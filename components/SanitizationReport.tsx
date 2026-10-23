'use client';

import { useState } from 'react';
import { Check as Check2, CheckCircle2, Copy, XCircle } from 'lucide-react';
import { DetailList, Notice, StatusBadge, Tag, cx } from '@/components/ui';
import { parseUtc } from '@/lib/api';

export interface Threat {
  code: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  count: number;
  locations: string[];
}

export interface Anchor {
  offset: number;
  line: number;
  column: number;
  codepoint: string;
  name: string;
  category: string;
  action: 'removed' | 'replaced';
  replacement?: string;
}

export interface EnclaveReport {
  verdict: string;
  detected_type: string | null;
  rejection?: { code: string; message: string } | null;
  threats?: Threat[];
  anchors?: Anchor[];
  anchor_count?: number;
  notes?: string[];
  verification?: { method: string; passed: boolean } | null;
  input_bytes?: number;
  output_bytes?: number;
  received_at?: string;
  completed_at?: string;
  error?: string;
  message?: string;
  purge?: { mutable_buffers_zeroed: number; bytes_zeroed: number; zero_verified: boolean | null; immutable_copies: string } | null;
  sandbox?: {
    worker_pid: number;
    exit_code: number;
    process_terminated: boolean;
    lifetime_ms: number;
    timeout_s: number;
    memory_limit_mb: number;
    peak_memory_mb: number | null;
    working_dir_empty_after_run: boolean;
    parent_handled_plaintext: boolean;
    isolation: { windows_job_object: boolean | null; posix_rlimits: boolean | null; audit_hook_self_test: Record<string, boolean> };
  } | null;
}

export interface EnclaveRecord {
  id: string;
  seq: number;
  created_at: string;
  verdict: string;
  detected_type: string | null;
  threat_count: number;
  anchor_count: number;
  input_sha256: string | null;
  output_sha256: string | null;
  prev_hash: string;
  record_hash: string;
  report?: EnclaveReport;
}

const SEVERITY = {
  high: 'bg-red-500/10 text-red-300 ring-red-500/25',
  medium: 'bg-amber-500/10 text-amber-300 ring-amber-500/25',
  low: 'bg-slate-500/10 text-slate-300 ring-slate-500/30',
};

const PROBE_LABELS: Record<string, string> = {
  file_read_blocked: 'File reads blocked',
  file_write_blocked: 'File writes blocked',
  directory_listing_blocked: 'Directory listing blocked',
  network_blocked: 'Network access blocked',
  process_spawn_blocked: 'Process creation blocked',
};

