'use client';

import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { MpChrome } from '../../mp-chrome';
import { MP, t } from '@restaurant/surfaces/mp/copy';
import {
  MP_POINTS,
  MP_PROFILE_ROWS,
  MP_PROFILE_STATS,
  say,
  type Lang,
} from '@restaurant/surfaces/mp/data';
import { NotificationsSheet, PlusSheet, type NotifyPrefs } from '../../mp-modals';

/**
 * Group a point balance the way this platform groups money.
 *
 * A narrow no-break space — U+202F — because `FOUNDATIONS` asks for a thin
 * separator and `toLocaleString` gives a comma in English and a breakable
 * space in Russian, so the same figure read "2,840" in one language and wrapped
 * across two lines in the next.
 */
const grouped = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');

/**
 * The customer's profile — `Ilova.dc.html:394-440`.
 *
 * The screen opens on the loyalty card and that is the design's ordering, not
 * an accident: a balance of 2 840 points with a rail 71% of the way to gold is
 * the reason somebody opens a profile at all. The six settings rows below it
 * are what they came for the *second* time.
 *
 * **The rail carries a sentence, not just a width.** "1 160 points to gold" is
 * what makes 71% mean anything; a bar on its own is a bar.
 *
 * **Two of the six rows now do something.** MyPOS Plus opens the sheet that
 * buys it — `POST /api/v1/mp/plus/subscribe`, through a Node handler because
 * the consumer's token is httpOnly — and notifications opens four switches that
 * save through `PATCH /api/v1/mp/me`. Both write back up through
 * `/api/mp/*` for the reason every write on this surface does: the page cannot
 * read the credential, deliberately.
 *
 * The other four still confirm what they would open, in the design's own words,
 * and name the endpoint that will answer them. Saved cards is the one that
 * never will from here — a card on file is a token the payment provider holds,
 * and a pan stored on this side of the wire is the thing PCI exists to forbid.
 */
export function MpProfileBoard({
  lang,
  basket,
  plusActive = false,
  prefs,
}: {
  lang: Lang;
  basket: string;
  /** Whether the subscription is live right now, read through `mp-server.ts`. */
  plusActive?: boolean;
  /** The four switches as the platform holds them. */
  prefs: NotifyPrefs;
}) {
  const [plus, setPlus] = useState(plusActive);
  const [plusOpen, setPlusOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notify, setNotify] = useState<NotifyPrefs>(prefs);

  return (
    <>
      <MpChrome lang={lang} basket={basket} />

      <main className="mx-auto max-w-[560px] px-[var(--mp-gutter)] pt-1.5 pb-24">
        <div className="flex items-center gap-3.5">
          <span className="bg-brand-100 text-brand-700 font-display grid size-14 flex-none place-items-center rounded-full text-[19px] font-extrabold">
            DA
          </span>
          <div className="min-w-0">
            <p className="font-display text-[19px] font-bold tracking-tight">
              {say(MP.profileName, lang)}
            </p>
            <p data-num className="text-fg-subtle mt-0.5 text-[13px]">
              {say(MP.profilePhone, lang)}
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------- points */}
        <section className="border-brand-200 bg-brand-50 mt-4.5 rounded-2xl border px-4.5 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-brand-700 text-xs font-semibold">{t('pointsLbl', lang)}</span>
            <span className="text-brand-700 tracking-caps text-[11px] font-bold uppercase">
              {t('tier', lang)}
            </span>
          </div>

          <p
            data-num
            className="font-display text-brand-700 mt-1 text-[33px] leading-none font-bold tracking-tight"
          >
            {grouped(MP_POINTS.balance)}
          </p>

          <div
            data-rail
            role="img"
            aria-label={`${t('tier', lang)}: ${MP_POINTS.attainment}%`}
            className="mt-3.5 h-1 overflow-hidden rounded-full bg-[rgba(46,116,234,.22)]"
          >
            <div
              className="bg-brand-500 h-full rounded-full"
              style={{ width: `${MP_POINTS.attainment}%` }}
            />
          </div>

          <p className="text-brand-700 mt-1.5 text-[11px]">{t('tierNote', lang)}</p>
        </section>

        {/* -------------------------------------------------------- stats */}
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          {MP_PROFILE_STATS.map((stat) => (
            <div
              key={stat.key}
              className="border-border bg-surface rounded-[14px] border px-3.5 py-3.5"
            >
              <p className="text-fg-subtle text-[11px]">
                {say(MP[`stat_${stat.key}` as 'stat_orders'], lang)}
              </p>
              <p data-num className="font-display mt-1 text-[19px] font-bold">
                {say(stat.value, lang)}
              </p>
            </div>
          ))}
        </div>

        {/* --------------------------------------------------------- rows */}
        <ul className="mt-5 grid gap-px">
          {MP_PROFILE_ROWS.map((row) => (
            <li key={row}>
              <button
                type="button"
                data-tap
                onClick={() => {
                  if (row === 'plus') {
                    setPlusOpen(true);
                    return;
                  }

                  if (row === 'notifications') {
                    setNotifyOpen(true);
                    return;
                  }

                  /*
                   * Two of the remaining four have an endpoint and need a
                   * handler beside `/api/mp/me`: addresses is
                   * PUT /api/v1/mp/me/addresses (the whole list at once — see
                   * the address sheet), and language is a `locale` on the same
                   * PATCH the notifications sheet already posts to.
                   *
                   * TODO(integration): needs PAYME_KEY — see docs/GO-LIVE.md
                   *
                   * That one is the saved-cards row, and it is not an endpoint
                   * we are missing. A card on file is a token the provider
                   * holds against the guest; the pan never crosses to this side
                   * of the wire and must not, so listing "···4417" here means
                   * reading the vault with a merchant credential the platform
                   * does not hold yet. Help is the fourth and is a phone
                   * number.
                   */
                  flash(
                    `${say(MP[`row_${row}` as 'row_help'], lang)} · ${say(
                      MP[`rowNote_${row}` as 'rowNote_help'],
                      lang,
                    )}`,
                  );
                }}
                className="flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-3.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {say(MP[`row_${row}` as 'row_help'], lang)}
                  </span>
                  <span className="text-fg-subtle mt-0.5 block text-[11px]">
                    {row === 'plus' && plus
                      ? t('plusSideNoteOn', lang)
                      : say(MP[`rowNote_${row}` as 'rowNote_help'], lang)}
                  </span>
                </span>

                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--fg-subtle)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="flex-none"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>

        <p className="text-fg-subtle mt-3.5 text-xs leading-relaxed">{say(MP.profileNote, lang)}</p>
      </main>

      {plusOpen ? (
        <PlusSheet
          lang={lang}
          active={plus}
          onToggle={setPlus}
          onClose={() => setPlusOpen(false)}
        />
      ) : null}

      {notifyOpen ? (
        <NotificationsSheet
          lang={lang}
          prefs={notify}
          onSaved={setNotify}
          onClose={() => setNotifyOpen(false)}
        />
      ) : null}
    </>
  );
}
