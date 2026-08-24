'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { NavDrawer as SharedDrawer } from '@restaurant/ui';

export { NavMenuButton } from '@restaurant/ui';

/**
 * The platform rail as a drawer below 820px — see `admin-shell.css`.
 *
 * The drawer itself is shared with the restaurant console and the seller panel;
 * all this adds is the pathname, which the package cannot read because it does
 * not depend on Next.
 */
export function NavDrawer({ children }: { children: ReactNode }) {
  return <SharedDrawer closeOn={usePathname()}>{children}</SharedDrawer>;
}
