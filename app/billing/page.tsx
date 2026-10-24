'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CreditCard, ExternalLink, Receipt, RefreshCw } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Button, Card, DetailList, EmptyState, Notice, PageHeader, Skeleton, Tag, cx } from '@/components/ui';
import { api, AuthRequiredError, hasSession, parseUtc } from '@/lib/api';

interface Plan {
  name: string;
  amount: number;
  currency: string;
  interval: string;
}

interface SubscriptionInfo {
  status: string;
  stripe_subscription_id?: string;
  price_id?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  plan?: Plan;
}

interface LedgerEntry {
  event_id: string;
  type: string;
  invoice_id: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  created: number;
}

const ACTIVE = ['active', 'trialing', 'past_due'];
const FEATURES = ['Unlimited data flows and RESO ingestion', 'Process enclave sanitization with forensic audit chain', 'Client-side encrypted vault', 'Broker overlay and electronic signatures'];

const money = (amount: number | null, currency: string | null) =>
  amount === null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(amount / 100);

const SUB_STYLES: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' },
  trialing: { label: 'Trialing', cls: 'bg-sky-500/10 text-sky-300 ring-sky-500/25' },
  past_due: { label: 'Past due', cls: 'bg-amber-500/10 text-amber-300 ring-amber-500/25' },
  canceled: { label: 'Canceled', cls: 'bg-slate-500/10 text-slate-300 ring-slate-500/30' },
  incomplete: { label: 'Incomplete', cls: 'bg-amber-500/10 text-amber-300 ring-amber-500/25' },
  incomplete_expired: { label: 'Expired', cls: 'bg-slate-500/10 text-slate-400 ring-slate-600/30' },
  unpaid: { label: 'Unpaid', cls: 'bg-red-500/10 text-red-300 ring-red-500/25' },
  none: { label: 'No subscription', cls: 'bg-slate-500/10 text-slate-400 ring-slate-600/30' },
};

function SubBadge({ status }: { status: string }) {
  const s = SUB_STYLES[status] ?? { label: status, cls: SUB_STYLES.none.cls };
  return <span data-testid="subscription-status" className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', s.cls)}>{s.label}</span>;
}

const LEDGER_LABEL: Record<string, string> = { 'invoice.paid': 'Paid', 'invoice.payment_succeeded': 'Paid', 'invoice.payment_failed': 'Payment failed' };

