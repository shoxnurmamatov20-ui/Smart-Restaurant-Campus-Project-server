import { useCallback, useEffect, useState } from 'react';
import { tableOrderFrom, type TableOrderEnvelope } from '@restaurant/surfaces/guest/live';
import type { TableOrder } from '@restaurant/surfaces/guest/table-data';

import { Failure, get, post } from '../lib/api';
import type { Lang } from '../lib/locale';

/**
 * What the table in front of this guest has ordered, and the three things they
 * can do about it.
 *
 * `GET /api/v1/public/tables/{token}/order` and its three writes. No login and
 * no bearer: the credential is the token printed on the sticker, and sending
 * the staff token that happens to be in the Keychain would ask a public
 * endpoint a signed-in question. `bearer: null` is that, said out loud — the
 * same rule `useGuestMenu` states.
 *
 * The mapping is `@restaurant/surfaces/guest/live`, shared with the browser,
 * because the two render the same table and two opinions about what `cooking`
 * means is how a phone and a laptop show one guest two different dinners.
 */

/**
 * Four arms, not two, and the fourth is the one worth having.
 *
 * `empty` is a live answer from a real table with nothing open — a guest who
 * has just sat down — and it must not draw a demo bill. `failed` is a server
 * that did not answer. A screen that collapsed the two would show four courses
 * somebody else ate to a person who has ordered nothing.
 */
export type TableState =
  | { status: 'loading' }
  | { status: 'ready'; order: TableOrder }
  | { status: 'empty' }
  | { status: 'failed'; retryable: boolean };

/**
 * The ETA a dine-in guest is shown.
 *
 * The endpoint answers a bill, not a promise: a table is not quoted a delivery
 * time and `orders.promised_at` is null on one. So this is a house average
 * rather than a computation — the honest answer at a table is "about twenty
 * minutes", and a screen claiming 18 would be claiming a precision no kitchen
 * gave it. Kept in step with the browser's `guest-table-server.ts`.
 */
const DINE_IN_ETA_MINUTES = 20;

export function useTableOrder(tenant: string, token: string, lang: Lang) {
  const [state, setState] = useState<TableState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;

    setState({ status: 'loading' });

    get<TableOrderEnvelope>(`/public/tables/${encodeURIComponent(token)}/order`, {
      tenant,
      locale: lang,
      bearer: null,
    })
      .then((body) => {
        if (!live) return;

        const order = tableOrderFrom(body?.data, lang, DINE_IN_ETA_MINUTES, new Date());

        setState(order === null ? { status: 'empty' } : { status: 'ready', order });
      })
      .catch((error: unknown) => {
        if (!live) return;

        setState({
          status: 'failed',
          retryable: error instanceof Failure ? error.retryable : true,
        });
      });

    return () => {
      // The guest walked off this screen. Whatever the server eventually says
      // is about a screen that is gone.
      live = false;
    };
  }, [tenant, token, lang, attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, refresh };
}

/**
 * The API's own sentence for a refusal, in the reader's language.
 *
 * `Failure.body` is typed as the platform's older `{message, errors, code}`
 * shape, and every refusal this endpoint issues arrives in the current envelope
 * — `{error: {code, message_uz, message_ru, message_en}}`. Read defensively
 * rather than retyped, because retyping `ApiError` is a change to every caller
 * on the phone and this is one screen's need.
 *
 * Worth the fifteen lines: "Manti hozir mavjud emas" names the dish and says
 * what to do about it, and a guest shown "something went wrong" presses the
 * same button again.
 */
export function refusalMessage(error: unknown, lang: Lang): string | null {
  if (!(error instanceof Failure) || error.body === null) return null;

  const envelope = (error.body as unknown as { error?: Record<string, unknown> }).error;

  if (envelope === undefined) return null;

  const said = envelope[`message_${lang}`] ?? envelope.message_uz;

  return typeof said === 'string' && said !== '' ? said : null;
}

/** One line of a basket on its way to the kitchen. */
export type TableOrderLine = {
  menu_item_id: number;
  quantity: number;
  /**
   * The catalogue's own choice ids, as integers.
   *
   * `PublicTableOrderRequest` takes up to twelve per line and prices each one
   * through `MenuCatalog`; a choice the catalogue no longer allows is refused
   * as `order.modifier_invalid` rather than dropped, because a ticket that
   * quietly lost "no onion" reaches the pass looking correct.
   */
  modifier_choice_ids?: readonly number[];
  note?: string | null;
  seat_no?: number;
};

/**
 * Send this table's basket to the kitchen.
 *
 * Throws a `Failure` the caller shows — a native screen has no fixtures to fall
 * back on and no server render to hide behind, which is the whole reason
 * `lib/api.ts` throws rather than answering null.
 *
 * `idempotencyKey` is pinned by the caller when a RESEND must land once: the
 * client mints a fresh key per request by default, so two taps are two orders,
 * and that is correct for a guest deliberately ordering two more teas.
 */
export async function sendTableOrder(
  tenant: string,
  token: string,
  lines: readonly TableOrderLine[],
  options: { lang?: Lang; seatNo?: number; idempotencyKey?: string } = {},
): Promise<void> {
  await post(
    `/public/tables/${encodeURIComponent(token)}/order`,
    { items: lines, seat_no: options.seatNo },
    { tenant, locale: options.lang, bearer: null, idempotencyKey: options.idempotencyKey },
  );
}

/** What a raised hand answers with. `alreadyOpen` is a call that was already up. */
export type CallOutcome = { id: number; kind: 'waiter' | 'bill'; alreadyOpen: boolean };

/**
 * "Ofitsiantni chaqirish".
 *
 * Latched on the server as well as on the screen: a guest who taps four times
 * gets one row and one buzz, and the fourth answer says `already_open` so the
 * screen can say "already called" rather than "nothing happened".
 */
export async function callWaiter(
  tenant: string,
  token: string,
  options: { lang?: Lang; seatNo?: number; note?: string } = {},
): Promise<CallOutcome> {
  const body = await post<{ data: { id: number; kind: 'waiter' | 'bill'; already_open: boolean } }>(
    `/public/tables/${encodeURIComponent(token)}/call`,
    { seat_no: options.seatNo, note: options.note },
    { tenant, locale: options.lang, bearer: null },
  );

  return {
    id: body.data.id,
    kind: body.data.kind,
    alreadyOpen: body.data.already_open,
  };
}

/**
 * "Hisobni so'rash" — and it is not a payment.
 *
 * Nothing here moves money: it raises a call on the floor and moves the bill to
 * `topay`, so a waiter walks over with a terminal. The rail, the tip and the
 * split travel as the guest's stated preference for that person to read.
 */
export async function askForBill(
  tenant: string,
  token: string,
  options: {
    lang?: Lang;
    method?: 'cash' | 'card' | 'online';
    tipPercent?: number;
    splitBetween?: number;
    seatNo?: number;
  } = {},
): Promise<CallOutcome> {
  const body = await post<{
    data: { call: { id: number; kind: 'waiter' | 'bill'; already_open: boolean } };
  }>(
    `/public/tables/${encodeURIComponent(token)}/pay`,
    {
      method: options.method,
      tip_percent: options.tipPercent,
      split_between: options.splitBetween,
      seat_no: options.seatNo,
    },
    { tenant, locale: options.lang, bearer: null },
  );

  return {
    id: body.data.call.id,
    kind: body.data.call.kind,
    alreadyOpen: body.data.call.already_open,
  };
}
