import { redirect } from 'next/navigation';

/**
 * There is no self-serve sign-up, by design.
 *
 * In practice nobody reaches this component: middleware.ts forwards `/register`
 * at the edge, because a `redirect()` to a fragment costs a one-second meta
 * refresh. This file is the backstop and, more usefully, the explanation — the
 * middleware's table points here.
 *
 * The handoff draws one door into the product (§3.12) and it has three tabs,
 * none of which creates an account. A restaurant arrives through the site's
 * contact section: sales opens a trial, and the platform operator creates the
 * tenant in the admin console — which is why `apps/admin` has /trials and
 * /tenants/new and this app has no form for it.
 *
 * The route stays because it was linked and may be bookmarked, and because a
 * 404 tells someone nothing. It sends them where the design actually onboards
 * them rather than showing a page that promises a form in a later version.
 *
 * `POST /api/v1/auth/register` does exist on the server for that operator flow.
 * If self-serve sign-up is ever wanted, it needs a screen drawn first.
 */
export default function RegisterPage() {
  redirect('/#contact');
}
