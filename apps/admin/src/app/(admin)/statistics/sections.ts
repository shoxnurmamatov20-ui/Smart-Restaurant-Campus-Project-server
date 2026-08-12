import { getTranslations } from 'next-intl/server';

/**
 * The four statistics views, in the order the tab strip lists them.
 *
 * A function rather than a constant, because the labels come from the
 * catalogue: a module-level array would be built once, in whatever language the
 * first render happened to use, and then serve that to everyone.
 */
export async function statisticsSections() {
  const t = await getTranslations('platform.extra.statistics');

  return [
    { href: '/statistics', label: t('general') },
    { href: '/statistics/users', label: t('users') },
    { href: '/statistics/activity', label: t('activity') },
    { href: '/statistics/system', label: t('system') },
  ];
}
