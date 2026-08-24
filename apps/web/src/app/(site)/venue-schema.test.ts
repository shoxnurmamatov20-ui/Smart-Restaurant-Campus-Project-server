import { describe, expect, it } from 'vitest';

import type { GuestMenu } from '@restaurant/surfaces/guest/menu-data';
import { asScriptJson, breadcrumbs, menuGraph, venueGraph } from './venue-schema';
import { BRANCHES, VENUE } from './venue-data';

/**
 * The markup a search result is built from.
 *
 * Untested, this is the worst kind of code: it is invisible on the page, so
 * nobody notices it is wrong, and it is the thing a crawler believes. Malformed
 * structured data does not degrade — Google drops the rich result entirely, so a
 * restaurant that thought it had published its hours has published nothing.
 *
 * And one of these tests is not about SEO at all. `asScriptJson` is the boundary
 * between an API-supplied restaurant name and a `<script>` element on a page
 * served to anonymous readers; getting it wrong is stored cross-site scripting.
 */
const BASE = 'https://oshxona.uz';

describe('asScriptJson — the escaping that stops a name closing the block', () => {
  it('never emits the characters that end a script element', () => {
    /*
     * The attack, spelled out: a restaurant registers under this name, the
     * page renders it inside `<script type="application/ld+json">`, and the
     * HTML parser sees `</script>` inside the string and stops. Everything
     * after it is markup — on a public page, for every visitor.
     *
     * `JSON.stringify` alone does NOT prevent this: `</script>` is six
     * perfectly ordinary characters as far as JSON is concerned.
     */
    const hostile = { name: 'Osh</script><script>alert(1)</script>' };
    const emitted = asScriptJson(hostile);

    expect(emitted).not.toContain('</script>');
    expect(emitted).not.toContain('<');
    expect(emitted).not.toContain('>');
  });

  it('still parses back to exactly what went in', () => {
    // Escaping that changed the value would be a fix that broke the feature.
    const value = { name: 'Osh & Xona <plov>', note: 'a\u2028b' };

    expect(JSON.parse(asScriptJson(value))).toEqual(value);
  });

  it('escapes the separators a JavaScript parser reads as newlines', () => {
    // U+2028 is a space to JSON and a line break to a script parser — the one
    // difference that turns valid JSON into a syntax error inside a page.
    expect(asScriptJson({ a: '\u2028' })).toContain('\\u2028');
    expect(asScriptJson({ a: '\u2029' })).toContain('\\u2029');
  });
});

describe('venueGraph — the restaurant, as a crawler reads it', () => {
  const graph = venueGraph({
    base: BASE,
    restaurant: 'osh-xona',
    name: 'Osh Xona',
    locale: 'uz',
    description: 'Qazili Toshkent oshi',
  }) as { '@context': string; '@graph': Record<string, unknown>[] };

  it('is valid JSON-LD with a context', () => {
    expect(graph['@context']).toBe('https://schema.org');
    expect(Array.isArray(graph['@graph'])).toBe(true);
  });

  it('describes one restaurant per physical branch, not one averaged one', () => {
    /*
     * A chain is not one restaurant. Hours, telephone and address differ per
     * branch, and a single node averaging five is a node that is wrong about
     * all five — including "is it open now", which is the question the rich
     * result exists to answer.
     */
    const venues = graph['@graph'].filter((node) => node['@type'] === 'Restaurant');

    expect(venues).toHaveLength(BRANCHES.length);
  });

  it('gives every branch an address, a telephone and its own hours', () => {
    for (const node of graph['@graph'].filter((n) => n['@type'] === 'Restaurant')) {
      expect(node.telephone).toMatch(/^\+/);
      expect((node.address as { streetAddress: string }).streetAddress).not.toBe('');
      expect((node.openingHoursSpecification as { opens: string }).opens).toMatch(/^\d\d:\d\d$/);
    }
  });

  it('points a crawler at the menu and the booking form', () => {
    const first = graph['@graph'].find((node) => node['@type'] === 'Restaurant');

    // These two are what turn a result into a booking. Absolute URLs, because
    // schema.org will not resolve a path.
    expect(first?.hasMenu).toBe(`${BASE}/r/osh-xona/menu`);
    expect(first?.acceptsReservations).toBe(`${BASE}/r/osh-xona/book`);
  });

  it('carries the rating the page already shows', () => {
    const brand = graph['@graph'].find((node) => node['@type'] === 'Organization');
    const rating = brand?.aggregateRating as { ratingValue: string; reviewCount: number };

    // Markup that disagreed with the page is the one thing Google penalises
    // outright, so both read the same constant.
    expect(rating.ratingValue).toBe(VENUE.rating);
    expect(rating.reviewCount).toBe(VENUE.ratingCount);
  });

  it('links every branch back to one brand', () => {
    const brandId = graph['@graph'].find((node) => node['@type'] === 'Organization')?.['@id'];

    for (const node of graph['@graph'].filter((n) => n['@type'] === 'Restaurant')) {
      expect((node.parentOrganization as { '@id': string })['@id']).toBe(brandId);
    }
  });
});

