import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * Signing a browser onto a private broadcast channel.
 *
 * Echo asks an endpoint to prove the reader may listen, and that endpoint has to
 * be here rather than Laravel's own `/broadcasting/auth` — for the reason every
 * other call in this app is proxied: the credential is in an httpOnly cookie
 * this origin owns, and the browser cannot send what it cannot read.
 *
 * Two credentials are accepted because two surfaces subscribe. The console
 * (a chef at a desk, a manager's dashboard) carries a session token; a paired
 * till carries a shift token. They authorise differently upstream — the channel
 * callbacks in routes/channels.php check the role — and this handler only has
 * to hand the right bearer over.
 *
 * It forwards the refusal verbatim. A 403 from the channel callback means "your
 * role may not listen to this room", which is a real answer and not this
 * handler's to soften.
 */
export async function POST(request: NextRequest) {
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const token = shift ?? session;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const terminal = pairedTerminalFrom(request);
  const body = await request.text();

  try {
    const upstream = await fetch(`${apiBase().replace(/\/v1$/, '')}/broadcasting/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        // Only a till knows its restaurant from a cookie; a console session
        // carries it on the token, and ResolveTenant reads it from there.
        ...(terminal === null ? {} : { 'X-Tenant': terminal.tenantSlug }),
      },
      body,
      cache: 'no-store',
    });

    // Echo needs the body verbatim — it is a signature over the socket id and
    // the channel name, and rewriting any of it breaks the handshake.
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }
}
