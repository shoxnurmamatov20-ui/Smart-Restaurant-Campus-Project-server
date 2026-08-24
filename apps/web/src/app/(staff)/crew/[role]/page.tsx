import { notFound, redirect } from 'next/navigation';

import { isCrewRole, tabsFor } from '@restaurant/surfaces/crew/data';

/**
 * A role with no tab lands on its first one.
 *
 * The first tab is not the same screen for everyone, and that is the design's
 * whole argument: an owner opens on the day's revenue, a waiter opens on their
 * own six tables, a courier opens on the drop they are already late for. The
 * landing page is the app's answer to "why did you pick this up", and it is a
 * different answer per role.
 *
 * `redirect` rather than rendering the panel here, so there is one canonical URL
 * per screen. Two paths showing the same tab would leave the dock unable to
 * decide which of them counts as active.
 */
export default async function CrewRoleIndex({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isCrewRole(role)) notFound();

  const first = tabsFor(role)[0];
  if (first === undefined) notFound();

  redirect(`/crew/${role}/${first.slug}`);
}
