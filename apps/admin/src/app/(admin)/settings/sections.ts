import { getTranslations } from 'next-intl/server';

/**
 * The four settings views, in the order the tab strip lists them.
 *
 * A function rather than a constant, because the labels come from the
 * catalogue: a module-level array would be built once, in whatever language the
 * first render happened to use, and then serve that to everyone.
 */
export async function settingsSections() {
  const t = await getTranslations('platform.settings');

  return [
    { href: '/settings', label: t('general') },
    { href: '/settings/email', label: t('email') },
    { href: '/settings/sms', label: t('sms') },
    { href: '/settings/localization', label: t('localization') },
  ];
}
