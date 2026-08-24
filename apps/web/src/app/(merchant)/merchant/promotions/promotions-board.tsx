'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { flash } from '@restaurant/ui';

import { apiId, post } from '@/lib/console-post';

import { som } from '../../../(guest)/guest-session';
import { merchantCopy } from '../../merchant-copy';
import {
  AD_SLOTS,
  AD_TEXT,
  MERCHANT_EMPTY,
  NOT_SAVED,
  PROMO_BUDGET,
  PROMO_RETURN,
  PROMO_SPEND,
  PROMO_TEXT,
  say,
  type Lang,
  type PromotionState,
  type Trilingual,
} from '../../merchant-data';
import type { MerchantPromotion, PlacementSlotKey, PlacementSlotView } from '../../merchant-server';
import { BudgetSheet, CancelPromoSheet } from '../../merchant-sheets';

/**
 * Promotions — `Do'kon paneli.dc.html:522-560`.
 *
 * Three offers in three lifecycles: one running, one scheduled, one finished.
 * The panel had none of them — it drew the *placements* a merchant can buy and
 * called that the promotions screen, which is the advertising shop rather than
 * the campaigns. A merchant could not see the offer that was live, could not
 * pause it, and could not find out what it had cost.
 *
 * **The buttons differ per state because the states differ.** A running offer
 * can be paused; a scheduled one can have its budget changed or be cancelled
 * before it starts; a finished one can only be run again. One "edit" button on
 * all three would refuse two-thirds of the time.
 *
 * **Ad spend is the number beside them**, and the three lines under it are what
 * makes it a decision rather than an expense: 1 940 000 spent returned
 * 11 400 000, which is 5.9 so‘m per so‘m and 94 new guests.
 *
 * ---------------------------------------------------------------------------
 * Optimistic, and it rolls back
 *
 * Every button here moves the card before the answer arrives, because a
 * merchant pausing an offer at seven in the evening is doing it for a reason
 * and a spinner is not an answer. A refusal puts the card back where it was and
 * says why in the merchant's own language — `marketplace.promotion_transition`
 * is "reload this screen", `marketplace.budget_below_spend` is "type a bigger
 * number", and a card left in the wrong state after either is a merchant who
 * believes an offer is stopped while it is still spending their money.
 */
const CHIP: Readonly<Record<PromotionState, string>> = {
  running: 'bg-success-50 text-success-700',
  scheduled: 'bg-brand-50 text-brand-700',
  ended: 'bg-bg-muted text-fg-muted',
  paused: 'bg-bg-muted text-fg-muted',
  cancelled: 'bg-bg-muted text-fg-muted',
};

const EDGE: Readonly<Record<PromotionState, string>> = {
  running: 'border-success-500',
  scheduled: 'border-border',
  ended: 'border-border',
  paused: 'border-border',
  cancelled: 'border-border',
};

/**
 * One row of the advertising shop, whether it came from the rate card or the
 * design.
 *
 * `slot` is `null` on a specimen row: the design draws three positions and the
 * platform sells two, so the banner has no `slot` to book. Its button says so
 * rather than posting something the API would answer `invalid_slot` to.
 */
type SlotRow = {
  key: string;
  slot: PlacementSlotKey | null;
  label: Trilingual;
  note: Trilingual;
  price: number;
  wait: number;
  booking: PlacementSlotView['booking'];
};

/** Nothing is bought for today — a placement starts on the next day. */
function tomorrow(now: Date): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

