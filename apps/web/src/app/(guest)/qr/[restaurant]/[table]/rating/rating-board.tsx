'use client';

import Link from 'next/link';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import type { GuestCopy } from '@restaurant/surfaces/guest/copy';
import type { GuestLocale } from '@restaurant/surfaces/guest/menu-data';
import { fill, somParts } from '../../../../guest-session';
import { GOLD_CARD_PERCENT, railLabel } from '@restaurant/surfaces/guest/table-data';

/**
 * The rating, and the receipt above it.
 *
 * Five stars, six tags, one optional comment — the design's shape, and the
 * reason for the tags is that a guest holding a phone at a table will tap three
 * chips and will not type a sentence. A rating with no tags is a number nobody
 * can act on; a rating with "Tez keldi" on it tells a manager which shift did
 * well.
 *
 * **It is sent now.** `POST /api/v1/public/feedback` takes a review with no
 * account behind it — a guest at a table has none, and a complaint form that
 * demands one collects fewer complaints, which reads on a dashboard as a better
 * week. The stars are the score, the tags and the comment are the text, and the
 * restaurant comes from the sticker's own URL.
 *
 * The screen does not wait for the answer. It thanks the guest and stops,
 * because they are standing up to leave and a network error is not something
 * they can act on.
 *
 * The star buttons are a radio group rather than five toggles: a rating is one
 * value, arrow keys should move it, and a screen reader should say "3 of 5"
 * rather than reading five unrelated checkboxes.
 */
