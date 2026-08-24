import { cookies, headers } from 'next/headers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { InstallPrompt } from '@/components/install-prompt';

import { CartProvider } from './cart-store';
import { fetchCustomerMenu, fetchCustomerVenues } from './customer-server';
import { customerLang, langCookie } from './customer-session';

import './customer.css';

/**
 * The customer app's own manifest.
 *
 * The platform's starts at `/dashboard` — the staff console — which is the
 * right answer for the product and the wrong one for a person who installed a
 * food-ordering app from their phone. Same icons, because there is no
 * per-tenant branding in this system yet; different name, and a start URL that
 * opens on the menu rather than a sign-in form.
 */
export const metadata: Metadata = {
  manifest: '/manifest-customer.json',
};

/**
 * The customer app's shell.
 *
 * A phone-width column on a field, and nothing else — no bezel. `FOUNDATIONS §9`
 * puts the breakpoint at 560 and calls everything under it full-bleed, so a
 * device frame here would be a demo artefact shipped as a product, drawn around
 * content that is already on a device.
 *
 * On a wide screen the column centres on `--page`, which is a role rather than a
 * colour: in light it matches `--bg-muted`, in dark it goes deliberately darker
 * than `--bg-subtle` so the column reads as a card floating on a field rather
 * than a panel welded to the background.
 *
 * `data-acc` seeds the restaurant's accent. It is a value the restaurant picks,
 * not one derived from its id — `FOUNDATIONS §1.4` — so two venues of one chain
 * may differ and a rebrand is a single setting.
 */
export default async function CustomerLayout({ children }: { children: ReactNode }) {
  /*
   * The catalogue is fetched HERE, not on the screens that draw it.
   *
   * Because the basket outlives any one of them. A line stores a dish id, and
   * which catalogue that id belongs to is what decides whether the basket can
   * be ordered — so the cart, the checkout and the tracking screen all have to
   * resolve against the same one the menu screen was drawn from. Fetched per
   * screen, a guest could add a dish from a live menu and then open a cart that
   * resolved it against fixtures.
   *
   * Both calls are `cache()`d, so the menu screen below asks for nothing extra.
   *
   * The language is resolved exactly as the screens resolve it — header plus
   * cookie, in that order — and that is not cosmetic: `cache()` keys on its
   * arguments, so a layout asking for `uz` while the menu screen asks for `ru`
   * would fetch the catalogue twice per render and hand the basket a different
   * one from the one the guest is reading.
   *
   * `?lang=` is the third input and a layout cannot see it — there are no
   * `searchParams` here. A guest who switches language mid-session gets the
   * cookie on the next request, which is what the switcher writes.
   */
  const lang = customerLang((await headers()).get('accept-language'), langCookie(await cookies()));
  const [menu, venues] = await Promise.all([fetchCustomerMenu(lang), fetchCustomerVenues(lang)]);

  return (
    <div data-customer data-acc="a0" className="bg-page text-fg min-h-dvh">
      {/*
       * The theme, written before the first paint.
       *
       * The profile's appearance switch stores a choice in `localStorage`, and
       * `localStorage` cannot be read on the server — so without this the app
       * paints its light palette and then flips to dark a frame later, which on
       * a phone at a dinner table is a flash of white in somebody's face. Four
       * lines inline, no dependencies, and it runs before the body renders.
       *
       * `dangerouslySetInnerHTML` because that is the only way to emit a script
       * body in JSX; the string is a literal with nothing interpolated into it.
       */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{var t=localStorage.getItem('srcp.customer.theme');" +
            "if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}",
        }}
      />

      {/*
       * `100dvh`, never `100vh`. Mobile Safari measures `vh` against the viewport
       * with the address bar hidden, so a dock pinned to `100vh` sits underneath
       * that bar for the whole first scroll — and the dock is the control this
       * app is navigated by.
       */}
      {/*
       * The basket wraps the whole surface, not the cart screen.
       *
       * A guest adds a dish on the menu, opens the order tab, comes back — and
       * the basket has to survive all of it. Held at the screen that owns it, the
       * first navigation would empty it, which is the one thing a shopping app
       * cannot do.
       */}
      <CartProvider menu={menu} venues={venues}>
        <div className="mx-auto flex min-h-dvh w-full max-w-[var(--phone-measure)] flex-col">
          {children}
        </div>
      </CartProvider>

      {/*
        The ask, after three minutes of actually using the app.

        A guest who has scrolled a menu and put something in a basket has a
        reason to keep it; one who has just arrived does not, and asking then is
        how people learned to dismiss these unread. On iOS the component draws
        the Share → Add to Home Screen steps, because Safari fires no event and
        shows no banner — `Sayt va PWA.dc.html` names that as this channel's
        first limitation.
      */}
      <InstallPrompt surface="customer" lang="uz" delayMs={180_000} />
    </div>
  );
}
