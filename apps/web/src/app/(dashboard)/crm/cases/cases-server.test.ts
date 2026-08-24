import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({ apiGet }));

import { getCases } from './cases-server';

/**
 * The line a settled complaint carries: who decided, and at what time.
 *
 * It is the only audit trail on this screen. A guest rings back a week later
 * asking who agreed to refund them, and this line — with the till's own log —
 * is the answer, so the hour on it has to be the hour that happened in the
 * dining room rather than the hour the machine drawing the card would have
 * called it.
 *
 * That is exactly what it was not. `new Date(decided_at).getHours()` converted
 * the venue's stamp into the renderer's zone, and because every box, tablet and
 * phone here is Asia/Tashkent the conversion was the identity and nobody saw
 * it. A server in UTC filed every decision five hours early.
 */

/** A settled `late` complaint — the one shape that reaches `settledBy`. */
const settledCase = (over: Record<string, unknown> = {}) => ({
  id: 41,
  number: 'SH-2418',
  channel: 'phone',
  kind: 'late',
  guest_name: 'Dilnoza K.',
  guest_phone: '+998 90 123 45 67',
  guest_visits: 4,
  order_number: 'A-0184',
  amount_tiyin: 24_000_00,
  amount_note: 'Uchta choy',
  quote: 'Yarim soat kutdim.',
  photos: [],
  status: 'settled',
  assigned_to: 'Aziza R.',
  is_overdue: false,
  outcome: 'refunded',
  decided_by: 'Aziza R.',
  decided_at: '2026-08-22T11:24:00+05:00',
  created_at: '2026-08-22T10:00:00+05:00',
  ...over,
});

/** The rendered line for one row, which is what the card prints verbatim. */
async function settledLine(over: Record<string, unknown> = {}): Promise<string | undefined> {
  apiGet.mockResolvedValueOnce({ data: [settledCase(over)] });

  return (await getCases()).rows[0]?.settledBy;
}

beforeEach(() => {
  apiGet.mockReset();
});

describe('the settled line', () => {
  it('reads the clock the venue wrote, whatever zone the reader is in', async () => {
    /*
     * The pair is the test. All three stamps name 11:24 and they are hours
     * apart as instants, so under the old reading they could never all come out
     * as 11:24 in any single timezone — at most one of them was ever right.
     * Asserting one stamp would pass on this box and fail in CI, which is how
     * the fault got here in the first place.
     */
    await expect(settledLine({ decided_at: '2026-08-22T11:24:00+05:00' })).resolves.toBe(
      'Aziza R. · 11:24',
    );
    await expect(settledLine({ decided_at: '2026-08-22T11:24:00+00:00' })).resolves.toBe(
      'Aziza R. · 11:24',
    );
    await expect(settledLine({ decided_at: '2026-08-22T11:24:00-04:00' })).resolves.toBe(
      'Aziza R. · 11:24',
    );
  });

  it('keeps a decision taken after midnight in the small hours', async () => {
    // 00:30 with a +05:00 offset is 19:30 the previous evening once converted,
    // so a night manager's refund was filed under the shift before theirs.
    await expect(settledLine({ decided_at: '2026-08-23T00:30:00+05:00' })).resolves.toBe(
      'Aziza R. · 00:30',
    );
  });

  it('prints the name alone when nothing recorded the time', async () => {
    // No separator either: ` · ` with nothing after it reads as a truncated
    // record rather than a missing one.
    await expect(settledLine({ decided_at: null })).resolves.toBe('Aziza R.');
    await expect(settledLine({ decided_at: 'someday' })).resolves.toBe('Aziza R.');
  });

  it('falls back to an em dash for the person, not for the clock', async () => {
    await expect(settledLine({ decided_by: null, decided_at: null })).resolves.toBe('—');
    await expect(settledLine({ decided_by: null })).resolves.toBe('— · 11:24');
  });

  it('is absent while a complaint is still open', async () => {
    // `settledBy` is present exactly when `outcome` is; an open case with a
    // name under it would read as answered.
    apiGet.mockResolvedValueOnce({
      data: [settledCase({ outcome: null, decided_by: null, decided_at: null, status: 'open' })],
    });

    const row = (await getCases()).rows[0];

    expect(row?.outcome).toBeUndefined();
    expect(row?.settledBy).toBeUndefined();
  });
});
