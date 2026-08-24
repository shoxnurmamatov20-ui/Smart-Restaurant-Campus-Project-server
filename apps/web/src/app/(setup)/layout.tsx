import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { landingPath } from '@/lib/roles';
import { getSession } from '@/lib/session';

import './setup/setup.css';

/**
 * The setup wizard's shell.
 *
 * Almost nothing: the wizard owns the whole viewport and draws its own header,
 * so a layout that added a sidebar or a top bar would be drawing a second one
 * over it. What this file is really for is the door.
 *
 * **Owner only** — spec §8. This screen collects the tax number every receipt
 * will carry, the business-day boundary every report will group by, and the
 * table labels the floor will be run from; it ends by opening a cash shift.
 * None of that belongs to a waiter who typed a URL.
 *
 * The check is a redirect here rather than a rule in `middleware.ts`, because
 * that file and `lib/roles.ts` are outside this surface's ownership. **This is
 * the weaker of the two places to put it**: middleware answers before any
 * render and cannot be reached around, while a layout runs after the request
 * has already been routed. The proper fix is one entry in `SURFACE_ACCESS` and
 * `SURFACE_PATHS` — `setup: ['owner']`, `setup: '/setup'` — which also keeps
 * app/robots.ts in step, since it reads the same list to keep crawlers out of
 * screens that answer 200 to anybody.
 *
 * With no session at all this resolves to the demo owner, which is deliberate:
 * a build with no API behind it still draws the wizard, the way every other
 * screen in this console still draws its fixtures.
 */
export default async function SetupLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (session.role.id !== 'owner') redirect(landingPath(session.role));

  return children;
}
