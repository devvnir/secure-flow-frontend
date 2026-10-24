/*
 * Secure Flow overlay engine.
 *
 * Compiles a JSON overlay definition plus real-estate user objects (Broker_ID, Region_Node,
 * Document_Status_Bit) into a UI rendered inside a Shadow DOM on the host page. Standalone:
 * no dependencies, no network access other than fetching its own config.
 *
 * Embed:
 *   <script src="https://app.example.com/overlay/secure-flow-overlay.js"
 *           data-config-url="https://app.example.com/overlay/mock-payload.json" defer></script>
 * or provide the config inline:
 *   <script type="application/json" id="secure-flow-overlay-config">{ ... }</script>
 * or from code: SecureFlowOverlay.mount(config, { target: element }).
 *
 * Security model: values from user objects are only ever written with textContent or as
 * attribute values that were validated (no innerHTML anywhere); links must be http(s); the
 * overlay refuses to mount on hosts that are not listed in allowedDomains.
 */

(function () {
  type Scalar = string | number | boolean | null;
  type UserObject = Record<string, Scalar>;
  type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

  interface StatusDef {
    label: string;
    tone: Tone;
    description?: string;
  }

  interface Condition {
    [field: string]: Scalar[];
  }

  interface BaseNode {
    when?: Condition;
  }

  type LayoutNode = BaseNode &
    (
      | { type: 'heading'; text: string }
      | { type: 'text'; text: string; muted?: boolean }
      | { type: 'field'; label: string; bind: string; mono?: boolean }
      | { type: 'status'; bind: string }
      | { type: 'steps'; bind: string }
      | { type: 'action'; label: string; href: string; variant?: 'primary' | 'secondary' }
      | { type: 'divider' }
      | { type: 'row'; children: LayoutNode[] }
    );

  interface OverlayDefinition {
    id: string;
    title: string;
    subtitle?: string;
    allowedDomains: string[];
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'inline';
    collapsed?: boolean;
    theme?: { accent?: string; radius?: number };
    statusField?: string;
    statusMap: Record<string, StatusDef>;
    record: LayoutNode[];
    emptyText?: string;
  }

  interface OverlayConfig {
    version: number;
    overlay: OverlayDefinition;
    context?: Record<string, string>;
    users: unknown[];
  }

  interface Rejection {
    index: number;
    reasons: string[];
  }

  interface MountReport {
    mounted: boolean;
    reason?: string;
    host: string;
    accepted: number;
    rejected: Rejection[];
    version?: number;
  }

  interface MountOptions {
    target?: Element;
    hostname?: string;
  }

  const VERSION = 1;
  const MAX_USERS = 500;
  const MAX_NODES = 200;
  const MAX_DEPTH = 4;
  const MAX_TEXT = 500;
  const HOST_TAG = 'secure-flow-overlay';
  const EVENT = 'secureflow:overlay';

  /** Field rules for the real-estate user objects. Extra fields are allowed but must be scalars. */
  const USER_FIELDS: Record<string, { required: boolean; check: (v: Scalar) => string | null }> = {
    Broker_ID: {
      required: true,
      check: (v) => (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v) ? null : 'Broker_ID must be 1-64 letters, digits, "-" or "_"'),
    },
    Region_Node: {
      required: true,
      check: (v) => (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(v) ? null : 'Region_Node must be 1-64 letters, digits, ".", ":", "-" or "_"'),
    },
    Document_Status_Bit: {
      required: true,
      check: (v) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255 ? null : 'Document_Status_Bit must be an integer 0-255'),
    },
  };

  const TONES: Record<Tone, { fg: string; bg: string; ring: string }> = {
    neutral: { fg: '#334155', bg: '#f1f5f9', ring: '#cbd5e1' },
    info: { fg: '#075985', bg: '#e0f2fe', ring: '#7dd3fc' },
    warning: { fg: '#92400e', bg: '#fef3c7', ring: '#fcd34d' },
    success: { fg: '#065f46', bg: '#d1fae5', ring: '#6ee7b7' },
    danger: { fg: '#991b1b', bg: '#fee2e2', ring: '#fca5a5' },
  };

  class ConfigError extends Error {}

  /* ------------------------------------------------------------------ */
  /* Validation                                                          */
  /* ------------------------------------------------------------------ */

  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const isScalar = (v: unknown): v is Scalar => v === null || ['string', 'number', 'boolean'].includes(typeof v);

  function validateUser(raw: unknown): { user?: UserObject; reasons: string[] } {
    if (!isObject(raw)) return { reasons: ['not an object'] };
    const reasons: string[] = [];
    for (const [name, rule] of Object.entries(USER_FIELDS)) {
      if (!(name in raw)) {
        if (rule.required) reasons.push(`${name} is missing`);
        continue;
      }
      const problem = isScalar(raw[name]) ? rule.check(raw[name] as Scalar) : `${name} must be a scalar`;
      if (problem) reasons.push(problem);
    }
    const user: UserObject = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) {
        reasons.push(`field name "${key.slice(0, 40)}" is not allowed`);
      } else if (!isScalar(value)) {
        reasons.push(`${key} must be a string, number, boolean or null`);
      } else {
        user[key] = typeof value === 'string' ? value.slice(0, MAX_TEXT) : value;
      }
    }
    return reasons.length ? { reasons } : { user, reasons };
  }

  function validateLayout(nodes: unknown, depth: number, counter: { n: number }): LayoutNode[] {
    if (!Array.isArray(nodes)) throw new ConfigError('layout must be an array');
    if (depth > MAX_DEPTH) throw new ConfigError(`layout nested deeper than ${MAX_DEPTH}`);
    return nodes.map((node, i) => {
      counter.n += 1;
      if (counter.n > MAX_NODES) throw new ConfigError(`layout has more than ${MAX_NODES} nodes`);
      if (!isObject(node) || typeof node.type !== 'string') throw new ConfigError(`layout[${i}] needs a "type"`);
      if (node.when !== undefined) {
        if (!isObject(node.when) || !Object.values(node.when).every((v) => Array.isArray(v) && v.every(isScalar))) {
          throw new ConfigError(`layout[${i}].when must map field names to arrays of values`);
        }
      }
      const str = (key: string) => {
        if (typeof node[key] !== 'string') throw new ConfigError(`layout[${i}] (${node.type}) needs "${key}"`);
      };
      switch (node.type) {
        case 'heading':
        case 'text':
          str('text');
          break;
        case 'field':
          str('label');
          str('bind');
          break;
        case 'status':
        case 'steps':
          str('bind');
          break;
        case 'action':
          str('label');
          str('href');
          break;
        case 'divider':
          break;
        case 'row':
          node.children = validateLayout(node.children, depth + 1, counter);
          break;
        default:
          throw new ConfigError(`layout[${i}] has unknown type "${String(node.type).slice(0, 30)}"`);
      }
      return node as unknown as LayoutNode;
    });
  }

  function validateConfig(raw: unknown): OverlayConfig {
    if (!isObject(raw)) throw new ConfigError('config must be a JSON object');
    if (raw.version !== VERSION) throw new ConfigError(`unsupported config version ${String(raw.version)} (expected ${VERSION})`);
    const o = raw.overlay;
    if (!isObject(o)) throw new ConfigError('config.overlay is missing');
    if (typeof o.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(o.id)) throw new ConfigError('overlay.id must be 1-40 lowercase letters, digits or "-"');
    if (typeof o.title !== 'string') throw new ConfigError('overlay.title is required');
    if (!Array.isArray(o.allowedDomains) || !o.allowedDomains.length || !o.allowedDomains.every((d) => typeof d === 'string' && /^(\*\.)?[a-z0-9.-]+$/i.test(d))) {
      throw new ConfigError('overlay.allowedDomains must list host names, e.g. ["portal.example.com", "*.example.com"]');
    }
    if (!isObject(o.statusMap) || !Object.values(o.statusMap).every((s) => isObject(s) && typeof s.label === 'string' && typeof s.tone === 'string' && s.tone in TONES)) {
      throw new ConfigError('overlay.statusMap entries need a label and a tone (neutral, info, warning, success, danger)');
    }
    if (o.theme !== undefined && !isObject(o.theme)) throw new ConfigError('overlay.theme must be an object');
    if (isObject(o.theme) && o.theme.accent !== undefined && !(typeof o.theme.accent === 'string' && /^#[0-9a-f]{6}$/i.test(o.theme.accent))) {
      throw new ConfigError('overlay.theme.accent must be a #rrggbb colour');
    }
    o.record = validateLayout(o.record, 0, { n: 0 });
    if (raw.context !== undefined && !(isObject(raw.context) && Object.values(raw.context).every((v) => typeof v === 'string'))) {
      throw new ConfigError('config.context must map names to strings');
    }
    if (!Array.isArray(raw.users)) throw new ConfigError('config.users must be an array');
    if (raw.users.length > MAX_USERS) throw new ConfigError(`config.users has more than ${MAX_USERS} entries`);
    return raw as unknown as OverlayConfig;
  }

  /* ------------------------------------------------------------------ */
  /* Domain gating                                                       */
  /* ------------------------------------------------------------------ */

  function hostAllowed(hostname: string, allowed: string[]): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    return allowed.some((pattern) => {
      const p = pattern.toLowerCase();
      if (p.startsWith('*.')) {
        const base = p.slice(2);
        return host.endsWith(`.${base}`) && host.length > base.length + 1;
      }
      return host === p;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Compilation                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Resolve {{Field}} placeholders from the user object, then from config.context.
   * encode=true is used inside URLs: user values are percent-encoded so they cannot change the
   * URL structure; context values come from the trusted config and are inserted as-is.
   */
  function interpolate(template: string, user: UserObject, context: Record<string, string>, encode: boolean): string {
    return template.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_, name: string) => {
      if (Object.prototype.hasOwnProperty.call(user, name)) {
        const value = user[name];
        const text = value === null || value === undefined ? '' : String(value);
        return encode ? encodeURIComponent(text) : text;
      }
      return Object.prototype.hasOwnProperty.call(context, name) ? context[name] : '';
    });
  }

  function matches(when: Condition | undefined, user: UserObject): boolean {
    if (!when) return true;
    return Object.entries(when).every(([field, values]) => values.some((v) => v === user[field]));
  }

  function safeUrl(raw: string): string | null {
    try {
      const url = new URL(raw, window.location.href);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
      return null;
    }
  }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function statusOf(def: OverlayDefinition, value: Scalar): StatusDef {
    return def.statusMap[String(value)] || { label: `Unknown (${String(value)})`, tone: 'neutral' };
  }

  function badge(status: StatusDef): HTMLElement {
    const node = el('span', 'sf-badge', status.label);
    const tone = TONES[status.tone];
    node.style.color = tone.fg;
    node.style.background = tone.bg;
    node.style.borderColor = tone.ring;
    node.dataset.tone = status.tone;
    return node;
  }

  function compileNode(node: LayoutNode, user: UserObject, def: OverlayDefinition, context: Record<string, string>): HTMLElement | null {
    if (!matches(node.when, user)) return null;
    switch (node.type) {
      case 'heading':
        return el('div', 'sf-heading', interpolate(node.text, user, context, false));
      case 'text':
        return el('p', node.muted ? 'sf-text sf-muted' : 'sf-text', interpolate(node.text, user, context, false));
      case 'field': {
        const wrap = el('div', 'sf-field');
        wrap.dataset.field = node.bind;
        wrap.appendChild(el('span', 'sf-label', node.label));
        const value = user[node.bind];
        wrap.appendChild(el('span', node.mono ? 'sf-value sf-mono' : 'sf-value', value === null || value === undefined ? '-' : String(value)));
        return wrap;
      }
      case 'status': {
        const wrap = el('div', 'sf-status');
        const status = statusOf(def, user[node.bind]);
        wrap.dataset.status = String(user[node.bind]);
        wrap.appendChild(badge(status));
        if (status.description) wrap.appendChild(el('span', 'sf-muted', status.description));
        return wrap;
      }
      case 'steps': {
        const list = el('ol', 'sf-steps');
        const keys = Object.keys(def.statusMap).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
        const current = Number(user[node.bind]);
        for (const key of keys) {
          const n = Number(key);
          const item = el('li', n < current ? 'sf-step sf-done' : n === current ? 'sf-step sf-current' : 'sf-step', def.statusMap[key].label);
          if (n === current) item.setAttribute('aria-current', 'step');
          list.appendChild(item);
        }
        return list;
      }
      case 'action': {
        const href = safeUrl(interpolate(node.href, user, context, true));
        if (!href) return null;
        const a = el('a', node.variant === 'secondary' ? 'sf-action sf-secondary' : 'sf-action', interpolate(node.label, user, context, false));
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return a;
      }
      case 'divider':
        return el('hr', 'sf-divider');
      case 'row': {
        const row = el('div', 'sf-row');
        for (const child of node.children) {
          const compiled = compileNode(child, user, def, context);
          if (compiled) row.appendChild(compiled);
        }
        return row;
      }
    }
    return null;
  }

  function styles(def: OverlayDefinition): string {
    const accent = def.theme?.accent || '#0ea5e9';
    const radius = Math.max(0, Math.min(24, Number(def.theme?.radius ?? 12)));
    const pos = def.position || 'bottom-right';
    const fixed =
      pos === 'inline'
        ? 'position: relative !important;'
        : `position: fixed !important; ${pos.includes('bottom') ? 'bottom' : 'top'}: 20px !important; ${pos.includes('right') ? 'right' : 'left'}: 20px !important; z-index: 2147483000 !important;`;
    // Host-page rules such as "* { ... !important }" match the host element itself, and important
    // declarations from :host win over them; the panel also sets its own font so nothing inherited
    // from the page reaches the overlay.
    return `
:host { all: initial; ${fixed} display: block !important; visibility: visible !important; opacity: 1 !important; }
*, *::before, *::after { box-sizing: border-box; }
.sf-panel { font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; text-align: left; letter-spacing: normal; width: ${pos === 'inline' ? '100%' : '340px'}; max-height: ${pos === 'inline' ? 'none' : '70vh'}; display: flex; flex-direction: column; background: #ffffff; border: 1px solid #e2e8f0; border-radius: ${radius}px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18); overflow: hidden; }
.sf-bar { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #0f172a; color: #f8fafc; border: 0; width: 100%; text-align: left; cursor: pointer; font: inherit; }
.sf-mark { width: 22px; height: 22px; border-radius: 6px; background: ${accent}; flex: none; }
.sf-titles { min-width: 0; flex: 1; }
.sf-title { font-weight: 600; font-size: 14px; }
.sf-subtitle { font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-count { font-size: 12px; color: #cbd5e1; background: rgba(148, 163, 184, 0.2); border-radius: 999px; padding: 1px 8px; }
.sf-body { overflow: auto; padding: 8px; display: grid; gap: 8px; background: #f8fafc; }
.sf-collapsed .sf-body { display: none; }
.sf-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: ${Math.max(0, radius - 4)}px; padding: 12px; display: grid; gap: 8px; }
.sf-heading { font-weight: 600; font-size: 14px; color: #0f172a; word-break: break-word; }
.sf-text { margin: 0; color: #334155; word-break: break-word; }
.sf-muted { color: #64748b; font-size: 12px; }
.sf-field { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.sf-label { color: #64748b; flex: none; }
.sf-value { color: #0f172a; text-align: right; word-break: break-all; }
.sf-mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
.sf-status { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sf-badge { display: inline-flex; align-items: center; border: 1px solid; border-radius: 999px; padding: 1px 9px; font-size: 12px; font-weight: 600; }
.sf-steps { list-style: none; margin: 0; padding: 0; display: flex; gap: 4px; }
.sf-step { flex: 1; text-align: center; font-size: 11px; color: #94a3b8; padding-top: 6px; border-top: 3px solid #e2e8f0; }
.sf-done { color: #475569; border-top-color: ${accent}80; }
.sf-current { color: #0f172a; font-weight: 600; border-top-color: ${accent}; }
.sf-action { display: inline-flex; justify-content: center; align-items: center; padding: 7px 12px; border-radius: 8px; background: ${accent}; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 13px; }
.sf-action:hover { filter: brightness(1.08); }
.sf-action:focus-visible, .sf-bar:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }
.sf-secondary { background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; }
.sf-divider { border: 0; border-top: 1px solid #e2e8f0; margin: 2px 0; width: 100%; }
.sf-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.sf-empty { padding: 16px; text-align: center; color: #64748b; font-size: 13px; }
`;
  }

  function compile(config: OverlayConfig): { root: HTMLElement; accepted: UserObject[]; rejected: Rejection[] } {
    const def = config.overlay;
    const context = config.context || {};
    const accepted: UserObject[] = [];
    const rejected: Rejection[] = [];
    const statusField = def.statusField || 'Document_Status_Bit';
    config.users.forEach((raw, index) => {
      const { user, reasons } = validateUser(raw);
      if (user && !(String(user[statusField]) in def.statusMap)) {
        reasons.push(`${statusField} ${String(user[statusField])} is not defined in statusMap`);
      }
      if (user && !reasons.length) accepted.push(user);
      else rejected.push({ index, reasons });
    });

    const panel = el('div', def.collapsed ? 'sf-panel sf-collapsed' : 'sf-panel');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', def.title);
    const bar = el('button', 'sf-bar');
    bar.type = 'button';
    bar.setAttribute('aria-expanded', String(!def.collapsed));
    bar.appendChild(el('span', 'sf-mark'));
    const titles = el('span', 'sf-titles');
    titles.appendChild(el('div', 'sf-title', def.title));
    if (def.subtitle) titles.appendChild(el('div', 'sf-subtitle', interpolate(def.subtitle, {}, context, false)));
    bar.appendChild(titles);
    bar.appendChild(el('span', 'sf-count', String(accepted.length)));
    bar.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('sf-collapsed');
      bar.setAttribute('aria-expanded', String(!collapsed));
    });
    panel.appendChild(bar);

    const body = el('div', 'sf-body');
    if (!accepted.length) body.appendChild(el('div', 'sf-empty', def.emptyText || 'No records to show'));
    for (const user of accepted) {
      const card = el('article', 'sf-card');
      card.dataset.brokerId = String(user.Broker_ID);
      card.dataset.statusBit = String(user[statusField]);
      for (const node of def.record) {
        const compiled = compileNode(node, user, def, context);
        if (compiled) card.appendChild(compiled);
      }
      body.appendChild(card);
    }
    panel.appendChild(body);
    return { root: panel, accepted, rejected };
  }

  /* ------------------------------------------------------------------ */
  /* Mounting                                                            */
  /* ------------------------------------------------------------------ */

  let current: { host: HTMLElement; shadow: ShadowRoot; config: OverlayConfig; options: MountOptions } | null = null;
  let lastReport: MountReport | null = null;

  function emit(report: MountReport) {
    lastReport = report;
    document.dispatchEvent(new CustomEvent(EVENT, { detail: report }));
    if (!report.mounted) console.warn(`[secure-flow-overlay] not mounted: ${report.reason}`);
    else if (report.rejected.length) console.warn(`[secure-flow-overlay] ${report.rejected.length} user object(s) rejected`, report.rejected);
  }

  function unmount() {
    if (current) current.host.remove();
    current = null;
  }

  function mount(rawConfig: unknown, options: MountOptions = {}): MountReport {
    const hostname = options.hostname || window.location.hostname;
    let config: OverlayConfig;
    try {
      config = validateConfig(rawConfig);
    } catch (err) {
      const report = { mounted: false, reason: `invalid config: ${(err as Error).message}`, host: hostname, accepted: 0, rejected: [] };
      emit(report);
      return report;
    }
    if (!hostAllowed(hostname, config.overlay.allowedDomains)) {
      unmount();
      const report = { mounted: false, reason: `host "${hostname}" is not in allowedDomains`, host: hostname, accepted: 0, rejected: [], version: config.version };
      emit(report);
      return report;
    }

    const { root, accepted, rejected } = compile(config);
    if (!current || (options.target && current.host.parentElement !== options.target)) {
      unmount();
      const host = document.createElement(HOST_TAG);
      host.id = `sf-overlay-${config.overlay.id}`;
      const shadow = host.attachShadow({ mode: 'open' });
      (options.target || document.body).appendChild(host);
      current = { host, shadow, config, options };
    }
    const style = document.createElement('style');
    style.textContent = styles(config.overlay);
    current.shadow.replaceChildren(style, root);
    current.config = config;
    const report = { mounted: true, host: hostname, accepted: accepted.length, rejected, version: config.version };
    emit(report);
    return report;
  }

  /** Re-render with new user objects, keeping the current overlay definition. */
  function update(users: unknown[]): MountReport {
    if (!current) throw new Error('SecureFlowOverlay is not mounted');
    return mount({ ...current.config, users }, current.options);
  }

  async function autoload(script: HTMLScriptElement | null) {
    const inline = document.getElementById('secure-flow-overlay-config');
    const url = script?.dataset.configUrl;
    let raw: unknown;
    try {
      if (inline && inline.getAttribute('type') === 'application/json') {
        raw = JSON.parse(inline.textContent || '');
      } else if (url) {
        const res = await fetch(new URL(url, script!.src || window.location.href).href, { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) throw new Error(`config request failed (${res.status})`);
        raw = await res.json();
      } else {
        return;
      }
    } catch (err) {
      emit({ mounted: false, reason: `could not load config: ${(err as Error).message}`, host: window.location.hostname, accepted: 0, rejected: [] });
      return;
    }
    mount(raw);
  }

  const api = {
    version: VERSION,
    mount,
    update,
    unmount,
    validateUser,
    hostAllowed,
    get lastReport() {
      return lastReport;
    },
  };
  (window as unknown as { SecureFlowOverlay: typeof api }).SecureFlowOverlay = api;

  const script = document.currentScript as HTMLScriptElement | null;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => autoload(script));
  else autoload(script);
})();
