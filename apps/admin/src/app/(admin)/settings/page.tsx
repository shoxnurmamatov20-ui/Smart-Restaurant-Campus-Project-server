import { getTranslations } from 'next-intl/server';

import { PLATFORM_SETTINGS } from '../platform-data';
import { Tabs } from '../screen';
import { settingsSections } from './sections';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('settings') };
}

/**
 * How the platform behaves towards the restaurants on it.
 *
 * Built to the design's platform settings: five switches, each with the detail
 * that makes it decidable — "auto-suspend after 14 days" means nothing without
 * "data kept for 90 days" underneath it.
 *
 * The last switch cannot be turned off, and is drawn that way rather than
 * hidden. A console that can quietly stop recording what its operators do is a
 * console nobody should trust; showing the locked control, with the reason next
 * to it, is the honest version.
 *
 * TODO — once the platform API lands:
 *   - Persisting a change, and auditing who made it
 *   - The dunning schedule as an editable sequence rather than a fixed one
 *   - Retention policy per plan
 */
export default async function PlatformSettingsPage() {
  const sections = await settingsSections();
  const t = await getTranslations('platform.platformSettings');

  return (
    <>
      <Tabs items={sections} current="/settings" />

      <section className="bg-surface max-w-[900px] overflow-hidden rounded-lg border">
        {PLATFORM_SETTINGS.map((setting) => (
          <div
            key={setting.key}
            className="border-divider flex items-center gap-5 border-b px-6 py-4 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t(`${setting.key}.label`)}</div>
              <div className="text-fg-subtle mt-[3px] text-xs">{t(`${setting.key}.detail`)}</div>
            </div>

            {/*
              `aria-checked` and `disabled` do the work the appearance only
              suggests: without them a screen reader hears a button with no
              state, and the locked switch looks pressable.
            */}
            <button
              type="button"
              role="switch"
              aria-checked={setting.on}
              aria-label={t(`${setting.key}.label`)}
              disabled={setting.locked}
              className={`rounded-pill flex h-[26px] w-11 flex-none items-center p-[3px] transition-colors ${
                setting.on ? 'bg-brand-500' : 'bg-border-strong'
              } ${setting.locked ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <span
                className={`rounded-pill block size-5 bg-white shadow-sm transition-transform ${
                  setting.on ? 'translate-x-[18px]' : ''
                }`}
              />
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
