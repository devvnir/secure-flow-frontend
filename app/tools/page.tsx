'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowRightLeft, CheckCircle2, Plus, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import AppShell from '@/components/AppShell';
import CustomDropdown from '@/components/CustomDropdown';
import { Button, Card, Field, Notice, PageHeader, Tabs, Tag, inputClass, textareaClass, useToast } from '@/components/ui';
import { api, AuthRequiredError, hasSession } from '@/lib/api';

interface SchemaMapping {
  key: string;
  source_schema: string;
  destination_schema: string;
  field_mappings: Record<string, string>;
}

interface ValidationSchema {
  name: string;
  required: string[];
  types: Record<string, string[]>;
}

interface TranslateResult {
  translated: Record<string, unknown>;
  unmapped_fields: string[];
}

type Tool = 'translate' | 'validate' | 'mappings';

const SAMPLE_RESO = JSON.stringify(
  { ListingKey: 'RESO_DEMO_1', ListPrice: '650000', PropertyAddress: '42 Lombard Street, San Francisco, CA', BedroomsTotal: 3, ModificationTimestamp: '2026-10-22T09:00:00Z', InternalNote: 'not mapped' },
  null,
  2
);
const SAMPLE_PAYLOAD = JSON.stringify({ listing_id: 'A1', price: 'expensive', bedrooms: 2 }, null, 2);

function parseObject(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object, e.g. {"field": "value"}');
  return value as Record<string, unknown>;
}

const ResultPlaceholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-full min-h-[12rem] items-center justify-center rounded-lg border border-dashed border-slate-700/70 p-4 text-center text-sm text-slate-500">{children}</div>
);

