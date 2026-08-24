'use client';

import { useRouter } from 'next/navigation';

import { flash } from '@restaurant/ui';

import { som } from '../../../(guest)/guest-session';
import { t } from '@restaurant/surfaces/tg/copy';
import { useLiveOrder } from './live-order';
import { TgAppBar } from '../../tg-app-bar';
import {
  say,
  TG_BOT,
  TG_LADDER,
  TG_ORDER,
  type Lang,
  type TgStep,
} from '@restaurant/surfaces/tg/data';
import { TgDock } from '../../tg-dock';

/**
 * Screen 3 of 4 — where the order is.
 *
 * **Five rungs, and the ladder is the platform's.** It had six, one of them
 * invented (`confirmed`, which appears in no design file and no database
 * column) and one missing — **Tayyor**, the rung a guest waiting on a delivery
 * cares about most, because it is the moment the waiting stops being about the
 * kitchen and starts being about the road. The keys now come from
 * `packages/i18n/src/order-state.ts`, so this screen and the KDS and the Z
 * report are talking about the same row.
 *
 * A check in a ring, not an emoji. The design draws the chat messages with
 * emoji and the tracker with marks, and the difference is deliberate: a
 * conversation is a restaurant talking, a tracker is a state machine.
 *
 * Fixture, and it says so through the bot rather than pretending: there is no
 * `GET /api/v1/public/orders/{id}`, so nothing here polls. When it lands this
 * takes the same shape from a fetch or a Reverb frame.
 */
export function TgTrackBoard({ lang, basket }: { lang: Lang; basket: string }) {
  const money = (tiyin: number) => som(tiyin, lang);
  const router = useRouter();
  const track = useLiveOrder();

  /*
   * The guest's own order when Telegram signed them in, and the design's
   * when this page is being read outside Telegram — where there is no
   * signature, so there is nobody whose order it could be. The fixture is
   * the demo, and the banner above says so.
   */
  const live = track.state === 'order' ? track.order : null;
  const order = live ?? {
    number: TG_ORDER.number,
    state: TG_ORDER.state,
    times: TG_ORDER.times as Partial<Record<TgStep, string>>,
    totalTiyin: null,
  };

  const reached = TG_LADDER.indexOf(order.state);

  const noteFor = (step: TgStep, index: number): string => {
    const at = order.times[step];

    if (at === undefined) return live === null ? say(TG_ORDER.handedEta, lang) : t('soon', lang);

    return index === reached ? `${at} · ${t('now', lang)}` : at;
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TgAppBar lang={lang} title={t('order', lang)} />

      <main className="flex-1 px-4 pt-4 pb-32">
        {/* ----------------------------------------------------- the card */}
        <section
          className="rounded-[14px] border px-4.5 py-4"
          style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span data-num className="text-xs" style={{ color: 'var(--tg-hint)' }}>
              {order.number} · {TG_BOT.name}
            </span>
            <span
              className="rounded-pill flex-none px-2.5 py-1 text-[11px] font-bold"
              style={{ background: 'var(--acc-soft)', color: 'var(--acc)' }}
            >
              {t('step_enroute', lang)}
            </span>
          </div>

          <p data-live="true" className="font-display mt-2 text-2xl font-bold tracking-tight">
            {say(TG_ORDER.eta, lang)}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--tg-hint)' }}>
            {say(TG_ORDER.where, lang)}
          </p>
        </section>

        {/* --------------------------------------------------- the ladder */}
        <ol className="mt-4">
          {TG_LADDER.map((step, index) => {
            const done = index <= reached;
            const live = index === reached;

            return (
              <li key={step} className="flex gap-3.5">
                <span className="flex w-[22px] flex-none flex-col items-center">
                  <span
                    aria-hidden
                    className="grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] text-[10px] font-extrabold text-white"
                    style={{
                      borderColor: live
                        ? 'var(--acc)'
                        : done
                          ? 'var(--success-500)'
                          : 'var(--border-strong)',
                      background: live ? 'var(--acc)' : done ? 'var(--success-500)' : 'transparent',
                    }}
                  >
                    {done ? '✓' : ''}
                  </span>

                  {index < TG_LADDER.length - 1 ? (
                    <span
                      aria-hidden
                      className="w-[1.5px] flex-1"
                      style={{
                        minHeight: '26px',
                        background: done ? 'var(--success-500)' : 'var(--border)',
                      }}
                    />
                  ) : null}
                </span>

                <span className="min-w-0 flex-1 pb-4.5">
                  <span
                    className="block text-sm font-semibold"
                    style={{ color: done ? 'var(--tg-text)' : 'var(--tg-hint)' }}
                  >
                    {t(`step_${step}` as 'step_accepted', lang)}
                  </span>
                  <span
                    data-num
                    className="mt-0.5 block text-[11px]"
                    style={{ color: 'var(--tg-hint)' }}
                  >
                    {noteFor(step, index)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {/* -------------------------------------------------- the courier */}
        <section
          className="flex items-center gap-3 rounded-[14px] border px-4 py-3"
          style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
        >
          <span
            className="grid size-9.5 flex-none place-items-center rounded-full text-[11px] font-bold"
            style={{ background: 'var(--bg-muted)', color: 'var(--fg-muted)' }}
          >
            {TG_ORDER.courier.initials}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t('courier', lang)}</span>
            <span data-num className="block text-[11px]" style={{ color: 'var(--tg-hint)' }}>
              {say(TG_ORDER.courier.note, lang)}
            </span>
          </span>

          {/*
           * A button, not a `tel:` link, and the flash says why: the guest's
           * number never reaches the courier and the courier's never reaches
           * the guest — the bot bridges the call. A raw `tel:` would hand over
           * a real number and break the promise in the same tap.
           */}
          <button
            type="button"
            data-tap
            data-press
            onClick={() => flash(t('callHidden', lang))}
            aria-label={t('call', lang)}
            className="grid size-9.5 flex-none place-items-center rounded-full border"
            style={{
              background: 'var(--acc-soft)',
              borderColor: 'var(--acc-line)',
              color: 'var(--acc)',
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15.5 21A13.5 13.5 0 0 1 3 8.5 3 3 0 0 1 6 5.5h1.8a1 1 0 0 1 1 .8l.7 3a1 1 0 0 1-.3 1l-1.4 1.3a11 11 0 0 0 4.6 4.6l1.3-1.4a1 1 0 0 1 1-.3l3 .7a1 1 0 0 1 .8 1V18a3 3 0 0 1-3 3z" />
            </svg>
          </button>
        </section>

        <p data-num className="mt-3 text-xs" style={{ color: 'var(--tg-hint)' }}>
          {t('total', lang)} · {money(TG_ORDER.total)}
        </p>
      </main>

      {/* The design's main button on the tracking screen is a way back to the
          conversation — `mainLabel` for anything that is not menu or cart. */}
      <div
        className="fixed inset-x-0 bottom-14 z-40 mx-auto max-w-[480px] border-t px-3.5 pt-2.5 pb-4"
        style={{ background: 'var(--tg-card)', borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          data-tap="pay"
          data-press
          onClick={() => router.push('/tg')}
          className="flex w-full items-center justify-center rounded-[10px] text-[15px] font-semibold"
          style={{ background: 'var(--acc)', color: '#fff' }}
        >
          {t('mainBack', lang)}
        </button>
      </div>

      <TgDock lang={lang} basket={basket} />
    </div>
  );
}
