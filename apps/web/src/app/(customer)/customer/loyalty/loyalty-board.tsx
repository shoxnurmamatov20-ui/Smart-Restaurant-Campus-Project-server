'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { flash } from '@restaurant/ui';

import { useCart } from '../../cart-store';
import { AUTH, copy, LOYALTY_COPY } from '@restaurant/surfaces/customer/copy';
import { CustomerDock } from '../../customer-dock';
import {
  COUPONS,
  LOYALTY,
  LOYALTY_RULES,
  POINTS_PER,
  say,
  type Coupon,
  type Lang,
} from '@restaurant/surfaces/customer/data';
import { readCoupons, reserveCoupon, type ShelfCoupon } from '../../customer-client';

/**
 * Loyalty.
 *
 * Points at the top, coupons under them, the rules at the bottom — in that
 * order because it is the order a guest asks the questions: how many have I
 * got, what can I spend, and how did I get them.
 *
 * The points figure is not money and is deliberately not drawn like it. It is
 * rendered as a bare number with its own word, never through `<Money>`, because
 * a guest who reads 2 480 as so'm will expect 2 480 so'm off and be wrong by two
 * orders of magnitude. The conversion is stated in the rules instead: 100 points
 * is 1 000 so'm.
 *
 * ---------------------------------------------------------------------------
 * The shelf is real, and pressing a coupon spends points
 *
 * `GET /api/v1/public/coupons` answers with the restaurant's own shelf, this
 * guest's balance, and which coupons they are already holding;
 * `POST .../{coupon}/reserve` takes the points and mints a code. Both writes
 * happen in one transaction on the server — points deducted with no coupon
 * written is the failure a guest cannot prove and the restaurant cannot see.
 *
 * With no session the fixture shelf is drawn and the button says where a coupon
 * takes effect, exactly as it did before: a balance nobody is signed in to is
 * not a balance anything can be spent from.
 */