export default function BillingPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null);
  const [checkoutState, setCheckoutState] = useState<'success' | 'cancelled' | null>(null);
  const [activating, setActivating] = useState(false);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof AuthRequiredError) router.replace('/login');
      else setError(err instanceof Error ? err.message : 'Something went wrong');
    },
    [router]
  );

  const load = useCallback(async () => {
    const [p, s, l] = await Promise.all([
      api<Plan>('/api/billing/plan'),
      api<SubscriptionInfo>('/api/billing/subscription'),
      api<LedgerEntry[]>('/api/billing/ledger'),
    ]);
    setPlan(p);
    setSub(s);
    setLedger(l);
    return s;
  }, []);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const state = params.get('checkout');
    if (state === 'success' || state === 'cancelled') {
      setCheckoutState(state);
      window.history.replaceState(null, '', '/billing');
    }
    let cancelled = false;
    (async () => {
      try {
        let s = await load();
        // Stripe confirms the payment by webhook, which can arrive a few seconds after the redirect.
        if (state === 'success' && !ACTIVE.includes(s.status)) {
          setActivating(true);
          for (let i = 0; i < 15 && !cancelled && !ACTIVE.includes(s.status); i++) {
            await new Promise((r) => setTimeout(r, 2000));
            s = await load();
          }
          setActivating(false);
        }
      } catch (err) {
        fail(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, load, fail]);

  const startCheckout = async () => {
    setError('');
    setBusy('checkout');
    try {
      const session = await api<{ url: string }>('/api/billing/checkout-session', { method: 'POST' });
      window.location.assign(session.url);
    } catch (err) {
      fail(err);
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setError('');
    setBusy('portal');
    try {
      const portal = await api<{ url: string }>('/api/billing/portal-session', { method: 'POST' });
      window.location.assign(portal.url);
    } catch (err) {
      fail(err);
      setBusy(null);
    }
  };

  const isActive = !!sub && ACTIVE.includes(sub.status);
  const periodEnd = sub?.current_period_end ? parseUtc(sub.current_period_end).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  return (
    <AppShell>
      <PageHeader
        title="Billing"
        description="Your Secure Flow subscription. Payments are processed by Stripe; card details never reach Secure Flow."
        actions={
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => load().catch(fail)}>
            Refresh
          </Button>
        }
      />

      <div className="space-y-4">
        {checkoutState === 'success' && (
          <Notice tone="success">{activating ? 'Payment received. Waiting for Stripe to confirm the subscription…' : isActive ? 'Payment received. Your subscription is active.' : 'Payment received. Confirmation is taking longer than usual; refresh in a moment.'}</Notice>
        )}
        {checkoutState === 'cancelled' && <Notice tone="warning">Checkout was cancelled. You have not been charged.</Notice>}
        {error && <Notice tone={error.includes('not configured') ? 'warning' : 'error'}>{error}</Notice>}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Card title="Plan" description="One plan, billed monthly.">
          {!plan ? (
            <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-24" /></div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-slate-300">{plan.name}</p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span data-testid="plan-price" className="text-3xl font-semibold tracking-tight text-white">{money(plan.amount, plan.currency)}</span>
                  <span className="text-sm text-slate-400">/ {plan.interval}</span>
                </p>
              </div>
              <ul className="space-y-2">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                    {f}
                  </li>
                ))}
              </ul>
              {!isActive && (
                <Button variant="primary" icon={CreditCard} loading={busy === 'checkout'} disabled={!sub || activating} onClick={startCheckout} className="w-full">
                  Subscribe for {money(plan.amount, plan.currency)} / {plan.interval}
                </Button>
              )}
            </div>
          )}
        </Card>

        <Card title="Subscription" actions={sub && <SubBadge status={sub.status} />}>
          {!sub ? (
            <div className="space-y-3"><Skeleton className="h-6" /><Skeleton className="h-6" /><Skeleton className="h-6" /></div>
          ) : sub.status === 'none' ? (
            <EmptyState icon={CreditCard} title="No subscription yet" description="Subscribe to the Base plan to activate your workspace. You will be redirected to Stripe Checkout." />
          ) : (
            <div className="space-y-5">
              <DetailList
                items={[
                  { label: 'Plan', value: sub.plan ? `${sub.plan.name} · ${money(sub.plan.amount, sub.plan.currency)} / ${sub.plan.interval}` : '-' },
                  {
                    label: sub.cancel_at_period_end || sub.status === 'canceled' ? 'Access until' : 'Renews on',
                    value: <span data-testid="period-end">{periodEnd ?? '-'}</span>,
                  },
                  { label: 'Subscription', value: <span className="font-mono text-xs">{sub.stripe_subscription_id}</span> },
                ]}
              />
              {sub.cancel_at_period_end && sub.status !== 'canceled' && <Notice tone="warning">Cancels at the end of the current period.</Notice>}
              {sub.status === 'past_due' && <Notice tone="error">The last payment failed. Update your payment method to keep the subscription active.</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button icon={ExternalLink} loading={busy === 'portal'} onClick={openPortal}>
                  Manage billing
                </Button>
                {!isActive && (
                  <Button variant="primary" icon={CreditCard} loading={busy === 'checkout'} onClick={startCheckout}>
                    Resubscribe
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6" title="Payment history" description="Invoices confirmed by Stripe webhooks. Each row matches an event in your Stripe Dashboard." padded={false}>
        {ledger === null ? (
          <div className="space-y-2 p-5"><Skeleton className="h-10" /></div>
        ) : ledger.length === 0 ? (
          <EmptyState icon={Receipt} title="No payments yet" description="Payments appear here as soon as Stripe confirms them." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">Result</th>
                  <th className="px-5 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-5 py-2.5 font-medium">Invoice</th>
                  <th className="px-5 py-2.5 font-medium">Stripe event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800" data-testid="ledger-rows">
                {ledger.map((e) => (
                  <tr key={e.event_id} className="text-slate-300">
                    <td className="px-5 py-3 whitespace-nowrap">{new Date(e.created * 1000).toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className={e.type === 'invoice.payment_failed' ? 'text-red-300' : 'text-emerald-300'}>{LEDGER_LABEL[e.type] ?? e.type}</span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{money(e.amount, e.currency)}</td>
                    <td className="px-5 py-3"><Tag mono>{e.invoice_id ?? '-'}</Tag></td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{e.event_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}

