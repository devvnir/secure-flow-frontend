'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AUTO_LOCK_MS = 15 * 60 * 1000;

interface VaultState {
  key: CryptoKey | null;
  unlock: (key: CryptoKey) => void;
  lock: () => void;
}

const VaultContext = createContext<VaultState>({ key: null, unlock: () => undefined, lock: () => undefined });

// The vault key lives only in memory: it is lost on reload, on sign-out, and after 15 idle minutes.
export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const lock = useCallback(() => setKey(null), []);
  const unlock = useCallback((k: CryptoKey) => setKey(k), []);

  useEffect(() => {
    if (!key) return;
    let timer = setTimeout(lock, AUTO_LOCK_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, AUTO_LOCK_MS);
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const onStorage = (e: StorageEvent) => e.key === 'access_token' && !e.newValue && lock();
    window.addEventListener('storage', onStorage);
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
      window.removeEventListener('storage', onStorage);
    };
  }, [key, lock]);

  return <VaultContext.Provider value={{ key, unlock, lock }}>{children}</VaultContext.Provider>;
}

export const useVault = () => useContext(VaultContext);
