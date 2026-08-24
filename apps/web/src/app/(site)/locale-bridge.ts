/**
 * The site's copy, borrowed from the guest catalogue.
 *
 * `guest-copy.ts` already holds the whole `site.*` tree — 121 keys across ten
 * sections, written when the guest surfaces were — and it was sitting unused
 * because the screens for it had never been built. Re-exporting is what stops
 * a second catalogue existing: two files with the same sentences in them drift
 * the first time somebody fixes a typo in one.
 *
 * A one-line module rather than importing across route groups everywhere,
 * because the import path from `(site)` into `(guest)` is four dots deep and
 * appears in every file here. One place to change if the catalogue moves.
 */
export { copyFor, fill, guestLocale, som } from '../(guest)/guest-session';

export type { GuestLocale as GuestLocaleOf } from '@restaurant/surfaces/guest/menu-data';
