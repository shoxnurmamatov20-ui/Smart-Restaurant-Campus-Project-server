'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { flash } from '@restaurant/ui';

import { t } from '@restaurant/surfaces/tg/copy';
import { say, TG_BOT, TG_CHAT, type Lang, type TgChatAction } from '@restaurant/surfaces/tg/data';

/**
 * Stage one of three — the conversation the guest actually arrives in.
 *
 * `Telegram.dc.html:151-186`. This screen did not exist: `/tg` redirected
 * straight to the menu, which skipped the only part of the product a guest
 * sees first and deleted the design's own argument for it — *the menu is not
 * in the bot, it opens in the mini app* (`chatNote`). It also deleted the only
 * two controls in the whole platform by which a guest can rate an order or say
 * something went wrong (`GAPS.md §4.1 K3`).
 *
 * Emoji, and only on this surface. `FOUNDATIONS §8` bans them everywhere else;
 * a Telegram bot message without one reads as a system alert rather than as a
 * restaurant talking. The set is closed to the nine in `TG_EMOJI` — the build
 * had invented three the designer never drew.
 *
 * **Nothing here is a real Telegram keyboard.** These are the buttons the bot
 * would send; on the phone they are drawn by Telegram from the bot's own reply
 * markup, and this is the web rendering of the same conversation.
 */
