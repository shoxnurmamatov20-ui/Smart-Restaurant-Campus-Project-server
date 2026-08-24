import { describe, expect, it } from 'vitest';

import {
  catalogueFrom,
  disputeFrom,
  payoutFrom,
  placementsFrom,
  promotionFrom,
  queueFrom,
  settlementFrom,
} from './merchant-server';

/**
 * The four joins the merchant panel is wrong about silently.
 *
 * This panel is the one surface on the platform where a mapping error costs
 * food. Every assertion below is about a mistake that produces a screen a
 * merchant would act on without noticing anything was odd:
 *
 *   `queueFrom` decides which heading an order appears under and whether a
 *   ninety-second clock is drawn beside it. Wrong, a delivered order from last
 *   Tuesday sits in the queue with an expired countdown — or, worse, a new one
 *   does not.
 *
 *   `catalogueFrom` decides which chip a dish sits under. Wrong, every chip but
 *   "all" empties the price table.
 *
 *   `settlementFrom` decides what a merchant reconciles their bank account
 *   against.
 *
 *   `disputeFrom` decides whether a complaint is still counting down.
 *
 * Money is integer tiyin throughout.
 */

function apiOrder(over: Partial<Parameters<typeof queueFrom>[0]> = {}) {
  return {
    id: 41,
    number: 'MP-8421',
    state: 'placed',
    seconds_to_answer: 62,
    customer: 'Nilufar Yusupova',
    address: 'Chilonzor 24',
    address_note: null as string | null,
    lines: [
      {
        name: { uz: 'Osh', ru: 'Плов', en: 'Plov' },
        quantity: 2,
        line_total_tiyin: 9_400_000,
        note: null,
      },
    ],
    gross_tiyin: 11_800_000,
    commission_percent: 9,
    commission_tiyin: 1_062_000,
    merchant_due_tiyin: 10_738_000,
    pay_rail: 'click',
    placed_at: '2026-08-22T14:02:00Z',
    eta_minutes: 35,
    ...over,
  };
}

describe('queueFrom', () => {
  it('draws a countdown only while one is actually running', () => {
    /*
     * `secondsLeft` absent rather than zero, because the board reads the key's
     * presence to decide whether to draw a clock at all. A zero puts an expired
     * countdown beside every order the restaurant answered last week.
     */
    expect(queueFrom(apiOrder()).secondsLeft).toBe(62);
    expect(queueFrom(apiOrder({ seconds_to_answer: null })).secondsLeft).toBeUndefined();
  });

  it('carries the promised ETA, and omits it when nothing has been promised', () => {
    /*
     * The delay button adds to this. Read from the server rather than kept in
     * the browser, because a local total resets on every reload and then
     * disagrees with the countdown the guest is watching.
     */
    expect(queueFrom(apiOrder()).etaMinutes).toBe(35);
    expect(queueFrom(apiOrder({ eta_minutes: null })).etaMinutes).toBeUndefined();
  });

  it('folds the nine server states into the five the panel draws', () => {
    const state = (s: string) => queueFrom(apiOrder({ state: s })).state;

    expect(state('placed')).toBe('new');
    expect(state('accepted')).toBe('cooking');
    expect(state('cooking')).toBe('cooking');
    // A cook does not distinguish "ready" from "a courier has it" — both are
    // off their pass.
    expect(state('ready')).toBe('ready');
    expect(state('courier_assigned')).toBe('ready');
    expect(state('enroute')).toBe('ready');
    expect(state('delivered')).toBe('done');
    expect(state('cancelled')).toBe('rejected');
    expect(state('rejected')).toBe('rejected');
  });

  it('treats a state it has never seen as new rather than losing the order', () => {
    // A tenth server state must land somewhere a person looks. `new` is the
    // heading a merchant reads first, so an unknown order is seen rather than
    // filed under "done" and never cooked.
    expect(queueFrom(apiOrder({ state: 'teleported' })).state).toBe('new');
  });

  it('shows the food at its market price, before the commission comes off', () => {
    const card = queueFrom(apiOrder());

    expect(card.gross).toBe(11_800_000);
  });

  it('appends the doorbell note to the address rather than dropping it', () => {
    const withNote = queueFrom(apiOrder({ address_note: '3-podyezd, 47-xonadon' }));

    expect(withNote.address.uz).toBe('Chilonzor 24 · 3-podyezd, 47-xonadon');
    expect(queueFrom(apiOrder()).address.uz).toBe('Chilonzor 24');
  });

  it('falls back to cash for a rail the panel does not draw', () => {
    // Three rails have a logo. Anything else is settled off-platform, and cash
    // is the row that says "no card was taken here".
    expect(queueFrom(apiOrder({ pay_rail: 'payme' })).pay).toBe('payme');
    expect(queueFrom(apiOrder({ pay_rail: 'humo' })).pay).toBe('cash');
  });
});

