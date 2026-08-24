import { copyFor, fill, type GuestLocaleOf } from './locale-bridge';
import { BRANCHES, SOCIALS, VENUE, type VenueBranch } from './venue-data';

import { StoreBadges } from '@/components/store-badges';
import { readAppManifest } from '../(marketing)/download/download-server';

/**
 * The foot of the page, and the last thing a search engine reads.
 *
 * Addresses and hours in text rather than in the hero image, because this is
 * the page a stranger finds by searching for a restaurant by name and the two
 * questions they arrive with are "where" and "when". An image cannot answer
 * either to a crawler, a screen reader, or somebody with images switched off on
 * a train.
 *
 * Built to `files/Osh Xona - Restoran sayti.dc.html:645-676`: a 1.4fr brand
 * column carrying the monogram, the sentence and three social links, then three
 * equal columns of plain rows. It had been four equal columns of links, which
 * lost the monogram, the socials, the email and the Telegram handle, and put
 * navigation under headings the design fills with content — a "Branches" column
 * that lists branches, not a link to a page that lists them.
 */
export function SiteFooter({
  locale,
  name,
  categories = [],
  branches = BRANCHES,
  phone = VENUE.phone,
  telegram = VENUE.telegram,
}: {
  locale: GuestLocaleOf;
  name: string;
  /**
   * This restaurant's own branches and contacts, or the fixture's.
   *
   * The footer read `BRANCHES`, `VENUE.phone` and `VENUE.telegram` directly, so
   * every live restaurant published the demo's five venues, its number and its
   * Telegram handle at the bottom of every page of its own website. The
   * defaults keep the marketing/demo render as drawn; a live route passes the
   * venue's own, and a field the restaurant has not filled in is `null` and is
   * not drawn at all.
   */
  branches?: readonly VenueBranch[];
  phone?: string | null;
  telegram?: string | null;
  /**
   * The menu's own headings, when the caller has them.
   *
   * The design's middle column is the category list, not a link list. A page
   * that has not loaded the menu passes nothing and the column is dropped
   * rather than drawn as a heading over air.
   */
  categories?: readonly string[];
}) {
  const t = copyFor(locale).site;
  const flagship = branches[0] ?? null;
  // Read here rather than passed in: this footer sits on five routes and
  // every one of them would otherwise have to remember to read it.
  const apkHref = readAppManifest()?.url ?? null;

  const columns: { key: string; head: string; rows: readonly React.ReactNode[] }[] = [
    {
      key: 'branches',
      head: t.footer.branches,
      rows: branches.map((branch) =>
        branch.opens === null || branch.closes === null
          ? branch.name
          : `${branch.name} · ${branch.opens} – ${branch.closes}`,
      ),
    },
    ...(categories.length > 0 ? [{ key: 'menu', head: t.footer.menu, rows: categories }] : []),
    {
      key: 'contact',
      head: t.footer.contact,
      /* Every row is dropped when the restaurant has not published it. A
         missing contact line is honest; the demo's number under somebody
         else's name is a stranger's phone ringing at dinner time. */
      rows: [
        phone === null ? null : (
          <a key="tel" href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="font-semibold">
            {phone}
          </a>
        ),
        telegram === null ? null : (
          <a key="tg" href={`https://${telegram}`} rel="noreferrer">
            {telegram}
          </a>
        ),
        flagship === null || flagship.opens === null || flagship.closes === null
          ? null
          : fill(t.footer.hours, { from: flagship.opens, to: flagship.closes }),
      ].filter((row) => row !== null),
    },
  ];

  return (
    <footer className="border-border bg-surface border-t">
      <div
        data-foot
        className="site-wrap grid gap-8 py-11 sm:grid-cols-2 lg:[grid-template-columns:1.4fr_1fr_1fr_1fr]"
      >
        <div>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="bg-acc font-display grid size-[34px] place-items-center rounded-[10px] text-xs font-extrabold text-white"
            >
              {VENUE.monogram}
            </span>
            <span className="font-display text-base font-bold tracking-tight">{name}</span>
          </div>

          <p className="text-fg-muted mt-3.5 max-w-[40ch] text-sm leading-relaxed">
            {t.footer.about}
          </p>

          {/* The two badges under the blurb, where every restaurant site puts
              them. One Android app carries this restaurant's ordering and the
              table QR; iPhone installs from the site. Both notes say so. */}
          <div className="mt-5">
            <p className="text-fg-subtle mb-2.5 text-[11px] font-semibold tracking-[.06em] uppercase">
              {t.footer.app}
            </p>
            <StoreBadges
              copy={{
                appleOver: t.footer.appleOver,
                apple: t.footer.apple,
                appleNote: t.footer.appleNote,
                googleOver: t.footer.googleOver,
                google: t.footer.google,
                googleNote: t.footer.googleNote,
                googleNone: t.footer.googleNone,
              }}
              apkHref={apkHref}
            />
          </div>

          <ul className="mt-4 flex gap-2.5">
            {SOCIALS.map((social) => (
              <li key={social.id}>
                <a
                  href={social.href}
                  rel="noreferrer"
                  aria-label={social.label}
                  title={social.label}
                  className="border-border text-fg-muted grid size-[38px] place-items-center rounded-md border"
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d={social.icon} />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {columns.map((column) => (
          <div key={column.key}>
            <h2 className="text-2xs tracking-caps text-fg-subtle font-semibold uppercase">
              {column.head}
            </h2>
            <ul data-num className="text-fg-muted mt-3.5 grid gap-2.5 text-sm leading-snug">
              {column.rows.map((row, index) => (
                <li key={index}>{row}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="site-wrap border-divider text-fg-subtle flex flex-wrap items-center justify-between gap-4 border-t py-5.5 text-[13px]">
        {/*
         * The year is the venue's founding year and the current one, and the
         * current one is read at render. This page is `force-dynamic`, so it is
         * right on the first of January without a deploy — a static build would
         * have carried last year's notice until somebody noticed.
         */}
        <p data-num>{fill(t.footer.rights, { year: new Date().getFullYear(), name })}</p>
        <p>{t.footer.powered}</p>
      </div>
    </footer>
  );
}
