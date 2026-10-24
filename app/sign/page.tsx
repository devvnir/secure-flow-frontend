'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Eye, FileSignature, PenLine, ShieldCheck } from 'lucide-react';
import AppShell from '@/components/AppShell';
import SignaturePad, { MIN_POINTS, type SignaturePadHandle } from '@/components/SignaturePad';
import { Button, Card, DetailList, EmptyState, Field, Modal, Notice, PageHeader, Skeleton, Tag, inputClass, useToast } from '@/components/ui';
import { api, apiText, AuthRequiredError, hasSession } from '@/lib/api';

interface SignatureSummary {
  id: string;
  document_ref: string;
  signed_at_utc: string;
  ip_address: string;
  stroke_count: number;
  point_count: number;
  canvas: { width: number; height: number };
  signature_hash: string;
}

const DOC_REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;

export default function SignPage() {
  const router = useRouter();
  const toast = useToast();
  const pad = useRef<SignaturePadHandle>(null);
  const [documentRef, setDocumentRef] = useState('');
  const [consent, setConsent] = useState(false);
  const [points, setPoints] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signed, setSigned] = useState<SignatureSummary | null>(null);
  const [records, setRecords] = useState<SignatureSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [viewing, setViewing] = useState<{ sig: SignatureSummary; url: string } | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  const fail = useCallback(
    (err: unknown, setter: (m: string) => void) => {
      if (err instanceof AuthRequiredError) router.replace('/login');
      else setter(err instanceof Error ? err.message : 'Something went wrong');
    },
    [router]
  );

  const load = useCallback(() => api<SignatureSummary[]>('/api/signatures').then(setRecords).catch((err) => fail(err, setLoadError)), [fail]);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    const doc = new URLSearchParams(window.location.search).get('doc');
    if (doc && DOC_REF.test(doc)) setDocumentRef(doc);
    load();
  }, [router, load]);

  useEffect(() => () => {
    if (viewing) URL.revokeObjectURL(viewing.url);
  }, [viewing]);

  const refValid = DOC_REF.test(documentRef);
  const canSubmit = refValid && consent && points >= MIN_POINTS && !busy;

  const submit = async () => {
    if (!pad.current) return;
    setError('');
    setBusy(true);
    try {
      const { strokes, canvas } = pad.current.value();
      const result = await api<SignatureSummary>('/api/signatures', { method: 'POST', body: JSON.stringify({ document_ref: documentRef, canvas, strokes }) });
      setSigned(result);
      pad.current.clear();
      setConsent(false);
      toast('Signature recorded');
      load();
    } catch (err) {
      fail(err, setError);
    } finally {
      setBusy(false);
    }
  };

  const view = async (sig: SignatureSummary) => {
    try {
      const svg = await apiText(`/api/signatures/${sig.id}/svg`);
      // Rendered through <img>, so the SVG can never run script in this page.
      setViewing({ sig, url: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) });
    } catch (err) {
      fail(err, (m) => toast(m, 'error'));
    }
  };

  const verify = async (sig: SignatureSummary) => {
    setVerifying(sig.id);
    try {
      const r = await api<{ valid: boolean }>(`/api/signatures/${sig.id}/verify`);
      toast(r.valid ? `Integrity verified for ${sig.document_ref}` : `Integrity check FAILED for ${sig.document_ref}`, r.valid ? 'success' : 'error');
    } catch (err) {
      fail(err, (m) => toast(m, 'error'));
    } finally {
      setVerifying(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Signatures"
        description="Single-party electronic signatures. Each one stores the raw pen strokes, a UTC timestamp and the IP address of your session, sealed with a SHA-256 hash."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card title="Sign a document" description="Draw your signature with a mouse, pen or finger.">
          <div className="space-y-5">
            <Field label="Document reference" htmlFor="document-ref" required hint="Letters, digits and . _ : - (for example BRK-2177 or BRK-2177:listing-agreement)">
              <input
                id="document-ref"
                className={inputClass}
                value={documentRef}
                maxLength={120}
                placeholder="BRK-2177:listing-agreement"
                onChange={(e) => setDocumentRef(e.target.value.trim())}
                aria-invalid={documentRef !== '' && !refValid}
              />
            </Field>
            <SignaturePad ref={pad} disabled={busy} onChange={(p) => setPoints(p)} />
            <label className="flex items-start gap-3 text-sm text-slate-300">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-sky-500" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I agree that this electronic signature is my own and is legally binding for the document referenced above.</span>
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex items-center justify-end gap-3">
              {points > 0 && points < MIN_POINTS && <span className="text-xs text-slate-500">Keep going, the signature is too short</span>}
              <Button variant="primary" icon={PenLine} loading={busy} disabled={!canSubmit} onClick={submit}>
                Sign document
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="What is recorded">
            <ul className="space-y-3 text-sm text-slate-400">
              <li className="flex gap-2.5"><PenLine className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />Every stroke as raw x/y/time vectors, not an image</li>
              <li className="flex gap-2.5"><FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />UTC timestamp set by the server, e.g. 2026-10-24T15:04:05.123Z</li>
              <li className="flex gap-2.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />Your session IP as seen by the server, plus a SHA-256 seal over all fields</li>
            </ul>
          </Card>
          {signed && (
            <Card title="Signature recorded" actions={<BadgeCheck className="h-5 w-5 text-emerald-400" />}>
              <DetailList
                items={[
                  { label: 'Document', value: <span className="font-mono text-xs">{signed.document_ref}</span> },
                  { label: 'Signed (UTC)', value: <span data-testid="signed-at" className="font-mono text-xs">{signed.signed_at_utc}</span> },
                  { label: 'Session IP', value: <span data-testid="signed-ip" className="font-mono text-xs">{signed.ip_address}</span> },
                  { label: 'Vectors', value: `${signed.stroke_count} strokes · ${signed.point_count} points` },
                  { label: 'Seal', value: <span className="font-mono text-xs" title={signed.signature_hash}>{signed.signature_hash.slice(0, 16)}…</span> },
                ]}
              />
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-6" title="Signature records" description="Signatures you have made, newest first." padded={false}>
        {loadError ? (
          <div className="p-5"><Notice tone="error">{loadError}</Notice></div>
        ) : records === null ? (
          <div className="space-y-2 p-5"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : records.length === 0 ? (
          <EmptyState icon={FileSignature} title="No signatures yet" description="Signed documents will appear here with their timestamp, IP and integrity seal." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Document</th>
                  <th className="px-5 py-2.5 font-medium">Signed (UTC)</th>
                  <th className="px-5 py-2.5 font-medium">Session IP</th>
                  <th className="px-5 py-2.5 font-medium">Vectors</th>
                  <th className="px-5 py-2.5 font-medium">Seal</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800" data-testid="signature-rows">
                {records.map((s) => (
                  <tr key={s.id} className="text-slate-300">
                    <td className="px-5 py-3"><Tag mono>{s.document_ref}</Tag></td>
                    <td className="px-5 py-3 font-mono text-xs">{s.signed_at_utc}</td>
                    <td className="px-5 py-3 font-mono text-xs">{s.ip_address}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-400">{s.stroke_count} / {s.point_count}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500" title={s.signature_hash}>{s.signature_hash.slice(0, 12)}…</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon={Eye} onClick={() => view(s)}>View</Button>
                        <Button size="sm" variant="ghost" icon={ShieldCheck} loading={verifying === s.id} onClick={() => verify(s)}>Verify</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!viewing} title={viewing ? `Signature · ${viewing.sig.document_ref}` : ''} onClose={() => setViewing(null)} wide>
        {viewing && (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewing.url} alt={`Signature for ${viewing.sig.document_ref}`} className="w-full rounded-lg border border-slate-700 bg-white" />
            <p className="text-xs text-slate-500">
              Rendered from the stored vectors ({viewing.sig.stroke_count} strokes, {viewing.sig.point_count} points) on a {viewing.sig.canvas.width}×{viewing.sig.canvas.height} canvas. Signed {viewing.sig.signed_at_utc} from {viewing.sig.ip_address}.
            </p>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
