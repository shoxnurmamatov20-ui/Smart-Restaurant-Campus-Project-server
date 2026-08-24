import Link from 'next/link';

/**
 * The two black badges every restaurant site carries — App Store, Google Play —
 * and what each of them honestly does here.
 *
 * A restaurant owner sent a screenshot of a competitor's footer: two pills,
 * an apple and a play triangle, "Download on the App Store", "Get it on Google
 * Play". That is the shape people already know how to press, so it is the
 * shape this draws — and because the app is not in either store yet, the
 * second line under each badge says where the press actually goes, rather
 * than letting the badge imply a listing that does not exist.
 *
 *   Google Play → the APK, straight from this site (`/downloads/…`). The
 *                 badge is the store's shape; the file is ours. Disabled with a
 *                 reason while no build is published.
 *   App Store   → the iPhone install guide on `/download`. Apple allows no
 *                 install from a website, so an iPhone gets the web app from
 *                 Safari's Share sheet; the badge takes the person to the three
 *                 steps that do that.
 *
 * The marks are drawn, not downloaded: a plain apple silhouette and a play
 * triangle in SVG, the same way the design draws every other icon. Official
 * store artwork comes with usage terms that assume a listing.
 *
 * Used in four places — the marketing `/download` page, the marketing home,
 * a restaurant's own site footer (`/r/{slug}`) and the MyPOS home — so the
 * words come in as props from whichever copy table owns that surface, and the
 * component itself carries none.
 */

export type StoreBadgeCopy = {
  /** "Download on the" */
  appleOver: string;
  /** "App Store" */
  apple: string;
  /** What happens instead of a store: "iPhone'da veb-ilova sifatida" */
  appleNote: string;
  /** "GET IT ON" */
  googleOver: string;
  /** "Google Play" */
  google: string;
  /** "To'g'ridan-to'g'ri saytdan · Play Market'da hali yo'q" */
  googleNote: string;
  /** While no APK is published: "Hali nashr qilinmagan" */
  googleNone: string;
};

export function StoreBadges({
  copy,
  /** `/downloads/smart-restaurant-….apk`, or null while nothing is published. */
  apkHref,
  /** Where the App Store badge goes — the iPhone section of the download page. */
  iosHref = '/download#iphone',
  align = 'start',
}: {
  copy: StoreBadgeCopy;
  apkHref: string | null;
  iosHref?: string;
  align?: 'start' | 'center';
}) {
  return (
    <div
      data-badges
      className={`flex flex-wrap gap-3 ${align === 'center' ? 'justify-center' : ''}`}
    >
      <Badge
        href={iosHref}
        over={copy.appleOver}
        name={copy.apple}
        note={copy.appleNote}
        icon={<Apple />}
      />
      <Badge
        href={apkHref}
        download={apkHref !== null}
        over={copy.googleOver}
        name={copy.google}
        note={apkHref === null ? copy.googleNone : copy.googleNote}
        icon={<Play />}
      />
    </div>
  );
}

function Badge({
  href,
  download = false,
  over,
  name,
  note,
  icon,
}: {
  href: string | null;
  download?: boolean;
  over: string;
  name: string;
  note: string;
  icon: React.ReactNode;
}) {
  const face =
    'bg-n-900 text-n-0 flex h-[44px] w-[176px] items-center gap-2.5 rounded-[8px] border border-n-700 px-3 transition-colors';

  const body = (
    <>
      <span aria-hidden className="grid size-6 shrink-0 place-items-center">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className="text-[9px] font-medium tracking-[.04em] uppercase opacity-80">{over}</span>
        <span className="mt-[3px] text-[15px] leading-[1.1] font-semibold tracking-[-.01em] whitespace-nowrap">
          {name}
        </span>
      </span>
    </>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {href === null ? (
        /* Not a button that does nothing: a pill that says why. `aria-disabled`
           keeps it out of the tab order's promises, the opacity says it on
           screen, and the note below says it in words. */
        <span aria-disabled className={`${face} cursor-not-allowed opacity-50`}>
          {body}
        </span>
      ) : download ? (
        <a href={href} download className={`${face} hover:bg-n-800`}>
          {body}
        </a>
      ) : (
        <Link href={href} className={`${face} hover:bg-n-800`}>
          {body}
        </Link>
      )}
      <span className="text-fg-subtle max-w-[176px] text-[11px] leading-[1.4]">{note}</span>
    </div>
  );
}

/* An apple, as a silhouette: the bite is a circle subtracted by the even-odd
   rule, the leaf a separate lobe. Sixteen points, no brand asset. */
function Apple() {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" fill="currentColor" aria-hidden>
      <path d="M15.6 11.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.8 3-.8s1.8.8 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.2-2.6 0 0-2.4-.9-2.4-3.6zM13.3 4.9c.6-.8 1.1-1.9.9-3-.9.1-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z" />
    </svg>
  );
}

/* The play triangle, four-coloured like the store's — but as four flat
   triangles meeting at the centre, which is geometry rather than artwork. */
function Play() {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" aria-hidden>
      <path d="M2 1.5 11.5 11 2 20.5c-.3-.2-.5-.6-.5-1v-17c0-.4.2-.8.5-1z" fill="#00d7fe" />
      <path d="M2 1.5c.3-.2.7-.2 1.1 0L14.6 8 11.5 11 2 1.5z" fill="#00f076" />
      <path d="M14.6 8l3.9 2.2c.8.5.8 1.2 0 1.6L14.6 14 11.5 11 14.6 8z" fill="#ffc900" />
      <path d="M11.5 11l3.1 3L3.1 20.5c-.4.2-.8.2-1.1 0L11.5 11z" fill="#f63448" />
    </svg>
  );
}
