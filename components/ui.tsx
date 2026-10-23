'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronRight, Info, Loader2, MoreHorizontal, X, XCircle } from 'lucide-react';

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

/* ---------- Button ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed';
const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-sky-500 text-white hover:bg-sky-400 shadow-sm shadow-sky-950/40',
  secondary: 'bg-slate-800/80 text-slate-100 border border-slate-700 hover:bg-slate-700/80 hover:border-slate-600',
  ghost: 'text-slate-300 hover:text-white hover:bg-slate-800/70',
  danger: 'bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20',
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
};

export const buttonClass = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string) =>
  cx(buttonBase, buttonVariants[variant], buttonSizes[size], extra);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon: Icon, children, className, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon ? <Icon className="w-4 h-4" /> : null}
      {children}
    </button>
  );
}

/* ---------- Badges ---------- */

const STATUS_STYLES: Record<string, { dot: string; text: string; ring: string; label: string }> = {
  active: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'bg-emerald-500/10 ring-emerald-500/25', label: 'Active' },
  completed: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'bg-emerald-500/10 ring-emerald-500/25', label: 'Completed' },
  draft: { dot: 'bg-slate-400', text: 'text-slate-300', ring: 'bg-slate-500/10 ring-slate-500/30', label: 'Draft' },
  paused: { dot: 'bg-amber-400', text: 'text-amber-300', ring: 'bg-amber-500/10 ring-amber-500/25', label: 'Paused' },
  running: { dot: 'bg-sky-400 animate-pulse', text: 'text-sky-300', ring: 'bg-sky-500/10 ring-sky-500/25', label: 'Running' },
  archived: { dot: 'bg-slate-500', text: 'text-slate-400', ring: 'bg-slate-500/10 ring-slate-600/30', label: 'Archived' },
  failed: { dot: 'bg-red-400', text: 'text-red-300', ring: 'bg-red-500/10 ring-red-500/25', label: 'Failed' },
  clean: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'bg-emerald-500/10 ring-emerald-500/25', label: 'Clean' },
  sanitized: { dot: 'bg-sky-400', text: 'text-sky-300', ring: 'bg-sky-500/10 ring-sky-500/25', label: 'Sanitized' },
  rejected: { dot: 'bg-red-400', text: 'text-red-300', ring: 'bg-red-500/10 ring-red-500/25', label: 'Rejected' },
  error: { dot: 'bg-red-400', text: 'text-red-300', ring: 'bg-red-500/10 ring-red-500/25', label: 'Error' },
};

export function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span data-testid={testId} className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', s.ring, s.text)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', s.dot)} />
      {STATUS_STYLES[status]?.label ?? status}
    </span>
  );
}

export function Tag({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span className={cx('inline-flex items-center rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300 ring-1 ring-inset ring-slate-700', mono && 'font-mono')}>
      {children}
    </span>
  );
}

/* ---------- Layout ---------- */

export function Card({
  title, description, actions, children, className, padded = true,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cx('rounded-xl border border-slate-800 bg-slate-900/50', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-slate-100">{title}</h3>}
            {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-5' : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({
  breadcrumbs, title, badge, description, actions,
}: {
  breadcrumbs?: { label: string; href?: string }[];
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5" />}
              {b.href ? <Link href={b.href} className="hover:text-slate-300 transition-colors">{b.label}</Link> : <span className="text-slate-400 truncate max-w-[16rem]">{b.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white break-words">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-1.5 text-sm text-slate-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'default' | 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-4">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={cx('mt-1.5 text-2xl font-semibold tabular-nums', tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : 'text-white')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function DetailList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-slate-800">
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-sm text-slate-400 shrink-0">{item.label}</dt>
          <dd className="text-sm text-slate-100 text-right min-w-0 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60">
        <Icon className="w-5 h-5 text-slate-300" />
      </div>
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'error' | 'success'; children: React.ReactNode }) {
  const styles = {
    info: 'border-sky-500/25 bg-sky-500/5 text-sky-200',
    warning: 'border-amber-500/25 bg-amber-500/5 text-amber-200',
    error: 'border-red-500/30 bg-red-500/5 text-red-200',
    success: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200',
  }[tone];
  const Icon = tone === 'error' ? XCircle : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm', styles)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-slate-800/70', className)} />;
}

/* ---------- Form controls ---------- */

export const inputClass =
  'block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 h-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors hover:border-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20';
export const textareaClass =
  'block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors hover:border-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20';

export function Field({ label, htmlFor, hint, required, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-200">
        {label}
        {required && <span className="ml-0.5 text-sky-400">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Toggle({ id, checked, onChange, label, description }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-200 cursor-pointer">{label}</label>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60', checked ? 'bg-sky-500' : 'bg-slate-700')}
      >
        <span className={cx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

/* ---------- Tabs ---------- */

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="relative">
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-slate-800" />
    <div role="tablist" className="no-scrollbar relative flex gap-1 overflow-x-auto overflow-y-hidden">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            value === t.value ? 'border-sky-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-slate-800 px-1.5 py-px text-xs tabular-nums text-slate-300">{t.count}</span>}
        </button>
      ))}
    </div>
    </div>
  );
}

/* ---------- Menu ---------- */

export function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

export function Menu({ label = 'More actions', items }: { label?: string; items: { label: string; icon?: React.ComponentType<{ className?: string }>; onSelect: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={buttonClass('secondary', 'md', 'px-2.5')}>
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl shadow-black/40">
          {items.map(({ label: itemLabel, icon: Icon, onSelect, danger, disabled }) => (
            <button
              key={itemLabel}
              role="menuitem"
              type="button"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
              className={cx('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed', danger ? 'text-red-300 hover:bg-red-500/10' : 'text-slate-200 hover:bg-slate-800')}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {itemLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Dialog ---------- */

export function ConfirmDialog({
  open, title, description, confirmLabel, onConfirm, onCancel, busy, danger,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !busy && onCancel()} />
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2 id="confirm-title" className="text-base font-semibold text-white">{title}</h2>
        <div className="mt-2 text-sm text-slate-400">{description}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className={cx('relative w-full rounded-xl border border-slate-700 bg-slate-900 shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Toasts ---------- */

type Toast = { id: number; message: string; tone: 'success' | 'error' };
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 shadow-xl shadow-black/40">
            {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
            <span className="flex-1">{t.message}</span>
            <button aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="text-slate-500 hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
