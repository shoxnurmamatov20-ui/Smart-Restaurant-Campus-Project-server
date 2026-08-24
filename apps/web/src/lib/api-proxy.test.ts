import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { forward } from './api-proxy';
import { BRANCH_COOKIE } from './branch-cookie';
import { SESSION_COOKIE } from './server-session';

/**
 * The write half of the venue header, which matters more than the read half.
 *
 * Shutting an intake door or setting a prep time is a change to ONE venue. A
 * write that arrived unscoped while the reader was looking at Yunusobod would
 * apply to the whole business — the screen would show the change on the venue
 * it was made from and the other four would quietly follow.
 */
type Leg = { branch: string | null; key: string | null };

function upstream(answers: { status: number; body: unknown }[]): Leg[] {
  const legs: Leg[] = [];
  let index = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);

      legs.push({ branch: headers.get('X-Branch'), key: headers.get('Idempotency-Key') });

      const answer = answers[Math.min(index++, answers.length - 1)]!;

      return new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return legs;
}

function request(branch?: string) {
  return new NextRequest('http://localhost:3000/api/orders/intake-rules', {
    method: 'POST',
    headers: {
      cookie: [`${SESSION_COOKIE}=tok_1`, branch ? `${BRANCH_COOKIE}=${branch}` : '']
        .filter(Boolean)
        .join('; '),
    },
    body: '{}',
  });
}

const write = { method: 'PUT', body: JSON.stringify({ prep_minutes: 40 }) };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('forward — which venue a write lands on', () => {
  it('carries the chosen venue upstream', async () => {
    const legs = upstream([{ status: 200, body: { data: {} } }]);

    await forward(request('yunusobod'), '/orders/intake-rules', write);

    expect(legs[0]?.branch).toBe('yunusobod');
  });

  it('retries a stale venue unscoped, on the SAME idempotency key', async () => {
    const legs = upstream([
      { status: 403, body: { error: { code: 'branch.mismatch' } } },
      { status: 200, body: { data: {} } },
    ]);

    const answer = await forward(request('yunusobod'), '/orders/intake-rules', write);

    expect(answer.status).toBe(200);
    expect(legs.map((leg) => leg.branch)).toEqual(['yunusobod', null]);
    /*
     * A refusal happens before the controller runs, so nothing happened and
     * re-using the key is correct. Minting a second one would turn a refusal
     * into a second chance to double a write.
     */
    expect(legs[0]?.key).toBe(legs[1]?.key);
  });

  it('never retries a permission refusal, which would widen the change', async () => {
    const legs = upstream([{ status: 403, body: { error: { code: 'auth.forbidden' } } }]);

    const answer = await forward(request('yunusobod'), '/orders/intake-rules', write);

    expect(answer.status).toBe(403);
    // The second attempt would not be a retry — it would be the same change
    // applied to the whole business instead of to one venue.
    expect(legs).toHaveLength(1);
  });

  it('answers 401 without a session rather than forwarding an anonymous write', async () => {
    const legs = upstream([{ status: 200, body: {} }]);

    const bare = new NextRequest('http://localhost:3000/api/orders/intake-rules', {
      method: 'POST',
      body: '{}',
    });

    expect((await forward(bare, '/orders/intake-rules', write)).status).toBe(401);
    expect(legs).toEqual([]);
  });
});
