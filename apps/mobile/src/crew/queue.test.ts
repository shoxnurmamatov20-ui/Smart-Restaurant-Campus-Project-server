import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ post: vi.fn() }));
vi.mock('@/lib/storage', () => ({ KEYS: { crewSession: 'crew-session' } }));
vi.mock('./session', () => ({ enrolment: async () => ({ tenant: 'osh-markazi' }) }));

import { post } from '@/lib/api';

import { clearQueue, drain, enqueue } from './queue';

/**
 * The offline queue's one promise: nothing a phone did goes missing.
 *
 * Every case here is a way that promise can quietly break — an entry cleared
 * because a batch "succeeded", an entry cleared because the server refused it,
 * an entry lost because the connection dropped mid-request. The drain is thirty
 * lines and each of those failures is one wrong `filter` away.
 */
const sent = vi.mocked(post);

type Entry = { local_id: string; kind: string; at: string; payload: Record<string, unknown> };

/** The batch the drain posted, as the server would have received it. */
const posted = (call = 0): readonly Entry[] =>
  ((sent.mock.calls[call]?.[1] ?? { entries: [] }) as { entries: Entry[] }).entries;

/** Answer every entry in the batch with the same verdict. */
function answerAll(status: string, reason?: string) {
  sent.mockImplementation(async (_path: string, body: unknown) => ({
    data: {
      results: (body as { entries: Entry[] }).entries.map((entry) => ({
        local_id: entry.local_id,
        status,
        reason,
      })),
    },
  }));
}

afterEach(() => {
  clearQueue();
  sent.mockReset();
});

describe('draining the crew queue', () => {
  it('sends what it has and empties only what landed', async () => {
    answerAll('applied');
    enqueue('Chaqiruv yopildi', '12-stol', { kind: 'call_resolve', payload: { call: 'c1' } });
    enqueue('Yetkazildi', 'D-1042', { kind: 'delivery_status', payload: { drop: 'd1' } });

    expect(await drain()).toEqual({ sent: 2, refused: 0, unsendable: 0 });

    // Nothing left to send.
    sent.mockClear();
    await drain();
    expect(sent).not.toHaveBeenCalled();
  });

  it('keeps a refused entry rather than pretending it went', async () => {
    answerAll('rejected', 'unknown_ingredient');
    enqueue('Chiqim', 'Pomidor', { kind: 'waste_log', payload: { ingredient_id: 1 } });

    expect(await drain()).toEqual({ sent: 0, refused: 1, unsendable: 0 });

    // The person who logged four kilos of spoiled chicken has to find out that
    // the store would not take it — so it is still there, with the reason.
    answerAll('applied');
    sent.mockClear();
    await drain();
    expect(posted()).toHaveLength(1);
  });

  it('never drops an entry the answer said nothing about', async () => {
    sent.mockResolvedValue({ data: { results: [] } });
    enqueue('Chaqiruv yopildi', '12-stol', { kind: 'call_resolve' });

    await drain();

    // A queue that keeps something twice is a nuisance; one that drops
    // something once is a write-off nobody can account for.
    sent.mockClear();
    sent.mockResolvedValue({ data: { results: [] } });
    await drain();
    expect(posted()).toHaveLength(1);
  });

  it('keeps everything when the network fails, and resends the same ids', async () => {
    sent.mockRejectedValue(new Error('offline'));
    enqueue('Yetkazildi', 'D-1042', { kind: 'delivery_status' });

    expect(await drain()).toEqual({ sent: 0, refused: 0, unsendable: 0 });

    sent.mockReset();
    answerAll('applied');
    expect((await drain()).sent).toBe(1);
  });

  it('does not post an entry it has no verb for', async () => {
    enqueue('Sanoq saqlandi', '12 / 40');

    expect(await drain()).toEqual({ sent: 0, refused: 0, unsendable: 1 });
    expect(sent).not.toHaveBeenCalled();
  });

  it('sends in the order the work was done', async () => {
    answerAll('applied');
    enqueue('Birinchi', 'a', { kind: 'call_resolve', payload: { n: 1 } });
    enqueue('Ikkinchi', 'b', { kind: 'call_resolve', payload: { n: 2 } });
    enqueue('Uchinchi', 'c', { kind: 'call_resolve', payload: { n: 3 } });

    await drain();

    // Out of order, the kitchen sees a dish after it was cancelled. The queue
    // screen says so in as many words; this is what holds it.
    expect(posted().map((entry) => entry.payload.n)).toEqual([1, 2, 3]);
  });

  it('carries the moment the person acted, not the moment it was sent', async () => {
    answerAll('applied');
    const before = Date.now();
    enqueue('Chaqiruv yopildi', '12-stol', { kind: 'call_resolve' });

    await drain();

    // The server stamps the trading day from this, so a night's work drained
    // the next morning still belongs to the night.
    const at = Date.parse(posted()[0]?.at ?? '');
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it('gives every entry an id that survives the app being killed', async () => {
    answerAll('applied');
    enqueue('Bir', 'a', { kind: 'call_resolve' });

    await drain();

    // A bare counter would restart at `q1` after a restart, and the server keys
    // on this string per person — so the first entry of the new session would
    // collide with the first of the old one and be answered as a duplicate that
    // never happened.
    expect(posted()[0]?.local_id).toMatch(/^q[a-z0-9]+-\d+$/);
  });
});