export default function SchemaToolsPage() {
  const router = useRouter();
  const toast = useToast();
  const [tool, setTool] = useState<Tool>('translate');
  const [mappings, setMappings] = useState<SchemaMapping[]>([]);
  const [schemas, setSchemas] = useState<ValidationSchema[]>([]);
  const [loadError, setLoadError] = useState('');

  const [mappingKey, setMappingKey] = useState('reso_to_internal');
  const [record, setRecord] = useState(SAMPLE_RESO);
  const [translateBusy, setTranslateBusy] = useState(false);
  const [translateError, setTranslateError] = useState('');
  const [translateResult, setTranslateResult] = useState<TranslateResult | null>(null);

  const [schemaName, setSchemaName] = useState('internal');
  const [payload, setPayload] = useState(SAMPLE_PAYLOAD);
  const [validateBusy, setValidateBusy] = useState(false);
  const [validateError, setValidateError] = useState('');
  const [validateResult, setValidateResult] = useState<{ valid: boolean; errors: string[] } | null>(null);

  const [newSource, setNewSource] = useState('');
  const [newDest, setNewDest] = useState('internal');
  const [rows, setRows] = useState([{ from: '', to: '' }]);
  const [mappingBusy, setMappingBusy] = useState(false);
  const [mappingError, setMappingError] = useState('');

  const fail = useCallback(
    (err: unknown, setter: (m: string) => void) => {
      if (err instanceof AuthRequiredError) router.replace('/login');
      else setter(err instanceof Error ? err.message : 'Something went wrong');
    },
    [router]
  );

  const loadMappings = useCallback(() => api<SchemaMapping[]>('/api/ingestion/schema-mappings').then(setMappings), []);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    Promise.all([loadMappings(), api<ValidationSchema[]>('/api/ingestion/schemas').then(setSchemas)]).catch((err) => fail(err, setLoadError));
  }, [router, loadMappings, fail]);

  const selectedMapping = mappings.find((m) => m.key === mappingKey);
  const selectedSchema = schemas.find((s) => s.name === schemaName);

  const translate = async () => {
    setTranslateError('');
    setTranslateResult(null);
    if (!selectedMapping) return;
    setTranslateBusy(true);
    try {
      setTranslateResult(
        await api<TranslateResult>('/api/ingestion/translate-schema', {
          method: 'POST',
          body: JSON.stringify({ record: parseObject(record), source_schema: selectedMapping.source_schema, destination_schema: selectedMapping.destination_schema }),
        })
      );
    } catch (err) {
      fail(err, setTranslateError);
    } finally {
      setTranslateBusy(false);
    }
  };

  const validate = async () => {
    setValidateError('');
    setValidateResult(null);
    setValidateBusy(true);
    try {
      setValidateResult(await api('/api/ingestion/validate-payload', { method: 'POST', body: JSON.stringify({ data: parseObject(payload), schema_name: schemaName }) }));
    } catch (err) {
      fail(err, setValidateError);
    } finally {
      setValidateBusy(false);
    }
  };

  const saveMapping = async () => {
    setMappingError('');
    const source = newSource.trim();
    const dest = newDest.trim();
    const fields = rows.filter((r) => r.from.trim() && r.to.trim());
    if (!/^[a-z0-9_]+$/i.test(source) || !/^[a-z0-9_]+$/i.test(dest)) {
      setMappingError('Schema names may only contain letters, numbers and underscores.');
      return;
    }
    if (fields.length === 0) {
      setMappingError('Add at least one field mapping.');
      return;
    }
    setMappingBusy(true);
    try {
      await api('/api/ingestion/schema-mappings', {
        method: 'POST',
        body: JSON.stringify({ source_schema: source, destination_schema: dest, field_mappings: Object.fromEntries(fields.map((r) => [r.from.trim(), r.to.trim()])) }),
      });
      await loadMappings();
      setMappingKey(`${source}_to_${dest}`);
      setNewSource('');
      setRows([{ from: '', to: '' }]);
      toast(`Mapping ${source} → ${dest} saved`);
    } catch (err) {
      fail(err, setMappingError);
    } finally {
      setMappingBusy(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Schema tools" description="Preview schema translation, check payloads against validation rules, and manage field mappings." />
      {loadError && <div className="mb-6"><Notice tone="error">{loadError}</Notice></div>}

      <Tabs<Tool>
        value={tool}
        onChange={setTool}
        tabs={[
          { value: 'translate', label: 'Translate' },
          { value: 'validate', label: 'Validate' },
          { value: 'mappings', label: 'Mappings', count: mappings.length },
        ]}
      />

      <div className="mt-6">
        {tool === 'translate' && (
          <Card title="Translate a record" description="Run a record through a field mapping and see the output exactly as ingestion would store it.">
            <div className="mb-5 max-w-xs">
              <CustomDropdown
                label="Mapping"
                value={mappingKey}
                onChange={(v) => {
                  setMappingKey(v);
                  setTranslateResult(null);
                }}
                options={mappings.map((m) => ({ value: m.key, label: `${m.source_schema} → ${m.destination_schema}` }))}
              />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label="Input record (JSON)" htmlFor="translate-input">
                <textarea id="translate-input" value={record} onChange={(e) => setRecord(e.target.value)} spellCheck={false} rows={11} className={`${textareaClass} font-mono text-xs leading-relaxed resize-y`} />
              </Field>
              <div className="flex flex-col">
                <p className="mb-1.5 text-sm font-medium text-slate-200">Output</p>
                {translateError ? (
                  <Notice tone="error">{translateError}</Notice>
                ) : translateResult ? (
                  <div className="flex flex-1 flex-col gap-3">
                    <pre data-testid="translate-output" className="flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs leading-relaxed text-emerald-200">
                      {JSON.stringify(translateResult.translated, null, 2)}
                    </pre>
                    <p className="text-xs text-slate-400">
                      {translateResult.unmapped_fields.length ? (
                        <>Dropped (not in mapping): {translateResult.unmapped_fields.map((f) => <Tag key={f} mono>{f}</Tag>)}</>
                      ) : 'Every input field was mapped.'}
                    </p>
                  </div>
                ) : (
                  <ResultPlaceholder>Run a translation to see the output.</ResultPlaceholder>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end border-t border-slate-800 pt-5">
              <Button variant="primary" icon={ArrowRightLeft} loading={translateBusy} disabled={!selectedMapping} onClick={translate}>Translate</Button>
            </div>
          </Card>
        )}

        {tool === 'validate' && (
          <Card title="Validate a payload" description="Check a record against a validation schema before ingesting it.">
            <div className="mb-5 grid gap-4 md:grid-cols-[240px_1fr] md:items-end">
              <CustomDropdown
                label="Schema"
                value={schemaName}
                onChange={(v) => {
                  setSchemaName(v);
                  setValidateResult(null);
                }}
                options={schemas.map((s) => s.name)}
              />
              {selectedSchema && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                  <span>Required:</span>
                  {selectedSchema.required.map((f) => <Tag key={f} mono>{f}</Tag>)}
                  <span className="ml-2">Typed:</span>
                  {Object.entries(selectedSchema.types).map(([f, t]) => <Tag key={f} mono>{f}: {t.join('|')}</Tag>)}
                </div>
              )}
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label="Payload (JSON)" htmlFor="validate-input">
                <textarea id="validate-input" value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} rows={9} className={`${textareaClass} font-mono text-xs leading-relaxed resize-y`} />
              </Field>
              <div className="flex flex-col">
                <p className="mb-1.5 text-sm font-medium text-slate-200">Result</p>
                {validateError ? (
                  <Notice tone="error">{validateError}</Notice>
                ) : validateResult ? (
                  <div data-testid="validate-output" className={`rounded-lg border p-4 ${validateResult.valid ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <p className={`flex items-center gap-2 text-sm font-semibold ${validateResult.valid ? 'text-emerald-300' : 'text-red-300'}`}>
                      {validateResult.valid ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {validateResult.valid ? 'Valid payload' : `Invalid payload (${validateResult.errors.length} problem${validateResult.errors.length !== 1 ? 's' : ''})`}
                    </p>
                    {validateResult.errors.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
                        {validateResult.errors.map((e) => <li key={e}>{e}</li>)}
                      </ul>
                    )}
                  </div>
                ) : (
                  <ResultPlaceholder>Run validation to see the result.</ResultPlaceholder>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end border-t border-slate-800 pt-5">
              <Button variant="primary" icon={ShieldCheck} loading={validateBusy} disabled={!selectedSchema} onClick={validate}>Validate</Button>
            </div>
          </Card>
        )}

        {tool === 'mappings' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Card title="Registered mappings" description="Field mappings available to the translator and ingestion." padded={false}>
              <ul className="divide-y divide-slate-800">
                {mappings.map((m) => (
                  <li key={m.key} className="min-w-0 px-5 py-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                      <Tag mono>{m.source_schema}</Tag>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                      <Tag mono>{m.destination_schema}</Tag>
                      <span className="ml-auto text-xs font-normal text-slate-500">{Object.keys(m.field_mappings).length} fields</span>
                    </div>
                    <p className="mt-2 truncate font-mono text-xs text-slate-500" title={Object.entries(m.field_mappings).map(([a, b]) => `${a} → ${b}`).join(', ')}>
                      {Object.entries(m.field_mappings).map(([a, b]) => `${a}→${b}`).join('  ·  ')}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Register a mapping" description="Kept in server memory; resets when the backend restarts.">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Source schema" htmlFor="map-source">
                    <input id="map-source" value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="legacy_mls" className={`${inputClass} font-mono`} />
                  </Field>
                  <Field label="Destination" htmlFor="map-dest">
                    <input id="map-dest" value={newDest} onChange={(e) => setNewDest(e.target.value)} placeholder="internal" className={`${inputClass} font-mono`} />
                  </Field>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-200">Fields</p>
                  <div className="space-y-2">
                    {rows.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                        <input aria-label={`Source field ${i + 1}`} value={row.from} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, from: e.target.value } : r)))} placeholder="Source" className={`${inputClass} font-mono`} />
                        <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                        <input aria-label={`Destination field ${i + 1}`} value={row.to} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, to: e.target.value } : r)))} placeholder="Destination" className={`${inputClass} font-mono`} />
                        <button type="button" aria-label="Remove field" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ from: '', to: '' }])} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-300">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => setRows([...rows, { from: '', to: '' }])}>Add field</Button>
                </div>
                {mappingError && <Notice tone="error">{mappingError}</Notice>}
                <div className="flex justify-end border-t border-slate-800 pt-4">
                  <Button variant="primary" loading={mappingBusy} onClick={saveMapping}>Save mapping</Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
