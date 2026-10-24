// Browser-injection proxy validation for the overlay engine.
//
//   npm run build:overlay && npm run validate:overlay
//
// Starts three local servers:
//   - a mock broker portal (the "designated domain" upstream)  127.0.0.1:5055
//   - the overlay assets on a separate origin (like a CDN)     127.0.0.1:5057
//   - the injection proxy in front of the portal               127.0.0.1:5056
// then drives a real browser (Microsoft Edge by default; OVERLAY_BROWSER=chrome to switch)
// through the proxy and checks the overlay end to end. Writes a screenshot and a JSON report to
// overlay/proxy/output/.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createInjectionProxy } from './inject-proxy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const FIXTURES = path.join(HERE, 'fixtures');
const ASSETS = path.join(ROOT, 'public', 'overlay');
const OUT = path.join(HERE, 'output');
const PORTS = { upstream: 5055, proxy: 5056, assets: 5057 };
const BINARY = crypto.randomBytes(64 * 1024);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: ok ? '' : String(detail).slice(0, 400) });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${!ok && detail ? '  -- ' + String(detail).slice(0, 400) : ''}`);
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

function staticServer(dir, extraHeaders = {}) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/blob.bin') {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': BINARY.length });
      return res.end(BINARY);
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === '/old-listing') {
      res.writeHead(302, { location: `http://127.0.0.1:${PORTS.upstream}/` });
      return res.end();
    }
    const file = path.join(dir, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', ...extraHeaders });
    fs.createReadStream(file).pipe(res);
  });
}

const listen = (server, port) => new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

