'use client';

import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { som } from '../../../(guest)/guest-session';
import { MpChrome } from '../../mp-chrome';
import { post } from '@/lib/console-post';

import { MP } from '@restaurant/surfaces/mp/copy';
import {
  MP_ORDERS,
  say,
  type Lang,
  type MpOrder,
  type MpOrderState,
} from '@restaurant/surfaces/mp/data';

/**
 * A customer's orders — `Ilova.dc.html:358-392`.
 *
 * Two tabs and a row per order, with the rating **in the row**. That last part
 * is the design's whole point about this screen and its own note says so: a
 * delivered order is rated where it is read, not behind a separate "rate your
 * order" flow that a customer opens once and never again. The consequence is
 * that most orders never get rated, which is the same as having no ratings.
 *
 * Four states, because a real history has four: one on the way, two delivered
 * — one of them still unrated — and one the customer cancelled. A list that
 * only ever drew "delivered" would never show the row this screen exists for.
 *
 * The stars write. `POST /api/v1/mp/orders/{number}/rate` through
 * `/api/mp/orders/[number]`, because the consumer's token is in an httpOnly
 * cookie the page cannot read; the API refuses a second rating on the same
 * order. The star lights when the answer comes back rather than on the press —
 * a rating is what the directory sorts by, and thanking somebody for a vote
 * that was discarded is the one outcome this screen must not have.
 */
const ACCENT: Readonly<Record<MpOrderState, string>> = {
  live: 'border-l-brand-500',
  delivered: 'border-l-success-500',
  past: 'border-l-border-strong',
  cancelled: 'border-l-danger-500',
};

const STATE_TEXT: Readonly<Record<MpOrderState, string>> = {
  live: 'text-brand-600',
  delivered: 'text-success-700',
  past: 'text-fg-muted',
  cancelled: 'text-danger-600',
};

const DOT: Readonly<Record<MpOrderState, string>> = {
  live: 'bg-brand-500',
  delivered: 'bg-success-500',
  past: 'bg-border-strong',
  cancelled: 'bg-danger-500',
};

export function MpOrdersBoard({
  lang,
  basket,
  orders = MP_ORDERS,
  live = false,
}: {
  lang: Lang;
  basket: string;
  /** The customer's own orders, read on the server through `mp-server.ts`. */
  orders?: readonly MpOrder[];
  /**
   * Whether those orders are theirs or the design's sample.
   *
   * A history is the one screen where showing a fixture as if it were real is
   * actively harmful — somebody would ring a restaurant about an order they
   * never placed — so an empty LIVE history stays empty and says so, while a
   * page that could not reach the API keeps the sample and marks it.
   */
  live?: boolean;
}) {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [rated, setRated] = useState<Record<string, number>>({});

  const shown = orders.filter((order) =>
    tab === 'active' ? order.state === 'live' : order.state !== 'live',
  );

  return (
    <>
      <MpChrome lang={lang} basket={basket} />

      <main
        className="mx-auto max-w-[560px] px-[var(--mp-gutter)] pt-1.5 pb-24"
        data-demo={live ? undefined : ''}
      >
        <h1 className="font-display text-xl font-bold tracking-tight">{say(MP.ordersH, lang)}</h1>

        <div className="bg-bg-muted mt-3.5 flex gap-0.5 rounded-[10px] p-[3px]">
          {(['active', 'history'] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={`h-8 flex-1 rounded-lg text-xs font-semibold ${
                tab === key ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'
              }`}
            >
              {say(key === 'active' ? MP.ordersActive : MP.ordersHistory, lang)}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="text-fg-subtle py-12 text-center text-sm">{say(MP.ordersEmpty, lang)}</p>
        ) : (
          <ul className="mt-4 grid gap-2.5">
            {shown.map((order) => (
              <li
                key={order.id}
                className={`border-border rounded-[14px] border border-l-[3px] bg-[var(--mp-surface,var(--surface))] px-4 py-3.5 ${ACCENT[order.state]}`}
              >
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="min-w-0 truncate text-[15px] font-semibold">{order.store}</span>
                  <span data-num className="text-fg-subtle flex-none font-mono text-[11px]">
                    {order.id}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2.5">
                  <span
                    className={`flex items-center gap-1.5 text-xs font-semibold ${STATE_TEXT[order.state]}`}
                  >
                    <span aria-hidden className={`size-1.5 rounded-full ${DOT[order.state]}`} />
                    {say(MP[`state_${order.state}`], lang)}
                  </span>

                  <span data-num className="font-display flex-none text-[15px] font-bold">
                    {som(order.total, lang)}
                  </span>
                </div>

                {order.canRate ? (
                  <div className="border-divider mt-3 flex items-center gap-2 border-t pt-2.5">
                    {[1, 2, 3, 4, 5].map((value) => {
                      const on = (rated[order.id] ?? 0) >= value;

                      return (
                        <button
                          key={value}
                          type="button"
                          aria-label={String(value)}
                          disabled={!live || rated[order.id] !== undefined}
                          onClick={() => {
                            /*
                             * `POST /api/v1/mp/orders/{number}/rate` through the
                             * Node handler, because the token is httpOnly. Once,
                             * on a delivered order, and it moves the shop's
                             * average in the directory — which is why the star
                             * is only lit once the API has counted it. It used
                             * to light on the press and thank the guest for a
                             * vote that was discarded.
                             *
                             * Disabled on the fixture history: `order.id` there
                             * is a sample number and would 404 after saying
                             * thank you.
                             */
                            void post(
                              `/api/mp/orders/${encodeURIComponent(order.id)}`,
                              { action: 'rate', rating: value },
                              lang,
                            ).then((answer) => {
                              if (!answer.ok) {
                                flash.problem(answer.message ?? say(MP.rateFailed, lang));
                                return;
                              }

                              setRated((current) => ({ ...current, [order.id]: value }));
                              flash(say(MP.rateThanks, lang));
                            });
                          }}
                          className="grid size-6 place-items-center"
                        >
                          <svg
                            width="19"
                            height="19"
                            viewBox="0 0 24 24"
                            fill={on ? 'var(--rating-star)' : 'none'}
                            stroke={on ? 'var(--rating-star)' : 'var(--fg-disabled)'}
                            strokeWidth="1.4"
                            aria-hidden
                          >
                            <path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.3l-5.8 3.1 1.1-6.4L2.6 9.4l6.5-.9L12 2.6Z" />
                          </svg>
                        </button>
                      );
                    })}

                    <span className="text-fg-subtle ml-1 text-[11px]">
                      {rated[order.id] === undefined
                        ? say(MP.rateNote, lang)
                        : say(MP.rateThanks, lang)}
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
