import { useRouter, type Href } from 'expo-router';

/**
 * Where a table lives, in the same URL the browser uses.
 *
 * `/qr/{restaurant}/{table}` — segment for segment with
 * `apps/web/src/app/(guest)/qr/[restaurant]/[table]`, because the sticker on
 * the table is printed once and a deep link from it has to land somewhere in
 * both builds. That is the whole reason this app repeats the web's route tree
 * rather than inventing a flatter one.
 */
export type TableRef = { restaurant: string; table: string };

/**
 * One route parameter, as a string.
 *
 * Expo Router hands back `string | string[]` — a repeated segment is an array —
 * and every screen here wants one value. Taking the first rather than joining:
 * `/qr/a/b/c` is not a table with two names, it is a URL that is wrong, and the
 * screen should read `a` and fail the lookup rather than ask for `a/b`.
 */
export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';

  return value ?? '';
}

/**
 * The table's own path, typed as a route rather than as a string.
 *
 * `typedRoutes` narrows `router.push()` to the routes that exist, which is what
 * catches a renamed screen at compile time. A template literal is not one of
 * them — the compiler cannot know `${restaurant}` is a segment and not a slash
 * — so the cast is where a dynamic path re-enters the typed world. It is done
 * once, here, next to the rule it depends on: these five paths are the only
 * ones this surface builds, and each has a file under
 * `app/(guest)/qr/[restaurant]/[table]/`.
 */
export type TablePath = `/qr/${string}/${string}`;

export const tableHref = ({ restaurant, table }: TableRef): TablePath =>
  `/qr/${encodeURIComponent(restaurant)}/${encodeURIComponent(table)}`;

/** A screen under a table: `/qr/{r}/{t}/menu`, `…/status`, `…/bill`, `…/rating`. */
export const tableScreen = (here: string, screen: 'menu' | 'status' | 'bill' | 'rating'): Href =>
  `${here}/${screen}` as Href;

/**
 * A scanned code, read as a table — or `null`.
 *
 * This is the one thing the native build does that the web one cannot: in a
 * browser the phone's own camera app reads the sticker and opens a URL, so no
 * page ever sees the raw code. Here the app reads it, and it has to be able to
 * say *"that is a Wi-Fi code"* rather than opening a blank screen.
 *
 * Deliberately not `new URL()`. Hermes has no complete URL implementation, the
 * sticker may carry `srcp://qr/...`, `https://osh.uz/qr/...` or a bare path
 * depending on who printed it, and all three are the same table. What matters
 * is the `qr/{restaurant}/{table}` triple, wherever it sits, and a query string
 * or a trailing `/menu` after it is still that table.
 *
 * The segments are decoded because a slug can be percent-encoded by whatever
 * printed the sticker, and rejected when either is empty — `/qr//12` names no
 * restaurant and would send a guest to a menu belonging to nobody.
 */
const TABLE_IN_CODE = /(?:^|\/)qr\/([^/?#\s]+)\/([^/?#\s]+)/;

export function tableFromCode(code: string): TableRef | null {
  const found = TABLE_IN_CODE.exec(code.trim());

  if (found === null) return null;

  try {
    const restaurant = decodeURIComponent(found[1] ?? '');
    const table = decodeURIComponent(found[2] ?? '');

    return restaurant === '' || table === '' ? null : { restaurant, table };
  } catch {
    // A malformed percent-escape. The code is not ours to interpret.
    return null;
  }
}

/**
 * Going back, without stacking a second copy of where you came from.
 *
 * `router.push(here)` on a back control looks right and grows the stack every
 * time: menu → table → menu → table, and the hardware back button then walks
 * the guest through every step of a meal. `back()` is the correct move — but a
 * deep link or a push notification can land on `/qr/a/12/bill` as the first
 * screen of the session, where there is nothing to go back to, so the fallback
 * replaces instead.
 */
export function useGuestBack(fallback: string): () => void {
  const router = useRouter();

  return () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback as Href);
  };
}
