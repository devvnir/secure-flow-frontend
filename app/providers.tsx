'use client';

import { NextUIProvider } from '@nextui-org/react';
import { ToastProvider } from '@/components/ui';
import { VaultProvider } from '@/components/VaultProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextUIProvider>
      <ToastProvider>
        <VaultProvider>{children}</VaultProvider>
      </ToastProvider>
    </NextUIProvider>
  );
}
