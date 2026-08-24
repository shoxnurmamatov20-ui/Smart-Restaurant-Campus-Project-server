import { cookies, headers } from 'next/headers';

import { customerLang, langCookie } from '../../customer-session';
import { CUSTOMER_COOKIE } from '@/lib/customer-gateway';
import { LoyaltyBoard } from './loyalty-board';

/**
 * Points, tier and coupons.
 *
 * Everything on it is read-only, and that is the design rather than a shortcut:
 * the ledger awards points ten minutes after payment clears, and a client that
 * can write its own balance can write any balance.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sodiqlik' };

export default async function CustomerLoyaltyPage() {
  const jar = await cookies();

  return (
    <LoyaltyBoard
      lang={customerLang((await headers()).get('accept-language'), langCookie(jar))}
      /* A balance belongs to a person. Read here because the session cookie is
         httpOnly: the board cannot tell "not signed in" from "still asking",
         and it used to print the fixture's 2 480 points to both. */
      signedIn={jar.get(CUSTOMER_COOKIE) !== undefined}
    />
  );
}
