import { getLocale, getTranslations } from 'next-intl/server';

import { apiGet } from '@/lib/api-server';

import { PageHead } from '../../screen';
import { SiteConfig, type SiteDraft } from './site-config';

export async function generateMetadata() {
  const t = await getTranslations('console.siteConfig');
  return { title: t('title') };
}

/**
 * The restaurant's site and its install, configured together.
 *
 * `specs/06-site-pwa.md`, which had no route at all. It sits under Settings
 * rather than under the Website module because the four things it decides —
 * the address, the accent, which sections exist and which languages — are the
 * ones a restaurant sets once and then leaves alone. `/web` is the day-to-day:
 * which dishes are shown, which booking windows are open, what the funnel did.
 *
 * One read serves both halves of the screen. `GET /api/v1/settings/site`
 * answers the stored `site` group — the address, the accent, the sections, the
 * languages, the hero paragraph — and carries the restaurant's own name in
 * `meta`, which is what the phone preview, the home-screen icon and the
 * generated manifest are all drawn from. Before this, the panel opened on
 * "Osh Xona" whoever was reading, which is the same failure as the receipt
 * preview printing one STIR for every restaurant on the platform: it does not
 * look like a placeholder, it looks like a configured value.
 */

/** What `GET /api/v1/settings/site` answers, narrowed to what this screen draws. */
type ApiSite = {
  data: Partial<SiteDraft>;
  meta: { restaurant: { name: string; slug: string } };
};

/**
 * Two letters for the home-screen icon.
 *
 * The initials of the first two words, because that is what the design draws
 * and what fits a 40px tile — "Osh Xona" is OX. A single-word name gives its
 * first two letters rather than one, so the tile is never half empty.
 */
function monogramOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return 'SR';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();

  return words
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}
export default async function SiteConfigPage() {
  const [t, shell, panels, live] = await Promise.all([
    getTranslations('console.siteConfig'),
    getTranslations('console.shell'),
    getTranslations('console.settingsPanels'),
    apiGet<ApiSite>('/settings/site'),
  ]);

  const labels: Record<string, string> = {
    addressTitle: t('addressTitle'),
    addressNote: t('addressNote'),
    published: t('published'),
    addressFree: t('addressFree'),
    addressTaken: t('addressTaken'),
    addressShort: t('addressShort'),

    pwaTitle: t('pwaTitle'),
    pwaNote: t('pwaNote'),
    pwaCompare: t('pwaCompare'),
    pwaCompareCol0: t('pwaCompareCol0'),
    /* An acronym, the same in all three — `i18n.test.ts`'s rule. */
    pwaCompareCol1: 'PWA',
    pwaCompareCol2: t('pwaCompareCol2'),
    pwaLimits: t('pwaLimits'),

    accentTitle: t('accentTitle'),
    accentNote: t('accentNote'),
    accentBlue: t('accentBlue'),
    accentTerracotta: t('accentTerracotta'),
    accentGreen: t('accentGreen'),
    accentCharcoal: t('accentCharcoal'),

    sectionsTitle: t('sectionsTitle'),
    sectionsNote: t('sectionsNote'),
    permanent: t('permanent'),

    copyTitle: t('copyTitle'),
    langsTitle: t('langsTitle'),
    langsNote: t('langsNote'),
    /* A filename, the same in all three — see `i18n.test.ts`'s rule. */
    manifestTitle: 'manifest.json',
    manifestNote: t('manifestNote'),
    /* The catalogue has no save button of its own here — the screen was drawn
       before it had anything to save to — so it borrows the settings screen's,
       which is the same word for the same act. `notStored` is deliberately not
       passed any more: it says these settings are not stored, and they are. */
    save: panels('notify.save'),

    stageSite: t('stageSite'),
    stageInstall: t('stageInstall'),
    stageHome: t('stageHome'),
    stageApp: t('stageApp'),
    stageNote_site: t('stageNote_site'),
    stageNote_install: t('stageNote_install'),
    stageNote_home: t('stageNote_home'),
    stageNote_app: t('stageNote_app'),

    previewOrder: t('previewOrder'),
    install: t('install'),
    installSub: t('installSub'),
    camera: t('camera'),

    ...Object.fromEntries(
      (
        ['home', 'menu', 'about', 'branches', 'booking', 'gallery', 'reviews', 'contact'] as const
      ).flatMap((key) => [
        [`section_${key}`, t(`section_${key}`)],
        [`sectionNote_${key}`, t(`sectionNote_${key}`)],
      ]),
    ),
  };

  return (
    <>
      <PageHead title={t('title')} subtitle={t('sub')} />

      <SiteConfig
        labels={labels}
        lang={(await getLocale()) as 'uz' | 'ru' | 'en'}
        restaurantName={live?.meta.restaurant.name ?? 'Osh Xona'}
        monogram={live === null ? 'OX' : monogramOf(live.meta.restaurant.name)}
        /* The stored document, or nothing — `SiteConfig` keeps the design's own
           draft when the API has no session to answer for. A restaurant that
           has never opened this screen has an empty `site` group, which is not
           the same as no answer: the panel then shows its defaults, and the
           slug is the obvious first suggestion for the address. */
        saved={live?.data ?? null}
        suggestion={live?.meta.restaurant.slug ?? null}
        offline={shell('offline')}
      />
    </>
  );
}