export function RatingBoard({
  locale,
  copy,
  paid,
  railId,
  restaurant,
  table,
  here,
}: {
  locale: GuestLocale;
  copy: GuestCopy;
  paid: number | null;
  railId: string | null;
  /** The slug in the sticker's URL — which restaurant this review is about. */
  restaurant: string;
  /** The table segment. Numeric on this platform; anything else is not sent. */
  table: string;
  here: string;
}) {
  const t = copy.qr.rating;

  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<readonly string[]>([]);
  const [comment, setComment] = useState('');
  const [keepPhone, setKeepPhone] = useState(false);
  const [receipt, setReceipt] = useState(false);

  const money = paid === null ? null : somParts(paid, locale);

  return (
    <main data-safe-top className="flex flex-1 flex-col px-[var(--guest-gutter)] pb-8">
      {/* -------------------------------------------------------- receipt */}
      {/*
       * Payment received — `Mehmon.dc.html:499-505`.
       *
       * On the success ramp with a check mark, not on the accent. The accent is
       * what this app uses for "here is an offer"; a bill that has been settled
       * is the one moment on the surface that has genuinely succeeded, and a
       * guest scanning the screen for reassurance reads the green tick before
       * they read any of the words.
       */}
      {money !== null ? (
        <section className="mt-2">
          <span className="bg-success-50 text-success-600 grid size-13 place-items-center rounded-2xl">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>

          <h2 className="font-display mt-4 text-[26px] font-bold tracking-tight text-balance">
            {t.paid}
          </h2>

          <p data-num className="text-fg-muted mt-2 text-sm leading-relaxed">
            {fill(t.paidLine, {
              amount: money.amount,
              currency: money.currency,
              method: railId === null ? '—' : railLabel(railId),
            })}
          </p>

          <button
            type="button"
            onClick={() => {
              setReceipt(true);
              flash(t.receiptDone);
            }}
            className="border-border mt-5 flex h-13 w-full items-center gap-3 rounded-[13px] border px-4 text-left text-sm font-medium"
          >
            {/*
             * There is no fiscal driver behind this — `soliq.uz` receives a
             * cheque from the OFD integration the platform has not written yet.
             * The button says what it did rather than downloading an empty PDF.
             */}
            {receipt ? t.receiptDone : t.receipt}
          </button>
        </section>
      ) : null}

      {/* --------------------------------------------------------- rating */}
      <header className="border-divider mt-7 border-t pt-6">
        <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight">
          {t.title}
        </h1>
        <p className="text-fg-subtle mt-1 text-sm">{t.sub}</p>
      </header>

      {/*
       * Five 52px tiles with the design's star glyph — `dc.html:513-519`.
       *
       * A drawn path in `--rating-star`, not the `★` character: the text star
       * inherits the button's colour and renders at whatever weight the font
       * happens to carry it at, which is why the unselected row read as five
       * grey asterisks rather than five empty stars.
       */}
      <div role="radiogroup" aria-label={t.title} className="mt-4 flex gap-2.5">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === stars}
            aria-label={t.stars[value - 1]}
            onClick={() => setStars(value)}
            className={`grid size-13 place-items-center rounded-[14px] ${
              value <= stars ? 'bg-warning-50' : 'bg-bg-muted'
            }`}
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill={value <= stars ? 'var(--rating-star)' : 'none'}
              stroke={value <= stars ? 'var(--rating-star)' : 'var(--fg-disabled)'}
              strokeWidth="1.6"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m12 2.6 2.9 6 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.5l6.5-.9z" />
            </svg>
          </button>
        ))}
      </div>

      {/*
       * The word for the score, shown only once one is chosen. A default of
       * "Yaxshi" under five grey stars is a rating the guest did not give.
       */}
      <p className="mt-3 min-h-5 text-sm font-semibold">{stars === 0 ? '' : t.stars[stars - 1]}</p>

      {/*
       * Everything below waits for a star — `dc.html:524` wraps it all in
       * `sc-if value="{{rated}}"`.
       *
       * The screen used to ask for stars, six tags, a sentence and a phone
       * number at once, which is the shape a guest closes: they came to pay,
       * the meal is over, and a form is not what "was it good?" looks like.
       * One tap answers the question; the rest appears because they answered.
       */}
      {stars === 0 ? null : (
        <>
          {/* ----------------------------------------------------------- tags */}
          <section className="mt-5">
            <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
              {t.whatGood}
            </h2>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.tags.map((tag) => {
                const on = tags.includes(tag);

                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setTags((current) =>
                        on ? current.filter((entry) => entry !== tag) : [...current, tag],
                      )
                    }
                    className={`h-[var(--tap-min)] rounded-full px-3.5 text-sm font-semibold ${
                      on ? 'bg-acc text-white' : 'bg-bg-muted text-fg-muted'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </section>

          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t.commentPlaceholder}
            aria-label={t.commentPlaceholder}
            rows={3}
            className="border-border bg-surface mt-4 w-full resize-none rounded-md border px-3.5 py-3 text-base"
          />

          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              checked={keepPhone}
              onChange={(event) => setKeepPhone(event.target.checked)}
              className="accent-acc mt-0.5 h-4 w-4 flex-none"
            />
            <span className="text-fg-subtle text-sm leading-normal">
              {fill(t.loyalty, { percent: GOLD_CARD_PERCENT })}
            </span>
          </label>

          <button
            type="button"
            onClick={() => {
              /*
               * The tags and the comment together, because the console draws one
               * comment column. The tags are already words a person wrote —
               * "Tez keldi", "Mazali" — so they read as a sentence rather than
               * as a taxonomy nobody entered.
               */
              const said = [tags.join(', '), comment.trim()]
                .filter((part) => part !== '')
                .join(' — ');

              void fetch(
                `/api/customer/feedback?lang=${locale}&restaurant=${encodeURIComponent(restaurant)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    score: stars,
                    comment: said === '' ? undefined : said,
                    /*
                     * The token, which is what is actually on the sticker.
                     *
                     * `[table]` is a `qr_token` — 22 random characters minted
                     * once and laminated onto furniture — and never an id. This
                     * used to send `table_id` for the numeric case, which meant
                     * every real QR code sent nothing at all and the review
                     * arrived detached from the table it was left at. The
                     * console's feedback screen groups by table, so an
                     * unattached review is a complaint about a room.
                     *
                     * The numeric branch stays for the console's own path,
                     * where a manager types a review in on somebody's behalf
                     * and does hold an id.
                     */
                    ...(/^\d+$/.test(table)
                      ? { table_id: Number(table) }
                      : table.length === 22
                        ? { table_token: table }
                        : {}),
                  }),
                },
              ).catch(() => null);

              flash(fill(t.thanks, { stars }));
            }}
            className="bg-acc text-md mt-5 grid h-13 w-full place-items-center rounded-md font-semibold text-white"
          >
            {t.send}
          </button>
        </>
      )}

      <Link
        href={`${here}?lang=${locale}`}
        onClick={() => flash(t.skipped)}
        className="text-fg-muted mt-2 grid h-[var(--tap-min)] w-full place-items-center text-sm font-semibold"
      >
        {t.skip}
      </Link>
    </main>
  );
}
