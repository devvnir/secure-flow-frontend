'use client';

import AppHeader from '@/components/AppHeader';
import { cx } from '@/components/ui';

export default function AppShell({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgba(14,165,233,0.08),transparent)]">
      <AppHeader />
      <main className={cx('mx-auto px-4 sm:px-6 py-8', narrow ? 'max-w-3xl' : 'max-w-6xl')}>{children}</main>
    </div>
  );
}
