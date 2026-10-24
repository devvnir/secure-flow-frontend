'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, CreditCard, ExternalLink, Layers, Lock, Receipt, RefreshCw, Repeat } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Button, Card, ConfirmDialog, DetailList, EmptyState, Notice, PageHeader, Skeleton, Tag, cx } from '@/components/ui';
import { api, AuthRequiredError, hasSession, parseUtc } from '@/lib/api';

/** A subscription tier exactly as defined in Stripe (a recurring Price tagged with tier_id). */
interface Tier {
  price_id: string;
  tier_id: string;
  name: string;
  description: string | null;
  nickname: string | null;
  billing_scheme: 'per_unit' | 'tiered';
  unit_amount: number | null;
  currency: string;
  tiers_mode: 'graduated' | 'volume' | null;
  tiers: { up_to: number | null; unit_amount: number | null; flat_amount: number | null }[] | null;
  interval: string | null;
  interval_count: number | null;
  features: string[];
}

type Method = 'ach' | 'card';

interface PaymentOption {
  id: Method;
  label: string;
  fee_bps: number;
  fee_percent: number;
}

/** Server-calculated price for one period: the fee is never computed in the browser. */
interface Quote {
  price_id: string;
  payment_method: Method;
  quantity: number;
  currency: string;
  interval: string | null;
  interval_count: number | null;
  base_amount: number;
  fee_bps: number;
  fee_amount: number;
  total_amount: number;
}

interface SubscriptionInfo {
  status: string;
  stripe_subscription_id?: string;
  tier_id?: string | null;
  price_id?: string | null;
  currency?: string | null;
  interval?: string | null;
  interval_count?: number | null;
  quantity?: number | null;
  payment_method?: Method | null;
  payment_status?: 'paid' | 'processing' | 'failed' | 'pending';
  fee_bps?: number;
  fee_amount?: number;
  base_amount?: number | null;
  total_amount?: number | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  plan?: Tier | null;
}

interface LedgerEntry {
  event_id: string;
  type: string;
  invoice_id: string | null;
  amount: number | null;
  fee_amount: number;
  currency: string | null;
  payment_method: Method | null;
  tier_id: string | null;
  status: string;
  created: number;
}

const ACTIVE = ['active', 'trialing', 'past_due'];
const METHOD_LABEL: Record<Method, string> = { ach: 'Bank account (ACH)', card: 'Card' };

const money = (amount: number | null | undefined, currency: string | null | undefined) =>
  amount === null || amount === undefined ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(amount / 100);

const per = (interval: string | null | undefined, count: number | null | undefined) =>
  !interval ? '' : count && count > 1 ? `every ${count} ${interval}s` : interval;

const pct = (bps: number) => `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

function tierPrice(t: Tier) {
  if (t.billing_scheme !== 'tiered' || !t.tiers?.length) return { amount: money(t.unit_amount, t.currency), suffix: `/ ${per(t.interval, t.interval_count)}` };
  const lowest = Math.min(...t.tiers.map((x) => x.unit_amount ?? Infinity));
  return { amount: `From ${money(Number.isFinite(lowest) ? lowest : null, t.currency)}`, suffix: `/ unit / ${per(t.interval, t.interval_count)}` };
}

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

function Steps({ step }: { step: 1 | 2 }) {
  const items = ['Choose a tier', 'Payment method', 'Secure checkout'];
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Checkout steps">
      {items.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'current' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 && <span className="h-px w-6 bg-slate-700" />}
            <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
              state === 'done' ? 'bg-sky-500 text-white' : state === 'current' ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/50' : 'bg-slate-800 text-slate-500')}>
              {state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
            </span>
            <span className={state === 'todo' ? 'text-slate-500' : 'text-slate-200'}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function TierCard({ tier, current, action }: { tier: Tier; current: boolean; action?: React.ReactNode }) {
  const price = tierPrice(tier);
  return (
    <section data-testid={`tier-${tier.tier_id}`} className={cx('flex flex-col rounded-xl border bg-slate-900/50 p-5', current ? 'border-sky-500/60 ring-1 ring-sky-500/30' : 'border-slate-800')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">{tier.name}</p>
          {(tier.nickname || tier.description) && <p className="mt-0.5 text-xs text-slate-500">{tier.nickname || tier.description}</p>}
        </div>
        {current && <span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300 ring-1 ring-inset ring-sky-500/25">Current</span>}
      </div>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
        <span data-testid="tier-price" className="text-2xl font-semibold tracking-tight text-white">{price.amount}</span>
        <span className="text-sm text-slate-400">{price.suffix}</span>
      </p>
      {tier.billing_scheme === 'tiered' && tier.tiers && (
        <table className="mt-3 w-full text-xs text-slate-400">
          <tbody>
            {tier.tiers.map((t, i) => {
              const from = i === 0 ? 1 : (tier.tiers![i - 1].up_to ?? 0) + 1;
              return (
                <tr key={i} className="border-t border-slate-800 first:border-0">
                  <td className="py-1">{t.up_to === null ? `${from}+` : `${from}–${t.up_to}`} units</td>
                  <td className="py-1 text-right tabular-nums text-slate-300">
                    {money(t.unit_amount, tier.currency)} each{t.flat_amount ? ` + ${money(t.flat_amount, tier.currency)}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {tier.features.length > 0 && (
        <ul className="mt-4 space-y-2">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
              {f}
            </li>
          ))}
        </ul>
      )}
      {action && <div className="mt-auto pt-5">{action}</div>}
    </section>
  );
}

