import { cookies, headers } from 'next/headers';

import { CUSTOMER_COOKIE } from '@/lib/customer-gateway';
import { customerLang, langCookie } from '../../customer-session';
import { ProfileBoard } from './profile-board';

/**
 * The guest, their addresses, their history and the settings.
 *
 * The last tab, and the one that has to be honest about what this app cannot do
 * yet: there is no address book, no in-app refund, no payment-method vault. Each
 * of those is drawn as the design drew it and says where the real route is,
 * because a dead control that explains itself is worth more than a live one that
 * silently fails.
 *
 * **Whether anybody is signed in is decided here, on the server.** The board
 * used to draw the fixture guest until `GET /public/me` answered, which on a
 * phone nobody had signed in on meant a stranger reading a name, a phone
 * number, eleven orders, 3.6 million spent and somebody's home address as
 * though the account were theirs. The session cookie is httpOnly, so the client
 * cannot tell the two states apart before the round trip and the server can
 * before the first paint.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profil' };

export default async function CustomerProfilePage() {
  const jar = await cookies();

  return (
    <ProfileBoard
      lang={customerLang((await headers()).get('accept-language'), langCookie(jar))}
      signedIn={jar.get(CUSTOMER_COOKIE) !== undefined}
    />
  );
}
