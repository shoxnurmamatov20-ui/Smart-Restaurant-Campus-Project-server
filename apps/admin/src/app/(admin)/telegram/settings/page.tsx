import { getTranslations } from 'next-intl/server';

import { ACTION_PRIMARY, CARD, H3, PageIntro } from '../../screen';

export async function generateMetadata() {
  const t = await getTranslations('platform.telegram.sections');
  return { title: t('settings') };
}

/**
 * The settings all fifty bots share.
 *
 * Per-bot settings live under `/telegram/{botKey}/settings`; what is here is
 * what a single bot has no business overriding — the webhook the whole
 * dispatcher listens on, the rate limits Telegram itself imposes, and the
 * retry policy that decides whether a failed message is lost.
 *
 * Secrets are shown masked and are not editable here. A field that can reveal a
 * bot token in a browser is a field that will eventually reveal one in a
 * screen-share; the secret manager owns them.
 *
 * The values are mono and left as-is: a webhook URL and "20 / 60s" mean the
 * same thing in every language, and translating them would only invite drift
 * between what this page claims and what the dispatcher is configured with.
 *
 * TODO — once the TelegramBots module reports live:
 *   - Editing each value, with the resync that has to follow
 *   - Reading the channel list from the module's config rather than a constant
 *   - Running `telegram:sync` from here, as a job with visible progress
 */
const PANELS: readonly { key: string; rows: readonly [string, string][] }[] = [
  {
    key: 'webhook',
    rows: [
      ['url', 'https://api.smartrest.uz/telegram/webhook'],
      ['secret', '••••••••'],
    ],
  },
  {
    key: 'rateLimit',
    rows: [
      ['perUser', '20 / 60s'],
      ['perBot', '30 / s'],
    ],
  },
  {
    key: 'languages',
    rows: [
      ['supported', 'uz, ru, en'],
      ['default', 'uz'],
    ],
  },
  {
    key: 'retry',
    rows: [
      ['attempts', '5'],
      ['backoff', '30s'],
      ['timeout', '15s'],
    ],
  },
];

export default async function TelegramGlobalSettingsPage() {
  const t = await getTranslations('platform.extra.tgSettings');

  return (
    <>
      <PageIntro
        actions={
          <button type="button" className={ACTION_PRIMARY}>
            {t('sync')}
          </button>
        }
      >
        {t('intro')}
      </PageIntro>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))] gap-5">
        {PANELS.map((panel) => (
          <section key={panel.key} className={`${CARD} px-6 py-[22px]`}>
            <h3 className={`${H3} mb-3.5`}>{t(panel.key)}</h3>

            {panel.rows.map(([label, value]) => (
              <div
                key={label}
                className="border-divider flex items-baseline justify-between gap-4 border-b py-2.5 last:border-b-0"
              >
                <span className="text-fg-muted text-sm">{t(label)}</span>
                <span data-num className="truncate text-right font-mono text-xs">
                  {value}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>

      <div className="border-divider bg-bg-subtle mt-5 rounded-lg border border-dashed px-6 py-5">
        <p className="text-sm font-semibold">{t('channelsTitle')}</p>
        <p className="text-fg-muted mt-1.5 text-xs leading-normal">{t('channelsNote')}</p>
      </div>
    </>
  );
}
