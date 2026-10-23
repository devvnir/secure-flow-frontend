'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Archive, Check, Copy, Database, History, Lock, Unlock, Pause, Pencil, Play, RotateCcw, Trash2, Upload } from 'lucide-react';
import AppShell from '@/components/AppShell';
import FlowForm, { toFlowPayload, type FlowFormValues } from '@/components/FlowForm';
import {
  Button, Card, ConfirmDialog, DetailList, EmptyState, Field, Menu, Notice, PageHeader, Skeleton, Stat, StatusBadge, Tabs, Tag,
  buttonClass, inputClass, textareaClass, useToast,
} from '@/components/ui';
import { api, AuthRequiredError, hasSession, parseUtc, type DataFlow, type FlowStatus } from '@/lib/api';
import { relativeTime } from '@/lib/ui';

interface IngestionFailure {
  source_key: string | null;
  errors: string[];
}

interface IngestionResult {
  records_ingested: number;
  records_validated: number;
  records_failed: number;
  error_details: { failures?: IngestionFailure[] } | null;
}

interface BatchResult {
  records_processed: number;
  records_ingested: number;
  records_failed: number;
  failures: string[][];
}

interface FlowRun {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  records_processed: number;
  records_failed: number;
  error_log: { error?: string } | null;
}

interface StoredRecord {
  id: string;
  run_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

type Tab = 'ingest' | 'records' | 'runs';

const SAMPLE_BATCH = JSON.stringify(
  [
    { listing_id: 'MANUAL_001', address: '10 Market Street, San Francisco, CA', price: 845000, bedrooms: 3, bathrooms: 2, square_feet: 1800 },
    { listing_id: 'MANUAL_002', price: 'unknown' },
  ],
  null,
  2
);

const STATUS_NOTICE: Partial<Record<FlowStatus, string>> = {
  draft: 'This flow is a draft. Activate it to start ingesting data.',
  paused: 'This flow is paused. Ingestion is blocked until you resume it.',
  archived: 'This flow is archived. Restore it to edit or ingest again.',
};

const formatPrice = (value: unknown) => (typeof value === 'number' ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—');
const formatNumber = (value: unknown) => (typeof value === 'number' ? value.toLocaleString() : '—');

function duration(run: FlowRun) {
  if (!run.started_at || !run.completed_at) return '—';
  const ms = parseUtc(run.completed_at).getTime() - parseUtc(run.started_at).getTime();
  return ms < 1000 ? `${Math.max(ms, 1)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const toFormValues = (flow: DataFlow): FlowFormValues => ({
  name: flow.name,
  description: flow.description ?? '',
  source_type: flow.source_type,
  destination_type: flow.destination_type,
  encryption_enabled: flow.encryption_enabled,
  reso_resource: typeof flow.source_config?.resource === 'string' ? flow.source_config.resource : 'Property',
  reso_filter: typeof flow.source_config?.filter === 'string' ? flow.source_config.filter : '',
});

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy flow ID"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-300 hover:text-white"
      title={value}
    >
      {value.slice(0, 8)}…
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
    </button>
  );
}

export default function DataFlowDetailPage() {
  const router = useRouter();
  const toast = useToast();
  const flowId = useParams().id as string;

  const [flow, setFlow] = useState<DataFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pageError, setPageError] = useState('');
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('ingest');
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [filter, setFilter] = useState('');
  const [top, setTop] = useState(100);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState('');
  const [result, setResult] = useState<IngestionResult | null>(null);

  const [batchJson, setBatchJson] = useState(SAMPLE_BATCH);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [records, setRecords] = useState<StoredRecord[]>([]);
  const [recordsCount, setRecordsCount] = useState(0);

  const handleError = useCallback(
    (err: unknown, setter: (msg: string) => void) => {
      if (err instanceof AuthRequiredError) router.replace('/login');
      else setter(err instanceof Error ? err.message : 'Something went wrong');
    },
    [router]
  );

  const loadActivity = useCallback(async () => {
    const [runList, data] = await Promise.all([
      api<FlowRun[]>(`/api/data-flows/${flowId}/runs`),
      api<{ records_count: number; data: StoredRecord[] }>(`/api/data-flows/${flowId}/data?limit=100`),
    ]);
    setRuns(runList);
    setRecords(data.data);
    setRecordsCount(data.records_count);
  }, [flowId]);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const data = await api<DataFlow>(`/api/data-flows/${flowId}`);
        setFlow(data);
        setFilter(typeof data.source_config?.filter === 'string' ? data.source_config.filter : '');
        await loadActivity();
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404 || status === 422) setNotFound(true);
        else handleError(err, setPageError);
      } finally {
        setLoading(false);
      }
    })();
  }, [flowId, router, loadActivity, handleError]);

  const changeStatus = async (to: FlowStatus, message: string) => {
    setStatusBusy(true);
    setPageError('');
    try {
      setFlow(await api<DataFlow>(`/api/data-flows/${flowId}`, { method: 'PUT', body: JSON.stringify({ status: to }) }));
      toast(message);
    } catch (err) {
      handleError(err, setPageError);
    } finally {
      setStatusBusy(false);
    }
  };

  const deleteFlow = async () => {
    setDeleting(true);
    try {
      await api(`/api/data-flows/${flowId}`, { method: 'DELETE' });
      toast(`Flow "${flow?.name}" deleted`);
      router.push('/dashboard');
    } catch (err) {
      handleError(err, setPageError);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const runIngestion = async () => {
    if (!flow) return;
    setIngesting(true);
    setIngestError('');
    setResult(null);
    try {
      const resource = typeof flow.source_config?.resource === 'string' ? flow.source_config.resource : 'Property';
      const res = await api<IngestionResult>('/api/ingestion/reso/ingest', {
        method: 'POST',
        body: JSON.stringify({ flow_id: flowId, query_filters: { resource, filter: filter.trim() || null, top, skip: 0 }, validate_schema: true }),
      });
      setResult(res);
      toast(`Ingestion complete: ${res.records_validated} stored, ${res.records_failed} rejected`);
    } catch (err) {
      handleError(err, setIngestError);
    } finally {
      setIngesting(false);
      loadActivity().catch(() => undefined);
    }
  };

  const runBatch = async () => {
    setBatchError('');
    setBatchResult(null);
    let rows: unknown;
    try {
      rows = JSON.parse(batchJson);
    } catch {
      setBatchError('Not valid JSON. Paste an array of records, e.g. [{"listing_id": "A1", "address": "..."}]');
      return;
    }
    if (!Array.isArray(rows) || rows.length === 0 || !rows.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
      setBatchError('Expected a non-empty JSON array of objects.');
      return;
    }
    setBatchBusy(true);
    try {
      const now = new Date().toISOString();
      const payloads = rows.map((data, i) => ({ id: `manual-${i + 1}`, source: 'manual', timestamp: now, data }));
      const res = await api<BatchResult>('/api/ingestion/batch-ingest', { method: 'POST', body: JSON.stringify({ flow_id: flowId, payloads }) });
      setBatchResult(res);
      toast(`Imported ${res.records_ingested} of ${res.records_processed} records`);
      loadActivity().catch(() => undefined);
    } catch (err) {
      handleError(err, setBatchError);
    } finally {
      setBatchBusy(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <Skeleton className="mb-3 h-4 w-40" />
        <Skeleton className="mb-8 h-8 w-72" />
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-80" />
      </AppShell>
    );
  }

  if (notFound || !flow) {
    return (
      <AppShell>
        <Card>
          <EmptyState
            icon={Database}
            title={pageError || 'Data flow not found'}
            description="It may have been deleted, or it belongs to another account."
            action={<Link href="/dashboard" className={buttonClass('secondary', 'sm')}>Back to flows</Link>}
          />
        </Card>
      </AppShell>
    );
  }

  const isReso = flow.source_type.toUpperCase() === 'RESO';
  const isActive = flow.status === 'active';
  const resource = typeof flow.source_config?.resource === 'string' ? flow.source_config.resource : 'Property';
  const defaultFilter = typeof flow.source_config?.filter === 'string' ? flow.source_config.filter : null;
  const failures = result?.error_details?.failures ?? [];
  const lastRun = runs[0];

  const primaryAction =
    flow.status === 'draft' ? <Button variant="primary" icon={Play} loading={statusBusy} onClick={() => changeStatus('active', 'Flow activated')}>Activate</Button>
    : flow.status === 'paused' ? <Button variant="primary" icon={Play} loading={statusBusy} onClick={() => changeStatus('active', 'Flow resumed')}>Resume</Button>
    : flow.status === 'archived' ? <Button variant="primary" icon={RotateCcw} loading={statusBusy} onClick={() => changeStatus('draft', 'Flow restored to draft')}>Restore</Button>
    : <Button icon={Pause} loading={statusBusy} onClick={() => changeStatus('paused', 'Flow paused')}>Pause</Button>;

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[{ label: 'Flows', href: '/dashboard' }, { label: flow.name }]}
        title={flow.name}
        badge={<StatusBadge status={flow.status} testId="flow-status" />}
        description={flow.description || undefined}
        actions={
          editing ? null : (
            <>
              <Button icon={Pencil} onClick={() => setEditing(true)} disabled={flow.status === 'archived'} title={flow.status === 'archived' ? 'Restore the flow to edit it' : undefined}>Edit</Button>
              {primaryAction}
              <Menu
                items={[
                  { label: 'Archive flow', icon: Archive, onSelect: () => changeStatus('archived', 'Flow archived'), disabled: flow.status === 'archived' },
                  { label: 'Delete flow', icon: Trash2, onSelect: () => setConfirmDelete(true), danger: true },
                ]}
              />
            </>
          )
        }
      />

      {pageError && <div className="mb-6"><Notice tone="error">{pageError}</Notice></div>}

      {editing ? (
        <FlowForm
          initial={toFormValues(flow)}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            try {
              const updated = await api<DataFlow>(`/api/data-flows/${flowId}`, { method: 'PUT', body: JSON.stringify(toFlowPayload(values, flow.source_config ?? {})) });
              setFlow(updated);
              setFilter(typeof updated.source_config?.filter === 'string' ? updated.source_config.filter : '');
              setEditing(false);
              toast('Changes saved');
            } catch (err) {
              if (err instanceof AuthRequiredError) router.replace('/login');
              throw err;
            }
          }}
        />
      ) : (
        <>
          {STATUS_NOTICE[flow.status] && <div className="mb-6"><Notice tone="warning">{STATUS_NOTICE[flow.status]}</Notice></div>}

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Records stored" value={recordsCount.toLocaleString()} />
            <Stat label="Ingestion runs" value={runs.length} />
            <Stat
              label="Last run"
              value={lastRun ? <StatusBadge status={lastRun.status} /> : <span className="text-base text-slate-500">Never</span>}
              hint={lastRun?.started_at ? relativeTime(parseUtc(lastRun.started_at)) : undefined}
            />
            <Stat label="Rejected in last run" value={lastRun ? lastRun.records_failed : '—'} tone={lastRun?.records_failed ? 'bad' : 'default'} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <Tabs<Tab>
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'ingest', label: 'Ingest' },
                  { value: 'records', label: 'Records', count: recordsCount },
                  { value: 'runs', label: 'Run history', count: runs.length },
                ]}
              />

              <div className="mt-6 space-y-6">
                {tab === 'ingest' && (
                  <>
                    <Card
                      title="RESO ingestion"
                      description={isReso ? `Fetch ${resource} records from the RESO Web API, translate them to the internal schema, validate each one, and store the valid records under your account.` : 'Pull records from a RESO Web API (OData) feed.'}
                    >
                      {!isReso ? (
                        <Notice>This flow&apos;s source is {flow.source_type}. Change the source to RESO with <button onClick={() => setEditing(true)} className="font-medium text-sky-300 underline-offset-2 hover:underline">Edit</button> to enable RESO ingestion.</Notice>
                      ) : (
                        <div className="space-y-5">
                          <div className="grid gap-4 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                            <Field label="OData $filter" htmlFor="odata-filter">
                              <input id="odata-filter" type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ListPrice gt 300000 and ListPrice lt 2000000" className={`${inputClass} font-mono`} />
                            </Field>
                            <Field label="Max records" htmlFor="max-records">
                              <input id="max-records" type="number" min={1} max={1000} value={top} onChange={(e) => setTop(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))} className={inputClass} />
                            </Field>
                            <Button variant="primary" icon={Play} loading={ingesting} disabled={!isActive} onClick={runIngestion} title={!isActive ? 'Activate the flow to run ingestion' : undefined}>
                              Run ingestion
                            </Button>
                          </div>

                          {ingestError && <Notice tone="error">{ingestError}</Notice>}

                          {result && (
                            <div className="rounded-lg border border-slate-800 bg-slate-950/40">
                              <div className="grid grid-cols-3 divide-x divide-slate-800">
                                {[
                                  { label: 'Fetched', value: result.records_ingested, cls: 'text-white' },
                                  { label: 'Stored', value: result.records_validated, cls: 'text-emerald-300' },
                                  { label: 'Rejected', value: result.records_failed, cls: result.records_failed ? 'text-red-300' : 'text-white' },
                                ].map((s) => (
                                  <div key={s.label} className="px-4 py-3" data-testid={`result-${s.label.toLowerCase()}`}>
                                    <p className="text-xs text-slate-400">{s.label}</p>
                                    <p className={`mt-1 text-xl font-semibold tabular-nums ${s.cls}`}>{s.value}</p>
                                  </div>
                                ))}
                              </div>
                              {failures.length > 0 ? (
                                <div className="border-t border-slate-800 px-4 py-3">
                                  <p className="mb-2 text-xs font-medium text-red-300">Rejected by validation</p>
                                  <ul className="space-y-1.5 text-sm">
                                    {failures.map((f, i) => (
                                      <li key={i} className="flex flex-wrap gap-x-2">
                                        <span className="font-mono text-slate-200">{f.source_key ?? '(no key)'}</span>
                                        <span className="text-slate-400">{f.errors.join(' · ')}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                <p className="border-t border-slate-800 px-4 py-3 text-sm text-emerald-300">All fetched records passed validation.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>

                    <Card title="Manual import" description="Paste records that are already in the internal schema. listing_id and address are required; each record is validated before it's stored.">
                      <Field label="Records (JSON array)" htmlFor="batch-json">
                        <textarea id="batch-json" value={batchJson} onChange={(e) => setBatchJson(e.target.value)} spellCheck={false} rows={9} className={`${textareaClass} font-mono text-xs leading-relaxed resize-y`} />
                      </Field>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button variant="primary" icon={Upload} loading={batchBusy} disabled={!isActive} onClick={runBatch} title={!isActive ? 'Activate the flow to import records' : undefined}>Import records</Button>
                        {batchResult && (
                          <p className="text-sm text-slate-300" data-testid="batch-result">
                            Imported <span className="font-semibold text-emerald-300">{batchResult.records_ingested}</span> of {batchResult.records_processed} · <span className="font-semibold text-red-300">{batchResult.records_failed}</span> rejected
                          </p>
                        )}
                      </div>
                      {batchError && <div className="mt-4"><Notice tone="error">{batchError}</Notice></div>}
                      {batchResult && batchResult.failures.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm text-slate-400">
                          {batchResult.failures.map((errs, i) => <li key={i}>• {errs.join(' · ')}</li>)}
                        </ul>
                      )}
                    </Card>
                  </>
                )}

                {tab === 'records' && (
                  <Card title="Ingested records" description="Records stored for this flow under your account. Other users can't see them." actions={<span className="text-xs text-slate-500" data-testid="records-count">{recordsCount} total</span>} padded={false}>
                    {records.length === 0 ? (
                      <EmptyState icon={Database} title="No records yet" description="Run an ingestion or import records to see them here." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                              <th className="px-4 py-3 font-medium">Listing ID</th>
                              <th className="px-4 py-3 font-medium">Address</th>
                              <th className="px-4 py-3 text-right font-medium">Price</th>
                              <th className="px-4 py-3 text-right font-medium">Beds</th>
                              <th className="px-4 py-3 text-right font-medium">Baths</th>
                              <th className="px-4 py-3 text-right font-medium">Sq ft</th>
                              <th className="px-4 py-3 font-medium">Source</th>
                              <th className="px-4 py-3 font-medium">Ingested</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {records.map((r) => (
                              <tr key={r.id} className="text-slate-300 hover:bg-slate-800/30">
                                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-100">{String(r.data.listing_id ?? '—')}</td>
                                <td className="px-4 py-3">{String(r.data.address ?? '—')}</td>
                                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatPrice(r.data.price)}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.data.bedrooms)}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.data.bathrooms)}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.data.square_feet)}</td>
                                <td className="px-4 py-3"><Tag>{r.run_id ? 'RESO' : 'Manual'}</Tag></td>
                                <td className="whitespace-nowrap px-4 py-3 text-slate-400" title={parseUtc(r.created_at).toLocaleString()}>{relativeTime(parseUtc(r.created_at))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                )}

                {tab === 'runs' && (
                  <Card title="Run history" description="Every RESO ingestion attempt, newest first." padded={false}>
                    {runs.length === 0 ? (
                      <EmptyState icon={History} title="No runs yet" description="Runs appear here after you start an ingestion." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                              <th className="px-4 py-3 font-medium">Started</th>
                              <th className="px-4 py-3 font-medium">Status</th>
                              <th className="px-4 py-3 text-right font-medium">Stored</th>
                              <th className="px-4 py-3 text-right font-medium">Rejected</th>
                              <th className="px-4 py-3 text-right font-medium">Duration</th>
                              <th className="px-4 py-3 font-medium">Error</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {runs.map((run) => (
                              <tr key={run.id} className="text-slate-300">
                                <td className="whitespace-nowrap px-4 py-3">{run.started_at ? parseUtc(run.started_at).toLocaleString() : '—'}</td>
                                <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                                <td className="px-4 py-3 text-right tabular-nums">{run.records_processed}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{run.records_failed}</td>
                                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-400">{duration(run)}</td>
                                <td className="max-w-xs truncate px-4 py-3 text-red-300" title={run.error_log?.error ?? ''}>{run.error_log?.error ?? ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                )}
              </div>
            </div>

            <aside className="space-y-6">
              <Card title="Details">
                <DetailList
                  items={[
                    { label: 'Status', value: <StatusBadge status={flow.status} /> },
                    { label: 'Source', value: <Tag>{flow.source_type}</Tag> },
                    ...(isReso
                      ? [
                          { label: 'Resource', value: resource },
                          { label: 'Default filter', value: defaultFilter ? <code className="font-mono text-xs text-slate-200">{defaultFilter}</code> : <span className="text-slate-500">None</span> },
                        ]
                      : []),
                    { label: 'Destination', value: <Tag>{flow.destination_type}</Tag> },
                    {
                      label: 'Encryption',
                      value: flow.encryption_enabled
                        ? <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-emerald-400" />Enabled</span>
                        : <span className="inline-flex items-center gap-1.5 text-slate-400"><Unlock className="h-3.5 w-3.5 text-amber-400" />Off</span>,
                    },
                    { label: 'Flow ID', value: <CopyButton value={flow.id} /> },
                    { label: 'Created', value: <span title={parseUtc(flow.created_at).toLocaleString()}>{parseUtc(flow.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span> },
                    { label: 'Updated', value: <span title={parseUtc(flow.updated_at).toLocaleString()}>{relativeTime(parseUtc(flow.updated_at))}</span> },
                  ]}
                />
              </Card>
            </aside>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Delete this flow?"
        description={<>“{flow.name}” and its <strong className="text-slate-200">{recordsCount} stored record{recordsCount !== 1 ? 's' : ''}</strong> and run history will be permanently deleted. This can&apos;t be undone.</>}
        confirmLabel="Delete flow"
        busy={deleting}
        onConfirm={deleteFlow}
        onCancel={() => setConfirmDelete(false)}
      />
    </AppShell>
  );
}
