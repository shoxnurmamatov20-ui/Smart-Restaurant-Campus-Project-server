import { describe, expect, it, vi } from 'vitest';

/*
 * `vi.hoisted` because `vi.mock` is lifted above the imports: a plain
 * `const apiGet = vi.fn()` would still be in its temporal dead zone when the
 * factory runs.
 */
const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({
  apiGet,
  translate: (value: unknown, lang: string) =>
    typeof value === 'string' ? value : ((value as Record<string, string>)[lang] ?? ''),
}));

import { getComposeMenu, getIntakeRules, getIntakeStats } from './calls-server';

/**
 * The two reads behind the order-intake desk that used to answer with the
 * design's figures whatever the restaurant.
 *
 * `/calls` is the order-operator's landing screen (`roles.ts`), so both of
 * these are the first thing that role sees on its first day. The distinction
 * both tests turn on is the same one the whole console turns on: `null` from
 * `apiGet` is "no session, or the API is down" and keeps the fixture; an
 * ANSWER of none is an answer and must be drawn as none.
 */
describe('getComposeMenu', () => {
  it('keeps the design’s tiles when there is no session at all', async () => {
    apiGet.mockResolvedValueOnce(null);

    const menu = await getComposeMenu();

    // The design's tiles carry word ids and no `menuItemId`, which is what
    // stops the demo console from posting them.
    expect(menu.live).toBe(false);
    expect(menu.items.length).toBeGreaterThan(0);
    expect(menu.items.every((item) => item.menuItemId === undefined)).toBe(true);
  });

  it('offers nothing when the restaurant has nothing on sale', async () => {
    apiGet.mockResolvedValueOnce({ data: [] });

    const menu = await getComposeMenu();

    /*
     * This is the regression. An empty catalogue used to take the fixture, so
     * an operator taking a telephone order on day one was offered eight dishes
     * the kitchen cannot cook at prices nobody set.
     */
    expect(menu).toEqual({ items: [], live: true });
  });

  it('maps the catalogue’s own dishes with ids that can be posted', async () => {
    apiGet.mockResolvedValueOnce({
      data: [{ id: 17, name: { uz: 'Osh', ru: 'Плов', en: 'Pilaf' }, price: 4_200_000 }],
    });

    const menu = await getComposeMenu();

    expect(menu).toEqual({
      items: [
        {
          id: '17',
          menuItemId: 17,
          name: { uz: 'Osh', ru: 'Плов', en: 'Pilaf' },
          price: 4_200_000,
        },
      ],
      live: true,
    });
  });
});

describe('getIntakeStats', () => {
  it('reads the three figures the operator arm answers', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        kpis: [
          { key: 'orders', value: 41, delta_percent: 12.44 },
          { key: 'average_cheque', value: 18_600_000, delta_percent: null },
        ],
        declined: 2,
      },
    });

    expect(await getIntakeStats()).toEqual({
      taken: 41,
      takenDeltaPercent: 12.44,
      averageOrder: 18_600_000,
      declined: 2,
      channels: {},
      live: true,
    });
  });

  it('answers null per figure rather than the design’s 84 and 0:38', async () => {
    apiGet.mockResolvedValueOnce({ data: { kpis: [] } });

    expect(await getIntakeStats()).toEqual({
      taken: null,
      takenDeltaPercent: null,
      averageOrder: null,
      declined: null,
      channels: {},
      live: true,
    });
  });

  it('keys today’s tally by the door each order came through', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        kpis: [],
        intake_channels: [
          { channel: 'phone', orders_count: 9, revenue_tiyin: 120_000_000 },
          { channel: 'telegram', orders_count: 4, revenue_tiyin: 41_000_000 },
        ],
      },
    });

    /*
     * The channels tab draws four cells per door and drew them from the
     * fixture: 34 orders through a website that had taken none. A lane with no
     * row here has taken nothing, which the panel renders as zero.
     */
    expect((await getIntakeStats()).channels).toEqual({
      phone: { orders: 9, revenue: 120_000_000 },
      telegram: { orders: 4, revenue: 41_000_000 },
    });
  });

  it('falls back only when there is no answer at all', async () => {
    apiGet.mockResolvedValueOnce(null);

    expect((await getIntakeStats()).live).toBe(false);
  });
});

describe('getIntakeRules', () => {
  it('keeps the design’s switches when there is no session at all', async () => {
    apiGet.mockResolvedValueOnce(null);

    const rules = await getIntakeRules();

    expect(rules.live).toBe(false);
    expect(rules.prepMinutes).toBe(25);
    expect(rules.rules.auto).toBe(true);
    // Nothing is enforced on a console with no server behind it, and the card
    // must not claim otherwise.
    expect(rules.enforced).toEqual({});
  });

  it('translates the columns into the four keys the switches are drawn from', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        auto_accept_prepaid: false,
        hide_stopped_online: true,
        pause_at_peak: true,
        peak_ticket_limit: 20,
        call_on_cash: true,
        prep_minutes: 40,
        enforced: {
          auto_accept_prepaid: false,
          hide_stopped_online: false,
          pause_at_peak: true,
          call_on_cash: false,
        },
      },
    });

    const rules = await getIntakeRules();

    expect(rules.live).toBe(true);
    expect(rules.rules).toEqual({ auto: false, stop: true, cap: true, call: true });
    expect(rules.prepMinutes).toBe(40);
    expect(rules.peakTicketLimit).toBe(20);
    /*
     * Only one of the four is acted on today. A screen that could not tell an
     * enforced rule from a recorded one would let an operator believe the
     * queue is being answered without them.
     */
    expect(rules.enforced).toEqual({ auto: false, stop: false, cap: true, call: false });
  });
});
