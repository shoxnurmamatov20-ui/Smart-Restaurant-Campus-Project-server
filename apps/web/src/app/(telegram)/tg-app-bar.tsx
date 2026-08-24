import Link from 'next/link';

import { t } from '@restaurant/surfaces/tg/copy';
import type { Lang } from '@restaurant/surfaces/tg/data';

/**
 * The mini app's own header — `Telegram.dc.html:187-202`.
 *
 * A close control on the left, the screen's name in the middle, and the words
 * "mini ilova" under it. Telegram draws its own chrome above a real WebView, so
 * the earlier build left this out on purpose; what that overlooked is that
 * **`Yopish` is the way back to the conversation**, and the conversation is
 * where the bot's messages, the rating buttons and the problem report live. A
 * mini app with no way back to its own chat is a dead end, and it is also how
 * this surface behaves in the plain browser it is developed and shared in.
 *
 * Not sticky: the design's header scrolls with the sheet, and a phone that has
 * already given Telegram's bar 42px of its height cannot spare a second one.
 */
export function TgAppBar({ lang, title }: { lang: Lang; title: string }) {
  return (
    <header
      className="flex flex-none items-center gap-3 border-b px-3.5 py-2.5"
      style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
    >
      <Link
        href="/tg"
        data-tap
        data-press
        className="flex flex-none items-center text-sm font-semibold"
        style={{ color: 'var(--tg-link)' }}
      >
        {t('appClose', lang)}
      </Link>

      <span className="min-w-0 flex-1 text-center">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block text-[10px]" style={{ color: 'var(--tg-hint)' }}>
          {t('appVia', lang)}
        </span>
      </span>

      {/* The design reserves the mirror of the close control so the title stays
          optically centred. An empty span is cheaper than measuring. */}
      <span aria-hidden className="w-[52px] flex-none" />
    </header>
  );
}
