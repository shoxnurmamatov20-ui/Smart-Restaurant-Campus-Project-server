import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * One expense, filed from the books screen.
 *
 * Two names differ between the design's form and `Expense::CATEGORIES`, and the
 * translation belongs here rather than in the browser: the console's vocabulary
 * is the seven words the design's picker draws, the API's is eight, and a
 * screen that sent its own words would be refused by a validator listing
 * neither. `refund` is the API's eighth and is deliberately unmapped — a refund
 * is written by the ledger when a bill is reversed, never typed by hand.
 */
const CATEGORY: Readonly<Record<string, string>> = {
  rent: 'rent',
  utilities: 'utilities',
  payroll: 'payroll',
  food: 'purchase',
  marketing: 'marketing',
  repairs: 'repair',
  other: 'other',
};

/** Upstream's `max:255` on the description, applied before the round trip. */
const NOTE_MAX = 255;

type Body = {
  category?: unknown;
  note?: unknown;
  /** Integer tiyin. The form takes so'm and converts once, in the browser. */
  amountTiyin?: unknown;
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const category = typeof body.category === 'string' ? CATEGORY[body.category] : undefined;

  if (category === undefined) return badRequest('invalid_category');

  const note = typeof body.note === 'string' ? body.note.trim() : '';

  if (note === '') return badRequest('invalid_description');

  const amount = whole(body.amountTiyin);

  if (amount === null) return badRequest('invalid_amount');

  return forward(request, '/finance/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category,
      description: note.slice(0, NOTE_MAX),
      amount,
      /*
       * Not out of the drawer, and this is a decision rather than a default.
       *
       * `paid_in_cash` defaults to true upstream, and a cash expense carrying a
       * shift lowers that till's expected figure. The books screen files the
       * month's paperwork — rent, utilities, an advertising invoice — which is
       * paid by transfer and never passes through a drawer. Booking it as cash
       * would make tonight's till read short by the rent, and the cashier
       * counting it would be the one asked to explain.
       *
       * A payout genuinely taken out of the till has its own door: the drop on
       * the till screen, which writes against a named shift.
       */
      paid_in_cash: false,
    }),
  });
}
