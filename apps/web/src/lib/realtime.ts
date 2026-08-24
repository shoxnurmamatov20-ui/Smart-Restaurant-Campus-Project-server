'use client';

import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

import type { RealtimeConfig } from './realtime-server';

/**
 * The one WebSocket connection this browser opens.
 *
 * A restaurant screen is left open for eight hours and subscribes to two or
 * three channels; opening a socket per screen would mean four sockets on one
 * tablet, four authentication round trips, and four things to reconnect after a
 * router blinks. One connection, many channels, is what the protocol is for.
 *
 * Created lazily and kept, rather than built in a provider at the root: most
 * screens in this console need no realtime at all, and a socket opened for the
 * menu editor is a socket held open for nothing.
 *
 * Reverb speaks the Pusher protocol, which is why the client is `pusher-js`
 * pointed at our own host rather than at Pusher's service. Nothing here talks
 * to anybody's cloud.
 */

/** Kept between subscriptions so a screen does not open a second socket. */
let echo: Echo<'reverb'> | null = null;

/**
 * Where the socket is, given what the server said.
 *
 * Everything except the key defaults to the origin that served the page. That is
 * not a shortcut — it is what lets one build serve this console over an IP on
 * the LAN and over a domain with TLS, without either being compiled in. nginx
 * upgrades `/app/` on whichever of the two the reader arrived through.
 */
function resolve(config: RealtimeConfig) {
  const https = window.location.protocol === 'https:';
  const scheme = config.scheme ?? (https ? 'https' : 'http');

  return {
    key: config.key,
    host: config.host ?? window.location.hostname,
    // The port the reader actually reached, which is not always the scheme's
    // default — a LAN console on :8080 has to dial :8080, not :80.
    port:
      config.port ??
      (window.location.port === '' ? (https ? 443 : 80) : Number(window.location.port)),
    scheme,
  };
}

/**
 * The shared connection, or null when realtime is not configured.
 *
 * Null rather than throwing, and every caller treats it as "no live updates
 * this session". A kitchen screen with no socket still renders the board it was
 * given and still works when a cook taps it — it just does not move on its own.
 * A screen that refused to render because a WebSocket was unavailable would be
 * a kitchen with no screen.
 *
 * The config comes from the server as a prop rather than from `NEXT_PUBLIC_*`,
 * so rotating the app key is a restart and not a rebuild. See ./realtime-server.ts.
 * The first caller to pass one wins: subsequent calls join the connection that
 * already exists, which is the point of it being shared.
 */
export function realtime(config: RealtimeConfig | null): Echo<'reverb'> | null {
  if (echo !== null) return echo;
  if (config === null || config.key === '') return null;

  const { key, host, port, scheme } = resolve(config);

  echo = new Echo({
    broadcaster: 'reverb',
    client: new Pusher(key, {
      wsHost: host,
      wsPort: port,
      wssPort: port,
      forceTLS: scheme === 'https',
      enabledTransports: ['ws', 'wss'],
      cluster: '',
      /*
       * Authorised through this app, not through Laravel.
       *
       * The credential is an httpOnly cookie this origin owns; the browser
       * cannot read it and so cannot send it to another host. The handler at
       * /api/broadcasting/auth attaches it and forwards the signature verbatim.
       */
      authorizer: (channel) => ({
        authorize: (socketId, callback) => {
          void fetch('/api/broadcasting/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
          })
            .then(async (response) => {
              if (!response.ok) {
                // A 403 here means the channel callback said this role may not
                // listen to this room. Passed on rather than retried: retrying
                // an authorisation refusal is a loop.
                callback(new Error(`auth ${response.status}`), null);

                return;
              }

              callback(null, (await response.json()) as { auth: string });
            })
            .catch((error: unknown) => callback(error as Error, null));
        },
      }),
    }),
  });

  giveUpAfterRepeatedFailures(echo);

  return echo;
}

/**
 * How many failed connection attempts before this session stops trying.
 *
 * Three, and the number is about the two cases it has to tell apart. A tablet
 * whose wifi dropped for a moment reconnects on the first or second attempt; an
 * edge that strips `Upgrade` fails every attempt forever, and pusher-js will
 * keep making them — with a console error each — for as long as the screen is
 * open. Three is past the first case and well short of a night's worth.
 */
const ATTEMPTS_BEFORE_GIVING_UP = 3;

/**
 * Stop reconnecting once it is clear the socket is not coming.
 *
 * The public domain reaches this box through an edge that speaks HTTP/1.0 and
 * drops `Upgrade`, so the handshake answers 500 and no retry can change that.
 * Left alone, pusher-js retries with backoff for the life of the page: on a
 * kitchen screen open all evening that is a console error every few seconds and
 * a socket that is never going to carry an event.
 *
 * The screens are already built for this — `live-fallback.ts` polls the server
 * whenever the link is anything but `connected`, and a disconnected link is
 * anything but connected — so giving up costs nothing and stops the noise. It
 * is deliberately per page load: a reader who reloads after the network admin
 * fixes the proxy gets the socket, without anybody clearing a flag.
 *
 * `unavailable` and `failed` are the two states pusher-js lands in when it
 * cannot get through; `connected` resets the count, because a link that came
 * back was a blip rather than a wall.
 */
function giveUpAfterRepeatedFailures(instance: Echo<'reverb'>): void {
  const connection = (
    instance.connector as unknown as {
      pusher?: {
        connection?: {
          bind(event: string, handler: (payload: { current?: string }) => void): void;
        };
        disconnect?: () => void;
      };
    }
  ).pusher;

  // Nothing to bind to in a test double or a future connector. The screens work
  // without this; it only removes noise.
  if (connection?.connection === undefined) return;

  let failures = 0;

  connection.connection.bind('state_change', (change: { current?: string }) => {
    if (change.current === 'connected') {
      failures = 0;

      return;
    }

    if (change.current !== 'unavailable' && change.current !== 'failed') return;

    failures += 1;

    if (failures >= ATTEMPTS_BEFORE_GIVING_UP) connection.disconnect?.();
  });
}