async function main() {
  if (!fs.existsSync(path.join(ASSETS, 'secure-flow-overlay.js'))) {
    console.error('public/overlay/secure-flow-overlay.js is missing - run `npm run build:overlay` first');
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const upstream = staticServer(FIXTURES);
  const assets = staticServer(ASSETS, { 'access-control-allow-origin': '*' });
  const proxy = createInjectionProxy({
    upstream: `http://127.0.0.1:${PORTS.upstream}`,
    script: `http://127.0.0.1:${PORTS.assets}/secure-flow-overlay.js`,
    config: `http://127.0.0.1:${PORTS.assets}/mock-payload.json`,
  });
  await Promise.all([listen(upstream, PORTS.upstream), listen(assets, PORTS.assets), listen(proxy, PORTS.proxy)]);

  // ---- Proxy behaviour (HTTP level) ----
  const direct = await fetch(`http://127.0.0.1:${PORTS.upstream}/`).then((r) => r.text());
  const proxied = await fetch(`http://127.0.0.1:${PORTS.proxy}/`);
  const proxiedHtml = await proxied.text();
  check('proxy injects exactly one overlay script into HTML', (proxiedHtml.match(/data-injected-by="secure-flow-proxy"/g) || []).length === 1 && !direct.includes('secure-flow-overlay'));
  check('script injected inside <head>', proxiedHtml.indexOf('secure-flow-overlay.js') < proxiedHtml.indexOf('</head>'));
  check('rest of the document is byte-identical', proxiedHtml.replace(/<script [^>]*data-injected-by="secure-flow-proxy"><\/script>/, '') === direct);
  check('proxy marks injected responses', proxied.headers.get('x-secure-flow-injected') === '1');
  const css = await fetch(`http://127.0.0.1:${PORTS.proxy}/portal.css`);
  check('non-HTML passes through untouched', (await css.text()) === fs.readFileSync(path.join(FIXTURES, 'portal.css'), 'utf8') && !css.headers.get('x-secure-flow-injected'));
  const bin = Buffer.from(await (await fetch(`http://127.0.0.1:${PORTS.proxy}/blob.bin`)).arrayBuffer());
  check('binary passes through byte-for-byte', bin.equals(BINARY));
  const redirect = await fetch(`http://127.0.0.1:${PORTS.proxy}/old-listing`, { redirect: 'manual' });
  check('upstream redirects stay on the proxy', redirect.status === 302 && redirect.headers.get('location') === '/', redirect.headers.get('location'));

  // ---- Browser ----
  const browser = await chromium.launch({ channel: process.env.OVERLAY_BROWSER || 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(`${m.text()} ${m.location().url || ''}`));
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  await page.goto(`http://localhost:${PORTS.proxy}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.SecureFlowOverlay && window.SecureFlowOverlay.lastReport, null, { timeout: 15000 });
  const report = await page.evaluate(() => window.SecureFlowOverlay.lastReport);
  check('overlay mounted on allowed domain (localhost)', report.mounted === true, JSON.stringify(report));
  check('4 valid user objects accepted', report.accepted === 4, report.accepted);
  check(
    '3 invalid user objects rejected with reasons',
    report.rejected.length === 3 &&
      /Broker_ID/.test(report.rejected[0].reasons.join()) &&
      /not defined in statusMap/.test(report.rejected[1].reasons.join()) &&
      /Region_Node is missing/.test(report.rejected[2].reasons.join()) &&
      /Document_Status_Bit must be an integer/.test(report.rejected[2].reasons.join()),
    JSON.stringify(report.rejected)
  );

  const overlay = page.locator('secure-flow-overlay');
  const cards = overlay.locator('article.sf-card');
  check('one card per accepted user', (await cards.count()) === 4, await cards.count());
  const cardData = await cards.evaluateAll((els) =>
    els.map((e) => ({
      broker: e.dataset.brokerId,
      bit: e.dataset.statusBit,
      badge: e.querySelector('.sf-badge')?.textContent,
      region: e.querySelector('[data-field="Region_Node"] .sf-value')?.textContent,
      current: e.querySelector('.sf-current')?.textContent,
      action: e.querySelector('a.sf-action')?.getAttribute('href') || null,
    }))
  );
  check('Broker_ID and Region_Node rendered', cardData[0].broker === 'BRK-1042' && cardData[0].region === 'us-west.sf-bay' && cardData[2].region === 'eu-central.fra', JSON.stringify(cardData));
  check('Document_Status_Bit 0/1/2 -> Pending/Submitted/Active', cardData.slice(0, 3).map((c) => c.badge).join() === 'Pending,Submitted,Active', JSON.stringify(cardData));
  check('status stepper marks current step', cardData.slice(0, 3).map((c) => c.current).join() === 'Pending,Submitted,Active');
  check(
    'conditional action only for Submitted, URL-encoded',
    cardData[0].action === null && cardData[2].action === null && cardData[1].action === 'http://localhost:3000/sign?doc=BRK-2177',
    JSON.stringify(cardData.map((c) => c.action))
  );

  const injected = cards.nth(3).locator('.sf-heading');
  check('HTML in user data rendered as text, never executed', (await injected.textContent()).startsWith('<img src=x') && (await page.evaluate(() => window.__sfXss)) === undefined && (await overlay.locator('img').count()) === 0);

  const styles = await page.evaluate(() => {
    const root = document.querySelector('secure-flow-overlay').shadowRoot;
    const title = getComputedStyle(root.querySelector('.sf-title'));
    const card = getComputedStyle(root.querySelector('.sf-card'));
    const host = getComputedStyle(document.querySelector('.portal-card'));
    return { titleColor: title.color, titleFont: title.fontFamily, cardBg: card.backgroundColor, hostColor: host.color };
  });
  check('host page CSS does not leak into the overlay', styles.titleColor === 'rgb(248, 250, 252)' && !/Times/.test(styles.titleFont) && styles.cardBg === 'rgb(255, 255, 255)', JSON.stringify(styles));
  check('host page styling itself unchanged', styles.hostColor === 'rgb(255, 0, 0)', styles.hostColor);
  check('host page script ran and DOM intact', (await page.evaluate(() => window.__portalScriptRan === true && document.getElementById('listing-title').dataset.hydrated === 'yes')) && (await page.textContent('#listing-price')).includes('$650,000'));
  const box = await overlay.boundingBox();
  check('overlay pinned bottom-right', box && box.x + box.width > 1200 && box.y + box.height > 780, JSON.stringify(box));
  await page.screenshot({ path: path.join(OUT, 'overlay-injected.png') });

  await page.locator('secure-flow-overlay .sf-bar').click();
  check('panel collapses', (await cards.first().isVisible()) === false && (await overlay.locator('.sf-bar').getAttribute('aria-expanded')) === 'false');
  await page.locator('secure-flow-overlay .sf-bar').click();

  const live = await page.evaluate(() =>
    window.SecureFlowOverlay.update([{ Broker_ID: 'BRK-1042', Region_Node: 'us-west.sf-bay', Document_Status_Bit: 2, Display_Name: 'Ava Thompson' }])
  );
  check('live update re-renders from new user objects', live.mounted && live.accepted === 1 && (await cards.count()) === 1 && (await cards.first().locator('.sf-badge').textContent()) === 'Active');
  check('re-render keeps a single overlay host', (await page.locator('secure-flow-overlay').count()) === 1);
  check('no console errors on the allowed domain', consoleErrors.length === 0, consoleErrors.join(' | '));

  // Same proxy, different host name: not a designated domain.
  const other = await browser.newPage();
  await other.goto(`http://127.0.0.1:${PORTS.proxy}/`, { waitUntil: 'networkidle' });
  await other.waitForFunction(() => window.SecureFlowOverlay && window.SecureFlowOverlay.lastReport, null, { timeout: 15000 });
  const blocked = await other.evaluate(() => window.SecureFlowOverlay.lastReport);
  check('overlay refuses to mount on a non-designated host (127.0.0.1)', blocked.mounted === false && /allowedDomains/.test(blocked.reason) && (await other.locator('secure-flow-overlay').count()) === 0, JSON.stringify(blocked));

  const gating = await other.evaluate(() => {
    const allowed = window.SecureFlowOverlay.hostAllowed;
    return [
      allowed('portal.example.com', ['*.example.com']),
      allowed('example.com', ['*.example.com']),
      allowed('evil-example.com', ['*.example.com']),
      allowed('example.com.evil.net', ['example.com']),
      allowed('PORTAL.Example.com.', ['portal.example.com']),
    ];
  });
  check('wildcard and look-alike domain rules', JSON.stringify(gating) === '[true,false,false,false,true]', JSON.stringify(gating));

  const badConfigs = await other.evaluate(() => {
    const o = window.SecureFlowOverlay;
    const base = { version: 1, overlay: { id: 'x', title: 'X', allowedDomains: ['127.0.0.1'], statusMap: { 0: { label: 'P', tone: 'info' } }, record: [] }, users: [] };
    const clone = (patch) => Object.assign(JSON.parse(JSON.stringify(base)), patch);
    return [
      o.mount(clone({ version: 2 })).reason,
      o.mount(clone({ overlay: { ...base.overlay, record: [{ type: 'iframe', src: 'x' }] } })).reason,
      o.mount(clone({ overlay: { ...base.overlay, theme: { accent: 'red;}</style><script>' } } })).reason,
      o.mount(clone({ overlay: { ...base.overlay, record: [{ type: 'action', label: 'x', href: 'javascript:alert(1)' }] }, users: [{ Broker_ID: 'A', Region_Node: 'r', Document_Status_Bit: 0 }] })),
    ];
  });
  check('unsupported version rejected', /unsupported config version/.test(badConfigs[0]), badConfigs[0]);
  check('unknown component type rejected', /unknown type "iframe"/.test(badConfigs[1]), badConfigs[1]);
  check('CSS injection through theme rejected', /accent must be/.test(badConfigs[2]), badConfigs[2]);
  check('javascript: links are dropped', badConfigs[3].mounted && (await other.locator('secure-flow-overlay a').count()) === 0);

  await browser.close();
  await Promise.all([upstream, assets, proxy].map((s) => new Promise((r) => s.close(r))));

  const passed = results.filter((r) => r.ok).length;
  const summary = { browser: process.env.OVERLAY_BROWSER || 'msedge', date: new Date().toISOString(), passed, total: results.length, results };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${passed}/${results.length} checks passed - screenshot and report in overlay/proxy/output/`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
