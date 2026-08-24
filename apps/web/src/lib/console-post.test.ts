import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiId, post } from './console-post';

/**
 * Reading a refusal, and reading what it came with.
 *
 * The second half is why this file exists. `post()` read a TOP-LEVEL `meta`,
 * and the API has never sent one: `ApiError::toArray()` spreads a refusal's
 * baggage *beside* the four fixed keys, inside `error`. So `answer.meta` was
 * null on every refusal in the platform, and the screens that branch on it —
 * the till re-sending an `approval_id`, the merchant panel drawing how many
 * days until an advertising slot frees — were branching on nothing.
 *
 * It is the kind of bug a type checker cannot see and a screen does not report:
 * the code is right, the sentence is right, and only the one figure that made
 * the answer actionable is missing.
 */

/** One fetch, answering exactly this. */
function answering(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('post', () => {
  it('reads the meta the API actually sends — beside the code, inside `error`', async () => {
    answering(409, {
      error: {
        code: 'pos.approval_required',
        message_uz: 'Menejer tasdig‘i kerak.',
        message_ru: 'Нужно подтверждение менеджера.',
        message_en: 'A manager has to sign this.',
        field: null,
        retryable: false,
        approval_id: 41,
      },
    });

    const answer = await post('/api/pos/approval', {}, 'en');

    expect(answer.ok).toBe(false);

    if (answer.ok) return;

    expect(answer.code).toBe('pos.approval_required');
    expect(answer.message).toBe('A manager has to sign this.');
    // The whole point: without this the till cannot re-send the approval and
    // raises a second request in the manager's queue on every retry.
    expect(answer.meta).toEqual({ approval_id: 41 });
  });

  it('still reads a `meta` a route handler lifted up itself', async () => {
    // `api/orders/route.ts` copies the extra keys to a top-level `meta` as well
    // as leaving them where they were. Both readings must give the same answer.
    answering(409, {
      error: { code: 'marketplace.placement_slot_taken', queue_days: 6 },
      meta: { queue_days: 6 },
    });

    const answer = await post('/api/marketplace/placements', {}, 'uz');

    expect(answer.ok).toBe(false);

    if (answer.ok) return;

    expect(answer.meta).toEqual({ queue_days: 6 });
  });

  it('leaves meta null when the refusal carried nothing but the envelope', async () => {
    answering(422, {
      error: {
        code: 'order.closed',
        message_uz: 'Hisob yopilgan.',
        message_ru: 'Счёт закрыт.',
        message_en: 'The bill is closed.',
        field: null,
        retryable: false,
      },
    });

    const answer = await post('/api/orders', {}, 'ru');

    expect(answer.ok).toBe(false);

    if (answer.ok) return;

    expect(answer.message).toBe('Счёт закрыт.');
    // Null rather than `{}`, because a caller checks it with `!== null`.
    expect(answer.meta).toBeNull();
  });

  it('names the status when the answer is not an envelope at all', async () => {
    // A route handler's own refusal — `{ error: 'not_signed_in' }` — is a
    // string where the envelope would be. It must not become `meta`.
    answering(401, { error: 'not_signed_in' });

    const answer = await post('/api/orders', {}, 'uz');

    expect(answer.ok).toBe(false);

    if (answer.ok) return;

    expect(answer.code).toBe('http_401');
    expect(answer.meta).toBeNull();
  });

  it('answers `offline` when the network never got there', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const answer = await post('/api/orders', {}, 'uz');

    expect(answer).toEqual({ ok: false, code: 'offline', message: null, meta: null });
  });

  it('hands a success back untouched', async () => {
    answering(200, { data: { id: 7 } });

    const answer = await post<{ data: { id: number } }>('/api/orders', {}, 'uz');

    expect(answer).toEqual({ ok: true, data: { data: { id: 7 } } });
  });
});

describe('apiId', () => {
  it('tells a real row from one of the design’s own', () => {
    expect(apiId('412')).toBe(412);
    expect(apiId('#4821')).toBeNull();
    expect(apiId('')).toBeNull();
  });
});
