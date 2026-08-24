import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { copy, SHARED } from '@restaurant/surfaces/crew/copy';
import { isCrewRole } from '@restaurant/surfaces/crew/data';

import { crewLang } from '../../../crew-session';
import { crewSearch } from '../../../crew-server';
import { SearchPanel } from '../../../panels/search';

/**
 * The screen behind the dock's search pill.
 *
 * A static segment rather than another `[tab]`, and it has to be: the dock's
 * tabs come from `DOCK[role]`, and a fifth entry there would have put a fifth
 * disc on every role's bar — the design draws four discs and one pill.
 *
 * **The URL is the query.** `?q=` is read here on the server, so the search
 * itself is a server read with the shift's httpOnly session on it and no new
 * proxy route to maintain; the field below only rewrites the address. That also
 * makes a result page shareable and survivable — a waiter who backgrounds the
 * app and comes back is still looking at what they searched for.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const lang = crewLang((await headers()).get('accept-language'));

  return {
    title: isCrewRole(role) ? copy(SHARED, lang).search : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function CrewSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { role } = await params;
  if (!isCrewRole(role)) notFound();

  const { q } = await searchParams;
  const lang = crewLang((await headers()).get('accept-language'));
  const term = q ?? '';
  const found = await crewSearch(term, lang);

  return (
    <SearchPanel
      lang={lang}
      role={role}
      term={term}
      dishes={found.dishes}
      tables={found.tables}
      live={found.live}
    />
  );
}
