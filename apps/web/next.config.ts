import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {/* config options here */};

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
