'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Play, RotateCcw, XCircle } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Button, Card, Notice, PageHeader, Stat, Tag, textareaClass } from '@/components/ui';
import { hasSession } from '@/lib/api';

interface MountReport {
  mounted: boolean;
  reason?: string;
  host: string;
  accepted: number;
  rejected: { index: number; reasons: string[] }[];
}

interface OverlayEngine {
  mount: (config: unknown, options?: { target?: Element; hostname?: string }) => MountReport;
  unmount: () => void;
}

declare global {
  interface Window {
    SecureFlowOverlay?: OverlayEngine;
  }
}

const ENGINE_SRC = '/overlay/secure-flow-overlay.js';
const PAYLOAD_SRC = '/overlay/mock-payload.json';

function loadEngine(): Promise<OverlayEngine> {
  if (window.SecureFlowOverlay) return Promise.resolve(window.SecureFlowOverlay);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${ENGINE_SRC}"]`);
    const script = existing || document.createElement('script');
    script.addEventListener('load', () => (window.SecureFlowOverlay ? resolve(window.SecureFlowOverlay) : reject(new Error('Overlay engine did not initialise'))));
    script.addEventListener('error', () => reject(new Error(`Could not load ${ENGINE_SRC} (run npm run build:overlay)`)));
    if (!existing) {
      script.src = ENGINE_SRC;
      document.head.appendChild(script);
    }
  });
}

export default function OverlayPage() {
  const router = useRouter();
  const preview = useRef<HTMLDivElement>(null);
  const engine = useRef<OverlayEngine | null>(null);
  const original = useRef('');
  const [source, setSource] = useState('');
  const [report, setReport] = useState<MountReport | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  const compile = useCallback((text: string) => {
    setError('');
    if (!engine.current || !preview.current) return;
    let config: { overlay?: { position?: string; allowedDomains?: string[] } };
    try {
      config = JSON.parse(text);
    } catch (err) {
      setError(`Not valid JSON: ${(err as Error).message}`);
      return;
    }
    // Preview renders inline in this page, as it would appear on the first designated domain.
    const domains = config?.overlay?.allowedDomains;
    const previewConfig = config?.overlay ? { ...config, overlay: { ...config.overlay, position: 'inline' } } : config;
    const result = engine.current.mount(previewConfig, { target: preview.current, hostname: Array.isArray(domains) && typeof domains[0] === 'string' ? domains[0].replace(/^\*\./, 'www.') : undefined });
    // On a live site a bad config leaves the last good overlay in place; here the preview should show the failure.
    if (!result.mounted) engine.current.unmount();
    setReport(result);
  }, []);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    setOrigin(window.location.origin);
    let disposed = false;
    Promise.all([loadEngine(), fetch(PAYLOAD_SRC, { cache: 'no-store' }).then((r) => r.text())])
      .then(([eng, payload]) => {
        if (disposed) return;
        engine.current = eng;
        original.current = payload;
        setSource(payload);
        compile(payload);
      })
      .catch((err) => setError(err.message));
    return () => {
      disposed = true;
      engine.current?.unmount();
    };
  }, [router, compile]);

  const snippet = `<script src="${origin}${ENGINE_SRC}"\n        data-config-url="${origin}${PAYLOAD_SRC}" defer></script>`;

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AppShell>
      <PageHeader
        title="Broker overlay"
        description="A JSON definition plus real-estate user objects (Broker_ID, Region_Node, Document_Status_Bit), compiled into an isolated Shadow DOM panel on your designated domains."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card
          title="Overlay definition and user objects"
          description="Edit the JSON and compile. Invalid user objects are rejected, never rendered."
          actions={
            <>
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => { setSource(original.current); compile(original.current); }}>
                Reset
              </Button>
              <Button size="sm" variant="primary" icon={Play} onClick={() => compile(source)}>
                Compile
              </Button>
            </>
          }
        >
          <textarea
            aria-label="Overlay JSON"
            data-testid="overlay-json"
            spellCheck={false}
            className={`${textareaClass} h-[34rem] font-mono text-xs leading-relaxed`}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        </Card>

        <div className="space-y-6">
          <Card title="Preview" description={report?.mounted ? `As rendered on ${report.host}` : undefined}>
            <div ref={preview} data-testid="overlay-preview" className="min-h-[8rem]" />
            {report && !report.mounted && <Notice tone="error">{report.reason}</Notice>}
          </Card>

          {report && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Accepted" value={<span data-testid="accepted-count">{report.accepted}</span>} tone="good" />
              <Stat label="Rejected" value={<span data-testid="rejected-count">{report.rejected.length}</span>} tone={report.rejected.length ? 'bad' : 'default'} />
            </div>
          )}

          {report && report.rejected.length > 0 && (
            <Card title="Rejected user objects">
              <ul className="space-y-3 text-sm">
                {report.rejected.map((r) => (
                  <li key={r.index} className="flex gap-2.5">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <div className="min-w-0">
                      <Tag mono>users[{r.index}]</Tag>
                      <p className="mt-1 text-slate-400 break-words">{r.reasons.join('; ')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-6" title="Embed on a designated domain" description="Add this tag to the broker portal. The overlay only mounts on hosts listed in allowedDomains.">
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 pr-24 text-xs text-slate-300"><code>{snippet}</code></pre>
          <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy} className="absolute right-3 top-3">
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          To validate on a live site before embedding, run the injection proxy: <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">node overlay/proxy/inject-proxy.mjs --upstream https://portal.example.com --script {origin || 'http://localhost:3000'}{ENGINE_SRC} --config {origin || 'http://localhost:3000'}{PAYLOAD_SRC}</code>
        </p>
      </Card>
    </AppShell>
  );
}