describe('catalogueFrom', () => {
  const row = (over = {}) => ({
    menu_item_id: 41,
    title: 'Osh',
    section: 'Asosiy',
    house_price_tiyin: 4_400_000,
    markup_tiyin: 300_000,
    market_price_tiyin: 4_700_000,
    is_listed: true,
    ...over,
  });

  it('takes the chip it is given rather than numbering each dish in turn', () => {
    // Numbering per dish gives every dish its own category, so every chip but
    // "all" empties the table — a filter that looks fine until it is used.
    expect(catalogueFrom(row(), 2).category).toBe(2);
  });

  it('keeps both prices, because the screen shows both', () => {
    const dish = catalogueFrom(row(), 1);

    expect(dish.housePrice).toBe(4_400_000);
    expect(dish.marketPrice).toBe(4_700_000);
  });

  it('reports no food cost rather than guessing one', () => {
    /*
     * A recipe belongs to Inventory and is the most commercially sensitive
     * number a restaurant holds; the marketplace endpoint does not answer it.
     * Zero is honest — a guess would be rendered as a margin.
     */
    expect(catalogueFrom(row(), 1).foodCost).toBe(0);
  });

  it('marks a dish that is not in the window', () => {
    expect(catalogueFrom(row({ is_listed: false }), 1).stopped).toBe(true);
    expect(catalogueFrom(row(), 1).stopped).toBeUndefined();
  });
});

describe('settlementFrom', () => {
  const row = (over = {}) => ({
    id: 833,
    invoice_number: 'MP-INV-2026-0833',
    period_start: '2026-08-10',
    period_end: '2026-08-16',
    gross_tiyin: 2_418_000_000,
    commission_tiyin: 217_620_000,
    payable_tiyin: 2_200_380_000,
    state: 'due',
    ...over,
  });

  it('quotes the invoice number a merchant reads down the phone', () => {
    expect(settlementFrom(row()).invoice).toBe('MP-INV-2026-0833');
    expect(settlementFrom(row()).period).toBe('2026-08-10 – 2026-08-16');
  });

  it('keeps the frozen figures exactly as the statement issued them', () => {
    const statement = settlementFrom(row());

    expect(statement.gross).toBe(2_418_000_000);
    expect(statement.fee).toBe(217_620_000);
  });

  it('treats anything that is not paid as still owed', () => {
    // Erring towards "due" is the safe direction: a merchant chasing a payment
    // that already arrived loses a phone call, and one who believes an unpaid
    // week was settled loses the week.
    expect(settlementFrom(row({ state: 'paid' })).state).toBe('paid');
    expect(settlementFrom(row({ state: 'due' })).state).toBe('due');
    expect(settlementFrom(row({ state: 'something_new' })).state).toBe('due');
  });
});

