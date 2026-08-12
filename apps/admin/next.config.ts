import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {/* config options here */};

/**
 * next-intl, pointed at the request config in src/i18n.
 *
 * There is no `[locale]` segment: this console has one deployment and switches
 * language in place, the way the design draws it. The plugin is wired so server
 * components can reach `getTranslations()` against the same catalogues the
 * restaurant console uses — one set of shared messages for both.
 */
export default createNextIntlPlugin('./src/i18n/config.ts')(nextConfig);
