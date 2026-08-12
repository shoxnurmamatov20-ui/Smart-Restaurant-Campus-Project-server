import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageIntro, StatStrip, Stub, Tabs } from '../../screen';
import { BOT_BY_KEY } from '../bots';
import { botSections } from '../sections';

type Props = { params: Promise<{ botKey: string }> };

export async function generateMetadata({ params }: Props) {
  const { botKey } = await params;
  return { title: BOT_BY_KEY[botKey]?.name ?? botKey };
}

/**
 * One bot's control panel.
 *
 * The tab strip is the same one every sub-view carries, so moving between a
 * bot's commands and its users never costs a trip back to the list.
 *
 * The key is shown in the mono face beside the name. Operators talk to
 * engineers about `stock_alert`, not about "Ombor ogohlantirish", and the page
 * should let them read the identifier off the screen exactly.
 *
 * TODO — once the TelegramBots module reports live:
 *   - GET /api/v1/admin/telegram/bots/{botKey}: enabled, token, webhook, sync
 *   - The 24-hour activity chart and the top five commands
 *   - Recent errors, with the payload that caused them
 */
export default async function BotDetailPage({ params }: Props) {
  const { botKey } = await params;

  const t = await getTranslations('platform.telegram');
  const tg = await getTranslations('platform.extra.tg');
  const sections = await botSections(botKey);

  const bot = BOT_BY_KEY[botKey];

  return (
    <>
      <Link
        href="/telegram"
        className="text-fg-muted hover:text-fg mb-[18px] flex items-center gap-2 text-sm font-medium"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 6 9 12l6 6" />
        </svg>
        {t('allBots')}
      </Link>

      <Tabs items={sections} current={`/telegram/${botKey}`} />

      <PageIntro>
        <span className="font-mono">{botKey}</span>
        {bot ? ` · ${bot.audience} ${t('forAudience')}` : ''}
      </PageIntro>

      <StatStrip
        stats={[
          { label: tg('botUsersCount'), value: '—' },
          { label: tg('todayMessages'), value: '—' },
          { label: tg('commands24h'), value: '—' },
          { label: tg('errorRate'), value: '—' },
        ]}
      />

      <Stub title={tg('botStub')}>{tg('botNote')}</Stub>
    </>
  );
}
