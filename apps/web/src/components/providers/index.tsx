'use client';

import type { ReactNode } from 'react';
import { TooltipProvider } from '@restaurant/ui';
import { Toaster } from '@restaurant/ui';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <TooltipProvider delayDuration={300}>
          {children}
          {/* Bottom centre, one at a time, 2.8s — the design's own toast.
              Everything about it is configured in packages/ui; passing
              `richColors` or `position` here would override the design. */}
          <Toaster />
        </TooltipProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
