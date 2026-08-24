import { describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({
  apiGet,
  translate: (value: unknown, locale: string) =>
    typeof value === 'string' ? value : ((value as Record<string, string>)[locale] ?? ''),
}));

import {
  getMenuCategories,
  getModifierGroups,
  getVatPercent,
  menuFacts,
  type MenuScreenRow,
} from './menu-server';

/**
 * What the Menu screen is allowed to say about itself.
 *
 * Three separate faults lived in one catalogue sentence — "20 items in 7
 * categories · 1 sold out · prices include 12% VAT" — and each fails
 * differently. The counts are arithmetic and are wrong loudly. The VAT clause
 * is a tenant setting and is wrong *quietly*: a restaurant outside the VAT
 * regime read a caption its own receipts contradict, and nothing on screen
 * disagreed with it.
 *
 * The categories tab is the third: it mapped the fixture unconditionally, so a
 * restaurant that had built its own sections still read the design's eight.
 */
function row(over: Partial<MenuScreenRow> = {}): MenuScreenRow {
  return {
    id: '1',
    name: 'Osh',
    price: 45_000_00,
    cost: 18_000_00,
    available: true,
    soldToday: 0,
    categoryLabel: 'Milliy taomlar',
    stationLabel: 'Issiq',
    imageUrl: null,
    image: null,
    ...over,
  } as MenuScreenRow;
}

describe('menuFacts', () => {
  it('says nothing of its own over the design’s own menu', () => {
    // The fixture console keeps the design's sentence, which is the honest
    // caption for the design's data.
    expect(menuFacts([row()], false)).toBeNull();
  });

  it('counts the dishes, the sections they sit in and the stop list', () => {
    expect(
      menuFacts(
        [
          row({ id: '1', categoryLabel: 'Milliy taomlar' }),
          row({ id: '2', categoryLabel: 'Milliy taomlar' }),
          row({ id: '3', categoryLabel: 'Kabob', available: false }),
        ],
        true,
      ),
    ).toEqual({ items: 3, categories: 2, stopped: 1 });
  });

  it('does not count a section that is only an empty label', () => {
    // A dish whose category was deleted resolves to '' — counting it would
    // report one more section than the restaurant has.
    expect(menuFacts([row({ categoryLabel: '' })], true)).toMatchObject({ categories: 0 });
  });

  it('answers zeroes for a live menu with nothing on it', () => {
    expect(menuFacts([], true)).toEqual({ items: 0, categories: 0, stopped: 0 });
  });
});

describe('getVatPercent', () => {
  it('reads the rate this restaurant is registered at', async () => {
    apiGet.mockResolvedValueOnce({ data: { settings: { vat_percent: 15 } } });

    await expect(getVatPercent()).resolves.toBe(15);
  });

  it('prints no VAT clause for a restaurant outside the regime', async () => {
    // The clause is the claim. A caption reading "prices include 12% VAT" over
    // a non-registered restaurant's menu contradicts its own receipts.
    apiGet.mockResolvedValueOnce({
      data: { settings: { vat_percent: 12, legal: { vat_registered: false } } },
    });

    await expect(getVatPercent()).resolves.toBeNull();
  });

  it('prints no clause when settings did not answer at all', async () => {
    apiGet.mockResolvedValueOnce(null);

    await expect(getVatPercent()).resolves.toBeNull();
  });
});

describe('getMenuCategories', () => {
  it('answers null when the API did not, so the tab keeps the fixture', async () => {
    apiGet.mockResolvedValueOnce(null);

    await expect(getMenuCategories('uz')).resolves.toBeNull();
  });

  it('answers an empty list for a restaurant with no sections yet', async () => {
    // Empty is a real answer and must not fall back: the table's own empty
    // state is what a first morning should read.
    apiGet.mockResolvedValueOnce({ data: [] });

    await expect(getMenuCategories('uz')).resolves.toEqual([]);
  });

  it('maps the row the table draws, in the reader’s language', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          id: 4,
          name: { uz: 'Kabob', ru: 'Кебаб', en: 'Kebab' },
          sort_order: 2,
          is_active: false,
          items_count: 9,
        },
      ],
    });

    await expect(getMenuCategories('ru')).resolves.toEqual([
      { id: '4', name: 'Кебаб', position: 2, items: 9, visible: false },
    ]);
  });

  it('numbers a menu nobody has arranged rather than showing every row at zero', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        { id: 1, name: 'A', sort_order: 0, is_active: true, items_count: 1 },
        { id: 2, name: 'B', sort_order: 0, is_active: true, items_count: 0 },
      ],
    });

    const rows = await getMenuCategories('uz');

    expect(rows?.map((entry) => entry.position)).toEqual([1, 2]);
  });
});

describe('getModifierGroups', () => {
  it('answers null when the API did not, so the tab keeps the design’s three', async () => {
    apiGet.mockResolvedValueOnce(null);

    await expect(getModifierGroups()).resolves.toBeNull();
  });

  it('answers an empty list for a restaurant that asks no questions', async () => {
    // A real answer, not a failure: the tab says so rather than borrowing
    // somebody else's sheets.
    apiGet.mockResolvedValueOnce({ data: [] });

    await expect(getModifierGroups()).resolves.toEqual([]);
  });

  it('keeps a switched-off sheet, which is the row somebody opened the tab for', async () => {
    apiGet.mockResolvedValueOnce({
      data: [
        {
          id: 3,
          title: 'Ulush',
          is_multi: false,
          min_choices: 1,
          max_choices: 1,
          is_active: false,
          used_by: 24,
          choices: [
            { id: 9, title: 'Kattalashtirilgan', price_delta_tiyin: 18_000_00, is_active: true },
          ],
        },
      ],
    });

    const groups = await getModifierGroups();

    expect(groups).toEqual([
      {
        id: '3',
        name: 'Ulush',
        min: 1,
        max: 1,
        usedBy: 24,
        active: false,
        options: [{ id: '9', name: 'Kattalashtirilgan', price: 18_000_00 }],
      },
    ]);
  });

  it('reads a missing count as none rather than as unknown', async () => {
    // A caller that forgot the `withCount` upstream would send no `used_by`;
    // "used by nobody" is the honest reading and the one the screen can draw.
    apiGet.mockResolvedValueOnce({
      data: [
        { id: 4, title: null, is_multi: true, min_choices: 0, max_choices: 4, is_active: true },
      ],
    });

    const groups = await getModifierGroups();

    expect(groups?.[0]).toMatchObject({ usedBy: 0, name: '—', options: [] });
  });
});
