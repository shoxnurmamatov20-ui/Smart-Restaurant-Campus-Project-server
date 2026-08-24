'use client';

import { useState } from 'react';

import { t } from '@restaurant/surfaces/mp/copy';
import type { Lang } from '@restaurant/surfaces/mp/data';
import { CancelSheet, ProblemSheet } from '../../mp-modals';

/**
 * The interactive half of the tracking screen — `Sayt.dc.html:658-706`.
 *
 * Everything else on that screen is a fact the server states; these are the
 * things a guest can *do* while an order is out: report a problem, or cancel.
 * Both now write — `POST /v1/mp/orders/{number}/dispute` and `/cancel` through
 * a Node handler, because the consumer's token is httpOnly.
 *
 * ---------------------------------------------------------------------------
 * Three controls the design draws are NOT here, and their absence is the fix
 *
 *   **Call the courier.** The design promises the courier's number is never
 *   handed over: the call is bridged and both sides see a platform number.
 *   That is a telephony contract with a provider who leases the numbers —
 *   `PBX_MASKED_NUMBER_KEY` in `docs/GO-LIVE.md` — and no amount of code here
 *   produces a masked leg. The button used to flash a sentence about number
 *   masking, which is the wrong answer at the one moment a control has to work:
 *   a guest whose delivery is late presses Call and wants a call.
 *
 *   **Message the courier.** There is no messaging endpoint on the platform at
 *   all — not unwired, absent.
 *
 *   **Get a receipt.** `FISCAL_DRIVER=none`, and no guest-scoped receipt route
 *   exists; the row told a guest the document was on its way to Telegram and
 *   their email and nothing was ever sent.
 *
 * All three come back the day their backend does. A button that lies is worse
 * than a screen that is honestly shorter.
 *
 * Client island rather than a client page: the ladder, the map and the contents
 * never change in the browser, and shipping them to it for two handlers is a
 * page that renders later for no gain.
 */

export function TrackHelp({
  lang,
  orderNumber,
  totalTiyin,
}: {
  lang: Lang;
  /** Null when the screen behind is the design's sample journey. */
  orderNumber: string | null;
  totalTiyin: number;
}) {
  const [sheet, setSheet] = useState<'problem' | 'cancel' | null>(null);

  const ROWS = [
    { key: 'helpProblem' as const, open: () => setSheet('problem') },
    { key: 'helpCancel' as const, open: () => setSheet('cancel') },
  ];

  return (
    <>
      <section className="bg-surface mt-4 rounded-lg border p-5">
        <h2 className="text-[13px] font-semibold">{t('helpH', lang)}</h2>

        <ul className="mt-2.5 grid gap-px">
          {ROWS.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                data-tap
                onClick={row.open}
                className={`flex w-full items-center justify-between gap-2.5 rounded-[9px] px-3 text-[13px] font-medium ${
                  row.key === 'helpCancel' ? 'text-danger-600' : 'text-fg-muted'
                }`}
              >
                {t(row.key, lang)}

                <svg
                  width="15"
                  height="15"
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
      </section>

      {sheet === 'problem' ? (
        <ProblemSheet
          lang={lang}
          orderNumber={orderNumber}
          totalTiyin={totalTiyin}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'cancel' ? (
        <CancelSheet lang={lang} orderNumber={orderNumber} onClose={() => setSheet(null)} />
      ) : null}
    </>
  );
}
