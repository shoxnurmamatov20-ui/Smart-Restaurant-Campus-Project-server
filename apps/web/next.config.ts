import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  /*
   * Let the proxy see the RSC request it is actually answering.
   *
   * By default Next normalises the URL and strips the Flight markers before
   * `src/middleware.ts` runs — `?_rsc` comes off the query string and the `rsc`,
   * `next-router-state-tree` and `next-router-prefetch` headers are removed. The
   * docs say why, and the reason is a good one: it stops a proxy handling the RSC
   * request differently from the HTML request when the two have to agree.
   *
   * Here it made them disagree instead. This app has no `[locale]` segment, so
   * `/uz/x` reaches its page by being rewritten to `/x`. Next answers a rewrite on
   * an RSC request by telling the *client* to fetch the rewritten path — and that
   * request comes back with no language in it, so the proxy sent it 308 to `/uz/x`,
   * which rewrote, which redirected to `/x?_rsc=…` again.
   *
   * Nothing errored, and it was not one page: a `<Link>` prefetches, so every link
   * in the viewport started its own loop and never stopped. A browser sitting still
   * on the marketing page made 56 requests in eight seconds, 40 of them redirects,
   * and the console draws a 24-row sidebar. That is where "every page is stuck
   * loading" came from — the router never received a payload, so routes kept
   * rendering `loading.tsx` while the box spent 55% of all its traffic on 3xx.
   *
   * With this on, the proxy can see `_rsc` and answer that follow-up request
   * instead of bouncing it, and the chain terminates in one redirect:
   *
   *     /uz/contact  →307→  /contact?_rsc  →200
   *
   * Measured after: 18 requests in the same eight seconds, none of them a redirect.
   *
   * The other half of the fix is in `src/middleware.ts`; neither works alone. This
   * flag only makes the marker visible — the proxy still has to stop redirecting on
   * it, and its guards still run on the same bare path they always saw.
   */
  skipProxyUrlNormalize: true,
};

/**
 * next-intl, pointed at the request config in src/i18n.
 *
 * There is no `[locale]` segment: the console is one deployment per tenant and
 * the public site switches language in place, without a navigation, the way the
 * design draws it. The plugin is still wired so server components can reach
 * `getTranslations()` against the same catalogues in packages/i18n — one set of
 * messages for both sides of the boundary.
 */
export default createNextIntlPlugin('./src/i18n/config.ts')(nextConfig);
