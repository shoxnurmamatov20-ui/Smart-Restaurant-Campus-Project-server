import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({ apiGet }));

import { getBillRates, getOrderCounts, getOrders } from './orders-server';

/**
 * The two figures the Orders screen states about itself, and the two rates the
 * drawer's bill is built from.
 *
 * The caption said "12 ta ochiq · bugun 192 ta yopilgan · Chilonzor" above an
 * empty table at a branch the tenant does not have. The counts are read rather
 * than counted off the rows on screen, because the table is one page of a
 * hundred and "closed today" is a trading-day question only the API can answer.
 *
 * The rates matter for a different reason: they reach `billTotals()` AND the
 * two labels printed beside it. Baked into the catalogue, a restaurant on a
 * different rate got a breakdown whose label contradicted its own arithmetic.
 */
describe('getOrderCounts', () => {
  it('reads both totals rather than counting the page', async () => {
    apiGet
      .mockResolvedValueOnce({ data: [], meta: { total: 12 } })
      .mockResolvedValueOnce({ data: [], meta: { total: 192 } });

    await expect(getOrderCounts()).resolves.toEqual({ open: 12, closed: 192 });

    expect(apiGet).toHaveBeenNthCalledWith(1, expect.stringContaining('filter[open]=1'));
    expect(apiGet).toHaveBeenNthCalledWith(2, expect.stringContaining('filter[today]=1'));
  });

  it('says nothing when the API did not answer, so the caption stays the design’s', async () => {
    apiGet.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(getOrderCounts()).resolves.toBeNull();
  });

  it('reports a quiet morning as zero rather than as twelve', async () => {
    apiGet
      .mockResolvedValueOnce({ data: [], meta: { total: 0 } })
      .mockResolvedValueOnce({ data: [], meta: { total: 0 } });

    await expect(getOrderCounts()).resolves.toEqual({ open: 0, closed: 0 });
  });

  it('still says how many are open when the closed read was refused', async () => {
    // `filter[today]` and `filter[open]` sit on one permission, but a partial
    // answer should not throw away the half that arrived.
    apiGet.mockResolvedValueOnce({ data: [], meta: { total: 3 } }).mockResolvedValueOnce(null);

    await expect(getOrderCounts()).resolves.toEqual({ open: 3, closed: 0 });
  });
});

describe('getBillRates', () => {
  it('reads this restaurant’s own two rates', async () => {
    apiGet.mockResolvedValueOnce({
      data: { settings: { vat_percent: 0, service_charge_percent: 15 } },
    });

    await expect(getBillRates()).resolves.toEqual({ vat: 0, service: 15 });
  });

  it('falls back to the platform’s defaults when settings did not answer', async () => {
    // A cashier without `settings.view` is the normal case rather than an
    // error, and these are the same two constants `BillTotals::of()` uses.
    apiGet.mockResolvedValueOnce(null);

    await expect(getBillRates()).resolves.toEqual({ vat: 12, service: 10 });
  });
});

describe('getOrders, narrowed', () => {
  const word = (key: string) => key;

  /* The stub is shared with the two suites above, so its call log has to be
     emptied or the first assertion reads somebody else's request. */
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('sends only the filters the API allows, encoded', async () => {
    apiGet.mockResolvedValueOnce({ data: [], meta: {} }).mockResolvedValueOnce({ data: [] });

    await getOrders(word, { channel: 'delivery', status: 'cooking', waiter: '7' });

    const asked = apiGet.mock.calls[0]?.[0] as string;

    // `ConsoleQueriesTest` on the API sends every string this file can produce
    // at the real router, because a filter the controller does not allow comes
    // back 400 and the screen falls back to fixtures without saying so.
    expect(asked).toContain('filter%5Bchannel%5D=delivery');
    expect(asked).toContain('filter%5Bstatus%5D=cooking');
    expect(asked).toContain('filter%5Bwaiter%5D=7');
  });

  it('asks for the whole list when nothing is selected', async () => {
    apiGet.mockResolvedValueOnce({ data: [], meta: {} }).mockResolvedValueOnce({ data: [] });

    await getOrders(word, {});

    expect(apiGet.mock.calls[0]?.[0]).toBe('/orders/orders?per_page=100');
  });

  it('encodes a value that would otherwise open a second parameter', async () => {
    apiGet.mockResolvedValueOnce({ data: [], meta: {} }).mockResolvedValueOnce({ data: [] });

    // A waiter id comes off a URL a person can type; an ampersand in it would
    // split into a parameter the API never allowed.
    await getOrders(word, { waiter: '7&filter[status]=paid' });

    expect(apiGet.mock.calls[0]?.[0]).not.toContain('&filter[status]=paid');
  });
});
