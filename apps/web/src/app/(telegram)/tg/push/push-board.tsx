'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { flash } from '@restaurant/ui';

import { t } from '@restaurant/surfaces/tg/copy';
import { say, TG_BOT, TG_PUSHES, type Lang, type TgPushAction } from '@restaurant/surfaces/tg/data';

/**
 * Stage three of three — what the bot sends afterwards.
 *
 * `Telegram.dc.html:382-414`, filled in at `:607-624`. Four cards on a locked
 * phone, each doing exactly one job and each carrying the one or two answers
 * that job has: track it, call the courier, confirm or cancel a table, look at
 * the points or leave a rating. That last pair is the design's whole argument
 * for the stage — "Har biri bir ish uchun, har biri javob berish mumkin" — and
 * the build had none of it.
 *
 * **This is a preview, not a notification system.** Real cards are drawn by
 * iOS and Android from a Telegram push; the buttons are the bot's inline
 * keyboard. What the screen is for is showing a restaurant what its guests will
 * receive, and giving this repository somewhere to put the four messages so
 * they are written once and reviewed against the file.
 *
 * The dark field is the design's own gradient rather than the theme's: a lock
 * screen is a lock screen in light mode too.
 */
export function TgPushBoard({ lang }: { lang: Lang }) {
  const router = useRouter();

  const run = (action: TgPushAction) => {
    switch (action.kind) {
      case 'open':
        router.push(`/tg/${action.screen}`);

        return;
      case 'call':
        flash(t('callCourier', lang));

        return;
      case 'rate':
        flash(t('ratedInPush', lang));

        return;
      case 'confirm':
        /*
         * A preview of a tap, not the tap.
         *
         * This whole screen is what a guest's *lock screen* looks like — the
         * class note above says so and the design's stage is called `push`. The
         * real cards are drawn by iOS and Android from a Telegram notification
         * and these buttons are the bot's inline keyboard, so pressing one there
         * sends a callback query to `apps/telegram-bots` with the reservation it
         * belongs to. There is no reservation in this browser to confirm: the
         * four cards are `TG_PUSHES`, written so a restaurant can read what its
         * guests will receive and so the wording lives somewhere reviewable.
         *
         * Which is why this is a toast rather than a call. Confirming somebody
         * else's booking from a page anyone can open would need a per-booking
         * token in the URL and a public endpoint to spend it on, and neither
         * exists — `POST /api/v1/public/reservations` is the only public route
         * the diary has, deliberately: every booking arrives `pending` and a
         * person confirms it against the diary.
         */
        flash(t('bookingConfirmed', lang));

        return;
      case 'cancel':
        flash(t('bookingCancelled', lang));
    }
  };

  const TONE: Readonly<Record<string, string>> = {
    success: 'var(--success-500)',
    acc: 'var(--acc)',
    warning: 'var(--warning-500)',
    star: 'var(--rating-star)',
  };

  return (
    <div
      className="flex min-h-dvh flex-col px-4 pb-8"
      style={{ background: 'linear-gradient(180deg,#1B2334 0%,#0F1320 100%)' }}
    >
      <header className="flex-none pt-7 pb-1 text-center">
        <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,.6)' }}>
          {t('lockDate', lang)}
        </p>
        <p
          data-num
          className="font-display mt-0.5 text-[62px] leading-none font-bold text-white"
          style={{ letterSpacing: '-.03em' }}
        >
          11:24
        </p>
      </header>

      <div data-scroll className="mt-5 grid flex-1 content-start gap-2.5 overflow-y-auto">
        {TG_PUSHES.map((push) => (
          <article
            key={push.id}
            data-sheet
            className="rounded-2xl border p-3.5"
            style={{
              background: 'rgba(255,255,255,.12)',
              borderColor: 'rgba(255,255,255,.16)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid size-5.5 flex-none place-items-center rounded-md text-[11px] font-extrabold text-white"
                style={{ background: TONE[push.tone] }}
              >
                {push.mark}
              </span>
              <span
                data-num
                className="min-w-0 flex-1 truncate text-[11px] font-semibold"
                style={{ color: 'rgba(255,255,255,.72)' }}
              >
                {TG_BOT.handle}
              </span>
              <span
                data-num
                className="flex-none text-[11px]"
                style={{ color: 'rgba(255,255,255,.56)' }}
              >
                {say(push.ago, lang)}
              </span>
            </div>

            <p className="mt-2 text-sm leading-snug font-semibold text-white">
              {say(push.title, lang)}
            </p>
            <p
              className="mt-1 text-xs leading-normal whitespace-pre-line"
              style={{ color: 'rgba(255,255,255,.68)' }}
            >
              {say(push.body, lang)}
            </p>

            <div className="mt-3 flex gap-2">
              {push.actions.map((entry, index) => (
                <button
                  key={say(entry.label, 'uz')}
                  type="button"
                  data-tap
                  data-press
                  onClick={() => run(entry.action)}
                  className="flex h-9 flex-1 items-center justify-center rounded-[10px] text-[11px] font-semibold text-white"
                  style={
                    index === 0
                      ? { background: 'var(--acc)', border: '0' }
                      : { background: 'transparent', border: '1px solid rgba(255,255,255,.2)' }
                  }
                >
                  {say(entry.label, lang)}
                </button>
              ))}
            </div>
          </article>
        ))}

        <p
          className="px-1 pt-2 text-[11px] leading-normal"
          style={{ color: 'rgba(255,255,255,.56)' }}
        >
          {t('lockNote', lang)}
        </p>
      </div>

      <Link
        href="/tg"
        data-tap
        data-press
        className="mt-4 flex flex-none items-center justify-center rounded-[10px] text-sm font-semibold text-white"
        style={{ border: '1px solid rgba(255,255,255,.2)' }}
      >
        {t('mainBack', lang)}
      </Link>
    </div>
  );
}
