'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ChevronRight, Lock, Unlock, Plus, Search, Workflow } from 'lucide-react';
import AppShell from '@/components/AppShell';
import CustomDropdown from '@/components/CustomDropdown';
import { Card, EmptyState, Notice, PageHeader, Skeleton, Stat, StatusBadge, Tag, buttonClass } from '@/components/ui';
import { api, AuthRequiredError, hasSession, parseUtc, type DataFlow } from '@/lib/api';
import { SOURCE_TYPES, STATUS_LABELS, relativeTime } from '@/lib/ui';

const STATUS_FILTERS = [{ value: '', label: 'All statuses' }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))];
const SOURCE_FILTERS = [{ value: '', label: 'All sources' }, ...SOURCE_TYPES.map((s) => ({ value: s, label: s }))];

export default function DashboardPage() {
  const router = useRouter();
  const [allFlows, setAllFlows] = useState<DataFlow[] | null>(null);
  const [flows, setFlows] = useState<DataFlow[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const filtering = !!(status || source || debouncedSearch);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    api<DataFlow[]>('/api/data-flows/').then(setAllFlows).catch((err) => {
      if (err instanceof AuthRequiredError) router.replace('/login');
      else setError(err.message);
    });
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!filtering) {
      setFlows(allFlows);
      return;
    }
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (source) params.set('source_type', source);
    if (debouncedSearch) params.set('search', debouncedSearch);
    api<DataFlow[]>(`/api/data-flows/?${params}`).then(setFlows).catch((err) => {
      if (err instanceof AuthRequiredError) router.replace('/login');
      else setError(err.message);
    });
  }, [status, source, debouncedSearch, filtering, allFlows, router]);

  const counts = useMemo(() => {
    const c = { total: allFlows?.length ?? 0, active: 0, draft: 0, paused: 0, archived: 0 };
    allFlows?.forEach((f) => (c[f.status] += 1));
    return c;
  }, [allFlows]);

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setSource('');
  };

  const loading = allFlows === null && !error;
  const noFlowsAtAll = allFlows !== null && allFlows.length === 0;

  return (
    <AppShell>
      <PageHeader
        title="Data flows"
        description="Pipelines that move data from a source into a destination, with validation and per-user access control."
        actions={
          <Link href="/dashboard/create" className={buttonClass('primary')}>
            <Plus className="h-4 w-4" />
            New flow
          </Link>
        }
      />

      {error && <div className="mb-6"><Notice tone="error">{error}</Notice></div>}

      {noFlowsAtAll ? (
        <Card>
          <EmptyState
            icon={Workflow}
            title="No data flows yet"
            description="Create a flow to connect a RESO feed or another source, validate the records and store them securely."
            action={
              <Link href="/dashboard/create" className={buttonClass('primary')}>
                Create your first flow
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="flow-stats">
            <Stat label="Total flows" value={loading ? '–' : counts.total} />
            <Stat label="Active" value={loading ? '–' : counts.active} tone={counts.active ? 'good' : 'default'} hint="Ready to ingest" />
            <Stat label="Draft" value={loading ? '–' : counts.draft} hint="Not yet activated" />
            <Stat label="Paused / archived" value={loading ? '–' : counts.paused + counts.archived} />
          </div>

          <Card padded={false}>
            <div className="flex flex-col gap-3 border-b border-slate-800 p-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name"
                  aria-label="Search flows"
                  className="block h-9 w-full rounded-lg border border-slate-700 bg-slate-950/60 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors hover:border-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
              <CustomDropdown className="md:w-44" value={status} onChange={setStatus} options={STATUS_FILTERS} ariaLabel="Filter by status" />
              <CustomDropdown className="md:w-44" value={source} onChange={setSource} options={SOURCE_FILTERS} ariaLabel="Filter by source" />
            </div>

            {loading || flows === null ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : flows.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No flows match these filters"
                description="Try a different search term or clear the filters."
                action={<button onClick={clearFilters} className={buttonClass('secondary', 'sm')}>Clear filters</button>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs font-medium text-slate-400">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Pipeline</th>
                      <th className="px-4 py-3 font-medium">Encryption</th>
                      <th className="px-4 py-3 font-medium">Updated</th>
                      <th className="w-10 px-4 py-3"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {flows.map((flow) => (
                      <tr
                        key={flow.id}
                        onClick={() => router.push(`/dashboard/${flow.id}`)}
                        className="group cursor-pointer transition-colors hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3.5">
                          <Link href={`/dashboard/${flow.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-100 group-hover:text-white hover:underline">
                            {flow.name}
                          </Link>
                          {flow.description && <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">{flow.description}</p>}
                        </td>
                        <td className="px-4 py-3.5"><StatusBadge status={flow.status} /></td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <Tag>{flow.source_type}</Tag>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
                            <Tag>{flow.destination_type}</Tag>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {flow.encryption_enabled ? (
                            <span className="inline-flex items-center gap-1.5 text-slate-300"><Lock className="h-3.5 w-3.5 text-emerald-400" />Enabled</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-slate-400"><Unlock className="h-3.5 w-3.5 text-amber-400" />Off</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-400" title={parseUtc(flow.updated_at).toLocaleString()}>
                          {relativeTime(parseUtc(flow.updated_at))}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 group-hover:text-slate-300"><ChevronRight className="h-4 w-4" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {flows && flows.length > 0 && (
              <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500" data-testid="flow-summary">
                {filtering ? `${flows.length} of ${counts.total} flows match` : `${counts.total} flow${counts.total !== 1 ? 's' : ''}`}
                {filtering && <button onClick={clearFilters} className="ml-3 text-sky-400 hover:text-sky-300">Clear filters</button>}
              </div>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