export function LoyaltyBoard({
  lang,
  signedIn = false,
}: {
  lang: Lang;
  /** Whether anybody holds a session on this device — decided in `page.tsx`. */
  signedIn?: boolean;
}) {
  const t = copy(LOYALTY_COPY, lang);
  const cart = useCart();

  /*
   * What the balance is currently worth, said in so'm.
   *
   * Computed from the two published constants rather than written down as a
   * third number: 100 points buys `POINTS_PER`, so the balance buys
   * `points / 100` of them. Stated in tiyin and floored, because a guest
   * cannot spend a fraction of a thousand.
   */
  /** The shelf, the balance and what this guest already holds. Null = no session. */
  const [shelf, setShelf] = useState<{
    coupons: ShelfCoupon[];
    points: number;
    held: number[];
  } | null>(null);

  useEffect(() => {
    // `GET /public/coupons` answers about a guest. With no session it answers
    // 401, and the fallback would put the demo's coupons on a stranger's
    // screen — so the question is not asked and the shelf is not drawn.
    if (!signedIn) return;

    let live = true;

    void readCoupons(lang).then((answer) => {
      if (!live || !answer.ok) return;

      setShelf({
        coupons: answer.data,
        points: answer.meta.points,
        held: answer.meta.held_coupon_ids,
      });
    });

    return () => {
      live = false;
    };
  }, [lang, signedIn]);

  /*
   * Nobody signed in means no balance to name — not a zero, and certainly not
   * the design's 2 480. The card becomes the invitation instead.
   */
  const points = shelf?.points ?? LOYALTY.points;

  const worth = Math.floor(points / 100) * POINTS_PER;

  return (
    <>
      <main className="flex-1 pb-6">
        <header
          className="px-[var(--phone-gutter)] pt-4"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
        >
          <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight">
            {t.heading}
          </h1>
        </header>

        {/* -------------------------------------------------------- points */}
        {/*
         * The dark card — `dc.html:565-575`, `--n-900` with the gold ramp on
         * it. It had been a light accent-tinted panel, which is the same shape
         * the promo block and the delivery note use: the one card in the app
         * that is meant to feel like a members' card read as another notice.
         * The star and the gold progress bar are the two things that make it
         * one, and both were missing.
         */}
        {signedIn ? (
          <section className="c-gold mx-[var(--phone-gutter)] mt-4 rounded-lg px-5.5 py-5.5">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,.66)' }}>
              {t.yourPoints}
            </p>

            <p className="mt-1 flex items-baseline gap-2">
              <span
                data-num
                className="font-display text-4xl leading-none font-bold tracking-tight"
              >
                {points.toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU').replace(/[,\s]/g, ' ')}
              </span>
              <span className="text-sm" style={{ color: 'rgba(255,255,255,.66)' }}>
                ≈{' '}
                {(worth / 100)
                  .toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU')
                  .replace(/[,\s]/g, ' ')}{' '}
                {lang === 'ru' ? 'сум' : "so'm"}
              </span>
            </p>

            <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--rating-star)" aria-hidden>
                <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.4l6.6-.9z" />
              </svg>
              {t.silverTier}
            </p>

            {/*
             * `role="progressbar"` with real values, not a styled div. A guest
             * using VoiceOver hears "62 percent" instead of nothing at all, and
             * the bar is the whole of what this card communicates.
             */}
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={LOYALTY.progressPercent}
              aria-label={t.toGold}
              className="mt-3.5 h-[5px] w-full overflow-hidden rounded-full"
              style={{ background: 'rgba(255,255,255,.16)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${LOYALTY.progressPercent}%`,
                  background: 'var(--rating-star)',
                }}
              />
            </div>

            <p data-num className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,.66)' }}>
              {t.toGold}
            </p>
          </section>
        ) : (
          /* The same card, with an invitation where the balance was. The
             coupons below stay: they are the restaurant's offers, and they are
             the same offers whether or not anybody is signed in. */
          <section className="c-gold mx-[var(--phone-gutter)] mt-4 rounded-lg px-5.5 py-5.5">
            <p className="font-display text-xl leading-tight font-semibold">{AUTH.heading[lang]}</p>
            <p className="mt-1.5 text-sm leading-normal" style={{ color: 'rgba(255,255,255,.66)' }}>
              {AUTH.lede[lang]}
            </p>
            <Link
              href="/customer/sign-in"
              className="text-fg bg-surface mt-3.5 flex h-11 items-center justify-center rounded-md text-sm font-semibold"
            >
              {AUTH.send[lang]}
            </Link>
          </section>
        )}

        {/* ------------------------------------------------------- coupons */}
        {signedIn ? (
          <section className="mt-5">
            <h2 className="text-fg-subtle px-[var(--phone-gutter)] text-xs font-semibold tracking-wide uppercase">
              {t.coupons}
            </h2>

            <ul className="mt-2 flex flex-col gap-2 px-[var(--phone-gutter)]">
              {shelf === null
                ? COUPONS.map((coupon) => (
                    <CouponRow
                      key={coupon.id}
                      coupon={coupon}
                      lang={lang}
                      use={t.use}
                      onUse={() => {
                        /*
                         * Nobody is signed in, so there are no points to spend.
                         * The old sentence still holds: it says where the coupon
                         * takes effect rather than pretending to apply one.
                         */
                        flash(`${say(coupon.name, lang)} · ${t.couponApplies}`);
                      }}
                    />
                  ))
                : shelf.coupons.map((coupon) => (
                    <CouponRow
                      key={coupon.id}
                      coupon={{
                        id: coupon.key,
                        name: coupon.name,
                        note: coupon.note ?? coupon.name,
                        // The shelf sends a date; the design draws a phrase. Until
                        // there is copy for "until 31 August" in three languages,
                        // the condition line carries the whole of it.
                        expires: coupon.note ?? coupon.name,
                        tone: coupon.tone,
                      }}
                      lang={lang}
                      use={shelf.held.includes(coupon.id) ? t.couponApplies : t.use}
                      onUse={async () => {
                        if (shelf.held.includes(coupon.id)) {
                          flash(`${say(coupon.name, lang)} · ${t.couponApplies}`);

                          return;
                        }

                        const taken = await reserveCoupon(lang, coupon.id);

                        if (!taken.ok) {
                          // "Ballar yetarli emas" and "you already hold this one"
                          // are different things to do next, and the API says
                          // which in the reader's language.
                          flash.problem(taken.message ?? t.use);

                          return;
                        }

                        setShelf({
                          ...shelf,
                          points: taken.meta.points,
                          held: [...shelf.held, coupon.id],
                        });

                        // The code is the point of the row: it is what gets typed
                        // into the promo field at checkout.
                        flash(`${taken.data.code} · ${t.couponApplies}`);
                      }}
                    />
                  ))}
            </ul>
          </section>
        ) : null}

        {/* --------------------------------------------------------- rules */}
        {/* The rules stay for everybody: how the programme works is the same
            fact whether or not anybody is signed in, and it is the half of this
            screen a reader deciding whether to sign in actually needs. */}
        <section className="mt-5 px-[var(--phone-gutter)]">
          <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
            {t.howItWorks}
          </h2>

          <ul className="mt-2 flex flex-col gap-2">
            {LOYALTY_RULES.map((rule) => (
              <li key={rule.en} className="text-fg-subtle flex gap-2 text-xs leading-normal">
                <span aria-hidden className="text-acc flex-none">
                  •
                </span>
                <span>{say(rule, lang)}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <CustomerDock lang={lang} cartCount={cart.count} />
    </>
  );
}

/** The four accents the design gives a coupon rail, as real utility classes. */
const RAIL: Readonly<Record<Coupon['tone'], string>> = {
  accent: 'bg-acc',
  brand: 'bg-brand-500',
  warning: 'bg-warning-500',
};

function CouponRow({
  coupon,
  lang,
  use,
  onUse,
}: {
  coupon: Coupon;
  lang: Lang;
  use: string;
  onUse: () => void;
}) {
  return (
    <li className="border-border bg-surface relative flex items-center gap-3 overflow-hidden rounded-md border py-3 pr-3.5 pl-4">
      {/*
       * The rail is an absolutely positioned span rather than a left border,
       * because a border would be clipped by the row's own rounding and the
       * design draws it running the full height of the card.
       */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${RAIL[coupon.tone]}`} />

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{say(coupon.name, lang)}</span>
        <span className="text-fg-subtle block text-xs">
          {say(coupon.note, lang)} · {say(coupon.expires, lang)}
        </span>
      </span>

      <button
        type="button"
        onClick={onUse}
        className="border-border rounded-pill h-[var(--tap-min)] flex-none border px-4 text-sm font-semibold"
      >
        {use}
      </button>
    </li>
  );
}
