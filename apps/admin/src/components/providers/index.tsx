'use client';

import type { ReactNode } from 'react';
import { QueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="light">
      <QueryProvider>{children}</QueryProvider>
    </ThemeProvider>
  );
}
