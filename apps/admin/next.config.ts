import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  /**
   * The staff console holds `/` on this host, so the platform console is
   * mounted under a prefix and nginx proxies `/admin` here. Next rewrites its
   * own links and asset URLs to match; it does not rewrite a hand-written
   * `fetch` to an absolute path, which is what src/lib/base-path.ts is for.
   * Keep this literal in step with NEXT_PUBLIC_BASE_PATH in .env.local.
   */
  basePath: '/admin',
};

/**
 * next-intl, pointed at the request config in src/i18n.
 *
 * There is no `[locale]` segment: this console has one deployment and switches
 * language in place, the way the design draws it. The plugin is wired so server
 * components can reach `getTranslations()` against the same catalogues the
 * restaurant console uses — one set of shared messages for both.
 */
export default createNextIntlPlugin('./src/i18n/config.ts')(nextConfig);
