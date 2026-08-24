import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

/*
 * `vi.hoisted` because `vi.mock` is lifted above the imports: a plain
 * `const apiGet = vi.fn()` would still be in its temporal dead zone when the
 * factory runs.
 */
const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({ apiGet }));

import { POSITIONS, STAFF } from './staff-data';
import { getRoster } from './staff-server';

/**
 * The roster's fourth call, and the join that is silently wrong.
 *
 * Everything else on this screen is a rendering decision somebody notices — a
 * shift printed in the wrong format, a role with no label. This one is
 * arithmetic across two modules, and getting it wrong produces a table that
 * looks perfectly normal and credits one waiter with another's takings.
 *
 * The trap is that the two payloads are keyed by different numbers for the same
 * person. `GET /staff/members` answers rows in `staff.members`; `GET
 * /orders/stats/by-waiter` answers rows keyed by the *user* who signed in and
 * took the order. Both are small integers, both look like ids, and joining on
 * the wrong one compiles, runs, and pays the wrong person a bonus.
 */

/** One roster row, as the members endpoint sends it. */
function member(over: Record<string, unknown> = {}) {
  return {
    id: 3,
    user_id: 41,
    full_name: 'Jasur Toshev',
    position: 'waiter',
    status: 'active',
    ...over,
  };
}

/** One row of the sales aggregate. Money is integer tiyin. */
function sale(over: Record<string, unknown> = {}) {
  return {
    waiter_user_id: 41,
    tickets: 62,
    covers: 184,
    revenue_tiyin: 624_000_000,
    average_tiyin: 10_064_516,
    ...over,
  };
}

/**
 * Answer each of the four requests by the path it asked for.
 *
 * Routed rather than queued in order: `getRoster` fires them inside one
 * `Promise.all`, and a test that depended on the order of that array would pass
 * until somebody reordered two lines that are explicitly unordered.
 */
function serve({
  members,
  sales,
  shifts,
}: {
  members: unknown[] | null;
  sales?: unknown[] | null;
  shifts?: unknown[];
}): void {
  apiGet.mockReset();
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/staff/members')) {
      return Promise.resolve(members === null ? null : { data: members });
    }
    if (path.startsWith('/orders/stats/by-waiter')) {
      return Promise.resolve(sales == null ? null : { data: sales });
    }
    if (path.startsWith('/staff/shifts')) {
      return Promise.resolve({ data: shifts ?? [] });
    }

    // The attendance log: empty is a valid answer, and only the `hours` and
    // `clockedIn` columns read it.
    return Promise.resolve({ data: [] });
  });
}

describe('getRoster — the sales join', () => {
  it('joins on the user id, not on the staff-member id', async () => {
    serve({ members: [member({ id: 3, user_id: 41 })], sales: [sale({ waiter_user_id: 41 })] });

    const roster = await getRoster();

    expect(roster).toHaveLength(1);
    expect(roster[0]?.sales).toBe(624_000_000);
    expect(roster[0]?.tickets).toBe(62);
  });

  it('does not credit somebody because their member id matched a user id', async () => {
    /*
     * The failure this whole file exists for. The member's own id is 3 and the
     * aggregate has a row for user 3 — a different person entirely. Joining on
     * `id` would put that person's week in this row, and nothing on the screen
     * would look wrong.
     */
    serve({ members: [member({ id: 3, user_id: 41 })], sales: [sale({ waiter_user_id: 3 })] });

    const roster = await getRoster();

    expect(roster[0]?.sales).toBe(0);
    expect(roster[0]?.tickets).toBe(0);
  });

  it('leaves anybody the aggregate does not mention at zero', async () => {
    // A chef sells nothing and is absent from this list every day of their
    // career. The screen draws zero as an em dash, which is the honest cell.
    serve({
      members: [member({ id: 9, user_id: 55, full_name: 'Bekzod Alimov', position: 'chef' })],
      sales: [sale({ waiter_user_id: 41 })],
    });

    const roster = await getRoster();

    expect(roster[0]?.name).toBe('Bekzod Alimov');
    expect(roster[0]?.sales).toBe(0);
    expect(roster[0]?.tickets).toBe(0);
  });

  it('keeps somebody with no login out of the map entirely', async () => {
    /*
     * A porter with no account has `user_id: null`. Reaching into the map with
     * a nullish key would match a row keyed `undefined` the first time the API
     * sent one — which is a person's takings landing on a stranger's row.
     */
    serve({
      members: [member({ user_id: null, full_name: 'Sardor Nazarov', position: 'storekeeper' })],
      sales: [sale({ waiter_user_id: 41 })],
    });

    const roster = await getRoster();

    expect(roster[0]?.sales).toBe(0);
  });

  it('still lists the roster when Orders does not answer', async () => {
    // Four calls, four independent failures. A stats endpoint that is down must
    // cost two columns, not the whole table.
    serve({ members: [member()], sales: null });

    const roster = await getRoster();

    expect(roster).toHaveLength(1);
    expect(roster[0]?.name).toBe('Jasur Toshev');
    expect(roster[0]?.sales).toBe(0);
  });

  it('falls back to the fixture when there is no session at all', async () => {
    serve({ members: null });

    expect(await getRoster()).toBe(STAFF);
  });

  it('leaves people who no longer work here off the list', async () => {
    serve({
      members: [member(), member({ id: 4, user_id: 42, status: 'terminated' })],
      sales: [sale({ waiter_user_id: 42, revenue_tiyin: 999_000_000 })],
    });

    const roster = await getRoster();

    // And the leaver's takings do not reappear on anybody else's row.
    expect(roster.map((row) => row.name)).toEqual(['Jasur Toshev']);
    expect(roster[0]?.sales).toBe(0);
  });
});

