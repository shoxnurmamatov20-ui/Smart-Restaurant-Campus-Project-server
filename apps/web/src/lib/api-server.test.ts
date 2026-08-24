import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * `vi.hoisted` because `vi.mock` is lifted above the imports: a plain `const`
 * would still be in its temporal dead zone when the factory runs.
 */
const { jar } = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.get(name);

      return value === undefined ? undefined : { name, value };
    },
  }),
  headers: async () => new Headers(),
}));

import { apiGet } from './api-server';
import { BRANCH_COOKIE } from './branch-cookie';
import { SESSION_COOKIE } from './server-session';

/**
 * Every read in the console goes through this, which is why the venue header
 * is worth its own file.
 *
 * The switcher was a label for a release because getting this wrong shows one
 * venue's takings under another venue's name on every screen at once — and the
 * failure has no symptom, because the numbers still look like numbers.
 */
type Leg = { url: string; branch: string | null };

function upstream(answers: { status: number; body: unknown }[]): Leg[] {
  const legs: Leg[] = [];
  let index = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);

      legs.push({ url, branch: headers.get('X-Branch') });

      const answer = answers[Math.min(index++, answers.length - 1)]!;

      return new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

const ok = [{ status: 200, body: { data: [1] } }];

afterEach(() => {
  jar.clear();
  vi.unstubAllGlobals();
});

describe('apiGet — which venue a read is about', () => {
  it('asks for no venue in particular when none has been chosen', async () => {
    jar.set(SESSION_COOKIE, 'tok_1');
    const legs = upstream(ok);

    await apiGet('/dashboard');

    // An absent header is the roll-up across every venue, which is what an
    // owner with nothing chosen is reading.
    expect(legs[0]?.branch).toBeNull();
  });

  it('sends the chosen venue on every read', async () => {
    jar.set(SESSION_COOKIE, 'tok_1');
    jar.set(BRANCH_COOKIE, 'yunusobod');
    const legs = upstream(ok);

    expect(await apiGet('/dashboard')).toEqual({ data: [1] });
    expect(legs[0]?.branch).toBe('yunusobod');
  });

  it('falls back to the roll-up when the venue is no longer readable', async () => {
    jar.set(SESSION_COOKIE, 'tok_1');
    jar.set(BRANCH_COOKIE, 'closed-branch');

    /*
     * A cookie outlives the venue it names — a branch closed, a reader newly
     * pinned — and `ResolveBranch` then refuses EVERY request in the console.
     * Asking again unscoped is the honest fallback and is what saves a reader
     * from a console that is entirely 403 with no way back.
     */
    const legs = upstream([
      { status: 404, body: { error: { code: 'branch.not_found' } } },
      { status: 200, body: { data: [2] } },
    ]);

    expect(await apiGet('/dashboard')).toEqual({ data: [2] });
    expect(legs.map((leg) => leg.branch)).toEqual(['closed-branch', null]);
  });

  it('never retries a permission refusal unscoped', async () => {
    jar.set(SESSION_COOKIE, 'tok_1');
    jar.set(BRANCH_COOKIE, 'yunusobod');

    // The reason has nothing to do with the venue, and a second attempt would
    // only be a second refusal one screen later.
    const legs = upstream([{ status: 403, body: { error: { code: 'auth.forbidden' } } }]);

    expect(await apiGet('/finance/shifts')).toBeNull();
    expect(legs).toHaveLength(1);
  });

  it('asks nothing at all without a session, whatever venue is remembered', async () => {
    jar.set(BRANCH_COOKIE, 'yunusobod');
    const legs = upstream(ok);

    expect(await apiGet('/dashboard')).toBeNull();
    expect(legs).toEqual([]);
  });
});
