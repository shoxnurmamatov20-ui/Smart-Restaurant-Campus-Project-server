/**
 * Paying through somebody else's app, from the guest's phone.
 *
 * Two calls and a redirect, and the order of them is the whole design:
 *
 *   1. the order is placed and comes back with an id and a number;
 *   2. an invoice is opened against that pair — the API reads the amount off
 *      the bill, never from here (a client that could name its own figure is a
 *      guest paying 1 000 so'm for a 120 000 so'm dinner);
 *   3. the browser goes to `pay_url`, which is Payme's or Click's own screen.
 *
 * What happens after that is NOT a redirect back with an answer. Both providers
 * return the browser with nothing useful in the URL: the authoritative "did it
 * work" is the callback they post to the API on their own schedule. So the
 * screen the guest lands on polls {@link readPaymentStatus} until the state
 * stops being `pending` — which is why the invoice token is put in the return
 * URL and in `sessionStorage` before leaving.
 *
 * ---------------------------------------------------------------------------
 * Which rails are online
 *
 * `card` in the design's rail list is a saved bank card and `cash` is money in
 * a courier's hand; neither goes through a provider. `click`, `payme` and
 * `uzum` do. The list is deliberately here rather than derived from
 * `PAYMENT_RAILS`, because a rail's id and a provider's name are two different
 * things that happen to coincide for three of them today — the day a fourth
 * rail is added, this file is where the mapping is stated.
 */

/** Rail ids that mean "leave for somebody else's app". */
const ONLINE: Record<string, string> = {
  click: 'click',
  payme: 'payme',
  uzum: 'uzum',
};

/** Where the invoice token is kept while the guest is inside a bank's app. */
export const INVOICE_KEY = 'restaurant-campus-invoice';

export type PaymentState = 'pending' | 'paid' | 'cancelled' | 'failed' | 'expired';

export type InvoiceHandle = {
  invoiceId: string;
  provider: string;
  payUrl: string;
  amount: number;
  state: PaymentState;
};

export function providerFor(railId: string): string | null {
  return ONLINE[railId] ?? null;
}

export const isOnlineRail = (railId: string): boolean => providerFor(railId) !== null;

/**
 * Open an invoice and hand back where to send the browser.
 *
 * Never throws. A refusal — the provider switched off, the bill already
 * settled, the API unreachable — comes back as null with the API's own
 * three-language sentence in `reason`, which is what the screen shows. Throwing
 * would take down a page whose basket has already been cleared.
 */
export async function openInvoice(input: {
  orderId: number;
  orderNumber: string;
  railId: string;
  returnUrl?: string;
}): Promise<{ invoice: InvoiceHandle | null; reason: string | null }> {
  const provider = providerFor(input.railId);

  if (provider === null) return { invoice: null, reason: null };

  let response: Response;

  try {
    response = await fetch('/api/public/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: input.orderId,
        order_number: input.orderNumber,
        provider,
        ...(input.returnUrl === undefined ? {} : { return_url: input.returnUrl }),
      }),
    });
  } catch {
    return { invoice: null, reason: null };
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: {
      invoice_id?: string;
      provider?: string;
      pay_url?: string;
      amount?: number;
      state?: PaymentState;
    };
    error?: { message_uz?: string; message_ru?: string; message_en?: string };
  } | null;

  if (!response.ok || !payload?.data?.pay_url || !payload.data.invoice_id) {
    return {
      invoice: null,
      /*
       * The API's own sentence, in whichever language the caller reads.
       * `message_uz` first because that is this platform's default and every
       * entry in the catalogue has one — the fallbacks are for a code added
       * without a translation, which is a bug this makes visible rather than
       * silent.
       */
      reason:
        payload?.error?.message_uz ??
        payload?.error?.message_ru ??
        payload?.error?.message_en ??
        null,
    };
  }

  return {
    invoice: {
      invoiceId: payload.data.invoice_id,
      provider: payload.data.provider ?? provider,
      payUrl: payload.data.pay_url,
      amount: payload.data.amount ?? 0,
      state: payload.data.state ?? 'pending',
    },
    reason: null,
  };
}

/**
 * Leave for the provider, remembering which payment this was.
 *
 * `sessionStorage` rather than a query parameter alone: Payme returns to
 * whatever address was configured in the merchant cabinet, which is not
 * necessarily the one we asked for, and a guest who lands on the tracking
 * screen with a bare URL still has to be able to ask about their payment.
 * Wrapped, because a browser in private mode throws on the accessor itself.
 *
 * `location.assign` and not `location.replace`: the back button should return
 * the guest to their own order, not to a bank's screen.
 */
export function leaveForProvider(invoice: InvoiceHandle): void {
  try {
    window.sessionStorage.setItem(INVOICE_KEY, invoice.invoiceId);
  } catch {
    // A private window, or storage the browser refuses. The return URL carries
    // the token too; this is the belt.
  }

  window.location.assign(invoice.payUrl);
}

/**
 * Where a payment stands.
 *
 * Returns null for anything that is not an answer — no such invoice, the API
 * mid-restart — so a polling screen keeps waiting rather than declaring a
 * failure it cannot support. A payment that genuinely failed comes back as
 * `failed`, which is a different thing and says so.
 */
export async function readPaymentStatus(invoiceId: string): Promise<PaymentState | null> {
  try {
    const response = await fetch(`/api/public/payments/${invoiceId}`, { cache: 'no-store' });

    if (!response.ok) return null;

    const payload = (await response.json()) as { data?: { state?: PaymentState } };

    return payload.data?.state ?? null;
  } catch {
    return null;
  }
}

/** The token left behind before the guest went to a bank, if there is one. */
export function rememberedInvoice(): string | null {
  try {
    return window.sessionStorage.getItem(INVOICE_KEY);
  } catch {
    return null;
  }
}

export function forgetInvoice(): void {
  try {
    window.sessionStorage.removeItem(INVOICE_KEY);
  } catch {
    // Nothing to clear, and nothing that can go wrong from not clearing it:
    // the token is single-use and names one attempt.
  }
}
