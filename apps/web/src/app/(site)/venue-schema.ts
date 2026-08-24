import type { GuestDish, GuestMenu } from '@restaurant/surfaces/guest/menu-data';
import { BRANCHES, say, VENUE, type SiteLocale, type VenueBranch } from './venue-data';

/**
 * What a search engine is told about this restaurant.
 *
 * The single highest-value thing on a restaurant's website and the one most
 * often left off. Without it a result is a blue link; with it Google shows the
 * hours, the rating, the price band and a menu link in the result itself — and
 * on a phone, that block IS the decision. The same markup is what puts a venue
 * into Maps, into the assistant answering "is Osh Xona open", and into the rich
 * result a competitor without it cannot get.
 *
 * ---------------------------------------------------------------------------
 * Why an `@graph` rather than one object
 *
 * A chain is not one restaurant. Google's own guidance is one `Restaurant` node
 * per physical location, because opening hours, telephone and address differ
 * per branch — and a single node averaging five branches is a node that is
 * wrong about all five. So: one `Organization` for the brand, one `Restaurant`
 * per branch, linked. A crawler that only understands the first still gets a
 * valid restaurant.
 *
 * ---------------------------------------------------------------------------
 * Escaping, which is not optional here
 *
 * The restaurant's name arrives from the API, and this markup is injected into
 * a `<script>` element. `JSON.stringify` escapes quotes but not the sequence
 * `</script>` — a venue named `x</script><script>…` would close the block and
 * run whatever followed, on a page served to strangers. {@link asScriptJson}
 * is what stops that, and every caller must use it rather than stringifying.
 */

/** A restaurant's own page URL, absolute — schema.org will not take a path. */
function pageUrl(base: string, restaurant: string, path = ''): string {
  return new URL(`/r/${encodeURIComponent(restaurant)}${path}`, base).toString();
}

/**
 * Opening hours in the shape schema.org reads them.
 *
 * Every day the same, because the five branches keep one schedule per branch
 * rather than a weekday/weekend split. Written as one specification covering
 * all seven days instead of seven identical ones — both are valid and this is
 * the one a person can read in the page source.
 */
function hoursFor(opens: string | null, closes: string | null) {
  // Nothing rather than a guess. A restaurant that has not published its hours
  // must not be marked up as open at nine — this block is what a search result
  // prints under the name, and being told a place is open when it is shut is
  // the one error a guest makes a journey for.
  if (opens === null || closes === null) return undefined;

  return {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens,
    closes,
  };
}

/**
 * The brand and its branches.
 *
 * `priceRange` is a band rather than a figure — schema.org expects `$$`-style
 * notation or a currency range, and a restaurant that published an exact price
 * here would be publishing a number that changes weekly.
 */
export function venueGraph({
  base,
  restaurant,
  name,
  locale,
  description,
  branches = BRANCHES,
  live = false,
}: {
  base: string;
  restaurant: string;
  name: string;
  locale: SiteLocale;
  description: string;
  /**
   * The venue's own branches, or the fixture when the caller has none.
   *
   * This used to read `BRANCHES` unconditionally, so every real restaurant on
   * the platform published the demo's five Tashkent addresses and telephone
   * numbers as its own structured data — the one output on this platform that
   * search engines read and repeat.
   */
  branches?: readonly VenueBranch[];
  /**
   * Whether this is a real venue.
   *
   * Live drops the rating block. `VENUE.rating` is `4.9` over 1 240 reviews and
   * nothing on `GET /public/site` carries a real one; publishing an invented
   * `aggregateRating` is what Google penalises a site for, and it is a claim
   * about a business made on that business's behalf.
   */
  live?: boolean;
}): object {
  const home = pageUrl(base, restaurant);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${home}#brand`,
        name,
        url: home,
        description,
        ...(live
          ? {}
          : {
              foundingDate: String(VENUE.since),
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: VENUE.rating,
                reviewCount: VENUE.ratingCount,
                bestRating: '5',
                worstRating: '1',
              },
            }),
      },

      ...branches.map((branch) => ({
        '@type': 'Restaurant',
        '@id': `${home}#${branch.id}`,
        name: `${name} — ${branch.name}`,
        parentOrganization: { '@id': `${home}#brand` },
        url: home,
        // Omitted rather than filled in from the demo — see `VenueBranch.phone`.
        ...(branch.phone === null ? {} : { telephone: branch.phone }),
        address: {
          '@type': 'PostalAddress',
          streetAddress: say(branch.address, locale),
          addressLocality: branch.name,
          addressCountry: 'UZ',
        },
        ...(hoursFor(branch.opens, branch.closes) === undefined
          ? {}
          : { openingHoursSpecification: hoursFor(branch.opens, branch.closes) }),
        /*
         * Named in the venue's own terms rather than a generic "Asian".
         *
         * This is the field a search for "plov near me" matches against, and
         * the cuisine a restaurant actually serves is the one worth saying.
         */
        servesCuisine: ['Uzbek', 'Central Asian'],
        priceRange: '$$',
        currenciesAccepted: 'UZS',
        paymentAccepted: 'Cash, Credit Card, Uzcard, Humo, Click, Payme',
        acceptsReservations: pageUrl(base, restaurant, '/book'),
        hasMenu: pageUrl(base, restaurant, '/menu'),
      })),
    ],
  };
}

