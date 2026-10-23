'use client';

import { useState } from 'react';
import CustomDropdown from '@/components/CustomDropdown';
import { Button, Field, Notice, Toggle, inputClass, textareaClass } from '@/components/ui';
import { DESTINATION_TYPES, RESO_RESOURCES, SOURCE_TYPES } from '@/lib/ui';

export interface FlowFormValues {
  name: string;
  description: string;
  source_type: string;
  destination_type: string;
  encryption_enabled: boolean;
  reso_resource: string;
  reso_filter: string;
}

export const emptyFlowForm: FlowFormValues = {
  name: '',
  description: '',
  source_type: 'RESO',
  destination_type: 'Database',
  encryption_enabled: true,
  reso_resource: 'Property',
  reso_filter: '',
};

export function toFlowPayload(values: FlowFormValues, existingSourceConfig: Record<string, unknown> = {}) {
  const isReso = values.source_type === 'RESO';
  const sourceConfig = isReso
    ? { ...existingSourceConfig, resource: values.reso_resource, filter: values.reso_filter.trim() || undefined }
    : Object.fromEntries(Object.entries(existingSourceConfig).filter(([k]) => k !== 'resource' && k !== 'filter'));
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    source_type: values.source_type,
    destination_type: values.destination_type,
    encryption_enabled: values.encryption_enabled,
    source_config: JSON.parse(JSON.stringify(sourceConfig)),
  };
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-6 border-b border-slate-800 px-5 py-6 last:border-b-0 md:grid-cols-[220px_1fr] md:gap-10">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      <div className="space-y-5 min-w-0">{children}</div>
    </div>
  );
}

interface FlowFormProps {
  initial: FlowFormValues;
  submitLabel: string;
  onSubmit: (values: FlowFormValues) => Promise<void>;
  onCancel: () => void;
}

export default function FlowForm({ initial, submitLabel, onSubmit, onCancel }: FlowFormProps) {
  const [values, setValues] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof FlowFormValues>(key: K, value: FlowFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      setError('Flow name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-800 bg-slate-900/50">
      {error && <div className="px-5 pt-5"><Notice tone="error">{error}</Notice></div>}

      <Section title="General" description="A name your team will recognise, and an optional note about its purpose.">
        <Field label="Name" htmlFor="flow-name" required>
          <input id="flow-name" type="text" placeholder="e.g. Bay Area listings" value={values.name} maxLength={255} onChange={(e) => set('name', e.target.value)} required className={inputClass} autoFocus />
        </Field>
        <Field label="Description" htmlFor="flow-description">
          <textarea id="flow-description" rows={3} placeholder="What does this flow do?" value={values.description} onChange={(e) => set('description', e.target.value)} className={`${textareaClass} resize-none`} />
        </Field>
      </Section>

      <Section title="Source" description="Where records come from. RESO flows pull listings from a RESO Web API (OData) feed.">
        <CustomDropdown label="Source type" value={values.source_type} onChange={(v) => set('source_type', v)} options={SOURCE_TYPES} required />
        {values.source_type === 'RESO' && (
          <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
            <CustomDropdown label="Resource" value={values.reso_resource} onChange={(v) => set('reso_resource', v)} options={RESO_RESOURCES} />
            <Field label="Default filter" htmlFor="reso-filter" hint="OData $filter, used when a run doesn't specify its own.">
              <input id="reso-filter" type="text" placeholder="ListPrice gt 300000" value={values.reso_filter} onChange={(e) => set('reso_filter', e.target.value)} className={`${inputClass} font-mono`} />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Destination & security" description="Where validated records are written, and how they're protected.">
        <CustomDropdown label="Destination type" value={values.destination_type} onChange={(v) => set('destination_type', v)} options={DESTINATION_TYPES} required />
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <Toggle id="encryption" checked={values.encryption_enabled} onChange={(v) => set('encryption_enabled', v)} label="Encryption" description="Encrypt records in transit. Recommended for personal or financial data." />
        </div>
      </Section>

      <div className="flex justify-end gap-2 rounded-b-xl border-t border-slate-800 bg-slate-900/60 px-5 py-4">
        <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" variant="primary" loading={submitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
