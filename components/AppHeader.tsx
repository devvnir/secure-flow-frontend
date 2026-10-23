'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Plus, Shield } from 'lucide-react';
import { api, logout, type CurrentUser } from '@/lib/api';
import { buttonClass, cx, useClickOutside } from '@/components/ui';

const NAV = [
  { href: '/dashboard', label: 'Flows' },
  { href: '/tools', label: 'Schema Tools' },
];

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menuRef = useClickOutside<HTMLDivElement>(closeMenu);

  useEffect(() => {
    api<CurrentUser>('/api/auth/me').then(setUser).catch(() => undefined);
  }, []);

  const handleLogout = async () => {
    setSigningOut(true);
    await logout();
    router.replace('/login');
  };

  const isActive = (href: string) => (href === '/dashboard' ? pathname.startsWith('/dashboard') : pathname.startsWith(href));
  const initial = user?.email?.[0]?.toUpperCase() ?? '·';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-500">
              <Shield className="h-4 w-4 text-white" />
            </span>
            <span className="hidden sm:inline text-sm font-semibold tracking-tight text-white">Secure Flow</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cx('rounded-md px-2.5 py-1.5 font-medium transition-colors', isActive(item.href) ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white')}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/create" className={buttonClass('primary', 'sm')}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New flow</span>
          </Link>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-slate-300 transition-colors hover:bg-slate-800"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">{initial}</span>
              <span className="hidden md:inline max-w-[14rem] truncate">{user?.email}</span>
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl shadow-black/40">
                <div className="border-b border-slate-800 px-3 py-2.5">
                  <p className="text-xs text-slate-500">Signed in as</p>
                  <p className="truncate text-sm font-medium text-slate-100">{user?.email ?? '…'}</p>
                </div>
                <button
                  role="menuitem"
                  type="button"
                  onClick={handleLogout}
                  disabled={signingOut}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
