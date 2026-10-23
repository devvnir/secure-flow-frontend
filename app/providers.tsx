'use client';

import { NextUIProvider } from '@nextui-org/react';
import { ToastProvider } from '@/components/ui';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextUIProvider>
      <ToastProvider>{children}</ToastProvider>
    </NextUIProvider>
  );
}
