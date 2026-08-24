'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { NavDrawer } from '@restaurant/ui';

export { NavMenuButton } from '@restaurant/ui';

/**
 * The platform rail as a drawer below 820px.
 *
 * This layout imports the console's stylesheet, so wearing `[data-nav]` gets
 * both behaviours it already defines: the 76px icon rail below 1200 and the
 * off-canvas panel below 820. The rail's rows carry `data-navlabel` for the
 * first of those — they did not, which is why this could not simply be
 * switched on.
 *
 * The drawer itself lives in `@restaurant/ui`; all this adds is the pathname,
 * which the package cannot read because it does not depend on Next.
 */
export function PlatformShell({ children }: { children: ReactNode }) {
  return (
    <NavDrawer
      closeOn={usePathname()}
      className="bg-surface flex w-[236px] flex-none flex-col overflow-hidden border-r"
    >
      {children}
    </NavDrawer>
  );
}