describe('disputeFrom', () => {
  const row = (over = {}) => ({
    id: 7,
    order_number: 'MP-8421',
    kind: 'late',
    amount_tiyin: 1_200_000,
    body: 'Yetkazish 40 daqiqa kechikdi',
    automatic: true,
    state: 'accepted',
    hours_left: null as number | null,
    ...over,
  });

  it('stops the clock on anything already settled', () => {
    // Zero is what the panel reads as closed, so a settled complaint and one
    // whose deadline expired land in the same place — neither is waiting on
    // the restaurant any more.
    expect(disputeFrom(row()).hoursLeft).toBe(0);
    expect(disputeFrom(row({ hours_left: 2 })).hoursLeft).toBe(2);
  });

  it('says whether the restaurant is being told or asked', () => {
    /*
     * The two are a different screen: an automatic credit is already decided
     * and the merchant may only appeal it, while an open complaint has a
     * two-hour clock and a button that answers it.
     */
    expect(disputeFrom(row()).resolved).toBe('accepted');
    expect(disputeFrom(row({ state: 'contested' })).resolved).toBe('contested');
    expect(disputeFrom(row({ state: 'open' })).resolved).toBeUndefined();
  });

  it('keeps the amount in tiyin and names the order it is about', () => {
    expect(disputeFrom(row()).amount).toBe(1_200_000);
    expect(disputeFrom(row()).number).toBe('MP-8421');
    expect(disputeFrom(row({ order_number: null })).number).toBe('—');
  });
});

describe('settlementFrom · the key behind the printed number', () => {
  it('carries the numeric id the document link is built from', () => {
    /*
     * `invoice_number` is what a merchant reads down the phone and the fixture
     * history invents its own. A document link built from the printed number
     * would open somebody else's week; only this field may aim one.
     */
    const row = {
      id: 833,
      invoice_number: 'MP-INV-2026-0833',
      period_start: '2026-08-10',
      period_end: '2026-08-16',
      gross_tiyin: 1,
      commission_tiyin: 1,
      payable_tiyin: 1,
      state: 'due',
    };

    expect(settlementFrom(row).id).toBe(833);
  });
});

/**
 * A campaign card, and the three figures a merchant decides on.
 *
 * `promotionFrom` chooses which buttons the card offers — a wrong state draws a
 * pause button on a finished offer, and the merchant who presses it gets a 409
 * they had no way to predict — and it carries the money the budget sheet does
 * arithmetic with.
 */
describe('promotionFrom', () => {
  const row = (over = {}) => ({
    id: 12,
    code: 'FREEDEL',
    title: { uz: 'Bepul yetkazish', ru: 'Бесплатная доставка', en: 'Free delivery' },
    body: null as { uz: string; ru: string; en: string } | null,
    kind: 'free_delivery',
    state: 'running',
    discount_tiyin: 0,
    budget_tiyin: 84_000_000,
    spent_tiyin: 19_400_000,
    remaining_tiyin: 64_600_000,
    starts_on: '2026-08-22',
    ends_on: '2026-08-24',
    ...over,
  });

  it('keeps the five states the panel draws', () => {
    const state = (value: string) => promotionFrom(row({ state: value })).state;

    expect(state('running')).toBe('running');
    expect(state('scheduled')).toBe('scheduled');
    expect(state('paused')).toBe('paused');
    expect(state('ended')).toBe('ended');
    expect(state('cancelled')).toBe('cancelled');
  });

  it('files a state it has never seen as scheduled rather than as running', () => {
    /*
     * The safe direction. A `scheduled` card offers "change the budget" and
     * "cancel", both of which the API can refuse harmlessly; a `running` card
     * offers "pause", which a merchant presses believing an offer is spending
     * money when it may already have ended.
     */
    expect(promotionFrom(row({ state: 'teleported' })).state).toBe('scheduled');
  });

  it('carries the money as integers rather than as the strings it renders', () => {
    const promo = promotionFrom(row());

    expect(promo.budget).toBe(84_000_000);
    expect(promo.spent).toBe(19_400_000);
    expect(promo.remaining).toBe(64_600_000);
    // Three cells, and in the order the question is asked in.
    expect(promo.stats).toHaveLength(3);
  });

  it('names both ends of the window, and copes with an offer that has no end', () => {
    expect(promotionFrom(row()).window.uz).toBe('2026-08-22 – 2026-08-24');
    expect(promotionFrom(row({ ends_on: null })).window.uz).toBe('2026-08-22');
  });

  it('renders an offer with no body rather than dropping the card', () => {
    expect(promotionFrom(row()).body.uz).toBe('');
  });
});

