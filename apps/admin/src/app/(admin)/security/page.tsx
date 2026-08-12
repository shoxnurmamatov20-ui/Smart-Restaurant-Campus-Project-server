import { getTranslations } from 'next-intl/server';

import { CARD, PageIntro, Stub } from '../screen';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('security') };
}

/**
 * What is going wrong at the door.
 *
 * The four figures are the ones worth waking up for. They are drawn with an
 * em dash rather than a zero, because this console has no metrics endpoint yet
 * and a confident "0 failed logins" would be a lie — the difference between
 * "nothing happened" and "nothing is being measured" is the whole value of the
 * screen.
 *
 * TODO — once the platform API lands:
 *   - Failed logins, suspicious IPs, live sessions and 2FA coverage
 *   - IP allowlist, per operator
 *   - Ending a session from here, and the audit entry it writes
 */
const STATS = ['failedLogins', 'suspiciousIps', 'sessions', 'twoFactor'] as const;

export default async function SecurityPage() {
  const t = await getTranslations('platform.extra.security');

  return (
    <>
      <PageIntro>{t('intro')}</PageIntro>

      <div className="mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
        {STATS.map((stat) => (
          <div key={stat} className={`${CARD} px-5 pt-[18px] pb-4`}>
            <div className="text-fg-subtle mb-2.5 text-xs">{t(stat)}</div>
            <div
              data-num
              className="font-display text-fg-disabled text-3xl leading-none font-semibold tracking-tight"
            >
              —
            </div>
            <div className="text-fg-subtle mt-2 text-xs">{t(`${stat}Hint`)}</div>
          </div>
        ))}
      </div>

      <Stub title={t('stub')}>{t('note')}</Stub>
    </>
  );
}
