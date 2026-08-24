import { describe, expect, it } from 'vitest';

import { consumerFrom, dishFrom, historyFrom, storeFrom, trackingFrom } from './mp-server';

/**
 * The four joins the marketplace is wrong about silently.
 *
 * Everything else on these screens is a rendering decision somebody notices —
 * a chip in the wrong colour, a word in the wrong language. These four take a
 * payload the API is right about and produce a screen that looks perfectly
 * normal and is about something else:
 *
 *   `storeFrom` decides what a shop costs to order from and how far away it is.
 *   Wrong, a guest picks a restaurant on a delivery fee it does not charge.
 *
 *   `dishFrom` decides which chip a dish sits under and whether it is struck
 *   through. Wrong, the category filter empties the menu — which is exactly
 *   what happened when this read the dish's own title as its section.
 *
 *   `historyFrom` decides which of four states a past order shows as, and
 *   therefore whether the row offers a star strip.
 *
 *   `trackingFrom` decides which of five dots is lit on the screen somebody
 *   watches while they wait. Wrong, it says a courier is on the way when the
 *   restaurant has not accepted the order.
 *
 * Money is integer tiyin in every assertion, and the times are asserted exactly
 * rather than "roughly" — a stamp is what a person reasons about when they are
 * deciding whether to ring the restaurant.
 */

function apiStore(over: Partial<Parameters<typeof storeFrom>[0]> = {}) {
  return {
    slug: 'osh-xona',
    name: 'Osh Xona',
    kind: { uz: 'Milliy taomlar', ru: 'Национальная кухня', en: 'Uzbek food' },
    cuisine: 'osh',
    vertical: 'food',
    rating: 4.9,
    reviews_count: 1_240,
    delivery_fee_tiyin: 1_200_000,
    min_order_tiyin: 0,
    minutes_from: 25,
    minutes_to: 35,
    offer: null,
    offer_tone: null,
    is_open: true,
    initials: 'OX',
    tint: '#C2410C',
    logo_url: null,
    cover_url: null,
    distance_metres: null,
    ...over,
  };
}

function apiOrder(over: Partial<Parameters<typeof historyFrom>[0]> = {}) {
  return {
    number: 'MP-8421',
    state: 'cooking',
    rung: 'cooking',
    store: { slug: 'osh-xona', name: 'Osh Xona', initials: 'OX', tint: '#C2410C' },
    lines: [],
    subtotal_tiyin: 11_800_000,
    discount_tiyin: 0,
    service_fee_tiyin: 354_000,
    delivery_fee_tiyin: 1_200_000,
    total_tiyin: 13_354_000,
    pay_rail: 'click',
    address: 'Chilonzor 24',
    eta_at: null,
    eta_minutes: null,
    courier: null,
    can_cancel: false,
    can_rate: false,
    rating: null,
    stamps: {} as Record<string, string | null>,
    ...over,
  };
}

describe('storeFrom', () => {
  it('keeps every figure in tiyin and the rating as the API answered it', () => {
    const card = storeFrom(apiStore());

    expect(card.id).toBe('osh-xona');
    expect(card.deliveryFee).toBe(1_200_000);
    expect(card.rating).toBe(4.9);
    expect(card.reviews).toBe(1_240);
    expect(card.minutesFrom).toBe(25);
    expect(card.minutesTo).toBe(35);
  });

  it('answers zero distance rather than inventing one when nobody said where they are', () => {
    // A marketplace that guesses distances sends couriers to the wrong side of
    // the city. Zero renders as "0.0 km", which is visibly not an answer.
    expect(storeFrom(apiStore({ distance_metres: null })).distanceKm).toBe(0);
  });

  it('rounds metres to one decimal of a kilometre, the way the card prints it', () => {
    expect(storeFrom(apiStore({ distance_metres: 1_240 })).distanceKm).toBe(1.2);
    expect(storeFrom(apiStore({ distance_metres: 1_250 })).distanceKm).toBe(1.3);
  });

  it('omits the badge entirely when there is no offer', () => {
    // Present-but-empty is not the same thing: the card branches on the key,
    // and an empty object would draw a blank badge over the photograph.
    expect(storeFrom(apiStore()).offer).toBeUndefined();
    expect(storeFrom(apiStore()).offerTone).toBeUndefined();
  });

  it('falls back to initials it can derive rather than rendering nothing', () => {
    expect(storeFrom(apiStore({ initials: null })).initials).toBe('OS');
  });
});