function Breakdown({ quote, testId }: { quote: Quote; testId?: string }) {
  const suffix = `/ ${per(quote.interval, quote.interval_count)}`;
  return (
    <dl data-testid={testId} className="space-y-1.5 text-sm">
      <div className="flex justify-between gap-4"><dt className="text-slate-400">Subscription</dt><dd className="tabular-nums text-slate-200">{money(quote.base_amount, quote.currency)}</dd></div>
      {quote.payment_method === 'card' && (
        <div className="flex justify-between gap-4"><dt className="text-slate-400">Card processing fee ({pct(quote.fee_bps)})</dt><dd className="tabular-nums text-slate-200">{money(quote.fee_amount, quote.currency)}</dd></div>
      )}
      <div className="flex justify-between gap-4 border-t border-slate-800 pt-1.5 font-medium"><dt className="text-slate-200">Total</dt><dd className="tabular-nums text-white">{money(quote.total_amount, quote.currency)} <span className="text-xs font-normal text-slate-500">{suffix}</span></dd></div>
    </dl>
  );
}

function MethodOption({ method, option, quote, selected, onSelect }: { method: Method; option?: PaymentOption; quote?: Quote; selected: boolean; onSelect: () => void }) {
  const Icon = method === 'ach' ? Building2 : CreditCard;
  return (
    <label
      data-testid={`method-${method}`}
      className={cx('flex cursor-pointer flex-col rounded-xl border p-5 transition-colors', selected ? 'border-sky-500/70 bg-sky-500/5 ring-1 ring-sky-500/40' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700')}
    >
      <div className="flex items-start gap-3">
        <input type="radio" name="payment-method" value={method} checked={selected} onChange={onSelect} className="mt-1 h-4 w-4 accent-sky-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="h-4 w-4 text-sky-400" />
            <span className="text-sm font-semibold text-slate-100">{method === 'ach' ? 'Bank account (ACH)' : 'Credit or debit card'}</span>
            <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', method === 'ach' ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' : 'bg-amber-500/10 text-amber-300 ring-amber-500/25')}>
              {method === 'ach' ? 'No fee' : option ? `+${pct(option.fee_bps)} fee` : '…'}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-400">
            {method === 'ach'
              ? 'Enter your routing and account number, or connect your bank, on Stripe’s secure page. Bank payments take a few business days to clear.'
              : `Pay by card. A ${option ? pct(option.fee_bps) : ''} processing fee is added to every invoice.`}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">{quote ? <Breakdown quote={quote} testId={`quote-${method}`} /> : <Skeleton className="h-16" />}</div>
    </label>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [options, setOptions] = useState<PaymentOption[]>([]);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [activating, setActivating] = useState(false);

  // Checkout wizard: step 1 tier, step 2 payment method (the method is fixed once subscribed).
  const [selected, setSelected] = useState<Tier | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [quotes, setQuotes] = useState<Partial<Record<Method, Quote>>>({});

  // Tier switch for active subscriptions.
  const [switchTo, setSwitchTo] = useState<{ tier: Tier; quote: Quote | null } | null>(null);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof AuthRequiredError) router.replace('/login');
      else setError(err instanceof Error ? err.message : 'Something went wrong');
    },
    [router]
  );

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([api<SubscriptionInfo>('/api/billing/subscription'), api<LedgerEntry[]>('/api/billing/ledger')]);
    setSub(s);
    setLedger(l);
    // The catalog depends on Stripe being configured; billing status still shows without it.
    Promise.all([api<Tier[]>('/api/billing/plans'), api<{ methods: PaymentOption[] }>('/api/billing/payment-options')])
      .then(([t, o]) => {
        setTiers(t);
        setOptions(o.methods);
      })
      .catch((err) => {
        setTiers([]);
        fail(err);
      });
    return s;
  }, [fail]);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const state = params.get('checkout');
    if (params.get('payment_method') === 'updated') setNotice({ tone: 'success', text: 'Payment details updated. Future invoices use the new details.' });
    if (state === 'cancelled') setNotice({ tone: 'warning', text: 'Checkout was cancelled. You have not been charged.' });
    if (state || params.get('payment_method')) window.history.replaceState(null, '', '/billing');
    let cancelled = false;
    (async () => {
      try {
        let s = await load();
        // Stripe confirms the subscription by webhook, which can arrive a few seconds after the redirect.
        if (state === 'success') {
          setActivating(true);
          for (let i = 0; i < 15 && !cancelled && !ACTIVE.includes(s.status); i++) {
            await new Promise((r) => setTimeout(r, 2000));
            s = await load();
          }
          setActivating(false);
          setNotice(
            ACTIVE.includes(s.status)
              ? { tone: 'success', text: s.payment_status === 'processing' ? 'Subscription active. Your bank payment is processing and usually clears in a few business days.' : 'Payment received. Your subscription is active.' }
              : { tone: 'warning', text: 'Confirmation is taking longer than usual; refresh in a moment.' }
          );
        }
      } catch (err) {
        fail(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, load, fail]);

  const chooseTier = async (tier: Tier) => {
    setError('');
    setSelected(tier);
    setMethod(null);
    setQuotes({});
    try {
      const [ach, card] = await Promise.all(
        (['ach', 'card'] as Method[]).map((m) => api<Quote>(`/api/billing/quote?price_id=${encodeURIComponent(tier.price_id)}&payment_method=${m}`))
      );
      setQuotes({ ach, card });
    } catch (err) {
      fail(err);
    }
  };

  const startCheckout = async () => {
    if (!selected || !method) return;
    setError('');
    setBusy('checkout');
    try {
      const session = await api<{ url: string }>('/api/billing/checkout-session', { method: 'POST', body: JSON.stringify({ price_id: selected.price_id, payment_method: method }) });
      window.location.assign(session.url);
    } catch (err) {
      fail(err);
      setBusy(null);
    }
  };

  const redirectTo = async (path: string, key: string) => {
    setError('');
    setBusy(key);
    try {
      const r = await api<{ url: string }>(path, { method: 'POST' });
      window.location.assign(r.url);
    } catch (err) {
      fail(err);
      setBusy(null);
    }
  };

  const openSwitch = async (tier: Tier) => {
    setSwitchTo({ tier, quote: null });
    try {
      const quote = await api<Quote>(`/api/billing/quote?price_id=${encodeURIComponent(tier.price_id)}&payment_method=${sub?.payment_method ?? 'ach'}`);
      setSwitchTo({ tier, quote });
    } catch (err) {
      setSwitchTo(null);
      fail(err);
    }
  };

  const confirmSwitch = async () => {
    if (!switchTo) return;
    setBusy('switch');
    try {
      await api('/api/billing/change-tier', { method: 'POST', body: JSON.stringify({ price_id: switchTo.tier.price_id }) });
      const target = switchTo.tier.price_id;
      setSwitchTo(null);
      setNotice({ tone: 'success', text: `Switched to ${switchTo.tier.name}. The difference is prorated on your next invoice.` });
      for (let i = 0; i < 10; i++) {
        const s = await load();
        if (s.price_id === target) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const isActive = !!sub && ACTIVE.includes(sub.status);
  const periodEnd = sub?.current_period_end ? parseUtc(sub.current_period_end).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  const suffix = sub ? `/ ${per(sub.interval, sub.interval_count)}` : '';
  const cardOption = options.find((o) => o.id === 'card');

  return (
    <AppShell>
      <PageHeader
        title="Billing"
        description="Your Secure Flow subscription. Payments are processed by Stripe; bank and card details never reach Secure Flow."
        actions={
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => load().catch(fail)}>
            Refresh
          </Button>
        }
      />

      <div className="space-y-4">
        {activating && <Notice tone="info">Payment submitted. Waiting for Stripe to confirm the subscription…</Notice>}
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {error && <Notice tone={error.includes('not configured') ? 'warning' : 'error'}>{error}</Notice>}
      </div>

      {sub && sub.status !== 'none' && (
        <Card className="mt-4" title="Subscription" actions={<SubBadge status={sub.status} />}>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
            <DetailList
              items={[
                { label: 'Tier', value: <span data-testid="subscription-tier">{sub.plan?.name ?? sub.tier_id ?? '-'}</span> },
                {
                  label: 'Payment method',
                  value: (
                    <span data-testid="subscription-method" className="inline-flex items-center gap-1.5">
                      {sub.payment_method === 'card' ? <CreditCard className="h-3.5 w-3.5 text-slate-400" /> : <Building2 className="h-3.5 w-3.5 text-slate-400" />}
                      {sub.payment_method ? METHOD_LABEL[sub.payment_method] : '-'}
                    </span>
                  ),
                },
                { label: 'Subscription', value: <span className="tabular-nums">{money(sub.base_amount, sub.currency)}{sub.quantity && sub.quantity > 1 ? ` (${sub.quantity} units)` : ''}</span> },
                ...(sub.payment_method === 'card' ? [{ label: `Card processing fee (${pct(sub.fee_bps ?? 0)})`, value: <span data-testid="subscription-fee" className="tabular-nums">{money(sub.fee_amount, sub.currency)}</span> }] : []),
                { label: 'Total', value: <span data-testid="subscription-total" className="font-medium tabular-nums text-white">{money(sub.total_amount, sub.currency)} <span className="text-xs font-normal text-slate-500">{suffix}</span></span> },
                { label: sub.cancel_at_period_end || sub.status === 'canceled' ? 'Access until' : 'Renews on', value: <span data-testid="period-end">{periodEnd ?? '-'}</span> },
              ]}
            />
            <div className="flex flex-col gap-2">
              {isActive && (
                <Button icon={sub.payment_method === 'card' ? CreditCard : Building2} loading={busy === 'method'} onClick={() => redirectTo('/api/billing/payment-method-session', 'method')}>
                  {sub.payment_method === 'card' ? 'Update card' : 'Update bank account'}
                </Button>
              )}
              <Button icon={ExternalLink} loading={busy === 'portal'} onClick={() => redirectTo('/api/billing/portal-session', 'portal')}>
                Invoices and cancellation
              </Button>
              <p className="flex items-start gap-1.5 text-xs text-slate-500">
                <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                The payment method was chosen at signup and stays the same for this subscription.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {sub.payment_status === 'processing' && (
              <Notice tone="info">
                <span data-testid="payment-processing">Your bank payment is processing. ACH payments usually clear in a few business days.</span>
              </Notice>
            )}
            {(sub.status === 'past_due' || sub.payment_status === 'failed') && (
              <Notice tone="error">The last payment failed. Update your {sub.payment_method === 'card' ? 'card' : 'bank account'} to keep the subscription active.</Notice>
            )}
            {sub.cancel_at_period_end && sub.status !== 'canceled' && <Notice tone="warning">Cancels at the end of the current period.</Notice>}
          </div>
        </Card>
      )}

      <div className="mt-6">
        {!isActive && <Steps step={selected ? 2 : 1} />}
        {tiers === null ? (
          <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-56" /><Skeleton className="h-56" /><Skeleton className="h-56" /></div>
        ) : tiers.length === 0 ? (
          <Card><EmptyState icon={Layers} title="No tiers available" description="Subscription tiers appear here once they are configured in Stripe." /></Card>
        ) : !isActive && selected ? (
          <Card
            title="Choose how to pay"
            description={`${selected.name} · ${tierPrice(selected).amount} ${tierPrice(selected).suffix}`}
            actions={
              <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => setSelected(null)}>
                Change tier
              </Button>
            }
          >
            <div data-testid="method-step" className="grid gap-4 md:grid-cols-2">
              <MethodOption method="ach" option={options.find((o) => o.id === 'ach')} quote={quotes.ach} selected={method === 'ach'} onSelect={() => setMethod('ach')} />
              <MethodOption method="card" option={cardOption} quote={quotes.card} selected={method === 'card'} onSelect={() => setMethod('card')} />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
              <p className="max-w-xl text-xs text-slate-500">
                {cardOption ? `Card payments carry a ${pct(cardOption.fee_bps)} processing fee, shown as its own line on every invoice. ` : ''}
                Your choice is fixed for this subscription. You are redirected to Stripe to enter your details; Secure Flow never sees them.
              </p>
              <Button variant="primary" icon={ArrowRight} disabled={!method || !quotes.ach || activating} loading={busy === 'checkout'} onClick={startCheckout}>
                Continue to secure checkout
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-slate-100">{isActive ? 'Switch tier' : 'Tiers'}</h2>
              <p className="mt-1 text-sm text-slate-400">{isActive ? 'Changes take effect now; the difference is prorated on your next invoice.' : 'Pick a tier, then choose bank account or card.'}</p>
            </div>
            <div data-testid="tier-list" className={cx('grid gap-4', tiers.length === 1 ? 'md:max-w-md' : tiers.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
              {tiers.map((t) => {
                const current = isActive && sub?.price_id === t.price_id;
                return (
                  <TierCard
                    key={t.price_id}
                    tier={t}
                    current={current}
                    action={
                      !sub || activating ? null : isActive ? (
                        !current && sub.status !== 'past_due' && <Button icon={Repeat} onClick={() => openSwitch(t)} className="w-full">Switch to this tier</Button>
                      ) : (
                        <Button variant="primary" icon={ArrowRight} onClick={() => chooseTier(t)} className="w-full">Select</Button>
                      )
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      <Card className="mt-6" title="Payment history" description="Invoices confirmed by Stripe webhooks. Each row matches an event in your Stripe Dashboard." padded={false}>
        {ledger === null ? (
          <div className="space-y-2 p-5"><Skeleton className="h-10" /></div>
        ) : ledger.length === 0 ? (
          <EmptyState icon={Receipt} title="No payments yet" description="Payments appear here as soon as Stripe confirms them. Bank payments appear once they clear." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">Result</th>
                  <th className="px-5 py-2.5 font-medium">Tier</th>
                  <th className="px-5 py-2.5 font-medium">Method</th>
                  <th className="px-5 py-2.5 font-medium text-right">Fee</th>
                  <th className="px-5 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-5 py-2.5 font-medium">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800" data-testid="ledger-rows">
                {ledger.map((e) => (
                  <tr key={e.event_id} className="text-slate-300" title={e.event_id}>
                    <td className="px-5 py-3 whitespace-nowrap">{new Date(e.created * 1000).toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className={e.type === 'invoice.payment_failed' ? 'text-red-300' : 'text-emerald-300'}>{LEDGER_LABEL[e.type] ?? e.type}</span>
                    </td>
                    <td className="px-5 py-3">{e.tier_id ? <Tag mono>{e.tier_id}</Tag> : '-'}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{e.payment_method ? METHOD_LABEL[e.payment_method] : '-'}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-400">{e.fee_amount ? money(e.fee_amount, e.currency) : '-'}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{money(e.amount, e.currency)}</td>
                    <td className="px-5 py-3"><Tag mono>{e.invoice_id ?? '-'}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!switchTo}
        title={switchTo ? `Switch to ${switchTo.tier.name}?` : ''}
        description={
          switchTo?.quote ? (
            <div className="space-y-3">
              <Breakdown quote={switchTo.quote} testId="switch-quote" />
              <p className="text-xs text-slate-500">Paid by {sub?.payment_method ? METHOD_LABEL[sub.payment_method].toLowerCase() : 'your current method'}. The change is prorated on your next invoice.</p>
            </div>
          ) : (
            <Skeleton className="h-16" />
          )
        }
        confirmLabel="Switch tier"
        busy={busy === 'switch'}
        onConfirm={confirmSwitch}
        onCancel={() => setSwitchTo(null)}
      />
    </AppShell>
  );
}
