import { guestCopy } from '@restaurant/surfaces/guest/copy';

import { useLocale } from '../lib/locale';

/**
 * Every word this surface says, in the language the phone reads.
 *
 * The catalogue is `@restaurant/surfaces/guest/copy` — the same one the browser
 * reads, so a guest who scanned the table yesterday on a laptop and today in
 * the app is told the same things in the same words. Nothing on these screens
 * writes a sentence of its own.
 *
 * `qr` rather than the whole tree: the other half of that file is the
 * restaurant's public website, which this app does not have.
 */
export function useGuestCopy() {
  const { lang } = useLocale();

  return { lang, t: guestCopy[lang].qr };
}