describe('dishFrom', () => {
  const dish = (over = {}) => ({
    menu_item_id: 41,
    title: 'Osh',
    section: 'Asosiy',
    description: null,
    price_tiyin: 4_700_000,
    was_tiyin: 4_400_000,
    image_url: null,
    kind: 'food',
    sold_out: false,
    ...over,
  });

  it('groups by the section the API named, never by the dish itself', () => {
    /*
     * The bug this is here for: reading the title as the category gives every
     * dish its own chip, so the store screen's filter shows exactly one row.
     * It looks like a working filter until somebody uses it.
     */
    expect(dishFrom(dish()).category.uz).toBe('Asosiy');
    expect(dishFrom(dish()).name.uz).toBe('Osh');
  });

  it('falls back to the title only when the catalogue has no section', () => {
    expect(dishFrom(dish({ section: '' })).category.uz).toBe('Osh');
  });

  it('strikes the house price through only when the two differ', () => {
    expect(dishFrom(dish()).was).toBe(4_400_000);
    expect(dishFrom(dish({ was_tiyin: null })).was).toBeUndefined();
  });

  it('flags a dish the kitchen has run out of instead of dropping it', () => {
    // Drawn crossed out: a guest who never sees it concludes the restaurant
    // does not make it, and does not come back tomorrow.
    expect(dishFrom(dish({ sold_out: true })).soldOut).toBe(true);
    expect(dishFrom(dish()).soldOut).toBeUndefined();
  });

  it('carries the photograph as a size set, and null — not absent — without one', () => {
    /*
     * The board draws a 64px square and the browser should pick `thumb` for
     * it from the `srcset`, which it cannot do from `image_url` alone. Null
     * rather than undefined on a live dish without a photograph: undefined is
     * what marks a fixture dish.
     */
    const mapped = dishFrom(
      dish({
        image_url: 'https://cdn.example/osh-full.webp',
        image: {
          src: 'https://cdn.example/osh-full.webp',
          width: 1600,
          height: 1200,
          placeholder: 'data:image/webp;base64,AAAA',
          sizes: {
            thumb: { url: 'https://cdn.example/osh-thumb.webp', width: 160, height: 120 },
            card: { url: 'https://cdn.example/osh-card.webp', width: 640, height: 480 },
            full: { url: 'https://cdn.example/osh-full.webp', width: 1600, height: 1200 },
          },
        },
      }),
    );

    expect(mapped.image?.sizes.thumb?.url).toBe('https://cdn.example/osh-thumb.webp');
    expect(mapped.image?.srcSet).toContain('osh-thumb.webp 160w');
    expect(mapped.image?.placeholder).toBe('data:image/webp;base64,AAAA');
    expect(dishFrom(dish()).image).toBeNull();
  });
});

describe('historyFrom', () => {
  it('reads anything still moving as live', () => {
    for (const state of ['placed', 'accepted', 'cooking', 'ready', 'enroute']) {
      expect(historyFrom(apiOrder({ state })).state).toBe('live');
    }
  });

  it('separates a delivered order that can still be rated from one that cannot', () => {
    // The only difference between the two rows on screen is a strip of stars,
    // and it is the whole reason a customer opens this list.
    expect(historyFrom(apiOrder({ state: 'delivered', can_rate: true })).state).toBe('delivered');
    expect(historyFrom(apiOrder({ state: 'delivered', can_rate: false })).state).toBe('past');
  });

  it('shows a rejection as a cancellation, because that is what it is to the guest', () => {
    // The merchant's own screen tells the two apart — one counts against their
    // acceptance rate — and the person who ordered dinner only needs to know
    // it is not coming.
    expect(historyFrom(apiOrder({ state: 'cancelled' })).state).toBe('cancelled');
    expect(historyFrom(apiOrder({ state: 'rejected' })).state).toBe('cancelled');
  });
});

