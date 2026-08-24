import { pathLocale } from '@/lib/server-locale';

import { guestLocale, som } from '../../../(guest)/guest-session';
import { MpChrome } from '../../mp-chrome';
import { fill, t } from '@restaurant/surfaces/mp/copy';
import { MP_LADDER, MP_ORDER, say, storeById, type Lang } from '@restaurant/surfaces/mp/data';
import { getLatestTracking } from '../../mp-server';
import { TrackHelp } from './track-actions';

export const dynamic = 'force-dynamic';

/**
 * Screen 4 of 4 — where the order is.
 *
 * Five steps with timestamps, the courier, the contents, what it was paid with,
 * and three help links. A server component: nothing here is interactive and
 * the only thing that changes it is the restaurant and the courier.
 *
 * **Timestamps on the rail, not just ticks.** A guest who ordered at seven and
 * is looking at "cooking" wants to know whether it started two minutes ago or
 * twenty, and a green tick answers neither. The step that has not happened
 * carries an em dash rather than a guess.
 *
 * The three help links are the design's and the last one is the point: cancel
 * is offered up to the moment a courier collects, and after that it is not —
 * which is why it sits with "a problem with the order" rather than as a button.
 *
 * ---------------------------------------------------------------------------
 * Live, with a fixture behind it
 *
 * The screen has no order number in its URL — it is the dock's third tab, and
 * what a person means by it is "the one I am waiting for". So the server asks
 * for the newest order that is still moving.
 *
 * `null` covers three different absences and they are deliberately one branch:
 * nobody is signed in, nothing is on its way, or the API cannot be reached.
 * All three mean the same thing to this screen — there is nothing of yours to
 * track — and it draws the design's sample journey with `data-demo` on it so
 * nothing here is mistaken for somebody's dinner.
 */
export default async function MarketplaceTrackPage() {
  const lang = guestLocale(await pathLocale(), null) as Lang;
  const money = (tiyin: number) => som(tiyin, lang);

  const live = await getLatestTracking(lang);
  const fixtureStore = storeById(MP_ORDER.storeId);

  const order = live ?? {
    number: MP_ORDER.number,
    storeName: fixtureStore?.name ?? '',
    reached: MP_ORDER.reached,
    stamps: MP_ORDER.stamps,
    courier: {
      name: say(MP_ORDER.courier.name, lang),
      rating: MP_ORDER.courier.rating,
      deliveries: MP_ORDER.courier.deliveries,
    },
    total: MP_ORDER.total,
    paidWith: say(MP_ORDER.paidWith, lang),
  };

  return (
    <>
      <MpChrome lang={lang} basket="mp:osh-xona" />

      <main
        className="mx-auto max-w-[720px] px-4 pt-5 pb-24 sm:px-6"
        data-demo={live === null ? '' : undefined}
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('track', lang)}</h1>
        <p data-num className="text-fg-subtle mt-1 text-sm">
          {order.number} · {order.storeName}
        </p>

        <ol className="mt-6">
          {MP_LADDER.map((step, index) => {
            const reached = index <= order.reached;

            return (
              <li key={step} className="flex gap-4">
                <span className="flex flex-none flex-col items-center">
                  <span
                    className={`mt-1 grid size-5 place-items-center rounded-full text-[10px] text-white ${
                      reached ? 'bg-brand-500' : 'bg-border-strong'
                    }`}
                    aria-hidden
                  >
                    {reached ? '✓' : ''}
                  </span>
                  {index < MP_LADDER.length - 1 ? (
                    <span
                      aria-hidden
                      className={`w-px flex-1 ${reached ? 'bg-brand-500' : 'bg-border'}`}
                      style={{ minHeight: '1.8rem' }}
                    />
                  ) : null}
                </span>

                <span className="flex flex-1 items-baseline justify-between gap-3 pb-5">
                  <span className={`text-sm ${reached ? 'font-semibold' : 'text-fg-subtle'}`}>
                    {t(`step_${step}` as 'step_placed', lang)}
                  </span>
                  <span data-num className="text-fg-subtle flex-none text-xs">
                    {order.stamps[index] ?? '—'}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <section className="bg-surface rounded-lg border p-5">
          <h2 className="text-2xs tracking-caps text-fg-subtle font-semibold uppercase">
            {t('courier', lang)}
          </h2>

          <div className="mt-2.5 flex items-center gap-3">
            <span className="bg-bg-muted text-fg-muted rounded-pill grid size-11 flex-none place-items-center text-sm font-semibold">
              OS
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{order.courier?.name ?? '—'}</span>
              <span data-num className="text-fg-subtle block text-xs">
                ★ {order.courier?.rating ?? '—'} ·{' '}
                {fill(t('deliveries', lang), { n: order.courier?.deliveries ?? 0 })}
              </span>
            </span>
          </div>

          {/* The design puts Call and Message on this card. Neither is drawn:
              there is no telephony provider behind a masked call and no
              messaging endpoint at all — see ./track-actions.tsx. */}
        </section>

        <section className="bg-surface mt-3 rounded-lg border p-5">
          <h2 className="text-2xs tracking-caps text-fg-subtle font-semibold uppercase">
            {t('contents', lang)}
          </h2>

          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="text-sm font-semibold">{t('total', lang)}</span>
            <span data-num className="font-display text-lg font-bold">
              {money(order.total)}
            </span>
          </div>

          <p data-num className="text-fg-subtle mt-1 text-xs">
            {t('paidWith', lang)}: {order.paidWith}
          </p>
        </section>

        <TrackHelp
          lang={lang}
          /* Null on the fixture journey, which disables both sheets: a
             complaint raised against `MP_ORDER.number` would 404 after telling
             the guest it had been filed. */
          orderNumber={live === null ? null : order.number}
          totalTiyin={order.total}
        />
      </main>
    </>
  );
}
