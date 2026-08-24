import { redirect } from 'next/navigation';

/** A merchant opens on the queue. Nothing else is time-critical. */
export default function MerchantIndexPage() {
  redirect('/merchant/orders');
}
