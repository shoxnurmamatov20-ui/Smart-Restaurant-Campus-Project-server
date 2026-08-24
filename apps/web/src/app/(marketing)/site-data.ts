import type { Messages } from '@/i18n';

/**
 * The public site's figures, ids and proper nouns.
 *
 * Everything here reads the same in Uzbek, Russian and English — a price, a
 * card number, a person's initials — so none of it belongs in a message
 * catalogue, where it would sit in three files at once waiting for two of them
 * to fall behind. The catalogue holds the prose, keyed by the ids below.
 *
 * The figures are the design's own. They are static on purpose: a marketing
 * page that queried the production database on every render would be both
 * slower and a small information leak.
 */

type Marketing = Messages['marketing'];

/**
 * Where Kirish goes — a route, not a section of this page.
 *
 * Every other destination in the header is an anchor into this document:
 * `#product`, `#roles`, `#pricing`, `#faq`, `#contact`. Sign-in is the one that
 * leaves, and following the pattern instead of the meaning is exactly what went
 * wrong: both Kirish links pointed at `#login`, which scrolls to the
 * illustration in the sign-in section — a card whose fields are uncontrolled
 * and whose button, at the time, did nothing whatever. The site's front door
 * led to a picture of a door, silently, and the report was "I cannot log in"
 * while every part of the login stack was working.
 *
 * Named here so the two call sites cannot disagree, and so
 * site-data.test.ts can check the route still exists on disk.
 */
export const SIGN_IN_HREF = '/login';

/*
 * `SITE_LANG_COOKIE` was here — `srcp.site.lang` — and it is gone.
 *
 * It was the public site's own memory of a language, kept separate from the
 * console's `restaurant-campus-locale` on the reasoning that a guest switching
 * the site to Russian is not the same act as a manager switching the console.
 * The reasoning was sound and the result was still a bug: two cookies for one
 * question, and a reader who crossed between the surfaces got whichever had
 * been written last. It was the second of four places this codebase decided
 * what language somebody was owed.
 *
 * There is one now and it is the first segment of the path. The console cookie
 * survives, doing the one job a cookie can still do here — saying which
 * language an *unprefixed* address should be redirected to.
 */

/**
 * The design's top-level navigation — `Sayt v2.dc.html:137-806`, one route per
 * `sc-if value="{{at.*}}"` block.
 *
 * Routes, not anchors. The header used to point at `#product`, `#roles`,
 * `#pricing` and `#faq`, which scrolled to a summary section of the home page;
 * the design gives each of them a page with several times as much on it, and
 * the summary sections stay on the home page as the teasers they are.
 */
export const SITE_NAV: readonly {
  key: 'product' | 'roles' | 'pricing' | 'customers' | 'faq' | 'contact';
  href: string;
}[] = [
  { key: 'product', href: '/product' },
  { key: 'roles', href: '/roles' },
  { key: 'pricing', href: '/pricing' },
  { key: 'customers', href: '/customers' },
  { key: 'faq', href: '/faq' },
  /*
   * Aloqa is a nav item as well as a button — `dc.html:1043-1045` lists six.
   *
   * The header carried five and reached contact only through the blue "Demo
   * so'rash" button on the right, which is a different promise: a reader who
   * wants to ask one question before booking a demo had no link to press, and
   * the two are the same page.
   */
  { key: 'contact', href: '/contact' },
];

/**
 * The four figures under the hero — what the product IS, not who bought it.
 *
 * They were sales figures: 42 restaurants running, 118 branches connected,
 * 99.98% uptime, 142 ms response. The first two were invented for a platform
 * with no customers yet, and the last two were hard-coded numbers presented as
 * measurements — nothing on this site was measuring either.
 *
 * What replaced them is checkable by anybody, including a reader: the console
 * draws 24 sections (`lib/roles.ts` and the design file both), the API is
 * fourteen modules, the product speaks three languages end to end, and the till
 * runs in four modes. Each is a fact about the software rather than a claim
 * about the world, which is the only kind of figure this page may carry until
 * there are real ones to print.
 */
export const STATS: readonly { key: string; value: string }[] = [
  { key: 'sections', value: '24' },
  { key: 'modules', value: '14' },
  { key: 'languages', value: '3' },
  { key: 'modes', value: '4' },
];

/*
 * Four lists that used to be here, all retired in the same pass — the home
 * page's summaries of `/product`, `/roles`, `/pricing`'s plan bullets, the FAQ
 * and the three sign-in doors.
 *
 * `Sayt v2.dc.html:137-341` is five sections long: hero, what changes, devices,
 * compliance, customers. The summaries were built when those six routes did not
 * exist and the header scrolled instead of navigating, and each one was a
 * second copy of a page's numbers with only one of the two maintained — which
 * is precisely how the roles summary came to claim eight roles above a list of
 * seven while the product had nine.
 *
 * Every one of them now has exactly one source: `pages-data.ts` for structure
 * and `pages-copy.ts` for prose, both read out of the design file in one pass.
 */

export type Plan = {
  key: keyof Marketing['pricing']['plans'];
  /** The plan's own name — a brand, not a translation. */
  name: string;
  /**
   * Monthly price in tiyin, or null when it is negotiated.
   *
   * An integer rather than a formatted string so the grouping follows the
   * reader's language, and because money is tiyin everywhere else on this
   * platform — a price typed out as "2 400 000" is a price nobody can compute
   * with.
   */
  priceTiyin: number | null;
  highlighted: boolean;
};

export const PLANS: readonly Plan[] = [
  { key: 'start', name: 'Start', priceTiyin: 15_000_000, highlighted: false },
  { key: 'growth', name: 'Growth', priceTiyin: 39_000_000, highlighted: true },
  { key: 'enterprise', name: 'Enterprise', priceTiyin: null, highlighted: false },
];

/**
 * The three scenario cards on the home page — an order, not people.
 *
 * They carried a name and two initials each: `Rustam Kamolov`, `Kamola
 * Yusupova`, `Shahzod Ergashev`, presented as customers of a platform that has
 * none yet. The cards stay, because the situations in them are the ones the
 * system is built around; the invented people do not, and the role is what the
 * card is attributed to now (see `pages-copy.ts` → `quotes[].role`).
 *
 * `key` is what remains: it lines the card up with its words in the copy
 * catalogue and gives React a stable one.
 */
export const QUOTES: readonly {
  key: keyof Marketing['quotes']['items'];
}[] = [{ key: 'rustam' }, { key: 'kamola' }, { key: 'shahzod' }];

/**
 * The dashboard still in the hero.
 *
 * Bar heights are in px, straight from the design — a percentage would resolve
 * against a parent with no resolved height and collapse the chart to nothing.
 */
export const MOCK_BARS = [28, 33, 30, 38, 36, 43, 47, 44, 53, 56, 61, 74] as const;
