import { getTranslations } from 'next-intl/server';

import { Head } from '../../platform-ui';
import { platformSettings } from '../platform-server';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('settings') };
}

/**
 * The four switches that apply to everybody.
 *
 * Every row carries the sentence saying what happens when it moves, because
 * these are not preferences — turning on maintenance mode takes forty-two
 * restaurants offline, and a toggle with only a name is a toggle somebody flips
 * to find out.
 *
 * Impersonation is on and stays on. Support cannot work without it; what makes
 * it safe is the sign-in history, not a switch that gets turned back on under
 * pressure and forgotten.
 */
export default async function PlatformSettingsPage() {
  const [t, nav, settings] = await Promise.all([
    getTranslations('console.platformSettings'),
    getTranslations('console.platformNav'),
    platformSettings(),
  ]);

  return (
    <>
      <Head title={nav('settings')} subtitle={t('subtitle')} />

      <ul className="bg-surface divide-divider divide-y rounded-lg border">
        {settings.map((setting) => (
          <li key={setting.key} className="flex items-center gap-4 px-5 py-4">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t(`name_${setting.key}`)}</span>
              <span className="text-fg-subtle block text-xs leading-normal">
                {t(`note_${setting.key}`)}
              </span>
            </span>

            {/*
             * Read here, written by PATCH /api/v1/platform/settings.
             *
             * Still drawn as a value rather than as a switch: flipping
             * `maintenance` takes every restaurant on the platform offline,
             * and a control one tap away from that belongs behind a
             * confirmation this page does not have yet.
             */}
            {setting.kind === 'number' ? (
              <span data-num className="text-md flex-none font-semibold">
                {t('days', { n: Number(setting.value) })}
              </span>
            ) : (
              <span
                className={`rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold ${
                  setting.value ? 'bg-success-50 text-success-700' : 'bg-bg-muted text-fg-muted'
                }`}
              >
                {setting.value ? t('on') : t('off')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
