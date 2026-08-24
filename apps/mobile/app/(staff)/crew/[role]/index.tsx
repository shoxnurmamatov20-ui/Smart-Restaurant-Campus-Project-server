import { Redirect, useLocalSearchParams } from 'expo-router';

import { isCrewRole, tabsFor } from '@restaurant/surfaces/crew/data';

/**
 * A role with no tab named lands on its first one.
 *
 * The first tab is a different screen for everyone, and that is the design's
 * whole argument: an owner opens on the day's revenue, a waiter on their own six
 * tables, a courier on the drop they are already late for. The landing screen is
 * this app's answer to "why did you pick this up", and the answer changes with
 * the person holding it.
 *
 * A redirect rather than rendering the panel here, so each screen has one
 * address. Two paths showing the same tab would leave the dock unable to decide
 * which of them counts as selected.
 */
export default function CrewRoleIndex() {
  const { role } = useLocalSearchParams<{ role: string }>();

  if (!isCrewRole(role)) return <Redirect href="/crew" />;

  const first = tabsFor(role)[0];

  return <Redirect href={first === undefined ? '/crew' : `/crew/${role}/${first.slug}`} />;
}
