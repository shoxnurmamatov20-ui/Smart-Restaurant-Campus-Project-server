import { getTranslations } from 'next-intl/server';

/**
 * The six views a single bot has, in the order its tab strip lists them.
 *
 * A function rather than a constant, because the labels come from the
 * catalogue: a module-level array would be built once, in whatever language the
 * first render happened to use, and then serve that to everyone.
 */
export async function botSections(botKey: string) {
  const t = await getTranslations('platform.telegram.sections');

  return [
    { href: `/telegram/${botKey}`, label: t('overview') },
    { href: `/telegram/${botKey}/commands`, label: t('commands') },
    { href: `/telegram/${botKey}/messages`, label: t('messages') },
    { href: `/telegram/${botKey}/users`, label: t('users') },
    { href: `/telegram/${botKey}/broadcast`, label: t('broadcast') },
    { href: `/telegram/${botKey}/settings`, label: t('settings') },
  ];
}
