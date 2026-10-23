'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import FlowForm, { emptyFlowForm, toFlowPayload } from '@/components/FlowForm';
import { PageHeader, useToast } from '@/components/ui';
import { api, AuthRequiredError, hasSession, type DataFlow } from '@/lib/api';

export default function CreateFlowPage() {
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (!hasSession()) router.replace('/login');
  }, [router]);

  return (
    <AppShell narrow>
      <PageHeader
        breadcrumbs={[{ label: 'Flows', href: '/dashboard' }, { label: 'New flow' }]}
        title="Create a data flow"
        description="New flows start as Draft. Activate a flow when it's ready to ingest data."
      />
      <FlowForm
        initial={emptyFlowForm}
        submitLabel="Create flow"
        onCancel={() => router.push('/dashboard')}
        onSubmit={async (values) => {
          try {
            const flow = await api<DataFlow>('/api/data-flows/', {
              method: 'POST',
              body: JSON.stringify({ ...toFlowPayload(values), destination_config: {} }),
            });
            toast(`Flow "${flow.name}" created`);
            router.push(`/dashboard/${flow.id}`);
          } catch (err) {
            if (err instanceof AuthRequiredError) router.replace('/login');
            throw err;
          }
        }}
      />
    </AppShell>
  );
}