export function TgChatBoard({ lang }: { lang: Lang }) {
  const router = useRouter();

  /**
   * @param said The button's own label — what the guest actually pressed, and
   *   the only description of the problem this surface has. The chat has no
   *   free-text field: the design draws reply-markup buttons, not a form.
   */
  const run = (action: TgChatAction, said: string) => {
    switch (action.kind) {
      case 'open':
        router.push(`/tg/${action.screen}`);

        return;
      case 'call':
        flash(t('callCourier', lang));

        return;
      case 'rate':
        /*
         * The rating stays in the chat, deliberately.
         *
         * `Telegram.dc.html` draws it as a row of star buttons the *bot* sends
         * as reply markup — the guest taps one inside Telegram and the bot
         * receives it. This web rendering has no star to read, so posting a
         * score here would be inventing one. The bot gateway
         * (`/api/v1/bots/{botKey}/feedback`) is where that lands.
         */
        flash(t('ratedInChat', lang));

        return;
      case 'problem':
        /*
         * A problem report has no score to invent — it is the guest saying
         * something went wrong — so it goes as a 2, the same way the customer
         * app's problem sheet does. `Feedback::negative()` is `score <= 2`; a 1
         * is auto-flagged urgent, and a control that marked every report urgent
         * would make the flag mean nothing by Friday.
         *
         * Not awaited: the guest is in a chat, the promise is "a manager will
         * be in touch", and a network error is not something they can act on
         * from here.
         */
        void fetch(`/api/customer/feedback?lang=${lang}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score: 2, aspect: 'problem', comment: said }),
        }).catch(() => null);

        flash(t('problemSent', lang));
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ------------------------------------------------------- bot header */}
      <header
        className="flex flex-none items-center gap-2.5 border-b px-3.5 py-2"
        style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
      >
        <span
          className="grid size-9 flex-none place-items-center rounded-full text-[11px] font-extrabold text-white"
          style={{ background: 'var(--acc)' }}
        >
          {TG_BOT.initials}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{TG_BOT.name}</span>
          <span className="block text-[11px]" style={{ color: 'var(--tg-link)' }}>
            {t('botOnline', lang)}
          </span>
        </span>

        <span data-num className="flex-none text-[11px]" style={{ color: 'var(--tg-hint)' }}>
          {TG_BOT.handle}
        </span>
      </header>

      {/* ----------------------------------------------------------- thread */}
      <div
        data-scroll
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-3.5 pb-2.5"
        style={{ background: 'var(--chat-bg, var(--bg-muted))' }}
      >
        {TG_CHAT.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.outgoing ? 'justify-end' : 'justify-start'}`}
          >
            <div
              data-sheet
              className="max-w-[82%] px-3.5 pt-2.5 pb-2 shadow-xs"
              style={{
                background: message.outgoing
                  ? 'var(--chat-out, var(--acc-soft))'
                  : 'var(--chat-in, var(--surface))',
                borderRadius: message.outgoing ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              }}
            >
              {message.title === undefined ? null : (
                <p className="mb-1.5 flex items-center gap-1.5">
                  <span aria-hidden className="text-base leading-none">
                    {message.icon}
                  </span>
                  <span className="text-sm font-bold">{say(message.title, lang)}</span>
                </p>
              )}

              <p className="text-sm leading-normal whitespace-pre-line">
                {say(message.body, lang)}
              </p>

              {message.rows === undefined ? null : (
                <dl
                  className="mt-2 grid gap-1 border-t pt-2"
                  style={{ borderColor: 'var(--divider)' }}
                >
                  {message.rows.map((row) => (
                    <div key={row.value} className="flex items-baseline justify-between gap-3">
                      <dt className="min-w-0 text-xs" style={{ color: 'var(--tg-hint)' }}>
                        {say(row.label, lang)}
                      </dt>
                      <dd
                        data-num
                        className="flex-none text-xs font-semibold"
                        style={{ color: row.strong ? 'var(--tg-text)' : 'var(--tg-hint)' }}
                      >
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {message.keyboard === undefined ? null : (
                <div className="mt-2.5 grid gap-1.5">
                  {message.keyboard.map((button, index) => (
                    <button
                      key={say(button.label, 'uz')}
                      type="button"
                      data-tap
                      data-press
                      onClick={() => run(button.action, say(button.label, lang))}
                      className="flex w-full items-center justify-center gap-1.5 rounded-[9px] text-sm font-semibold"
                      style={
                        index === 0
                          ? { background: 'var(--acc)', color: '#fff' }
                          : { background: 'var(--bg-muted)', color: 'var(--fg)' }
                      }
                    >
                      {button.icon === undefined ? null : (
                        <span aria-hidden className="text-base leading-none">
                          {button.icon}
                        </span>
                      )}
                      {say(button.label, lang)}
                    </button>
                  ))}
                </div>
              )}

              <p
                data-num
                className="mt-1 text-right text-[10px]"
                style={{ color: 'var(--fg-disabled)' }}
              >
                {message.at}
              </p>
            </div>
          </div>
        ))}

        <p className="px-1 pt-2 text-[11px] leading-normal" style={{ color: 'var(--tg-hint)' }}>
          {t('chatNote', lang)}
        </p>

        {/*
         * The third stage, reachable. `/tg/push` shows what these same messages
         * look like on a locked phone — the design's own `push` stage — and a
         * restaurant deciding what its bot should send needs to see them there
         * rather than only here.
         */}
        <Link
          href="/tg/push"
          data-tap
          className="px-1 pb-1 text-[11px] font-semibold underline"
          style={{ color: 'var(--tg-link)' }}
        >
          {t('pushTab', lang)}
        </Link>
      </div>

      {/* ------------------------------------------------- the way in */}
      {/*
       * `t.kbOpen`. On a real client this is Telegram's own menu button, which
       * the bot declares with `setChatMenuButton`; here it is a link, and both
       * land on the same URL.
       */}
      <div
        className="flex flex-none items-center gap-2.5 border-t px-3 pt-2.5 pb-3.5"
        style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
      >
        {/*
          TODO(integration): needs TELEGRAM_BOT_TOKEN — see docs/GO-LIVE.md.

          The real control here is Telegram's own menu button, declared by
          `setChatMenuButton`, which is a Bot API call authenticated by that
          token. It is made once per bot by the aiogram dispatcher in
          `apps/telegram-bots`, and the token must never reach a page a guest
          can open. The same key gates the other half: `initData` arrives signed
          with it, and until something verifies that signature this URL cannot
          know who opened it, which is why nothing on this surface writes.

          The link below lands on the same screen the button would, so the
          conversation is walkable in a plain browser and reviewable against the
          design file. It is a rendering of the bot's reply markup, not the
          markup itself.
        */}
        <Link
          href="/tg/menu"
          data-tap
          data-press
          className="rounded-pill flex flex-none items-center px-4 text-xs font-semibold"
          style={{ background: 'var(--acc)', color: '#fff' }}
        >
          {t('kbOpen', lang)}
        </Link>

        <span
          data-tap
          className="rounded-pill flex min-w-0 flex-1 items-center border px-3.5 text-sm"
          style={{
            background: 'var(--bg-subtle)',
            borderColor: 'var(--border)',
            color: 'var(--fg-disabled)',
          }}
        >
          {t('kbPlaceholder', lang)}
        </span>
      </div>
    </div>
  );
}
