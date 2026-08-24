import { describe, expect, it, vi } from 'vitest';

/*
 * `vi.hoisted` because `vi.mock` is lifted above the imports: a plain
 * `const apiGet = vi.fn()` would still be in its temporal dead zone when the
 * factory runs.
 */
const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({
  apiGet,
  translate: (value: unknown) => (typeof value === 'string' ? value : String(value)),
}));

import { getAnalytics, peakHour } from './analytics-server';

/**
 * The analytics seam, and the one failure that looks like a working screen.
 *
 * Three of the four service figures are questions this module is not permitted
 * to ask — turn time and ticket time are kitchen timestamps, the repeat share
 * is CRM — and the live path used to answer them with the design's own
 * constants (`54 min`, `8:40`, `38%`). A restaurant reading its own cover count
 * read three of somebody else's numbers beside it, with nothing on the card to
 * separate the real one from the borrowed three.
 */
const label = (key: string): string => key;

const SUMMARY = {
  window: { period: 'month', from: '2026-07-01', to: '2026-07-30', days: 30 },
  hours: [
    { hour: 9, guests_count: 4 },
    { hour: 10, guests_count: 11 },
  ],
  categories: [{ slug: 'osh', name: 'Osh', revenue_tiyin: 1_000_00, share_percent: 61.4 }],
  void_rate_percent: null as number | null,
};

const ENGINEERING = { data: [] as unknown[] };

describe('getAnalytics', () => {
  it('answers null for the three figures Analytics may not reach', async () => {
    apiGet.mockReset();
    apiGet.mockResolvedValueOnce({ data: SUMMARY }).mockResolvedValueOnce({ data: ENGINEERING });

    const view = await getAnalytics(label, 'uz');

    expect(view.live).toBe(true);
    expect(view.service.turnMinutes).toBeNull();
    expect(view.service.ticketTime).toBeNull();
    expect(view.service.repeatShare).toBeNull();
  });

  it('leaves the void rate null when the server itself could not compute one', async () => {
    apiGet.mockReset();
    apiGet
      .mockResolvedValueOnce({ data: { ...SUMMARY, void_rate_percent: null } })
      .mockResolvedValueOnce({ data: ENGINEERING });

    // A window with no bills in it is not a 1.2% void rate — which is what the
    // fixture fallback used to print here.
    expect((await getAnalytics(label, 'uz')).service.voidRate).toBeNull();
  });

  it('draws the void rate when there is one', async () => {
    apiGet.mockReset();
    apiGet
      .mockResolvedValueOnce({ data: { ...SUMMARY, void_rate_percent: 2.4 } })
      .mockResolvedValueOnce({ data: ENGINEERING });

    expect((await getAnalytics(label, 'uz')).service.voidRate).toBe('2.4%');
  });

  it('carries the API window so the subtitle cannot claim thirty days of nothing', async () => {
    apiGet.mockReset();
    apiGet
      .mockResolvedValueOnce({ data: { ...SUMMARY, window: { ...SUMMARY.window, days: 7 } } })
      .mockResolvedValueOnce({ data: ENGINEERING });

    expect((await getAnalytics(label, 'uz')).days).toBe(7);
  });

  it('keeps the design figures only when there was no answer at all', async () => {
    apiGet.mockReset();
    apiGet.mockResolvedValue(null);

    const view = await getAnalytics(label, 'uz');

    expect(view.live).toBe(false);
    expect(view.service.turnMinutes).toBe('54 min');
  });
});

describe('peakHour', () => {
  it('names the fullest hour, offset from 09:00', () => {
    expect(peakHour([8, 14, 26, 62])).toEqual({ hour: 12, guests: 62 });
  });

  it('answers null for a window nobody sat in', () => {
    expect(peakHour([0, 0, 0])).toBeNull();
    expect(peakHour([])).toBeNull();
  });
});
