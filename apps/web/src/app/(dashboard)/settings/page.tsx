import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { moduleMetadata } from '../module-page';
import { ACTION, PageHead } from '../screen';

export const generateMetadata = () => moduleMetadata('settings');

/**
 * Settings.
 *
 * Built to the design's Settings screen: one card per area, each saying what
 * it holds rather than only naming it — "Sozlamalar → Ogohlantirishlar" is a
 * path the notification panel already points people down, and a card that only
 * says "Alerts" leaves them guessing whether they have arrived.
 *
 * Branches has a screen already, so its card links there; the rest land as
 * their modules do.
 *
 * TODO — Phase 1 · settings, once the modules are built:
 *   - The restaurant profile form, and who may edit it
 *   - Roles and permissions against the Spatie set the API already defines
 *   - Alert rules: event, recipient, channel
 *   - Integrations: fiscal module, Didox, 1C, Telegram, aggregators
 *   - Plan and invoices
 */
const GROUPS = [
  { key: 'groupProfile', href: null },
  { key: 'groupRoles', href: '/settings/permissions' },
  { key: 'groupAlerts', href: null },
  { key: 'groupIntegrations', href: null },
  { key: 'groupBilling', href: null },
  { key: 'groupData', href: null },
] as const;

export default async function SettingsPage() {
  const [nav, t] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.settings'),
  ]);

  return (
    <>
      <PageHead title={nav('settings')} subtitle={t('subtitle')}>
        <Link href="/settings/branches" className={`${ACTION} grid place-items-center`}>
          {nav('branches')}
        </Link>
      </PageHead>

      <div className="grid [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))] gap-4">
        {GROUPS.map((group) => (
          <div
            key={group.key}
            className="bg-surface flex flex-col gap-3 rounded-lg border px-6 py-[22px]"
          >
            <h3 className="text-md tracking-snug font-semibold">{t(group.key)}</h3>
            <p className="text-fg-muted flex-1 text-sm leading-normal text-pretty">
              {t(`${group.key}Sub`)}
            </p>

            {/* Only the areas with a screen behind them link anywhere; the
                rest render the same control disabled rather than promising a
                page that is not there yet. */}
            {group.href ? (
              <Link
                href={group.href}
                className="hover:bg-bg-subtle mt-1 grid h-9 place-items-center self-start rounded-md border px-3.5 text-sm font-semibold"
              >
                {t('manage')}
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="text-fg-disabled mt-1 h-9 cursor-not-allowed self-start rounded-md border px-3.5 text-sm font-semibold"
              >
                {t('manage')}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
