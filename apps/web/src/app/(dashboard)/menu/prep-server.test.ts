import { describe, expect, it, vi } from 'vitest';

/*
 * `vi.hoisted` because `vi.mock` is lifted above the imports: a plain
 * `const apiGet = vi.fn()` would still be in its temporal dead zone when the
 * factory runs.
 */
const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({ apiGet }));

import { fixturePrepCards, prepCardFrom, type ApiPrepItem } from './prep-data';
import { getPrepCards } from './prep-server';

/**
 * The seam between a prep card on the server and the card the kitchen presses.
 *
 * Worth a test because both halves of it fail quietly. The mapping turns a LOSS
 * percentage into a YIELD percentage — a card entered as 12% loss is an 88%
 * yield — and the two numbers are both plausible on screen, so reading one as
 * the other produces a card that looks right and costs every dish using it at
 * the wrong figure. And the fixture half decides whether the record button may
 * post at all: a demo card that arrived carrying an id would be posted as `s1`
 * and refused, which the panel would have to show as a real failure.
 */

/** One card as `PrepItemResource` sends it. Zirvak: a kilo in, 880 g out. */
function card(over: Partial<ApiPrepItem> = {}): ApiPrepItem {
  return {
    id: 7,
    code: 'zirvak',
    name: { uz: 'Zirvak', ru: 'Зирвак', en: 'Zirvak' },
    unit: 'g',
    batch_quantity: 1000,
    loss_percent: 12,
    yield: 880,
    shelf_life_days: 2,
    on_hand: 2400,
    batch_cost_tiyin: 35_000,
    unit_cost_tiyin: 39,
    components: [
      { ingredient_id: 3, name: "Mol go'shti", unit: 'g', quantity: 400, cost_per_unit: 85 },
      { ingredient_id: 4, name: 'Piyoz', unit: 'g', quantity: 250, cost_per_unit: 4 },
    ],
    ...over,
  };
}

describe('prepCardFrom', () => {
  it('reads the loss as a yield and keeps the server’s own costs', () => {
    const row = prepCardFrom(card(), 'uz');

    expect(row.id).toBe(7);
    expect(row.name).toBe('Zirvak');
    // 12% lost is 88% kept. The card prints what survives, not what is gone.
    expect(row.yieldPct).toBe(88);
    expect(row.made).toBe(880);
    expect(row.batch).toBe(1000);
    // Never recomputed here: the server divides the batch cost by the yield,
    // and a second implementation in a browser is a second answer.
    expect(row.batchCost).toBe(35_000);
    expect(row.unitCost).toBe(39);
  });

  it('resolves the name for the reader and falls back to the code', () => {
    expect(prepCardFrom(card(), 'ru').name).toBe('Зирвак');
    expect(prepCardFrom(card({ name: { uz: 'Zirvak' } }), 'en').name).toBe('Zirvak');
    expect(prepCardFrom(card({ name: null }), 'en').name).toBe('zirvak');
  });

  it('leaves a live line with no shelf figure', () => {
    const [beef] = prepCardFrom(card(), 'uz').lines;

    expect(beef?.per).toBe(400);
    expect(beef?.price).toBe(85);
    /*
     * The prep endpoint costs a recipe; it never reports a balance. A zero here
     * would draw as "none left" and stop a kitchen making the very thing it is
     * out of.
     */
    expect(beef?.have).toBeNull();
  });

  it('takes a decimal column that arrived as a string', () => {
    /*
     * `PrepItem` casts these to integer today, so they arrive as JSON numbers.
     * A decimal column that loses its cast comes back from PDO as a string, and
     * a string does not throw in this arithmetic — it concatenates, and
     * `4.2 + 1.8` becomes "4.21.8" on a figure a cook would read as real.
     */
    const row = prepCardFrom(card({ on_hand: '4200', yield: '880', loss_percent: '12' }), 'uz');

    expect(row.onHand).toBe(4200);
    expect(row.made).toBe(880);
    expect(row.yieldPct).toBe(88);
  });
});

describe('fixturePrepCards', () => {
  it('has no id to post and a shelf of its own', () => {
    const [broth] = fixturePrepCards('uz');

    // The one thing that must hold: nothing on the demo console can reach the
    // API, because none of it exists there.
    expect(broth?.id).toBeNull();
    expect(broth?.name).toBe('Qaynatma, mol');
    // 8 litres at 84% — the fixture's own arithmetic, unchanged.
    expect(broth?.made).toBe(6.72);
    expect(broth?.lines[0]?.have).toBe(12);
  });
});

describe('getPrepCards', () => {
  it('answers null so the tab can fall back to its fixtures', async () => {
    apiGet.mockResolvedValueOnce(null);

    await expect(getPrepCards('uz')).resolves.toBeNull();
  });

  it('answers an empty list rather than null when the kitchen preps nothing', async () => {
    apiGet.mockResolvedValueOnce({ data: [] });

    // Not the same as a failure: the panel says "no prep cards yet" instead of
    // drawing four the restaurant does not have.
    await expect(getPrepCards('uz')).resolves.toEqual([]);
  });

  it('asks the unpaged endpoint and maps every card', async () => {
    apiGet.mockResolvedValueOnce({ data: [card(), card({ id: 8, code: 'broth', name: null })] });

    const rows = await getPrepCards('en');

    expect(apiGet).toHaveBeenCalledWith('/inventory/prep');
    expect(rows?.map((row) => row.key)).toEqual(['7', '8']);
    expect(rows?.[1]?.name).toBe('broth');
  });
});
