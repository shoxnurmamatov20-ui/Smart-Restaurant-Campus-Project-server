import { cookies, headers } from 'next/headers';
import { Suspense } from 'react';

import { customerLang, langCookie } from '../../customer-session';
import { TrackBoard } from './track-board';

/**
 * Where the order is now.
 *
 * The one screen a guest reopens rather than visits — between paying and eating
 * they will look at it four or five times — so it answers the only two questions
 * they have above the fold: how far along, and when.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Buyurtma holati' };

export default async function CustomerOrderPage() {
  const lang = customerLang((await headers()).get('accept-language'), langCookie(await cookies()));

  /*
   * The boundary is `useSearchParams()`'s price, and it is worth paying.
   *
   * The screen reads `?n=` — the bill number, which is the only thing that
   * survives a payment provider's redirect onto a fresh page load. Next refuses
   * to prerender a tree that reads search params without a Suspense boundary
   * above it, and the fallback is null rather than a skeleton because this page
   * is `force-dynamic`: the boundary is never actually shown.
   */
  return (
    <Suspense fallback={null}>
      <TrackBoard lang={lang} />
    </Suspense>
  );
}
