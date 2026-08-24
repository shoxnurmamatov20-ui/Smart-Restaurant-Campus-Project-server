/**
 * The notes a cashier can actually hold.
 *
 * A drawer is counted note by note and never typed as a total, so every screen
 * that counts cash — opening the float, counting it back at close, a cash drop
 * — needs to know which notes exist. This module is the client-safe half: the
 * type, the fallback ladder and the one conversion. The reading lives in
 * `cash-notes-server.ts` for the console and in `pos-session.ts` for the tablet,
 * because the two hold different credentials.
 *
 * Client-safe on purpose. `open-till.tsx` is a client component and importing
 * anything that touches `next/headers` from it breaks the browser build — the
 * same rule the screens follow with their `*-data.ts` / `*-server.ts` pairs.
 */

/** 1 so'm = 100 tiyin. Money is integer tiyin everywhere else in this app. */
export const TIYIN_PER_SOM = 100;

/**
 * Uzbekistan's eight notes in circulation, largest first, in tiyin.
 *
 * A fallback, not a source. `GET /api/v1/finance/denominations` is the source,
 * because the ladder is configuration — this platform is multi-country by
 * design — and because the same list is what the server validates a posted
 * count against. A client offering a row the server refuses is a count that
 * cannot be submitted.
 *
 * The reason it exists at all: a till has to open when the network does not.
 * The reason it is *these eight*: the screen shipped with six of them, missing
 * 20 000 and 2 000, so a cashier holding either had no row to count it into.
 * The float came out short, and a short float is a drawer that reads short all
 * evening — with the cashier's name on it.
 *
 * There is no coin row. Coins exist on paper and no restaurant has seen one in
 * years, and a row nobody fills is a row somebody eventually fills wrongly.
 */
export const UZS_NOTES: readonly number[] = [
  200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000,
].map((som) => som * TIYIN_PER_SOM);

/**
 * A ladder, as the API describes it.
 *
 * `roundingStep` travels with the notes rather than being read separately: cash
 * is rounded so the drawer can pay in notes that exist, so a screen that knew
 * one without the other could round a total to a figure nobody can hand over.
 */
export type CashLadder = {
  /** Denominations in tiyin, largest first. */
  notes: readonly number[];
  /** What a cash total is rounded to, in tiyin. */
  roundingStep: number;
  /** False when this is the built-in list rather than the server's. */
  live: boolean;
};

/** What every count screen falls back to when the API cannot be read. */
export const FALLBACK_LADDER: CashLadder = {
  notes: UZS_NOTES,
  // The smallest note. Rounding to anything finer would produce a total the
  // drawer cannot pay, which is the whole reason the step exists.
  roundingStep: 1_000 * TIYIN_PER_SOM,
  live: false,
};

/** `GET /api/v1/finance/denominations`, as it answers. */
export type ApiCashLadder = {
  data?: {
    currency?: string;
    tiyin_per_unit?: number;
    denominations?: unknown;
    rounding_step?: unknown;
  };
};

/**
 * The API's answer, narrowed to a ladder — or the fallback if it is not one.
 *
 * Validated rather than trusted because a wrong denomination is silent: the
 * count simply comes out short and the person who counted it gets asked why.
 * An empty or non-numeric list is treated as no answer at all.
 */
export function ladderFrom(body: ApiCashLadder | null): CashLadder {
  const notes = Array.isArray(body?.data?.denominations)
    ? body.data.denominations.filter(
        (note): note is number => typeof note === 'number' && Number.isInteger(note) && note > 0,
      )
    : [];

  if (notes.length === 0) return FALLBACK_LADDER;

  const step = body?.data?.rounding_step;

  return {
    notes: [...notes].sort((a, b) => b - a),
    roundingStep:
      typeof step === 'number' && Number.isInteger(step) && step > 0 ? step : Math.min(...notes),
    live: true,
  };
}
