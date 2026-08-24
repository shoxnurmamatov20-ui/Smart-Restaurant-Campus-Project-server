/**
 * The Android build the site hands out, and the four surfaces inside it.
 *
 * Nothing here touches the filesystem or the network — `download-server.ts` is
 * the neighbour that reads the disk, and it is the only module a client
 * component must never import. Same split the console screens already use
 * (`tables-data.ts` beside `tables-server.ts`): types and pure functions here,
 * `node:fs` next door.
 *
 * ---------------------------------------------------------------------------
 * Where the manifest comes from
 *
 * `infrastructure/server/bin/srcp-apk` builds the APK, verifies it was signed
 * with the release key, copies it into `/srv/srcp/shared/downloads/` and writes
 * `manifest.json` beside it. That directory sits outside every release on
 * purpose: an APK is a quarter of an hour of Gradle on a different rhythm from
 * a web deploy, so it must survive one.
 *
 * The shape below is that script's heredoc, field for field. If a field is
 * added there it has to be added here, and the page will ignore it until it is.
 */

/** Written by `srcp-apk`; read here at request time. */
export const DOWNLOAD_MANIFEST_PATH = '/srv/srcp/shared/downloads/manifest.json';

/**
 * Where nginx serves the file from — `srcp-routes.conf`, `location ^~
 * /downloads/`.
 *
 * Checked rather than assumed. `url` arrives from a file on disk, and it is
 * what the page's one big button points at; a mangled manifest that put an
 * absolute URL there would turn the download into an off-site link on a page
 * whose entire promise is "this exact file, from us". Cheap to verify, and the
 * failure mode without it is the worst kind.
 */
const DOWNLOAD_URL_PREFIX = '/downloads/';

export type AppManifest = {
  /** Display name — "Smart Restaurant". */
  app: string;
  /** `uz.smartrestaurant.campus`. Android identifies an app by this and the key. */
  package: string;
  /** The human version from `apps/mobile/app.json`. */
  version: string;
  /** UTC minutes since 2026-01-01; strictly increasing, or the phone refuses the update. */
  versionCode: number;
  file: string;
  /** Absolute path on this host, under `/downloads/`. */
  url: string;
  sizeBytes: number;
  /** 64 hex characters, so a reader who cares can verify what they installed. */
  sha256: string;
  /** Compact ISO 8601 — `20260821T134500Z`. */
  builtAt: string;
  commit: string;
  minAndroid: string;
  /** The signing certificate's digest, from `apksigner verify --print-certs`. */
  signerSha256: string;
};

const HEX_64 = /^[0-9a-f]{64}$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * The manifest, or `null` — never a half-populated object.
 *
 * Three ways this returns `null`, and all three have happened to somebody:
 * the file is absent (no APK has been built on this host), the JSON is broken
 * (a publish caught mid-write, though `srcp-apk` moves it into place to make
 * that impossible), or a field the page renders is missing. The third is the
 * reason the checks below are not decoration: a manifest without `sizeBytes`
 * renders "NaN MB" under a button, and a page that tells a restaurant owner the
 * download is NaN megabytes has done more damage than one that says the app is
 * not published yet.
 *
 * So the honest empty state is the fallback for all three, and the caller has
 * exactly two cases to draw instead of a dozen partial ones.
 */
export function parseManifest(raw: string | null): AppManifest | null {
  if (raw === null || raw.trim() === '') return null;

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  const m = value as Record<string, unknown>;

  const strings = ['app', 'package', 'version', 'file', 'commit', 'minAndroid'] as const;
  for (const key of strings) {
    if (!isNonEmptyString(m[key])) return null;
  }

  // The button's destination. Relative and under the directory nginx serves.
  if (!isNonEmptyString(m.url) || !m.url.startsWith(DOWNLOAD_URL_PREFIX)) return null;

  // A zero-byte APK is a failed build that got published, not a small download.
  if (typeof m.sizeBytes !== 'number' || !Number.isFinite(m.sizeBytes) || m.sizeBytes <= 0) {
    return null;
  }

  if (typeof m.versionCode !== 'number' || !Number.isInteger(m.versionCode) || m.versionCode <= 0) {
    return null;
  }

  // Lower-case hex, both of them: `sha256sum` and `apksigner` print it that
  // way, and the page shows them for comparison against a reader's own `certutil`
  // or `sha256sum` output. A digest of the wrong length is a truncated write.
  if (!isNonEmptyString(m.sha256) || !HEX_64.test(m.sha256)) return null;
  if (!isNonEmptyString(m.signerSha256) || !HEX_64.test(m.signerSha256)) return null;

  if (!isNonEmptyString(m.builtAt) || formatBuiltAt(m.builtAt) === null) return null;

  return {
    app: m.app as string,
    package: m.package as string,
    version: m.version as string,
    versionCode: m.versionCode,
    file: m.file as string,
    url: m.url,
    sizeBytes: m.sizeBytes,
    sha256: m.sha256,
    builtAt: m.builtAt,
    commit: m.commit as string,
    minAndroid: m.minAndroid as string,
    signerSha256: m.signerSha256,
  };
}

