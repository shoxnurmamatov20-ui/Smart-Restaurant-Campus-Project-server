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

import { CREW_DEVICE_COOKIE, CREW_TENANT_COOKIE } from './crew-session';
import { enrolledDeviceLine } from './crew-server';

/**
 * The one line above the keypad, and why it may never be a fixture.
 *
 * It exists so a person can check they are in the right back office before they
 * type — a waiter who has walked into another branch's office reads it there
 * rather than after their PIN is refused. It used to print the demo's
 * "Chilonzor filiali · POS-3" on every phone in the country, which turns the
 * screen's one check into the screen's one lie: the waiter in Termiz believes
 * they are somewhere they are not.
 *
 * So the failures worth a test are the ones that would put ANY name on an
 * unenrolled or refused handset.
 */
function paired(): void {
  jar.set(CREW_DEVICE_COOKIE, 'device-token');
  jar.set(CREW_TENANT_COOKIE, 'omad-manti');
}

function answers(status: number, body: unknown): string[] {
  const asked: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);

      asked.push(`${url} ${headers.get('Authorization')} ${headers.get('X-Tenant')}`);

      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as unknown as Response;
    }),
  );

  return asked;
}

afterEach(() => {
  jar.clear();
  vi.unstubAllGlobals();
});

describe('enrolledDeviceLine', () => {
  it('names the branch and the handset this phone was enrolled against', async () => {
    paired();
    const asked = answers(200, { data: { label: 'POS-3', branch_code: 'Termiz Markaz' } });

    expect(await enrolledDeviceLine()).toBe('Termiz Markaz · POS-3');

    // Its own device token, and the restaurant the pairing handed back: a
    // device token carries no user, so without `X-Tenant` the API cannot tell
    // which restaurant is asking and answers nothing.
    expect(asked[0]).toContain('/staff/devices/me');
    expect(asked[0]).toContain('Bearer device-token');
    expect(asked[0]).toContain('omad-manti');
  });

  it('says nothing at all on a phone that was never enrolled', async () => {
    const asked = answers(200, { data: { label: 'POS-3', branch_code: 'Chilonzor' } });

    expect(await enrolledDeviceLine()).toBeNull();
    // And does not ask: there is no credential to ask with.
    expect(asked).toHaveLength(0);
  });

  it('says nothing when the enrolment was revoked', async () => {
    paired();
    answers(401, { error: { code: 'staff.device_required' } });

    expect(await enrolledDeviceLine()).toBeNull();
  });

  it('prints the half it has rather than a joined blank', async () => {
    paired();
    answers(200, { data: { label: 'POS-3', branch_code: null } });

    expect(await enrolledDeviceLine()).toBe('POS-3');
  });

  it('answers null for an empty enrolment instead of dressing it as an identity', async () => {
    paired();
    answers(200, { data: { label: '  ', branch_code: null } });

    expect(await enrolledDeviceLine()).toBeNull();
  });
});
