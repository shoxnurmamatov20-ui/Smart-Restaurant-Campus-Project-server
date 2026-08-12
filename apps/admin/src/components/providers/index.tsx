'use client';

import type { ReactNode } from 'react';
import { TooltipProvider } from '@restaurant/ui';
import { Toaster } from '@restaurant/ui';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="light">
      <QueryProvider>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster richColors closeButton position="top-right" />
        </TooltipProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