/**
 * Bytes as megabytes, one decimal.
 *
 * Mebibytes — 1024 × 1024 — because that is what `srcp-apk` divides by when it
 * prints the size to the operator building the APK, and what Android shows in
 * Settings › Apps. Two places quoting one file's size have to agree, or the
 * first support question is why the site says 41.9 and the phone says 40.
 *
 * Never localised. `toFixed` writes a full stop in every locale, which is what
 * a size wants: a Russian reader who sees "41,9 МБ" on one screen and "41.9 MB"
 * on another has learned nothing, and `Intl.NumberFormat` here would make the
 * string depend on the reader for a value that does not.
 */
export function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

const BUILT_AT = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

/**
 * `20260821T134500Z` → `21.08.2026`, or `null` if it is not a real instant.
 *
 * `date -u +%Y%m%dT%H%M%SZ` writes the basic ISO 8601 form, which `new Date()`
 * does **not** parse — it wants the extended form with separators, and given
 * this string it returns `Invalid Date`. Handing that to a formatter prints
 * "Invalid Date" on the page, so the parse is explicit.
 *
 * The round trip through `Date.UTC` is what rejects `20260231` — a regex is
 * happy with the thirty-first of February and a reader would not be.
 *
 * Numeric and dotted rather than a month name, so one string is right in all
 * three languages: the site's copy is translated, a date's digits are not.
 */
export function formatBuiltAt(stamp: string): string | null {
  const parts = BUILT_AT.exec(stamp);
  if (parts === null) return null;

  const [, y, mo, d, h, mi, s] = parts.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  const at = new Date(Date.UTC(y, mo - 1, d, h, mi, s));

  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) {
    return null;
  }

  if (h > 23 || mi > 59 || s > 59) return null;

  const pad = (n: number) => String(n).padStart(2, '0');

  return `${pad(d)}.${pad(mo)}.${y}`;
}

/**
 * The four surfaces the one binary carries.
 *
 * Index-aligned with `pagesCopy(locale).download.surfaces`, the way
 * `pages-data.ts` is aligned with `pages-copy.ts` everywhere else on this site:
 * ids, marks and routes here, because none of them is translated; the names and
 * the sentence under each one there, because both are.
 *
 * **Three of the four names are not ours to choose.** They are the `short_name`
 * of `apps/web/public/manifest-*.json` — the word that ends up under the icon
 * on a home screen — and `download.test.ts` reads those files and compares.
 * A card that calls the customer app something other than what the phone calls
 * it is how a person ends up looking for an app they have already installed.
 *
 * The fourth has no manifest and cannot have one: the QR guest surface is
 * reached by pointing a camera at a table, not by installing anything. It is on
 * this page because it is inside the APK — that is what the app's camera
 * permission is for — and `apps/mobile/src/surfaces.ts` carries the same four.
 */
export const DOWNLOAD_SURFACES: readonly {
  id: 'customer' | 'mp' | 'guest' | 'crew';
  /** Two letters, as the app's own launcher screen draws them. */
  mark: string;
  /**
   * Where the surface begins on the web, segment for segment with the app —
   * or `null` where it has no address a reader can type.
   *
   * The three that have one are also the answer to the iPhone section's "open
   * the page you want in Safari": that is the whole PWA route, and a reader
   * following it needs somewhere to go.
   *
   * `guest` is `null` and that is not an omission. There is no `/qr` page:
   * the route is `/qr/[restaurant]/[table]`, so the only honest link would be
   * to one particular table in one particular restaurant. A card linking to
   * `/qr` would have been a 404 on the site's most public new page — which is
   * exactly what `site-data.test.ts` exists to stop happening again.
   */
  href: string | null;
  /** The static manifest whose `short_name` this card must match, if there is one. */
  manifest: string | null;
}[] = [
  { id: 'customer', mark: 'Bu', href: '/customer', manifest: 'manifest-customer.json' },
  { id: 'mp', mark: 'My', href: '/mp', manifest: 'manifest-mp.json' },
  { id: 'guest', mark: 'QR', href: null, manifest: null },
  { id: 'crew', mark: 'Xo', href: '/crew', manifest: 'manifest-crew.json' },
];
