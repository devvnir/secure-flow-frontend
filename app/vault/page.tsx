'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, Circle, Download, FileLock2, FileSearch, KeyRound, Loader2, Lock, MinusCircle, ShieldCheck, ShieldX, Trash2, UploadCloud, XCircle,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import SanitizationReport, { formatBytes, type EnclaveRecord } from '@/components/SanitizationReport';
import { useVault } from '@/components/VaultProvider';
import {
  Button, Card, ConfirmDialog, EmptyState, Field, Modal, Notice, PageHeader, Skeleton, StatusBadge, Tabs, Tag, cx, inputClass, useToast,
} from '@/components/ui';
import { api, ApiError, AuthRequiredError, hasSession, parseUtc } from '@/lib/api';
import {
  createVault, decrypt, decryptText, encrypt, encryptText, openEnclaveResult, sealForEnclave, unlockVault,
  type Bytes, type EnclavePublicKey, type EnclaveResult, type VaultConfig,
} from '@/lib/crypto';
import { relativeTime } from '@/lib/ui';

interface VaultItem {
  id: string;
  record_id: string | null;
  name_iv: string;
  name_ct: string;
  iv: string;
  size_bytes: number;
  created_at: string;
  verdict: string | null;
  threat_count: number | null;
  detected_type: string | null;
  ciphertext?: string;
}

interface ChainStatus {
  valid: boolean;
  count: number;
  head_hash?: string;
  broken_at_seq: number | null;
  reason: string | null;
}

type StepState = 'idle' | 'active' | 'done' | 'skipped' | 'error';
type Phase = 'loading' | 'setup' | 'locked' | 'unlocked';
type Tab = 'files' | 'audit';

const STEPS = [
  { key: 'encrypt', title: 'Encrypt in your browser', detail: 'AES-256-GCM with a one-time key, wrapped for the enclave with RSA-OAEP-3072' },
  { key: 'enclave', title: 'Sanitize in the isolated enclave', detail: 'Decrypted only inside a sandboxed worker; macros and scripts stripped; memory wiped' },
  { key: 'store', title: 'Seal into your vault', detail: 'Re-encrypted with your vault key; the server stores ciphertext only' },
] as const;

function saveFile(data: Bytes, name: string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'active') return <Loader2 className="h-5 w-5 animate-spin text-sky-400" />;
  if (state === 'done') return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
  if (state === 'error') return <XCircle className="h-5 w-5 text-red-400" />;
  if (state === 'skipped') return <MinusCircle className="h-5 w-5 text-slate-500" />;
  return <Circle className="h-5 w-5 text-slate-600" />;
}

