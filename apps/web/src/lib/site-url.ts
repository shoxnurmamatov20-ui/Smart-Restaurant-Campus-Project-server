import { APP_URL } from './constants';

/**
 * The absolute origin this deployment answers on.
 *
 * Server-side only. Everything that calls this — robots.ts, sitemap.ts, the
 * metadataBase in the root layout — runs on the server and is the one category
 * of thing that genuinely cannot use a relative URL: robots.txt and sitemap.xml
 * are specified to carry absolute ones, and a preview card resolved against
 * nothing is a preview card pointing at localhost.
 *
 * `SITE_URL`, not `NEXT_PUBLIC_SITE_URL`, and the distinction is the same one
 * .env.local already draws between `API_URL` and `NEXT_PUBLIC_API_URL`: the
 * public form is inlined into the browser bundle at build time, so the host
 * becomes part of the artifact and a deployment on another name ships a bundle
 * that names the wrong one. Nothing in the browser needs this value, so nothing
 * in the browser is given it.
 *
 * Unset, it falls back to APP_URL and then to localhost, which is right for a
 * developer and visibly wrong in production — the intended failure mode for a
 * value that must be deliberate.
 */
export function siteUrl(): string {
  return process.env.SITE_URL ?? APP_URL;
}
