import Link from 'next/link';

import { copyFor, fill, type GuestLocaleOf } from './locale-bridge';
import { HeaderCart } from './header-cart';
import { ThemeToggle } from './theme-toggle';
import { BRANCHES, VENUE } from './venue-data';

/**
 * The bar that follows a reader down a restaurant's website.
 *
 * A server component with no state, which is the whole reason it can be sticky
 * and cheap: the only interactive thing on it is the language switch, and that
 * is three links rather than a control, so the choice rides in the URL and
 * survives a reload. A `useState` here would have made the header a client
 * component and pulled the copy catalogue into the browser bundle for the sake
 * of three anchors.
 */
export function SiteHeader({
  restaurant,
  locale,
  name,
  phone = VENUE.phone,
}: {
  restaurant: string;
  locale: GuestLocaleOf;
  name: string;
  /**
   * This restaurant's own published number, or null when it has none.
   *
   * Defaulted to the fixture so the demo site still draws the design; every
   * live route passes `venue.phone`, which is `null` until the restaurant fills
   * its telephone in. The header used to print `VENUE.phone` unconditionally,
   * so a real venue published the demo's number in the most-tapped control on
   * its own website.
   */
  phone?: string | null;
}) {
  const t = copyFor(locale).site;
  const here = `/r/${encodeURIComponent(restaurant)}`;

  return (
    <header className="site-head">
      {/*
       * `gap-3` until there is room for the design's 4.
       *
       * At exactly 768 the link row appears (`md:flex`, the design's own 760)
       * and the bar then holds a brand, five links, three language buttons, a
       * theme toggle, a cart and a booking button — 779px of a 768px tablet, so
       * the page scrolled sideways by eleven. Five gaps at 16 is 80px; at 12 it
       * is 60, which is the eleven and then some.
       */}
      {/* `site-row` so the stylesheet can give it a second line on a narrow
          phone — see the note there. */}
      <div className="site-row site-wrap flex h-[68px] items-center gap-3 lg:gap-4">
        <Link href={`${here}?lang=${locale}`} className="flex min-w-0 items-center gap-2.5">
          {/*
           * The monogram, which is the restaurant's mark and the only branding
           * this header carries. It was missing, so the site's identity was a
           * line of text in the platform's own type — indistinguishable from
           * the next venue's.
           */}
          <span
            aria-hidden
            className="bg-acc font-display grid size-9 flex-none place-items-center rounded-[10px] text-sm font-bold text-white"
          >
            {name
              .split(' ')
              .slice(0, 2)
              .map((word) => word[0])
              .join('')}
          </span>

          <span className="min-w-0">
            <span className="font-display block truncate text-base font-semibold tracking-tight">
              {name}
            </span>
            <span className="text-fg-subtle block truncate text-xs">
              {fill(t.nav.tagline, { count: BRANCHES.length })}
            </span>
          </span>
        </Link>

        {/*
         * The design's five links, in its order: Home · Menu · Book · Track ·
         * About — `dc.html` NAVS at :897-903. The bar had four and two of them
         * were wrong: Home was missing entirely (the monogram was the only way
         * back), and Branches had been added, which is a section of the home
         * page rather than one of the five places this site goes.
         */}
        <nav
          aria-label={t.nav.home}
          className="ml-auto hidden items-center gap-4 min-[761px]:flex min-[1181px]:gap-5"
        >
          {(
            [
              ['', t.nav.home],
              ['/menu', t.nav.menu],
              ['/book', t.nav.book],
              ['/track', t.nav.track],
              ['/about', t.nav.about],
            ] as const
          ).map(([path, label]) => (
            <Link
              key={label}
              href={`${here}${path}?lang=${locale}`}
              className="text-sm font-semibold"
            >
              {label}
            </Link>
          ))}

          {/*
           * The phone number, click-to-call.
           *
           * The design puts it in the header and it is the most-used control on
           * a restaurant site in this market: a guest who wants a table at
           * seven tonight rings rather than fills a form, and burying the
           * number in the footer costs the booking.
           */}
          {phone === null ? null : (
            <a
              href={`tel:${phone.replace(/[^+\d]/g, '')}`}
              data-num
              data-press
              className="text-acc hidden text-sm font-semibold min-[1181px]:block"
            >
              {phone}
            </a>
          )}
        </nav>

        {/*
         * Three links, not a dropdown.
         *
         * A reader who wants Russian on an Uzbek site should not have to find a
         * menu — and there is no session to store the choice in, so it rides in
         * the URL where a reload and a shared link both keep it.
         */}
        <nav aria-label="til" className="ml-auto flex flex-none gap-1 md:ml-0">
          {(['uz', 'ru', 'en'] as const).map((code) => (
            <Link
              key={code}
              href={`${here}?lang=${code}`}
              aria-current={code === locale}
              /* 44×44, which is the floor FOUNDATIONS puts on this surface —
                 it read 40 here, which is the number that looks like it obeys
                 the rule. A language switch on a phone is pressed with a thumb,
                 at the very edge of the screen, one-handed. */
              className={`text-2xs grid size-11 place-items-center rounded-md font-bold ${
                code === locale ? 'bg-fg text-surface' : 'text-fg-muted'
              }`}
            >
              {code.toUpperCase()}
            </Link>
          ))}

          {/*
           * Day and night — `dc.html:122-124`, in the same group as the
           * language switch and on the always-visible side of the bar.
           *
           * The design hides the link row below 760px and keeps this group, so
           * the toggle belongs here: a phone in a dark room is the device this
           * control exists for.
           */}
          <span aria-hidden className="bg-divider mx-0.5 h-5 w-px self-center" />
          <ThemeToggle label={t.nav.theme} />
        </nav>

        <HeaderCart
          restaurant={restaurant}
          href={`${here}/cart?lang=${locale}`}
          label={t.nav.cart}
        />

        <Link
          href={`${here}/book?lang=${locale}`}
          className="bg-acc hidden h-10 place-items-center rounded-md px-4 text-sm font-semibold text-white sm:grid"
        >
          {t.nav.book}
        </Link>
      </div>
    </header>
  );
}
