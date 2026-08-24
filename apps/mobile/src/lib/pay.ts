import * as Linking from 'expo-linking';

import { Failure, get, post } from './api';

/**
 * Paying through Payme, Click or Uzum — from a phone.
 *
 * The same three steps the web build takes (`(customer)/customer/pay/
 * pay-online.ts`), with the one difference a native shell forces: there is no
 * redirect. `Linking.openURL` hands the URL to the operating system, which
 * opens the provider's own app when it is installed and a browser when it is
 * not — and either way this app stays in the background rather than being
 * navigated away from.
 *
 * That is not merely nicer, it changes what has to be remembered. A web page
 * that navigates to Payme loses its JavaScript and needs the invoice token in
 * `sessionStorage` to find its way back; this screen is still mounted when the
 * guest returns, so the token is a value in React state and the polling simply
 * resumes. Nothing is persisted.
 *
 * ---------------------------------------------------------------------------
 * Why the phone polls rather than waiting to be told
 *
 * Neither provider tells the merchant's app anything. The authoritative "did it
 * work" is the callback they post to the API on their own schedule — seconds
 * after the guest confirms, sometimes minutes — so the screen asks. It stops
 * asking when the state stops being `pending`, and it stops asking after
 * {@link POLL_LIMIT} attempts, because a guest who closed the bank's app
 * without paying must not leave a timer running for the rest of the evening.
 */

/** Rail ids that leave for somebody else's app. See the web copy for why this list is stated. */
const ONLINE: Record<string, string> = {
  click: 'click',
  payme: 'payme',
  uzum: 'uzum',
};

/** Two seconds, roughly, and give up after two minutes. */
export const POLL_MS = 2_000;

export const POLL_LIMIT = 60;

export type PaymentState = 'pending' | 'paid' | 'cancelled' | 'failed' | 'expired';

export type InvoiceHandle = {
  invoiceId: string;
  provider: string;
  payUrl: string;
  amount: number;
  state: PaymentState;
};

type InvoiceResponse = {
  data: {
    invoice_id: string;
    provider: string;
    pay_url: string;
    amount: number;
    state: PaymentState;
  };
};

export function providerFor(railId: string): string | null {
  return ONLINE[railId] ?? null;
}

export const isOnlineRail = (railId: string): boolean => providerFor(railId) !== null;

/**
 * Open an invoice against a placed order.
 *
 * The amount is not sent and would be ignored if it were: the API reads it off
 * the bill. A client that could name its own figure is a guest paying 1 000
 * so'm for a 120 000 so'm dinner, and the bank would confirm it happily.
 *
 * Throws a typed `Failure`, like every other call in this app — a phone has no
 * fixtures to fall back to, and "could not reach the restaurant, retry" is the
 * honest answer to hold in front of somebody. `Failure.body` carries the API's
 * own three-language sentence for the refusals that are worth showing:
 * the provider switched off, the bill already settled.
 */
export async function openInvoice(input: {
  orderId: number;
  orderNumber: string;
  railId: string;
  tenant: string | null;
  /** Where the provider should send the browser back to — `srcp://customer/order`. */
  returnUrl?: string;
}): Promise<InvoiceHandle> {
  const provider = providerFor(input.railId);

  if (provider === null) {
    throw new Failure(0, null, false);
  }

  const answer = await post<InvoiceResponse>(
    '/public/payments/invoice',
    {
      order_id: input.orderId,
      order_number: input.orderNumber,
      provider,
      ...(input.returnUrl === undefined ? {} : { return_url: input.returnUrl }),
    },
    // No bearer: this is a guest endpoint and a consumer may not be signed in.
    // The tenant is what scopes it, exactly as it scopes the public menu.
    { tenant: input.tenant, bearer: null },
  );

  return {
    invoiceId: answer.data.invoice_id,
    provider: answer.data.provider,
    payUrl: answer.data.pay_url,
    amount: answer.data.amount,
    state: answer.data.state,
  };
}

/**
 * Hand the URL to the operating system.
 *
 * `canOpenURL` is checked first and the answer is acted on rather than logged:
 * on iOS an un-declared scheme answers false, and calling `openURL` anyway
 * throws in front of a guest who has just committed to paying. Returning false
 * lets the screen say "open Payme to finish" instead.
 */
export async function leaveForProvider(invoice: InvoiceHandle): Promise<boolean> {
  try {
    if (!(await Linking.canOpenURL(invoice.payUrl))) return false;

    await Linking.openURL(invoice.payUrl);

    return true;
  } catch {
    return false;
  }
}

/**
 * Where the payment stands.
 *
 * Null for anything that is not an answer — the API mid-restart, no signal in a
 * lift — so a polling screen keeps waiting rather than declaring a failure it
 * cannot support. A payment that genuinely failed comes back as `failed`, which
 * is a different thing and says so.
 */
export async function readPaymentStatus(
  invoiceId: string,
  tenant: string | null,
): Promise<PaymentState | null> {
  try {
    const answer = await get<{ data: { state: PaymentState } }>(`/public/payments/${invoiceId}`, {
      tenant,
      bearer: null,
    });

    return answer.data.state;
  } catch {
    return null;
  }
}

/** The deep link a provider returns to: `srcp://customer/order`. */
export function returnUrl(path = 'customer/order'): string {
  return Linking.createURL(path);
}
