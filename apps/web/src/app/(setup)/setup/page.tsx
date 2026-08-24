import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';

import { SetupBoot } from './setup-boot';
import { isLang } from './setup-data';

export const metadata: Metadata = {
  title: 'Sozlash',
  /*
   * Never indexed. It answers behind a session, it is about one restaurant's
   * tax details, and a search result pointing at somebody's setup wizard is a
   * result nobody should ever see.
   */
  robots: { index: false, follow: false },
};

/**
 * `/setup` — what a restaurant sees the first time it signs in.
 *
 * A thin server component: it decides which language the wizard opens in and
 * hands over. Everything else is client state, because a wizard is eight steps
 * of a single form and a round trip per keystroke would be the slowest way to
 * fill one in.
 *
 * The language comes from the console's own locale cookie rather than from
 * `Accept-Language`, so somebody who has already switched the console to
 * Russian is not handed an Uzbek wizard. The header in the wizard can still
 * change it — this is the first screen a restaurant sees, and the person
 * filling it in is not always the person who signed up.
 */
export default async function SetupPage() {
  const locale = await getLocale();

  return <SetupBoot initialLang={isLang(locale) ? locale : 'uz'} />;
}
