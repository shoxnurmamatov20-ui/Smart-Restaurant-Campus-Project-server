import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * Where a week's takings land.
 *
 * `PUT /api/v1/marketplace/settings/payout` upstream — a whole replacement
 * rather than a patch, because bank details are one fact: an MFO belonging to
 * one bank and an account belonging to another is not half a saved form, it is
 * a payment that bounces. Five fields go up together or none do.
 *
 * Its own route rather than a field on `../route.ts`, which carries the trading
 * toggle. That one is `marketplace.manage` too, but it is the control a
 * merchant taps when the fryer dies; this is the one that decides who gets paid
 * — and any write here resets `state` to `pending_review`, which stops payouts
 * until a person at the platform confirms the account belongs to this business.
 * Two acts that far apart should not share a door.
 *
 * ---------------------------------------------------------------------------
 * There is no card number here, deliberately
 *
 * A settlement is a bank transfer to a business account: MFO, twenty digits,
 * INN, the holder's name as the bank spells it. A card field would invite a
 * merchant to type a pan into a form that stores it — which is the exact thing
 * PCI exists to forbid, and it would not even work, because a weekly payout to
 * a personal card is not what the act and the invoice describe.
 *
 * ---------------------------------------------------------------------------
 * The digit counts are checked twice, and this is the cheaper of the two
 *
 * `mfo` is five, `account` twenty, `inn` nine — the shapes Uzbek bank details
 * actually have, and the API validates all three. Checking here as well is not
 * distrust of the sheet above: it is that a refusal from this side arrives
 * without a round trip, and the sheet can put the sentence beside the field
 * while the merchant is still looking at it.
 */
type Body = {
  bankName?: unknown;
  mfo?: unknown;
  account?: unknown;
  inn?: unknown;
  holder?: unknown;
};

/** A name a bank would recognise; longer than this is a paste accident. */
const MAX_NAME = 120;

const digits = (value: unknown, length: number): string | null =>
  typeof value === 'string' && new RegExp(`^\\d{${length}}$`).test(value) ? value : null;

const words = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, MAX_NAME) : null;

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  const bankName = words(body.bankName);
  const holder = words(body.holder);
  const mfo = digits(body.mfo, 5);
  const account = digits(body.account, 20);
  const inn = digits(body.inn, 9);

  if (bankName === null || holder === null) return badRequest('invalid_name');
  if (mfo === null) return badRequest('invalid_mfo');
  if (account === null) return badRequest('invalid_account');
  if (inn === null) return badRequest('invalid_inn');

  return forward(request, '/marketplace/settings/payout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bank_name: bankName, mfo, account, inn, holder }),
  });
}