/**
 * The menu itself, section by section, with a price on every dish.
 *
 * The reason this is worth emitting separately from the restaurant node: a
 * `Menu` with priced `MenuItem`s is what lets a result answer "how much is
 * plov at Osh Xona" without anybody clicking, and what feeds the menu panel in
 * Maps. It is also the only structured description of a restaurant's food that
 * survives the page being redesigned.
 *
 * Built from the live catalogue — `GET /api/v1/public/menu` — so it lists
 * exactly what is for sale. A dish 86'd this morning is absent from both the
 * page and this markup, which is the correct answer to a crawler asking what
 * the kitchen serves.
 */
export function menuGraph({
  base,
  restaurant,
  name,
  menu,
}: {
  base: string;
  restaurant: string;
  name: string;
  menu: GuestMenu;
}): object {
  const url = pageUrl(base, restaurant, '/menu');

  const priced = (dish: GuestDish) => ({
    '@type': 'MenuItem',
    name: dish.name,
    ...(dish.description === '' ? {} : { description: dish.description }),
    /*
     * The largest file, deliberately. `MenuItem.image` is what a result
     * thumbnail and the Maps menu panel are drawn from, and a crawler picks
     * its own rendition — a 160px `thumb` here would be the picture Google
     * kept. Absent rather than null when there is none: an empty `image` is
     * a property with a wrong value, which is a warning on every dish.
     */
    ...(dish.imageUrl === null ? {} : { image: dish.imageUrl }),
    ...(dish.vegetarian ? { suitableForDiet: 'https://schema.org/VegetarianDiet' } : {}),
    offers: {
      '@type': 'Offer',
      /*
       * So'm, not tiyin.
       *
       * Everything inside this platform is tiyin — integers, no float, so a
       * rounding error cannot reach a bill. Schema.org wants the amount a
       * human pays, in the currency's own unit, so the conversion happens
       * here at the last possible moment and exactly once.
       */
      price: String(Math.round(dish.price / 100)),
      priceCurrency: 'UZS',
    },
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    '@id': `${url}#menu`,
    name: `${name} — menu`,
    url,
    inLanguage: ['uz', 'ru', 'en'],
    hasMenuSection: menu.categories
      .filter((category) => category.dishes.length > 0)
      .map((category) => ({
        '@type': 'MenuSection',
        name: category.name,
        hasMenuItem: category.dishes.map(priced),
      })),
  };
}

/**
 * A trail, for the line of links under a search result.
 *
 * Two levels is all this site has, and that is the point of emitting it: a
 * result reading "oshxona.uz › Menyu" tells a reader where they are about to
 * land, and a result with a bare URL does not.
 */
export function breadcrumbs(
  base: string,
  restaurant: string,
  name: string,
  leaf?: { label: string; path: string },
): object {
  const home = pageUrl(base, restaurant);

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name, item: home },
      ...(leaf === undefined
        ? []
        : [
            {
              '@type': 'ListItem',
              position: 2,
              name: leaf.label,
              item: pageUrl(base, restaurant, leaf.path),
            },
          ]),
    ],
  };
}

/**
 * JSON safe to put inside a `<script>` element.
 *
 * `JSON.stringify` escapes what JSON needs and nothing more — it will happily
 * emit the six characters `</script>` inside a string, which the HTML parser
 * reads as the end of the block whatever the JSON thinks. A restaurant named
 * `Osh</script><script>fetch(...)` would then run script on a page served to
 * anonymous readers, and the name comes from the API rather than from us.
 *
 * Escaping `<` as `\\u003c` is the standard fix and costs nothing: it is still
 * valid JSON and still the same string once parsed. `&` and the two line
 * separators go with it for the same family of reasons — `U+2028` is a literal
 * newline to a JavaScript parser and a space to JSON.
 */
export function asScriptJson(value: object): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