describe('menuGraph — the food, priced', () => {
  const menu: GuestMenu = {
    restaurant: { name: 'Osh Xona', slug: 'osh-xona' },
    live: true,
    categories: [
      {
        id: 'c1',
        name: 'Oshlar',
        dishes: [
          {
            id: 'd1',
            name: 'Osh',
            description: 'Qazili',
            price: 4_500_000,
            weightGrams: 350,
            calories: null,
            allergens: [],
            vegetarian: false,
            spicy: false,
            imageUrl: null,
            image: null,
            soldOut: false,
            categoryId: 'c1',
          },
        ],
      },
      { id: 'c2', name: 'Bo‘sh', dishes: [] },
    ],
  };

  const graph = menuGraph({ base: BASE, restaurant: 'osh-xona', name: 'Osh Xona', menu }) as {
    hasMenuSection: {
      name: string;
      hasMenuItem: { name: string; offers: Record<string, string> }[];
    }[];
  };

  it('prices every dish in so’m, not tiyin', () => {
    /*
     * The one conversion on this page, and the one that would be wrong by a
     * factor of a hundred if it were missed. Everything inside the platform is
     * tiyin so no rounding error reaches a bill; schema.org wants what a person
     * pays.
     */
    const offer = graph.hasMenuSection[0]!.hasMenuItem[0]!.offers;

    expect(offer.price).toBe('45000');
    expect(offer.priceCurrency).toBe('UZS');
  });

  it('leaves out a section with nothing in it', () => {
    // An empty `MenuSection` is a heading a crawler reports as a category the
    // restaurant serves nothing from.
    expect(graph.hasMenuSection).toHaveLength(1);
    expect(graph.hasMenuSection[0]!.name).toBe('Oshlar');
  });

  it('names the photograph when there is one, and no property when there is not', () => {
    /*
     * `image` is the largest address the platform holds, because a crawler
     * picks its own rendition from it. And it is absent — not null — on a dish
     * without one: an `image: null` is a wrong value on every dish of a menu
     * nobody has photographed yet.
     */
    const first = menu.categories[0]!.dishes[0]!;
    const photographed: GuestMenu = {
      ...menu,
      categories: [
        {
          id: 'c1',
          name: 'Oshlar',
          dishes: [{ ...first, imageUrl: 'https://cdn.example/osh-full.webp' }],
        },
      ],
    };

    const withPhoto = menuGraph({
      base: BASE,
      restaurant: 'osh-xona',
      name: 'Osh Xona',
      menu: photographed,
    }) as { hasMenuSection: { hasMenuItem: Record<string, unknown>[] }[] };

    expect(withPhoto.hasMenuSection[0]!.hasMenuItem[0]!.image).toBe(
      'https://cdn.example/osh-full.webp',
    );
    expect(graph.hasMenuSection[0]!.hasMenuItem[0]).not.toHaveProperty('image');
  });
});

describe('breadcrumbs', () => {
  it('is one level on the home page and two below it', () => {
    const home = breadcrumbs(BASE, 'osh-xona', 'Osh Xona') as { itemListElement: unknown[] };
    const menu = breadcrumbs(BASE, 'osh-xona', 'Osh Xona', {
      label: 'Menyu',
      path: '/menu',
    }) as { itemListElement: { position: number; item: string }[] };

    expect(home.itemListElement).toHaveLength(1);
    expect(menu.itemListElement).toHaveLength(2);
    expect(menu.itemListElement[1]!.position).toBe(2);
    expect(menu.itemListElement[1]!.item).toBe(`${BASE}/r/osh-xona/menu`);
  });
});
