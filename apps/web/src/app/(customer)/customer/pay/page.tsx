import { cookies, headers } from 'next/headers';

import { CUSTOMER_COOKIE } from '@/lib/customer-gateway';
import { customerLang, langCookie } from '../../customer-session';
import { PayBoard } from './pay-board';

/**
 * Where the guest names the money.
 *
 * The last screen the basket is still editable from — after this it is an order
 * with a number, and changing it is a phone call.
 *
 * Ordering without an account is supported here, so the session is read for one
 * reason: to stop asking `GET /public/me` a question whose answer is already
 * known. The read answered 401 on every guest checkout — an error in the
 * console of the screen a guest is about to pay on, which is the last place to
 * leave one.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: "To'lov" };

export default async function CustomerPayPage() {
  const jar = await cookies();

  return (
    <PayBoard
      lang={customerLang((await headers()).get('accept-language'), langCookie(jar))}
      signedIn={jar.get(CUSTOMER_COOKIE) !== undefined}
    />
  );
}
