import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { SESSION_COOKIE } from '@/lib/server-session';

/**
 * Editing a printer that already exists.
 *
 * The settings table drew a pencil on every row whose whole behaviour was a
 * toast, so a restaurant could not change an IP or a station from the console
 * at all — while the test button next to it worked, which made the dead one
 * read as working.
 *
 * Two things matter beyond "it forwards". The `code` is the stable handle a
 * print route points at, so renaming a printer must not move it: repointing a
 * station's dockets at nothing is a kitchen that silently stops getting paper.
 * And only the fields the sheet filled in may travel — the API takes each one
 * `sometimes`, and sending `target: null` for an untouched box would unplug the
 * printer.
 */
function request(body: unknown, token: string | null = 'tok_1') {
  return new NextRequest('http://localhost:3000/api/settings/printer-update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === null ? {} : { cookie: `${SESSION_COOKIE}=${token}` }),
    },
    body: JSON.stringify(body),
  });
}

type Leg = { method: string; url: string; body: Record<string, unknown> | null };

function serve(): Leg[] {
  const legs: Leg[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      legs.push({
        method: init?.method ?? 'GET',
        url: String(input),
        body:
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
      });

      return new Response(JSON.stringify({ data: { id: 7 } }), { status: 200 });
    }),
  );

  return legs;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/settings/printer-update', () => {
  it('sends only the fields the sheet filled in, and never the code', async () => {
    const legs = serve();

    const answer = await POST(request({ id: 7, name: 'P-BAR' }));

    expect(answer.status).toBe(200);
    expect(legs).toHaveLength(1);
    expect(legs[0]!.method).toBe('PATCH');
    expect(legs[0]!.url).toContain('/kitchen/printers/7');
    expect(legs[0]!.body).toEqual({ name: 'P-BAR' });
  });

  it('reads the connection off the address, as the add path does', async () => {
    const network = serve();

    await POST(request({ id: 7, target: '192.168.100.152:9100' }));

    expect(network[0]!.body).toEqual({ target: '192.168.100.152:9100', connection: 'network' });

    const agent = serve();

    await POST(request({ id: 7, target: 'USB001' }));

    expect(agent[0]!.body).toEqual({ target: 'USB001', connection: 'agent' });
  });

  it("maps the table's four kinds onto the spooler's three roles", async () => {
    const legs = serve();

    // A bar printer is a kitchen printer standing somewhere else.
    await POST(request({ id: 7, kind: 'bar' }));

    expect(legs[0]!.body).toEqual({ role: 'kitchen' });
  });

  it('refuses a fixture row rather than posting a word as an id', async () => {
    const legs = serve();

    expect((await POST(request({ id: 'p1', name: 'P-BAR' }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('refuses a name the API would reject, before the round trip', async () => {
    const legs = serve();

    expect((await POST(request({ id: 7, name: 'P' }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('refuses an empty change rather than sending one', async () => {
    const legs = serve();

    expect((await POST(request({ id: 7 }))).status).toBe(400);
    expect(legs).toHaveLength(0);
  });

  it('answers 401 with no session to forward', async () => {
    const legs = serve();

    expect((await POST(request({ id: 7, name: 'P-BAR' }, null))).status).toBe(401);
    expect(legs).toHaveLength(0);
  });
});