export function PromotionsBoard({
  lang,
  promotions,
  slots = null,
  live = false,
}: {
  lang: Lang;
  /** Campaigns, read through `merchant-server.ts`. */
  promotions: readonly MerchantPromotion[];
  /** The rate card, or `null` when the API could not answer with one. */
  slots?: readonly PlacementSlotView[] | null;
  /**
   * Whether these cards are this restaurant's or the design's sample.
   *
   * Marked rather than left to be guessed at: a promotions screen showing
   * invented spend as real is a merchant budgeting against nothing.
   */
  live?: boolean;
}) {
  const money = (tiyin: number) => som(tiyin, lang);
  const t = merchantCopy(lang);
  const router = useRouter();

  const [states, setStates] = useState<Partial<Record<string, PromotionState>>>({});
  const [budgets, setBudgets] = useState<Partial<Record<string, number>>>({});
  const [budgetFor, setBudgetFor] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<string | null>(null);

  /*
   * Which slots this merchant holds right now, keyed by row.
   *
   * Seeded from the server on every render and moved by a click. `undefined`
   * means "whatever the server said"; an explicit entry is this session's own
   * change, so a release that the API refused can put the booking back.
   */
  const [booked, setBooked] = useState<Partial<Record<string, SlotRow['booking']>>>({});
  const [queued, setQueued] = useState<Partial<Record<string, number>>>({});

  const stateOf = (promo: MerchantPromotion) => states[promo.id] ?? promo.state;
  const budgetOf = (promo: MerchantPromotion) => budgets[promo.id] ?? promo.budget;

  const refused = (message: string | null) => flash.problem(message ?? say(NOT_SAVED, lang));

  /**
   * Move an offer along, and put it back if the platform says no.
   *
   * A sample card — the design's carry `p1`, `p2`, `p3` — never reaches the
   * API: `apiId` answers `null` for them, and a PATCH aimed at a made-up id
   * would either 404 or, worse, change whichever real campaign holds it.
   */
  async function move(promo: MerchantPromotion, next: PromotionState, told: Trilingual) {
    const before = stateOf(promo);

    setStates((now) => ({ ...now, [promo.id]: next }));

    const real = apiId(promo.id);

    if (real === null) {
      flash(say(told, lang));

      return;
    }

    const sent = await post(`/api/marketplace/promotions/${real}`, { state: next }, lang);

    if (sent.ok) {
      flash(say(told, lang));

      return;
    }

    setStates((now) => ({ ...now, [promo.id]: before }));
    refused(sent.message);
  }

  /** A new ceiling on an offer that already exists. */
  async function reBudget(promo: MerchantPromotion, tiyin: number) {
    const before = budgetOf(promo);

    setBudgets((now) => ({ ...now, [promo.id]: tiyin }));

    const told = say(PROMO_TEXT.budgetSaved, lang).replace('{amount}', money(tiyin));
    const real = apiId(promo.id);

    if (real === null) {
      flash(told);

      return;
    }

    const sent = await post(`/api/marketplace/promotions/${real}`, { budgetTiyin: tiyin }, lang);

    if (sent.ok) {
      flash(told);

      return;
    }

    /*
     * `marketplace.budget_below_spend` lands here, and putting the old ceiling
     * back is the whole point: a card left showing a budget the platform
     * refused is a merchant who thinks they have capped an offer that is still
     * running on the old number.
     */
    setBudgets((now) => ({ ...now, [promo.id]: before }));
    refused(sent.message);
  }

  /**
   * Run an ended offer again.
   *
   * A CREATE, not a transition, and that is why it is not `move()`: the module
   * has no duplicate endpoint, so the new draft is assembled here from the
   * finished offer's own fields. It used to flash a confirmation and create
   * nothing at all — the only primary button on that card, on the screen whose
   * one job is spending money.
   *
   * The copy comes back scheduled rather than running (the handler pins the
   * state), so the merchant looks at the budget before it starts spending.
   */
  async function runAgain(promo: MerchantPromotion) {
    if (promo.kind === undefined) {
      /* A sample card — the design's three carry `p1`, `p2`, `p3` and no kind.
         Nothing to copy, and the wrapper already says the figures are not
         this merchant's. */
      flash(say(PROMO_TEXT.againFlash, lang));

      return;
    }

    const sent = await post(
      '/api/marketplace/promotions',
      {
        title: promo.title,
        body: promo.body,
        kind: promo.kind,
        discountTiyin: promo.discount,
        budgetTiyin: budgetOf(promo),
      },
      lang,
    );

    if (!sent.ok) {
      refused(sent.message);

      return;
    }

    flash(say(PROMO_TEXT.againFlash, lang));
    /* The new card is on the server and not in this list. A refresh is the
       honest way to show it — inventing a row here would put a campaign on
       screen with an id nothing else on the board could act on. */
    router.refresh();
  }

  /* ------------------------------------------------------------- ad slots */

  const rows: readonly SlotRow[] =
    slots === null
      ? AD_SLOTS.map((slot) => ({
          key: slot.key,
          slot: null,
          label: slot.label,
          note: slot.note,
          price: slot.price,
          wait: slot.wait,
          booking: null,
        }))
      : slots.map((slot) => ({
          key: slot.slot,
          slot: slot.slot,
          label: slot.label,
          note: slot.note,
          price: slot.price,
          wait: slot.wait,
          booking: slot.booking,
        }));

  /**
   * Buy a position, or give one back.
   *
   * **One day, starting tomorrow.** The design's card is a single tap with a
   * per-day price on it and no term control at all, so the smallest honest
   * commitment is the one the price label already states. A default week would
   * be a button that spends seven times what it says.
   */
  async function toggleSlot(row: SlotRow) {
    const mine = row.key in booked ? (booked[row.key] ?? null) : row.booking;

    if (mine !== null) {
      setBooked((now) => ({ ...now, [row.key]: null }));

      const sent = await post(
        '/api/marketplace/placements',
        { action: 'release', placementId: mine.id },
        lang,
      );

      if (sent.ok) {
        flash(say(AD_TEXT.released, lang));

        return;
      }

      setBooked((now) => ({ ...now, [row.key]: mine }));
      refused(sent.message);

      return;
    }

    if (row.slot === null) {
      /* A specimen row: the platform sells two positions and this is the
         third the design drew. Saying so beats a refusal from the API. */
      flash.problem(say(NOT_SAVED, lang));

      return;
    }

    const provisional = { id: 0, days: 1, total: row.price, startsOn: tomorrow(new Date()) };

    setBooked((now) => ({ ...now, [row.key]: provisional }));

    const sent = await post<{ data: { id: number; total_tiyin: number; starts_on: string } }>(
      '/api/marketplace/placements',
      { action: 'book', slot: row.slot, startsOn: provisional.startsOn, days: 1 },
      lang,
    );

    if (sent.ok) {
      setBooked((now) => ({
        ...now,
        [row.key]: {
          // The id the release button needs. Until the answer arrives the row
          // holds a zero, which `whole()` refuses in the handler — so a release
          // pressed in that half-second is declined rather than aimed at
          // whichever placement happens to be row one.
          id: sent.data.data.id,
          days: 1,
          total: sent.data.data.total_tiyin,
          startsOn: sent.data.data.starts_on,
        },
      }));
      flash(say(row.wait > 0 ? AD_TEXT.bookedQueue : AD_TEXT.bookedNow, lang));

      return;
    }

    setBooked((now) => ({ ...now, [row.key]: null }));

    /*
     * A taken slot is a schedule, not a no. `meta.queue_days` says how long
     * until it frees, so the row's counter moves to the server's number and
     * the toast says it in words — rather than "not saved", which tells a
     * merchant nothing about when to come back.
     */
    const days = sent.code === 'marketplace.placement_slot_taken' ? sent.meta?.queue_days : null;

    if (typeof days === 'number') {
      setQueued((now) => ({ ...now, [row.key]: days }));
      flash.problem(say(AD_TEXT.queued, lang).replace('{n}', String(days)));

      return;
    }

    refused(sent.message);
  }

  return (
    <>
      {/*
        The whole screen, marked when it is drawing the design's sample rather
        than this restaurant's campaigns — the same wrapper every board in this
        panel carries, and for the same reason.
      */}
      <div data-demo={live ? undefined : ''} className="contents">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid content-start gap-3">
            {/* An empty list is a live answer now — the read no longer draws the
                design's three specimen campaigns over it. The three states are
                explained in words instead, which teaches the same thing without
                inventing a budget on the one screen that spends money. */}
            {promotions.length === 0 ? (
              <p className="border-border bg-surface text-fg-subtle rounded-[14px] border px-6 py-9 text-center text-[13px] leading-relaxed">
                {say(MERCHANT_EMPTY.promotions, lang)}
              </p>
            ) : null}

            {promotions.map((promo) => {
              const state = stateOf(promo);
              const budget = budgetOf(promo);

              /* The scheduled specimen's three figures move with the budget: at
                 6 000 a share, the budget is literally a number of orders. A
                 live offer states its own three and needs no arithmetic here. */
              const stats =
                !live && promo.id === 'p2'
                  ? [
                      {
                        label: promo.stats[0]!.label,
                        value: `+${Math.floor(budget / PROMO_BUDGET.sharePerOrder)}`,
                      },
                      {
                        label: promo.stats[1]!.label,
                        value: money(PROMO_BUDGET.sharePerOrder),
                      },
                      { label: promo.stats[2]!.label, value: money(budget) },
                    ]
                  : promo.stats.map((stat) => ({
                      label: stat.label,
                      value: say(stat.value, lang),
                    }));

              return (
                <article
                  key={promo.id}
                  className={`bg-surface rounded-[14px] border px-5 py-4.5 ${EDGE[state]}`}
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`rounded-pill px-2.5 py-[3px] text-[11px] font-bold ${CHIP[state]}`}
                    >
                      {say(PROMO_TEXT[`state_${state}` as 'state_running'], lang)}
                    </span>
                    <span className="flex-1" />
                    <span data-num className="text-fg-subtle text-xs">
                      {say(promo.window, lang)}
                    </span>
                  </div>

                  <p className="font-display mt-2.5 text-[17px] font-bold tracking-tight">
                    {say(promo.title, lang)}
                  </p>
                  <p className="text-fg-muted mt-1 text-[13px] leading-relaxed">
                    {say(promo.body, lang)}
                  </p>

                  <div className="border-border bg-divider mt-3.5 grid grid-cols-1 gap-px overflow-hidden rounded-[11px] border sm:grid-cols-3">
                    {stats.map((stat) => (
                      <div key={say(stat.label, lang)} className="bg-surface px-3.5 py-3">
                        <p className="text-fg-subtle tracking-caps text-[10px] font-semibold uppercase">
                          {say(stat.label, lang)}
                        </p>
                        <p data-num className="font-display mt-0.5 text-[17px] font-bold">
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {state === 'running' ? (
                      <>
                        <PromoAction
                          label={say(PROMO_TEXT.pause, lang)}
                          kind="outline"
                          onClick={() => void move(promo, 'paused', PROMO_TEXT.pausedFlash)}
                        />
                        <PromoAction
                          label={say(PROMO_TEXT.report, lang)}
                          kind="quiet"
                          href="/merchant/performance"
                        />
                      </>
                    ) : null}

                    {state === 'paused' ? (
                      <PromoAction
                        label={say(PROMO_TEXT.resume, lang)}
                        kind="primary"
                        onClick={() => void move(promo, 'running', PROMO_TEXT.resumedFlash)}
                      />
                    ) : null}

                    {state === 'scheduled' ? (
                      <>
                        <PromoAction
                          label={say(PROMO_TEXT.budget, lang)}
                          kind="outline"
                          onClick={() => setBudgetFor(promo.id)}
                        />
                        <PromoAction
                          label={say(PROMO_TEXT.cancel, lang)}
                          kind="quiet"
                          onClick={() => setCancelFor(promo.id)}
                        />
                      </>
                    ) : null}

                    {state === 'ended' ? (
                      /* "Run again" copies the offer as a new scheduled draft —
                         a create rather than a transition, which is the one
                         button on this card the PATCH cannot carry. */
                      <PromoAction
                        label={say(PROMO_TEXT.again, lang)}
                        kind="primary"
                        onClick={() => void runAgain(promo)}
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="grid content-start gap-3">
            <div className="border-border bg-surface rounded-[14px] border px-5 py-4.5">
              <p className="font-display text-[15px] font-bold tracking-tight">
                {t.text.proSpendH}
              </p>
              <p
                data-num
                className="font-display mt-1.5 text-[30px] leading-none font-bold tracking-tight"
              >
                {money(PROMO_SPEND)}
              </p>
              <p data-num className="text-fg-subtle mt-1.5 text-xs">
                {t.text.proSpendNote}
              </p>

              <div className="border-divider mt-4 border-t pt-3.5">
                {PROMO_RETURN.map((row) => (
                  <div
                    key={say(row.label, lang)}
                    className="mb-2 flex items-baseline justify-between gap-3"
                  >
                    <span className="text-fg-muted text-[13px]">{say(row.label, lang)}</span>
                    <span
                      data-num
                      className={`flex-none text-[13px] font-semibold ${
                        row.tone === 'success' ? 'text-success-700' : ''
                      }`}
                    >
                      {say(row.value, lang)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-border bg-surface rounded-[14px] border px-5 py-4.5">
              <p className="text-fg-subtle tracking-caps mb-3 text-[11px] font-semibold uppercase">
                {t.text.proBuyH}
              </p>

              <div className="grid gap-2">
                {rows.map((row) => {
                  const mine = row.key in booked ? (booked[row.key] ?? null) : row.booking;
                  const on = mine !== null;
                  const wait = queued[row.key] ?? row.wait;

                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => void toggleSlot(row)}
                      className="border-border bg-surface w-full rounded-[11px] border px-3.5 py-3 text-left"
                    >
                      <span className="flex items-baseline justify-between gap-2.5">
                        <span className="text-[13px] font-semibold">{say(row.label, lang)}</span>
                        <span
                          data-num
                          className="text-brand-700 flex-none text-[13px] font-semibold"
                        >
                          {money(row.price)}
                        </span>
                      </span>

                      <span className="mt-1.5 flex items-center justify-between gap-2.5">
                        {/* Once booked the note becomes the schedule: a merchant
                            buying the banner is fourth in a queue and has to know
                            that before Friday, not after it. */}
                        <span className="text-fg-subtle min-w-0 text-xs leading-normal">
                          {on
                            ? wait > 0
                              ? say(AD_TEXT.queued, lang).replace('{n}', String(wait))
                              : say(AD_TEXT.startsTomorrow, lang)
                            : say(row.note, lang)}
                        </span>

                        <span
                          className={`rounded-pill flex-none px-2.5 py-1 text-[11px] font-bold ${
                            on ? 'bg-bg-muted text-success-700' : 'bg-brand-500 text-white'
                          }`}
                        >
                          {say(on ? AD_TEXT.booked : AD_TEXT.book, lang)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-fg-subtle mt-3 text-[11px] leading-normal">{t.text.proBuyNote}</p>
            </div>
          </div>
        </div>

        {promotions.map((promo) =>
          budgetFor === promo.id ? (
            <BudgetSheet
              key={`budget-${promo.id}`}
              lang={lang}
              budget={budgetOf(promo)}
              sub={`${say(promo.title, lang)} · ${say(promo.window, lang)}`}
              onSave={(next) => void reBudget(promo, next)}
              onClose={() => setBudgetFor(null)}
            />
          ) : null,
        )}

        {promotions.map((promo) =>
          cancelFor === promo.id ? (
            <CancelPromoSheet
              key={`cancel-${promo.id}`}
              lang={lang}
              budget={promo.remaining}
              spent={promo.spent}
              sub={`${say(promo.title, lang)} · ${say(promo.window, lang)}`}
              onCancel={() => void move(promo, 'cancelled', PROMO_TEXT.cancelledFlash)}
              onClose={() => setCancelFor(null)}
            />
          ) : null,
        )}
      </div>
    </>
  );
}

function PromoAction({
  label,
  kind,
  onClick,
  href,
}: {
  label: string;
  kind: 'primary' | 'outline' | 'quiet';
  onClick?: () => void;
  href?: string;
}) {
  const SKIN = {
    primary: 'bg-brand-500 text-white border-0',
    outline: 'border-border-strong bg-surface text-fg border',
    quiet: 'border-border bg-surface text-fg-muted border',
  } as const;

  const shape = `flex h-[38px] items-center rounded-[10px] px-3.5 text-[13px] font-semibold ${SKIN[kind]}`;

  if (href !== undefined) {
    return (
      <a href={href} className={shape}>
        {label}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={shape}>
      {label}
    </button>
  );
}