/**
 * The advertising rate card.
 *
 * `placementsFrom` decides what a position costs, how long it is sold out for,
 * and whether the merchant already holds it. Wrong, a merchant either buys a
 * banner they already own or is told a slot is free on a day somebody else has.
 */
describe('placementsFrom', () => {
  const offers = [
    { slot: 'home_top', day_rate_tiyin: 32_000_000, queue_days: 4 },
    { slot: 'category_top', day_rate_tiyin: 18_000_000 },
  ];

  const bookings = [
    {
      id: 7,
      slot: 'home_top',
      starts_on: '2026-08-23',
      ends_on: '2026-08-23',
      days: 1,
      day_rate_tiyin: 32_000_000,
      total_tiyin: 32_000_000,
      billed_tiyin: 0,
      state: 'booked',
      queue_position: 1,
    },
  ];

  it('takes the queue from the server rather than from the design', () => {
    // `AD_SLOTS.wait` is a number somebody drew. A merchant told "four days" by
    // a constant plans a promotion around a date nobody is holding for them.
    const rows = placementsFrom(offers, []);

    expect(rows.find((row) => row.slot === 'home_top')?.wait).toBe(4);
    // A slot free today sends no `queue_days` at all — that is the ordinary
    // case, and requiring one would fall back to the fixture on it.
    expect(rows.find((row) => row.slot === 'category_top')?.wait).toBe(0);
  });

  it('takes the day rate from the server and falls back to the design’s', () => {
    const rows = placementsFrom([{ slot: 'home_top' }], []);

    expect(placementsFrom(offers, [])[0]?.price).toBe(32_000_000);
    expect(rows[0]?.price).toBeGreaterThan(0);
  });

  it('folds the merchant’s own live booking onto the row it belongs to', () => {
    const rows = placementsFrom(offers, bookings);

    expect(rows.find((row) => row.slot === 'home_top')?.booking?.id).toBe(7);
    expect(rows.find((row) => row.slot === 'category_top')?.booking).toBeNull();
  });

  it('ignores a booking that is over', () => {
    /*
     * A finished or cancelled row is history. Treating one as current draws
     * "Booked" on a slot the merchant could buy again, with a release button
     * that answers 409.
     */
    const done = [{ ...bookings[0]!, state: 'finished' }];

    expect(placementsFrom(offers, done)[0]?.booking).toBeNull();
  });

  it('drops a slot the panel has no words for rather than drawing a blank row', () => {
    expect(placementsFrom([{ slot: 'sky_writing' }], [])).toHaveLength(0);
  });
});

describe('payoutFrom', () => {
  const row = (over = {}) => ({
    bank_name: 'Kapitalbank',
    mfo: '00450',
    account: null,
    account_last4: '9012',
    inn: '302481776',
    holder: 'OSH XONA MCHJ',
    state: 'verified',
    verified_at: '2026-08-01T09:00:00Z',
    ...over,
  });

  it('never carries the whole account, only the four that identify it', () => {
    // Twenty digits saying where a business's money goes do not need to be on a
    // screen anybody can read over a shoulder.
    const payout = payoutFrom(row());

    expect(payout.accountLast4).toBe('9012');
    expect(Object.values(payout)).not.toContain('20208000447190129012');
  });

  it('errs towards incomplete on a state it does not know', () => {
    /*
     * The safe direction: a merchant told their details are still being checked
     * rings the platform, and one told they are verified waits for a Thursday
     * that does not come.
     */
    expect(payoutFrom(row()).state).toBe('verified');
    expect(payoutFrom(row({ state: 'pending_review' })).state).toBe('pending_review');
    expect(payoutFrom(row({ state: 'something_new' })).state).toBe('incomplete');
  });

  it('draws a dash rather than the word null on an empty account', () => {
    const payout = payoutFrom(row({ bank_name: null, mfo: null, inn: null, holder: null }));

    expect(payout.bankName).toBe('—');
    expect(payout.holder).toBe('—');
  });
});
