/**
 * What a screen needs to open its socket, resolved on the server.
 *
 * The Pusher app key is not a secret — it identifies the application, and every
 * private channel is still authorised per subscription against the reader's own
 * token. What it is, is *deployment-specific*, and that is the whole reason it
 * does not live in a `NEXT_PUBLIC_` variable: those are inlined at build time,
 * so an operator rotating the key would have to rebuild the console rather than
 * restart it. The same reasoning already keeps `NEXT_PUBLIC_API_URL` relative.
 *
 * So it is read here, per request, and handed to the board as a prop. The value
 * must match `REVERB_APP_KEY` in the API's environment — they are two processes
 * reading the same broadcaster, and a mismatch shows up as screens that connect
 * and then hear nothing, which is the least diagnosable failure of the three.
 *
 * Server-only by convention: nothing in a client component imports this.
 */
export type RealtimeConfig = {
  /** The Pusher app key. */
  key: string;
  /**
   * Where the WebSocket lives, when it is not this origin.
   *
   * Normally absent, and absent is the useful case: nginx upgrades `/app/` on the
   * same host that served the page, so the browser resolves the socket against
   * `window.location` and the console works through an IP today and a domain
   * tomorrow without a rebuild. Set these only when Reverb is genuinely
   * elsewhere.
   */
  host?: string;
  port?: number;
  scheme?: 'http' | 'https';
};

/**
 * The configuration for this render, or `null` when realtime is not set up.
 *
 * `null` is a supported state, not a failure. A console with no broadcaster
 * renders every screen it renders now; the live ones simply do not move on their
 * own. That is the difference between a kitchen that is a second behind and a
 * kitchen with no screen.
 */
export function realtimeConfig(): RealtimeConfig | null {
  const key = process.env.REVERB_APP_KEY ?? '';

  if (key === '') return null;

  const port = Number(process.env.REVERB_PUBLIC_PORT ?? '');
  const scheme = process.env.REVERB_PUBLIC_SCHEME;

  return {
    key,
    host: process.env.REVERB_PUBLIC_HOST || undefined,
    port: Number.isFinite(port) && port > 0 ? port : undefined,
    scheme: scheme === 'http' || scheme === 'https' ? scheme : undefined,
  };
}
