import { describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({ apiGet }));

import {
  fetchDeliveries,
  fetchLedger,
  fetchRecipeCards,
  fetchWasteLog,
  type StockItem,
} from './stock-ops-server';

/**
 * The three lists that used to be drawn with no fetch at all.
 *
 * Deliveries, the movement ledger and the waste log came straight from the
 * design's fixtures, so a storekeeper's first morning showed vans waiting to be
 * signed for, a costed waste log and an adjustment history belonging to another
 * restaurant — with buttons that appeared to act on them.
 *
 * The subtle one is the receiving table's second column. A purchase order
 * records what was ORDERED, and `received_quantity` is what somebody counted
 * off the van — null when nobody did. Printing the ordered figure again under
 * "received" would manufacture a variance of zero on every line and a credit
 * note nobody should read; treating a null as a shortfall would put one on
 * every delivery that arrived before the column existed.
 */
const item = (over: Partial<StockItem> = {}): StockItem => ({
  id: 7,
  name: "Mol go'shti",
  unit: 'g',
  onHand: 12_000,
  costPerUnit: 78,
  ...over,
});

describe('fetchDeliveries', () => {
  it('answers null when the API did not', async () => {
    apiGet.mockResolvedValueOnce(null);

    await expect(fetchDeliveries()).resolves.toBeNull();
  });

  it('leaves the received column empty rather than inventing a variance', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          id: 5,
          number: 'XB-0185',
          status: 'sent',
          expected_at: '2026-08-23T09:00:00+05:00',
          supplier: { id: 3, name: "Farg'ona Meat" },
          items: [
            {
              id: 91,
              ingredient_id: 7,
              name: "Mol go'shti",
              unit: 'g',
              quantity: 40_000,
              received_quantity: null,
              unit_price: 78,
            },
          ],
        },
      ],
    });

    const vans = await fetchDeliveries();

    expect(vans).toEqual([
      {
        id: '5',
        number: 'XB-0185',
        supplier: "Farg'ona Meat",
        when: '2026-08-23',
        lines: [
          {
            key: '5:91',
            lineId: 91,
            name: "Mol go'shti",
            unit: 'g',
            ordered: 40_000,
            received: null,
            unitPriceTiyin: 78,
          },
        ],
        shortfallTiyin: 0,
      },
    ]);
  });

  it('values a counted shortfall and ignores an uncounted line', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          id: 5,
          number: 'XB-0186',
          status: 'sent',
          expected_at: null,
          supplier: null,
          items: [
            // Two kilos short at 78 tiyin a gram.
            {
              id: 1,
              ingredient_id: 7,
              name: 'Beef',
              unit: 'g',
              quantity: 40_000,
              received_quantity: 38_000,
              unit_price: 78,
            },
            // Nobody counted this one; it is not a shortfall.
            {
              id: 2,
              ingredient_id: 8,
              name: 'Rice',
              unit: 'g',
              quantity: 10_000,
              received_quantity: null,
              unit_price: 3,
            },
            // Over-delivery is not netted off against the line above.
            {
              id: 3,
              ingredient_id: 9,
              name: 'Oil',
              unit: 'ml',
              quantity: 5_000,
              received_quantity: 6_000,
              unit_price: 2,
            },
          ],
        },
      ],
    });

    const vans = await fetchDeliveries();

    expect(vans?.[0]?.shortfallTiyin).toBe(2_000 * 78);
    expect(vans?.[0]?.lines[1]?.received).toBeNull();
  });

  it('lists what is on its way, not what nobody has sent', async () => {
    // A draft has been shown to nobody and cannot arrive at the door.
    apiGet.mockResolvedValueOnce({
      data: ['draft', 'sent', 'confirmed', 'received', 'cancelled'].map((status, index) => ({
        id: index,
        number: `X-${index}`,
        status,
        expected_at: null,
        supplier: null,
        items: [],
      })),
    });

    const vans = await fetchDeliveries();

    expect(vans?.map((van) => van.number)).toEqual(['X-1', 'X-2']);
  });
});

