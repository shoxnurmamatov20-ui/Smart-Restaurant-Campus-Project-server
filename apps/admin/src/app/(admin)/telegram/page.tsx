import Link from 'next/link';

import { formatNumber } from '@restaurant/utils';

import { getTranslations } from 'next-intl/server';

import { ACTION, ACTION_PRIMARY, CARD, PageIntro } from '../screen';
import { ALL_BOTS, BOT_GROUPS } from './bots';

export async function generateMetadata() {
  const nav = await getTranslations('platform.nav');
  return { title: nav('telegram') };
}

/**
 * Fifty bots, one dispatcher.
 *
 * Every bot here is a route into the same Python process; none of them is a
 * separate service. The grouping is the registry's own, so an operator reading
 * this page and an engineer reading `registry.py` are looking at the same map.
 *
 * The dot on each card is the only state the console can honestly show today:
 * a bot without a token cannot start, and saying so on the card is cheaper than
 * letting somebody discover it after a broadcast fails.
 *
 * TODO — once the TelegramBots module reports live:
 *   - Real enabled state, subscriber counts and 24-hour message volume
 *   - Token presence per bot, from the secret manager rather than .env
 *   - Starting and stopping a bot from here
 */
export default async function TelegramBotsPage() {
  const t = await getTranslations('platform.telegram');

  const total = ALL_BOTS.length;

  return (
    <>
      <PageIntro
        actions={
          <>
            <Link href="/telegram/broadcast" className={ACTION}>
              {t('broadcast')}
            </Link>
            <Link href="/telegram/analytics" className={ACTION_PRIMARY}>
              {t('analytics')}
            </Link>
          </>
        }
      >
        <span data-num>{formatNumber(total)}</span> {t('intro')}
      </PageIntro>

      <div className="bg-surface mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))] overflow-hidden rounded-lg border">
        {[
          { label: t('totalBots'), value: formatNumber(total) },
          { label: t('enabled'), value: '0' },
          { label: t('linkedUsers'), value: '—' },
          { label: t('messages24h'), value: '—' },
        ].map((cell) => (
          <div key={cell.label} className="border-divider border-r px-[22px] py-5 last:border-r-0">
            <div className="text-fg-subtle mb-2.5 text-xs">{cell.label}</div>
            <div
              data-num
              className={`font-display text-2xl font-semibold tracking-tight ${
                cell.value === '—' ? 'text-fg-disabled' : ''
              }`}
            >
              {cell.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        {BOT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="text-fg-subtle text-2xs tracking-caps mb-2.5 font-semibold uppercase">
              {group.title}
            </h3>

            <div className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-2.5">
              {group.bots.map((bot) => (
                <Link
                  key={bot.key}
                  href={`/telegram/${bot.key}`}
                  data-row
                  className={`${CARD} flex items-center gap-3 px-3.5 py-3`}
                >
                  <span className="bg-bg-muted text-fg-muted text-2xs grid size-10 flex-none place-items-center rounded-md font-mono font-semibold uppercase">
                    {bot.key.replace(/^br_/, '').slice(0, 3)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{bot.name}</span>
                    <span className="text-fg-subtle mt-0.5 block truncate text-xs">
                      <span className="font-mono">{bot.key}</span> · {bot.audience}
                    </span>
                  </span>

                  <span
                    aria-hidden
                    title={t('noToken')}
                    className="bg-border-strong rounded-pill size-2 flex-none"
                  />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="border-divider bg-bg-subtle mt-5 rounded-lg border border-dashed px-6 py-5">
        <p className="text-sm font-semibold">{t('enableTitle')}</p>
        <p className="text-fg-muted mt-1.5 text-xs leading-normal">
          Bot ishlashi uchun{' '}
          <code className="bg-bg-muted rounded-sm px-1 py-px font-mono">
            apps/telegram-bots/.env
          </code>{' '}
          faylida{' '}
          <code className="bg-bg-muted rounded-sm px-1 py-px font-mono">BOT_TOKEN_&lt;KEY&gt;</code>{' '}
          o&apos;rnating va Python servisni qayta ishga tushiring, so&apos;ng:
        </p>
        <code className="bg-fg text-bg mt-2.5 inline-block rounded-sm px-2 py-1 font-mono text-xs">
          php artisan telegram:sync
        </code>
      </div>
    </>
  );
}