export const formatBytes = (n?: number | null) => {
  if (n === undefined || n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

function Check({ ok, children }: { ok: boolean | null | undefined; children: React.ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5', ok ? 'text-emerald-300' : 'text-red-300')}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h4>
      {children}
    </section>
  );
}

function Hash({ value }: { value: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-slate-500">—</span>;
  return (
    <button
      type="button"
      title={`${value} (click to copy)`}
      onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-300 hover:text-white"
    >
      {value.slice(0, 16)}…{value.slice(-10)}
      {copied ? <Check2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
    </button>
  );
}

export default function SanitizationReport({ record }: { record: EnclaveRecord }) {
  const report = record.report;
  if (!report) return null;
  const threats = report.threats ?? [];
  const anchors = report.anchors ?? [];
  const box = report.sandbox;
  const purge = report.purge;
  const probes = box?.isolation.audit_hook_self_test ?? {};

  return (
    <div className="space-y-6" data-testid="sanitization-report">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={record.verdict} testId="report-verdict" />
        {record.detected_type && <Tag mono>{record.detected_type}</Tag>}
        <span className="text-sm text-slate-400">
          {threats.reduce((n, t) => n + t.count, 0)} threat{threats.reduce((n, t) => n + t.count, 0) === 1 ? '' : 's'} · {report.anchor_count ?? 0} character anchor{report.anchor_count === 1 ? '' : 's'} · {formatBytes(report.input_bytes)} → {formatBytes(report.output_bytes)}
        </span>
      </div>

      {report.rejection && <Notice tone="error"><strong>Rejected:</strong> {report.rejection.message}. Nothing was returned or stored.</Notice>}
      {report.error && <Notice tone="error"><strong>Processing error:</strong> {report.message || report.error}</Notice>}
      {record.verdict === 'clean' && <Notice tone="success">No threats or deceptive characters found. The file is stored unchanged.</Notice>}

      {threats.length > 0 && (
        <Section title="Threats removed">
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-800">
                {threats.map((t) => (
                  <tr key={t.code} className="align-top">
                    <td className="w-20 px-3 py-2.5">
                      <span className={cx('inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset', SEVERITY[t.severity])}>{t.severity}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-slate-100">{t.description}</p>
                      {t.locations.length > 0 && (
                        <p className="mt-1 font-mono text-xs text-slate-500">
                          {t.locations.slice(0, 3).join(' · ')}
                          {t.locations.length > 3 && ` · +${t.count - 3} more`}
                        </p>
                      )}
                    </td>
                    <td className="w-14 px-3 py-2.5 text-right tabular-nums text-slate-300">×{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {anchors.length > 0 && (
        <Section title={`Character anchor map (${report.anchor_count})`}>
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm" data-testid="anchor-map">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                  <th className="px-3 py-2 font-medium">Position</th>
                  <th className="px-3 py-2 font-medium">Character</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {anchors.slice(0, 200).map((a) => (
                  <tr key={a.offset}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-300">L{a.line}:C{a.column}</td>
                    <td className="px-3 py-2">
                      <code className="font-mono text-xs text-slate-100">{a.codepoint}</code>
                      <span className="ml-2 text-xs text-slate-500">{a.name.toLowerCase()}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-300">{a.category.replace('_', ' ')}</td>
                    <td className="px-3 py-2 text-xs text-slate-300">{a.action === 'replaced' ? <>replaced → <code className="font-mono text-slate-100">{a.replacement}</code></> : 'removed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(report.anchor_count ?? 0) > anchors.length && <p className="mt-2 text-xs text-slate-500">Showing the first {anchors.length} of {report.anchor_count} anchors.</p>}
        </Section>
      )}

      {(report.notes?.length ?? 0) > 0 && (
        <Section title="Notes">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">{report.notes!.map((n) => <li key={n}>{n}</li>)}</ul>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {box && (
          <Section title="Enclave & memory purge">
            <DetailList
              items={[
                { label: 'Plaintext buffer', value: purge ? <Check ok={purge.zero_verified}>{formatBytes(purge.bytes_zeroed)} zeroed {purge.zero_verified ? '& verified' : ''}</Check> : '—' },
                { label: 'Worker process', value: <Check ok={box.process_terminated && box.exit_code === 0}>PID {box.worker_pid} · exited {box.exit_code}</Check> },
                { label: 'Plaintext lifetime', value: `${box.lifetime_ms} ms` },
                { label: 'Peak memory', value: `${box.peak_memory_mb ?? '—'} MB of ${box.memory_limit_mb} MB limit` },
                { label: 'Disk writes', value: <Check ok={box.working_dir_empty_after_run}>{box.working_dir_empty_after_run ? 'None' : 'Files left behind'}</Check> },
                { label: 'Main server saw plaintext', value: <Check ok={box.parent_handled_plaintext === false}>{box.parent_handled_plaintext ? 'Yes' : 'No'}</Check> },
                ...(box.isolation.windows_job_object !== null ? [{ label: 'Job Object limits', value: <Check ok={box.isolation.windows_job_object}>{box.isolation.windows_job_object ? 'Applied' : 'Unavailable'}</Check> }] : []),
              ]}
            />
            <ul className="mt-3 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2" data-testid="sandbox-probes">
              {Object.entries(probes).map(([k, v]) => (
                <li key={k}><Check ok={v}>{PROBE_LABELS[k] ?? k}</Check></li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Integrity">
          <DetailList
            items={[
              { label: 'Output re-scan', value: report.verification ? <Check ok={report.verification.passed}>{report.verification.passed ? 'Passed' : 'Failed'}</Check> : <span className="text-slate-500">Not applicable</span> },
              { label: 'Record', value: <span>#{record.seq} · {parseUtc(record.created_at).toLocaleString()}</span> },
              { label: 'Input SHA-256', value: <Hash value={record.input_sha256} /> },
              { label: 'Output SHA-256', value: <Hash value={record.output_sha256} /> },
              { label: 'Record hash', value: <Hash value={record.record_hash} /> },
              { label: 'Previous hash', value: <Hash value={record.prev_hash} /> },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
