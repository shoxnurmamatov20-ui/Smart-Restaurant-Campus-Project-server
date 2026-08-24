import { describe, expect, it, vi } from 'vitest';

/*
 * `vi.hoisted` because `vi.mock` is lifted above the imports: a plain
 * `const apiGet = vi.fn()` would still be in its temporal dead zone when the
 * factory runs.
 */
const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({ apiGet }));

import { shellState } from './shell-server';

/**
 * The top bar's venue list, and which row it points at.
 *
 * The switcher writes a cookie that becomes `X-Branch` on every request the
 * console makes, so the one thing this file has to pin is the SLUG: matching on
 * the numeric id would let the row highlighted in the menu and the venue the
 * page was actually read against drift apart without anything noticing.
 */
const REGISTER = {
  data: [
    { id: 1, name: 'Chilonzor', slug: 'chilonzor', city: 'Toshkent', settings: { seats: 96 } },
    { id: 2, name: 'Yunusobod', slug: 'yunusobod', city: 'Toshkent', settings: {} },
  ],
};

function answers(register: unknown, pulse: unknown = null) {
  apiGet.mockResolvedValueOnce(register).mockResolvedValueOnce(pulse);
}

describe('shellState', () => {
  it('carries the slug the header is keyed on, beside the id', async () => {
    answers(REGISTER);

    const shell = await shellState('yunusobod', true);

    expect(shell.live).toBe(true);
    expect(shell.branches.map((branch) => branch.slug)).toEqual(['chilonzor', 'yunusobod']);
    expect(shell.branches[0]?.id).toBe('1');
    expect(shell.activeSlug).toBe('yunusobod');
    expect(shell.canSwitch).toBe(true);
  });

  it('leaves the roll-up as the roll-up rather than naming the first venue', async () => {
    answers(REGISTER);

    /*
     * This used to fall through to `branches[0]`, so a five-branch restaurant
     * with nothing chosen read "Chilonzor" over a five-branch total. Nothing
     * chosen IS a state and the switcher has a row for it.
     */
    const shell = await shellState(null, true);

    expect(shell.activeSlug).toBeNull();
  });

  it('says the switcher is a label for somebody pinned to their venue', async () => {
    answers(REGISTER);

    // The server scopes them whatever they pick, so offering the choice would
    // be offering one the API answers with `branch.mismatch`.
    const shell = await shellState('chilonzor', false);

    expect(shell.canSwitch).toBe(false);
  });

  it('draws no venues at all for a restaurant that has opened none', async () => {
    answers({ data: [] }, { data: { orders_open: 0 } });

    // An ANSWER of none must not borrow the demo restaurant's five, which is
    // what an owner read over an empty staff table on their first day.
    const shell = await shellState(null, true);

    expect(shell.branches).toEqual([]);
    expect(shell.live).toBe(true);
  });

  it('keeps the design’s venues when there is no session at all', async () => {
    answers(null);

    const shell = await shellState(null, true);

    expect(shell.live).toBe(false);
    expect(shell.branches.length).toBeGreaterThan(0);
    // The fixture's ids were always slugs, which is why the demo switcher can
    // be the same control as the live one.
    expect(shell.branches[0]?.slug).toBe(shell.branches[0]?.id);
  });
});
