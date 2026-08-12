import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { ACTION, CARD, H3, PageIntro } from '../../../screen';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return { title: `Telegram · ${id}` };
}

/**
 * One Telegram account, across every bot it has touched.
 *
 * A person is linked to the platform once and then reachable through several
 * bots; the interesting question is never "what did they do in the guest bot"
 * but "who is this and which bots can reach them".
 *
 * Unlinking sits apart from the rest and is drawn in red: it silently stops
 * every notification that account receives, and nothing tells the person it
 * happened.
 *
 * TODO — once the TelegramBots module reports live:
 *   - Profile, linked bots and the last fifty commands and messages
 *   - Linking to another bot, and the confirmation Telegram itself requires
 *   - Unlinking, with the audit entry it must write
 */
const PANELS = ['profile', 'bots', 'activity', 'messages'] as const;

export default async function TelegramUserDetailPage({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations('platform.extra.tgUser');

  return (
    <>
      <Link
        href="/telegram/users"
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
        {t('back')}
      </Link>

      <PageIntro
        actions={
          <>
            <button type="button" className={ACTION}>
              {t('link')}
            </button>
            <button
              type="button"
              className="text-danger-700 hover:bg-danger-50 flex h-9 items-center rounded-md border px-3.5 text-sm font-medium"
            >
              {t('unlink')}
            </button>
          </>
        }
      >
        {t('intro')} <span className="font-mono">{id}</span>
      </PageIntro>

      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))] gap-5">
        {PANELS.map((panel) => (
          <section key={panel} className={`${CARD} px-6 py-[22px]`}>
            <h3 className={H3}>{t(panel)}</h3>
            <p className="text-fg-subtle mt-2 text-xs leading-normal">{t(`${panel}Note`)}</p>
            <div
              data-num
              className="font-display text-fg-disabled mt-4 text-2xl font-semibold tracking-tight"
            >
              —
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