describe('fetchLedger', () => {
  it('leaves sales off a list of decisions', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          ingredient_id: 7,
          kind: 'consumption',
          quantity: -300,
          reason: null,
          reference: null,
          happened_at: '2026-08-22T12:00:00+05:00',
        },
        {
          id: 2,
          ingredient_id: 7,
          kind: 'write_off',
          quantity: -500,
          reason: 'Muddati o‘tgan',
          reference: null,
          happened_at: '2026-08-22T13:00:00+05:00',
        },
      ],
    });

    const rows = await fetchLedger([item()]);

    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({ kind: 'waste', delta: '−500 g', who: 'Muddati o‘tgan' });
  });

  it('names the row from the shelf rather than printing an id', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          id: 3,
          ingredient_id: 7,
          kind: 'receipt',
          quantity: 40_000,
          reason: null,
          reference: 'XB-0185',
          happened_at: '2026-08-22T09:05:00+05:00',
        },
      ],
    });

    const rows = await fetchLedger([item()]);

    expect(rows?.[0]).toMatchObject({
      what: "Mol go'shti",
      kind: 'receiving',
      delta: '+40000 g',
      time: '09:05',
    });
  });

  it('falls back to the id when the shelf no longer carries the row', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          id: 3,
          ingredient_id: 99,
          kind: 'stock_take',
          quantity: 10,
          reason: null,
          reference: null,
          happened_at: null,
        },
      ],
    });

    const rows = await fetchLedger([item()]);

    expect(rows?.[0]).toMatchObject({ what: '#99', kind: 'count', time: '—', who: '—' });
  });
});

describe('fetchWasteLog', () => {
  it('costs the write-off at what the shelf says the product is worth', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          id: 8,
          ingredient_id: 7,
          kind: 'write_off',
          quantity: -500,
          reason: 'Muddati o‘tgan',
          reference: null,
          happened_at: '2026-08-22T13:20:00+05:00',
        },
      ],
    });

    // 500 g at 78 tiyin a gram — the same figure the store screen shows.
    await expect(fetchWasteLog([item()])).resolves.toEqual([
      {
        id: 8,
        time: '13:20',
        name: "Mol go'shti",
        quantity: '500 g',
        reason: 'Muddati o‘tgan',
        costTiyin: 39_000,
      },
    ]);
  });

  it('asks only for write-offs', async () => {
    apiGet.mockResolvedValueOnce({ data: [] });

    await fetchWasteLog([item()]);

    expect(apiGet).toHaveBeenLastCalledWith(expect.stringContaining('filter[kind]=write_off'));
  });

  it('costs an unknown product at nothing rather than crashing the tab', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          id: 8,
          ingredient_id: 99,
          kind: 'write_off',
          quantity: -500,
          reason: null,
          reference: null,
          happened_at: null,
        },
      ],
    });

    const rows = await fetchWasteLog([item()]);

    expect(rows?.[0]).toMatchObject({ costTiyin: 0, quantity: '500' });
  });
});

describe('fetchRecipeCards', () => {
  it('answers null when the API did not, so the tab keeps the design’s cards', async () => {
    apiGet.mockResolvedValueOnce(null);

    await expect(fetchRecipeCards()).resolves.toBeNull();
  });

  it('answers an empty list for a restaurant that has costed nothing', async () => {
    // Not the same as "the API is down": a first week has no cards, and the tab
    // says so rather than drawing somebody else's kitchen.
    apiGet.mockResolvedValueOnce({ data: [] });

    await expect(fetchRecipeCards()).resolves.toEqual([]);
  });

  it('carries a line the shelf could not price rather than dropping it', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          menu_item_id: 12,
          name: 'Osh',
          sell_tiyin: 45_000_00,
          cost_tiyin: null,
          unresolved_lines: 1,
          margin_percent: null,
          food_cost_percent: null,
          lines: [
            {
              id: 1,
              kind: 'raw',
              name: 'Guruch',
              unit: 'g',
              quantity: 200,
              unit_cost_tiyin: 3,
              line_cost_tiyin: 600,
            },
            {
              id: 2,
              kind: 'prep',
              name: null,
              unit: null,
              quantity: 260,
              unit_cost_tiyin: null,
              line_cost_tiyin: null,
            },
          ],
        },
      ],
    });

    const cards = await fetchRecipeCards();

    // A card with a hole in it has to look like one: the total is null rather
    // than a smaller number, and the missing line is still a row.
    expect(cards?.[0]).toMatchObject({ key: '12', costTiyin: null, unresolved: 1 });
    expect(cards?.[0]?.lines).toHaveLength(2);
    expect(cards?.[0]?.lines[1]).toMatchObject({ prep: true, name: null, unit: '' });
  });
});
