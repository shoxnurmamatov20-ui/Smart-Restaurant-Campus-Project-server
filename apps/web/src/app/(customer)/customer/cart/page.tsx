import { cookies, headers } from 'next/headers';

import { customerLang, langCookie } from '../../customer-session';
import { CartBoard } from './cart-board';

/**
 * The basket, and the last screen before money is named.
 *
 * Everything here is a client concern — the basket lives in the browser — so the
 * server resolves the language and steps out of the way. That is deliberate and
 * not laziness: a cart rendered on the server would need the basket sent to it
 * on every keystroke of a promo code.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Savat' };

export default async function CustomerCartPage() {
  return (
    <CartBoard
      lang={customerLang((await headers()).get('accept-language'), langCookie(await cookies()))}
    />
  );
}