/**
 * The shift column prints the hour the venue wrote down.
 *
 * `starts_at` arrives with the venue's own offset because that is the fact the
 * rota records — eighteen hundred, in that room. Read back with
 * `new Date(iso).getHours()` it becomes eighteen hundred *here*, and the console
 * renders on a server whose clock nobody in the restaurant has ever seen: on a
 * UTC box a bar shift written 18:00–02:00 drew as 13:00–21:00, a shift no
 * manager had rostered and no waiter had agreed to.
 *
 * The two rows below are the point of this block. They name the **same wall
 * clock** with different offsets, so no single timezone can make both come out
 * right by accident — the old reading fails one of them in Tashkent and both of
 * them in UTC, which is what a regression test for this has to do.
 */
describe('getRoster — the shift column reads the clock as written', () => {
  /*
   * Midday UTC, so `now` falls on 2026-08-27 whether the box is set to UTC or to
   * Asia/Tashkent five hours ahead. The rota is filtered against the render
   * machine's calendar day, and a fixed `now` near midnight would make this
   * block pass or fail on the box's zone rather than on the code under test.
   */
  const noon = new Date('2026-08-27T12:00:00Z');

  /** One rota row, published, for the person `member()` describes. */
  function shift(over: Record<string, unknown> = {}) {
    return {
      staff_member_id: 3,
      starts_at: '2026-08-27T18:00:00+05:00',
      ends_at: '2026-08-28T02:00:00+05:00',
      status: 'published',
      ...over,
    };
  }

  it('prints the written hours for the venue that wrote them', async () => {
    serve({ members: [member({ id: 3 })], shifts: [shift()] });

    const roster = await getRoster(noon);

    expect(roster[0]?.shift).toBe('18:00 – 02:00');
  });

  it('prints the same clock for a venue five zones away that wrote the same clock', async () => {
    /*
     * A second restaurant on the same platform keeps the same hours in its own
     * offset. Both rows say "we open at six and close at two"; a reader that
     * converts instants answers two different pairs of numbers, and one of the
     * two managers is being shown somebody else's night.
     */
    serve({
      members: [member({ id: 3 })],
      shifts: [
        shift({ starts_at: '2026-08-27T18:00:00+02:00', ends_at: '2026-08-28T02:00:00+02:00' }),
      ],
    });

    const roster = await getRoster(noon);

    expect(roster[0]?.shift).toBe('18:00 – 02:00');
  });

  it('keeps a 02:00 finish on the clock rather than dragging it back a day', async () => {
    /*
     * The half of this that is worse than a wrong label. Converting 02:00+05:00
     * into a zone behind the venue lands it on the previous evening, so the row
     * for a Thursday night shift reports a finish before its own start — and the
     * swap form built on the same reading offers the wrong day to accept.
     */
    serve({
      members: [member({ id: 3 })],
      shifts: [
        shift({ starts_at: '2026-08-27T22:00:00+05:00', ends_at: '2026-08-28T02:00:00+05:00' }),
      ],
    });

    const roster = await getRoster(noon);

    expect(roster[0]?.shift).toBe('22:00 – 02:00');
  });

  it('still draws an em dash for somebody who is off today', async () => {
    // Not a guess at 09:00–18:00, and not the empty string either: the column
    // has one word for "no shift" and a caller downstream tells them apart.
    serve({ members: [member({ id: 3 })], shifts: [] });

    const roster = await getRoster(noon);

    expect(roster[0]?.shift).toBe('—');
  });
});

/**
 * The console's position list is the API's, character for character.
 *
 * Read from the PHP source rather than restated here, so the day the model
 * gains a position the console either gains it too or this fails — which is
 * what happened on 2026-08-23 without this test: `StaffMember::POSITIONS`
 * grew `accountant` and `operator`, the hire form offered them, and the route
 * handler between the two still carried the old nine and answered 400.
 */
describe('POSITIONS — one list, on both sides of the API', () => {
  it('matches StaffMember::POSITIONS', () => {
    const php = readFileSync(
      resolve(__dirname, '../../../../../api/Modules/Staff/app/Models/StaffMember.php'),
      'utf8',
    );
    const match = /public const POSITIONS = \[([^\]]+)\];/.exec(php);

    expect(match, 'StaffMember::POSITIONS not found').not.toBeNull();

    const server = [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(POSITIONS.map((position) => position.value)).toEqual(server);
  });
});