export default function VaultPage() {
  const router = useRouter();
  const toast = useToast();
  const { key: vaultKey, unlock, lock } = useVault();

  const [phase, setPhase] = useState<Phase>('loading');
  const [config, setConfig] = useState<VaultConfig | null>(null);
  const [pageError, setPageError] = useState('');
  const [tab, setTab] = useState<Tab>('files');

  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<EnclaveRecord[] | null>(null);
  const [chain, setChain] = useState<ChainStatus | null>(null);

  const pubKey = useRef<EnclavePublicKey | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [steps, setSteps] = useState<Record<string, StepState>>({ encrypt: 'idle', enclave: 'idle', store: 'idle' });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [lastRecord, setLastRecord] = useState<EnclaveRecord | null>(null);

  const [reportRecord, setReportRecord] = useState<EnclaveRecord | null>(null);
  const [deleteItem, setDeleteItem] = useState<VaultItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fail = useCallback(
    (err: unknown, setter: (m: string) => void) => {
      if (err instanceof AuthRequiredError) router.replace('/login');
      else setter(err instanceof Error ? err.message : 'Something went wrong');
    },
    [router]
  );

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await api<VaultConfig | { configured: false }>('/api/vault');
      if (cfg.configured === false) {
        setPhase('setup');
        return;
      }
      setConfig(cfg);
      setPhase(vaultKey ? 'unlocked' : 'locked');
    } catch (err) {
      fail(err, setPageError);
    }
  }, [vaultKey, fail]);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    loadConfig();
  }, [router, loadConfig]);

  const loadData = useCallback(async () => {
    if (!vaultKey) return;
    const [itemList, recordList, chainStatus] = await Promise.all([
      api<VaultItem[]>('/api/vault/items'),
      api<EnclaveRecord[]>('/api/enclave/records'),
      api<ChainStatus>('/api/enclave/verify'),
    ]);
    setItems(itemList);
    setRecords(recordList);
    setChain(chainStatus);
    const decoded: Record<string, string> = {};
    await Promise.all(
      itemList.map(async (it) => {
        try {
          decoded[it.id] = await decryptText(vaultKey, { iv: it.name_iv, ciphertext: it.name_ct });
        } catch {
          decoded[it.id] = '(undecryptable name)';
        }
      })
    );
    setNames(decoded);
  }, [vaultKey]);

  useEffect(() => {
    if (phase === 'unlocked') loadData().catch((err) => fail(err, setPageError));
  }, [phase, loadData, fail]);

  useEffect(() => {
    if (!vaultKey && phase === 'unlocked') setPhase('locked');
  }, [vaultKey, phase]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (pass.length < 12) return setAuthError('Use at least 12 characters.');
    if (pass !== pass2) return setAuthError('Passphrases do not match.');
    setAuthBusy(true);
    try {
      const { config: cfg, key } = await createVault(pass);
      await api('/api/vault', { method: 'POST', body: JSON.stringify(cfg) });
      setConfig(cfg);
      unlock(key);
      setPass('');
      setPass2('');
      setPhase('unlocked');
      toast('Vault created and unlocked');
    } catch (err) {
      fail(err, setAuthError);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setAuthError('');
    setAuthBusy(true);
    try {
      unlock(await unlockVault(pass, config));
      setPass('');
      setPhase('unlocked');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not unlock');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await api('/api/vault?confirm=true', { method: 'DELETE' });
      lock();
      setConfig(null);
      setItems(null);
      setPhase('setup');
      setConfirmReset(false);
      toast('Vault deleted');
    } catch (err) {
      fail(err, setAuthError);
    } finally {
      setResetting(false);
    }
  };

  const getPublicKey = async (refresh = false) => {
    if (!pubKey.current || refresh) pubKey.current = await api<EnclavePublicKey>('/api/enclave/public-key');
    return pubKey.current;
  };

  const processFile = async (file: File) => {
    if (!vaultKey || uploading) return;
    setUploadError('');
    setLastRecord(null);
    setUploadName(file.name);
    setSteps({ encrypt: 'active', enclave: 'idle', store: 'idle' });
    setUploading(true);
    let stage: 'encrypt' | 'enclave' | 'store' = 'encrypt';
    try {
      let pub = await getPublicKey();
      if (file.size > pub.max_file_bytes) throw new Error(`Files must be ${formatBytes(pub.max_file_bytes)} or smaller`);
      const bytes = new Uint8Array(await file.arrayBuffer());

      const send = async (key: EnclavePublicKey) => {
        const sealed = await sealForEnclave(key, bytes, file.name);
        setSteps((s) => ({ ...s, encrypt: 'done', enclave: 'active' }));
        stage = 'enclave';
        const res = await api<{ record: EnclaveRecord; result: EnclaveResult | null }>('/api/enclave/sanitize', { method: 'POST', body: JSON.stringify(sealed.envelope) });
        return { ...res, sealed };
      };

      let out;
      try {
        out = await send(pub);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) throw err;
        pub = await getPublicKey(true);
        setSteps({ encrypt: 'active', enclave: 'idle', store: 'idle' });
        out = await send(pub);
      }
      setLastRecord(out.record);

      if (!out.result) {
        setSteps({ encrypt: 'done', enclave: 'error', store: 'skipped' });
        toast(`${file.name} was rejected by the enclave`, 'error');
        return;
      }
      setSteps({ encrypt: 'done', enclave: 'done', store: 'active' });
      stage = 'store';
      const { data, name } = await openEnclaveResult(out.sealed.uploadKey, out.sealed.aad, out.result);
      const content = await encrypt(vaultKey, data);
      const sealedName = await encryptText(vaultKey, name);
      await api('/api/vault/items', {
        method: 'POST',
        body: JSON.stringify({ record_id: out.record.id, iv: content.iv, ciphertext: content.ciphertext, name_iv: sealedName.iv, name_ct: sealedName.ciphertext }),
      });
      setSteps({ encrypt: 'done', enclave: 'done', store: 'done' });
      toast(out.record.verdict === 'clean' ? `${name} stored — no threats found` : `${name} sanitized and stored`);
    } catch (err) {
      setSteps((s) => ({ ...s, [stage]: 'error' }));
      fail(err, setUploadError);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
      loadData().catch(() => undefined);
    }
  };

  const openReport = async (recordId: string | null) => {
    if (!recordId) return;
    try {
      setReportRecord(await api<EnclaveRecord>(`/api/enclave/records/${recordId}`));
    } catch (err) {
      fail(err, setPageError);
    }
  };

  const download = async (item: VaultItem) => {
    if (!vaultKey) return;
    setDownloading(item.id);
    try {
      const full = await api<VaultItem>(`/api/vault/items/${item.id}`);
      const data = await decrypt(vaultKey, { iv: full.iv, ciphertext: full.ciphertext! });
      saveFile(data, names[item.id] || 'download');
    } catch (err) {
      fail(err, setPageError);
    } finally {
      setDownloading(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      await api(`/api/vault/items/${deleteItem.id}`, { method: 'DELETE' });
      toast(`${names[deleteItem.id] ?? 'File'} deleted`);
      setDeleteItem(null);
      await loadData();
    } catch (err) {
      fail(err, setPageError);
    } finally {
      setDeleting(false);
    }
  };

  const exportAudit = async () => {
    try {
      const data = await api('/api/enclave/export');
      saveFile(new TextEncoder().encode(JSON.stringify(data, null, 2)), `secure-flow-forensic-export-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
      toast('Forensic export downloaded');
    } catch (err) {
      fail(err, setPageError);
    }
  };

  const header = (
    <PageHeader
      title="Crypto vault"
      description="Files are encrypted in your browser, sanitized inside an isolated enclave, and stored encrypted with a key only you hold."
      badge={phase === 'unlocked' ? <StatusBadge status="active" /> : undefined}
      actions={phase === 'unlocked' ? <Button icon={Lock} onClick={() => { lock(); setPhase('locked'); }}>Lock vault</Button> : undefined}
    />
  );

  if (phase === 'loading') {
    return (
      <AppShell>
        {header}
        <Skeleton className="h-64" />
      </AppShell>
    );
  }

  if (phase === 'setup' || phase === 'locked') {
    const creating = phase === 'setup';
    return (
      <AppShell narrow>
        {header}
        {pageError && <div className="mb-6"><Notice tone="error">{pageError}</Notice></div>}
        <Card
          title={creating ? 'Create your vault' : 'Unlock your vault'}
          description={creating ? 'Choose a passphrase. Your vault key is derived from it in this browser (PBKDF2-SHA256, 600,000 iterations) and never sent to the server.' : 'Enter your vault passphrase. The key is derived locally and kept in memory only; the vault locks after 15 idle minutes.'}
        >
          <form onSubmit={creating ? handleCreate : handleUnlock} className="space-y-4">
            {authError && <Notice tone="error">{authError}</Notice>}
            <Field label="Passphrase" htmlFor="vault-pass" hint={creating ? 'At least 12 characters. A short sentence works well.' : undefined}>
              <input id="vault-pass" type="password" autoComplete={creating ? 'new-password' : 'current-password'} value={pass} onChange={(e) => setPass(e.target.value)} className={inputClass} autoFocus required />
            </Field>
            {creating && (
              <Field label="Confirm passphrase" htmlFor="vault-pass2">
                <input id="vault-pass2" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} className={inputClass} required />
              </Field>
            )}
            {creating && <Notice tone="warning">If you forget this passphrase, your files can&apos;t be recovered. Nobody, including the server, can decrypt them.</Notice>}
            <div className="flex items-center justify-between gap-3 pt-2">
              {!creating ? <button type="button" onClick={() => setConfirmReset(true)} className="text-sm text-slate-400 hover:text-red-300">Forgot passphrase? Reset vault</button> : <span />}
              <Button type="submit" variant="primary" icon={creating ? KeyRound : Lock} loading={authBusy}>
                {authBusy ? 'Deriving key…' : creating ? 'Create vault' : 'Unlock'}
              </Button>
            </div>
          </form>
        </Card>
        <ConfirmDialog
          open={confirmReset}
          danger
          title="Reset vault?"
          description="Every file in your vault will be permanently deleted, because without the passphrase they can't be decrypted. Your forensic audit records are kept."
          confirmLabel="Delete vault"
          busy={resetting}
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      </AppShell>
    );
  }

  const decorated = (items ?? []).map((it) => ({ ...it, name: names[it.id] }));

  return (
    <AppShell>
      {header}
      {pageError && <div className="mb-6"><Notice tone="error">{pageError}</Notice></div>}

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'files', label: 'Files', count: items?.length }, { value: 'audit', label: 'Forensic audit', count: records?.length }]} />

      <div className="mt-6 space-y-6">
        {tab === 'files' && (
          <>
            <Card title="Add a file" description="Office documents, PDF, HTML, SVG, CSV, text and images up to 10 MB. Executables, archives and legacy Office files are rejected.">
              <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                <label
                  htmlFor="vault-file"
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) processFile(f);
                  }}
                  className={cx(
                    'flex min-h-[11rem] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
                    dragging ? 'border-sky-400 bg-sky-500/5' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/30',
                    uploading && 'pointer-events-none opacity-60'
                  )}
                >
                  <UploadCloud className="mb-3 h-8 w-8 text-slate-400" />
                  <p className="text-sm font-medium text-slate-100">{uploading ? `Processing ${uploadName}…` : 'Drop a file here, or click to choose'}</p>
                  <p className="mt-1 text-xs text-slate-500">Encrypted before it leaves this browser</p>
                  <input id="vault-file" ref={fileInput} type="file" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
                </label>
                <ol className="space-y-4" aria-label="Upload pipeline" data-testid="pipeline">
                  {STEPS.map((s) => (
                    <li key={s.key} className="flex gap-3" data-step={s.key} data-state={steps[s.key]}>
                      <StepIcon state={steps[s.key]} />
                      <div>
                        <p className={cx('text-sm font-medium', steps[s.key] === 'idle' ? 'text-slate-400' : 'text-slate-100')}>{s.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{s.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              {uploadError && <div className="mt-5"><Notice tone="error">{uploadError}</Notice></div>}
              {lastRecord && (
                <div className="mt-6 border-t border-slate-800 pt-6">
                  <p className="mb-4 text-sm font-medium text-slate-200">Enclave report for <span className="font-mono">{uploadName}</span></p>
                  <SanitizationReport record={lastRecord} />
                </div>
              )}
            </Card>

            <Card title="Vault files" description="Names and contents are decrypted in this browser only." padded={false}>
              {items === null ? (
                <div className="space-y-3 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : items.length === 0 ? (
                <EmptyState icon={FileLock2} title="Your vault is empty" description="Files you add are sanitized and stored here, encrypted." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="vault-files">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 text-right font-medium">Size</th>
                        <th className="px-4 py-3 font-medium">Added</th>
                        <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {decorated.map((it) => (
                        <tr key={it.id} className="text-slate-300">
                          <td className="px-4 py-3 font-medium text-slate-100">{it.name ?? '…'}</td>
                          <td className="px-4 py-3">
                            {it.verdict && <StatusBadge status={it.verdict} />}
                            {it.threat_count ? <span className="ml-2 text-xs text-slate-500">{it.threat_count} removed</span> : null}
                          </td>
                          <td className="px-4 py-3">{it.detected_type && <Tag mono>{it.detected_type}</Tag>}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatBytes(it.size_bytes)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-400" title={parseUtc(it.created_at).toLocaleString()}>{relativeTime(parseUtc(it.created_at))}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" icon={Download} loading={downloading === it.id} onClick={() => download(it)} aria-label={`Download ${it.name}`}>Download</Button>
                              <Button size="sm" variant="ghost" icon={FileSearch} onClick={() => openReport(it.record_id)} aria-label={`Report for ${it.name}`}>Report</Button>
                              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleteItem(it)} aria-label={`Delete ${it.name}`} className="hover:text-red-300" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {tab === 'audit' && (
          <>
            {chain && (
              chain.valid ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-5 py-4" data-testid="chain-status">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-emerald-200">Audit chain verified · {chain.count} record{chain.count === 1 ? '' : 's'}</p>
                    <p className="truncate font-mono text-xs text-emerald-300/70">head {chain.head_hash ?? '—'}</p>
                  </div>
                  <Button icon={Download} onClick={exportAudit}>Export for review</Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4" data-testid="chain-status">
                  <ShieldX className="h-5 w-5 text-red-400" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-200">Audit chain broken at record #{chain.broken_at_seq}</p>
                    <p className="text-xs text-red-300/80">{chain.reason}</p>
                  </div>
                  <Button icon={Download} onClick={exportAudit}>Export for review</Button>
                </div>
              )
            )}
            <Card
              title="Enclave records"
              description={<>Every file processed by the enclave, hash-chained so any change is detectable. Reviewers can check an export offline with <code className="font-mono text-xs text-slate-300">python tools/verify_forensic_export.py export.json</code>.</>}
              padded={false}
            >
              {records === null ? (
                <div className="space-y-3 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : records.length === 0 ? (
                <EmptyState icon={ShieldCheck} title="No records yet" description="Each upload creates a forensic record." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="audit-records">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                        <th className="px-4 py-3 font-medium">#</th>
                        <th className="px-4 py-3 font-medium">Time</th>
                        <th className="px-4 py-3 font-medium">Verdict</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 text-right font-medium">Threats</th>
                        <th className="px-4 py-3 text-right font-medium">Anchors</th>
                        <th className="px-4 py-3 font-medium">Record hash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {records.map((r) => (
                        <tr key={r.id} onClick={() => openReport(r.id)} className="cursor-pointer text-slate-300 hover:bg-slate-800/40">
                          <td className="px-4 py-3 tabular-nums text-slate-400">{r.seq}</td>
                          <td className="whitespace-nowrap px-4 py-3">{parseUtc(r.created_at).toLocaleString()}</td>
                          <td className="px-4 py-3"><StatusBadge status={r.verdict} /></td>
                          <td className="px-4 py-3">{r.detected_type ? <Tag mono>{r.detected_type}</Tag> : <span className="text-slate-500">—</span>}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{r.threat_count}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{r.anchor_count}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.record_hash.slice(0, 16)}…</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <Modal open={!!reportRecord} title={`Enclave report · record #${reportRecord?.seq ?? ''}`} onClose={() => setReportRecord(null)} wide>
        {reportRecord && <SanitizationReport record={reportRecord} />}
      </Modal>
      <ConfirmDialog
        open={!!deleteItem}
        danger
        title="Delete this file?"
        description={<>“{deleteItem ? names[deleteItem.id] : ''}” will be permanently removed from your vault. Its forensic record is kept.</>}
        confirmLabel="Delete file"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteItem(null)}
      />
    </AppShell>
  );
}
