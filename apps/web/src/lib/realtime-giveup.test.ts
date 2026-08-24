import { describe, expect, it, vi } from 'vitest';

const { EchoMock, PusherMock, handlers, disconnects } = vi.hoisted(() => {
  const handlers: ((change: { current?: string }) => void)[] = [];
  const disconnects: number[] = [];

  class PusherMock {
    connection = {
      bind(event: string, handler: (change: { current?: string }) => void) {
        if (event === 'state_change') handlers.push(handler);
      },
    };

    disconnect() {
      disconnects.push(1);
    }
  }

  class EchoMock {
    connector: { pusher: PusherMock };

    constructor(options: { client: PusherMock }) {
      this.connector = { pusher: options.client };
    }
  }

  return { EchoMock, PusherMock, handlers, disconnects };
});

vi.mock('laravel-echo', () => ({ default: EchoMock }));
vi.mock('pusher-js', () => ({ default: PusherMock }));

import { realtime } from './realtime';

/**
 * When the socket is never going to arrive, stop asking.
 *
 * The public domain reaches this box through an edge that speaks HTTP/1.0 and
 * drops `Upgrade`: the handshake answers 500 and no number of retries changes
 * it. pusher-js retries for the life of the page, so a kitchen screen open all
 * evening logged a console error every few seconds — on the one screen a cook
 * looks at when something has gone wrong.
 *
 * Giving up is safe because the boards never depended on the socket alone:
 * `live-fallback.ts` polls whenever the link is anything but `connected`, and a
 * disconnected link is anything but connected. What these tests protect is the
 * distinction between a wall and a blip — a tablet whose wifi dropped for a
 * moment must not be cut off from live updates for the rest of the shift.
 */
describe('a socket that cannot connect', () => {
  const config = { key: 'app-key', host: 'example.test', port: 443, scheme: 'https' as const };

  it('stops retrying after three failed attempts', () => {
    handlers.length = 0;
    disconnects.length = 0;

    realtime(config);

    expect(handlers).toHaveLength(1);

    handlers[0]!({ current: 'unavailable' });
    handlers[0]!({ current: 'unavailable' });
    expect(disconnects).toHaveLength(0);

    handlers[0]!({ current: 'failed' });
    expect(disconnects).toHaveLength(1);
  });

  it('treats a link that came back as a blip, not a wall', async () => {
    handlers.length = 0;
    disconnects.length = 0;

    /*
     * A fresh module: `realtime()` caches its instance for the page, and with
     * it the failure count this test is about. Reloading is what a second page
     * load does, which is also the only way a reader gets the socket back after
     * a proxy is fixed.
     */
    vi.resetModules();

    const { realtime: fresh } = await import('./realtime');

    fresh(config);

    const link = handlers[0]!;

    link({ current: 'unavailable' });
    link({ current: 'unavailable' });
    // Two failures then a connection: a tablet whose wifi dropped in a
    // corridor. The count goes back to zero, so the next two do not add up to
    // a give-up that would leave the screen polling for the rest of the shift.
    link({ current: 'connected' });
    link({ current: 'unavailable' });
    link({ current: 'unavailable' });

    expect(disconnects).toHaveLength(0);
  });
});