describe('trackingFrom', () => {
  const stamps = {
    placed: '2026-08-22T14:02:00Z',
    accepted: '2026-08-22T14:03:00Z',
    cooking: '2026-08-22T14:11:00Z',
    courier: null,
    delivered: null,
  };

  it('lights the rung the server named and no further', () => {
    const live = trackingFrom(apiOrder({ rung: 'cooking', stamps }), 'uz');

    // Index 2 of placed · accepted · cooking · courier · delivered.
    expect(live.reached).toBe(2);
  });

  it('lights nothing at all for an order that stopped', () => {
    /*
     * -1, so every dot is unlit. The screen swaps the ladder for a refund
     * notice rather than drawing a journey that ended halfway — a cancelled
     * order showing three green ticks reads as still coming.
     */
    expect(trackingFrom(apiOrder({ rung: null, state: 'cancelled' }), 'uz').reached).toBe(-1);
  });

  it('prints each stamp as a 24-hour clock time and an em dash for what has not happened', () => {
    const live = trackingFrom(apiOrder({ stamps }), 'en');

    // Formatted on the server: a browser in another timezone would print a
    // courier collecting before the order was placed.
    expect(live.stamps).toHaveLength(5);
    expect(live.stamps[3]).toBe('—');
    expect(live.stamps[4]).toBe('—');
    expect(live.stamps[0]).toMatch(/^\d{2}:\d{2}$/);
  });

  it('carries the total in tiyin and never a commission', () => {
    const live = trackingFrom(apiOrder(), 'uz');

    expect(live.total).toBe(13_354_000);
    // What the platform keeps from the restaurant is a commercial term between
    // those two. It is not on this screen and there is no field for it here.
    expect(Object.keys(live)).not.toContain('commission');
  });
});

/**
 * The account behind the cookie.
 *
 * `consumerFrom` decides how four switches render and whether the profile says
 * MyPOS Plus is running. The switches are the part worth a test: a preference
 * that renders ON when the guest set it OFF is marketing somebody opted out of,
 * and one that renders OFF when they set it ON is a cold dinner nobody was
 * told about.
 */
describe('consumerFrom', () => {
  const row = (over = {}) => ({
    name: 'Dilnoza Abdullayeva',
    phone: '+998901234567',
    locale: 'uz',
    points: 2_840,
    plus: true,
    plus_until: '2026-09-21T00:00:00Z',
    notification_prefs: { orders: true, promos: false, delivery: true, newsletter: false },
    ...over,
  });

  it('keeps each of the four switches exactly as the platform holds it', () => {
    const prefs = consumerFrom(row()).prefs;

    expect(prefs).toEqual({ orders: true, promos: false, delivery: true, newsletter: false });
  });

  it('defaults order updates on and marketing off when a key is missing', () => {
    /*
     * Only reached when the API answered something partial, and the asymmetry
     * is the point: a guest who never sees "your courier is downstairs" has a
     * cold dinner, and a guest opted into a newsletter by a fallback was never
     * asked.
     */
    const prefs = consumerFrom(row({ notification_prefs: {} })).prefs;

    expect(prefs.orders).toBe(true);
    expect(prefs.delivery).toBe(true);
    expect(prefs.promos).toBe(false);
    expect(prefs.newsletter).toBe(false);
  });

  it('reports the subscription and the date it runs to, separately', () => {
    // Two different questions: `plus` is what the checkout reads to zero the
    // delivery fee, `plusUntil` is what the profile prints so a guest knows
    // when to renew.
    const me = consumerFrom(row());

    expect(me.plus).toBe(true);
    expect(me.plusUntil).toBe('2026-09-21T00:00:00Z');
    expect(consumerFrom(row({ plus: false, plus_until: null })).plusUntil).toBeNull();
  });

  it('draws a dash rather than the word null for a guest who never gave a name', () => {
    expect(consumerFrom(row({ name: null })).name).toBe('—');
  });
});
