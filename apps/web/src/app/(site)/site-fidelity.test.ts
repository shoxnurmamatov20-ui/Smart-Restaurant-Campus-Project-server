import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { copyFor } from '../(guest)/guest-session';
import { STEP_ETA, STEP_MINUTES, TRACK_LADDER } from './placed-order';
import { QUICK_ACTIONS } from './quick-actions';
import {
  ADDONS,
  BRANCHES,
  HIGHLIGHTS,
  PAYMENT_RAILS,
  PORTIONS,
  preOrderSlots,
  SOCIALS,
  som,
  VENUE,
  WHEN_SLOTS,
} from './venue-data';

/**
 * The restaurant site, checked against the design file rather than the spec.
 *
 * The handoff's README settles the precedence: where `files/*.dc.html` and
 * `specs/NN-*.md` disagree, "the file wins and the document is a bug". This
 * transcribes the file — `files/Osh Xona - Restoran sayti.dc.html` — for the
 * parts of the surface that are *data*: how many cards, in what order, with
 * which words. Layout is not testable here and is not the thing that silently
 * rots; a set of four cards quietly becoming three is.
 *
 * The numbers below were read out of the design's own script block, not
 * recalculated. Where this build departs from it on purpose, the departure is
 * named in `DEPARTURES` with its reason, so a future reader can tell a decision
 * from a regression.
 */
const DEPARTURES = {
  bookingSlots:
    'The design greys 19:00 as a fixture. There is no availability endpoint, so ' +
    'every sitting is offered and a clash comes back as a refusal from POST ' +
    '/api/v1/public/reservations — greying a slot from a guess refuses a free table.',
  categoryRail:
    'The design’s rail selects a category and hides the other eight. Here it ' +
    'scrolls and highlights: a page opened from a search result cannot hide four ' +
    'fifths of the menu before the reader has touched anything.',
  perDishRating:
    'Ratings and order counts stay editorial — the venue’s own four dishes in the ' +
    'window, matched to the live menu by name. A real count is a query over ' +
    'order_items, and publishing per-dish sales on a login-free indexable URL ' +
    'hands a restaurant’s figures to the competitor across the road.',
  trackedOrder:
    'The design tracks a fixture. A real order is placed through POST ' +
    '/api/v1/public/orders and its rung, clocks and courier are polled from GET ' +
    '/api/v1/public/orders/{number}; placed-order.ts keeps only the receipt this ' +
    'browser was given, and ?demo=1 draws the design’s own order.',
  oftenWith:
    'The sheet’s "ordered together" set is one dish from each other category. A ' +
    'real one is a basket-affinity query over order_items — a map of what sells ' +
    'with what — and is deliberately not published on this surface, so the rule ' +
    'is one a reader can check off the screen.',
  portionSheet:
    'PORTIONS and ADDONS are the fallback. A live dish is priced from the ' +
    'modifier_groups GET /api/v1/public/menu carries, at the venue’s own ' +
    'surcharges and with the kitchen’s own option ids; the design’s three and ' +
    'four are what a sheet opened against a fixture menu draws.',
  preOrderSlots:
    'WHEN_SLOTS is the fallback. preOrderSlots() derives the sittings from each ' +
    'venue’s own opening hours and its own clock, because the design’s four are ' +
    'the same four for a kitchen that shuts at ten and one that shuts at eleven.',
} as const;

describe('the home page, against the design file', () => {
  it('draws four quick actions, in the design’s order', () => {
    // dc.html:931-936 — Yetkazish / Olib ketish / Stol bandlash / Katta buyurtma.
    expect(QUICK_ACTIONS.map((action) => action.key)).toEqual([
      'delivery',
      'pickup',
      'book',
      'large',
    ]);

    // Every one of them carries an icon path and a label key that resolves.
    for (const action of QUICK_ACTIONS) {
      expect(action.icon.length).toBeGreaterThan(20);

      for (const locale of ['uz', 'ru', 'en'] as const) {
        expect(copyFor(locale).site.home.quick[action.key]).toBeTruthy();
        expect(copyFor(locale).site.home.quick[action.sub]).toBeTruthy();
      }
    }
  });

  it('sends the large-order card to the telephone rather than to a screen', () => {
    // A forty-person banquet is agreed on the phone. A button that pretended to
    // take one would put a wedding in a queue nobody in the kitchen reads.
    expect(QUICK_ACTIONS.filter((action) => action.href === null)).toHaveLength(1);
    expect(QUICK_ACTIONS.find((action) => action.href === null)?.key).toBe('large');
  });

  it('carries three promises with the design’s figures', () => {
    // dc.html:938-942 — 12 · 06:00 · 4.9, and the rating agrees with the hero.
    for (const locale of ['uz', 'ru', 'en'] as const) {
      const promises = copyFor(locale).site.home.promises;

      expect(promises.map((promise) => promise.value)).toEqual(['12', '06:00', '4.9']);

      for (const promise of promises) {
        expect(promise.head).toBeTruthy();
        expect(promise.body.length).toBeGreaterThan(20);
      }
    }

    expect(VENUE.rating).toBe('4.9');
  });

  it('curates four highlights and badges exactly two of them', () => {
    // dc.html:937-947. The strip's heading claims a 30-day ranking, so the set
    // is curated rather than `dishes.slice(0, 4)` under the same sentence.
    expect(HIGHLIGHTS).toHaveLength(4);
    expect(HIGHLIGHTS.filter((entry) => entry.badge !== undefined)).toHaveLength(2);
    expect(HIGHLIGHTS.map((entry) => entry.orders30d)).toEqual([412, 286, 331, 508]);

    // Matched by name, so the match string has to be lowercase to ever hit.
    for (const entry of HIGHLIGHTS) {
      expect(entry.match).toBe(entry.match.toLowerCase());
      expect(DEPARTURES.perDishRating).toBeTruthy();
    }
  });
});

describe('about, footer and booking', () => {
  it('has three about cards and five answered questions in every language', () => {
    // dc.html:1120-1129. An FAQ that is five questions in Uzbek and three in
    // Russian is how a reader in one language quietly gets a worse page.
    for (const locale of ['uz', 'ru', 'en'] as const) {
      const about = copyFor(locale).site.about;

      expect(about.cards).toHaveLength(3);
      expect(about.questions).toHaveLength(5);

      for (const entry of about.questions) {
        expect(entry.q.endsWith('?')).toBe(true);
        expect(entry.a.length).toBeGreaterThan(30);
      }
    }
  });

  it('links three social accounts and both contact channels', () => {
    // dc.html:1130-1134. The footer had none of these.
    expect(SOCIALS.map((social) => social.label)).toEqual(['Telegram', 'Instagram', 'YouTube']);

    for (const social of SOCIALS) {
      expect(social.href.startsWith('https://')).toBe(true);
    }

    expect(VENUE.email).toContain('@');
    expect(VENUE.telegram).toContain('t.me');
    expect(VENUE.monogram).toHaveLength(2);
  });

  it('quotes one phone number, and every branch has a pressable one', () => {
    // The header, the large-order card, the footer and the about screen all
    // print VENUE.phone. A second number in a fixture is a number that rings
    // somewhere nobody is sitting.
    expect(VENUE.phone.replace(/[^+\d]/g, '')).toMatch(/^\+\d{9,}$/);

    for (const branch of BRANCHES) {
      // The fixture's own five all carry one; the type is nullable because a
      // LIVE branch may not, and that is what stops the demo's number being
      // published on a real venue's site.
      expect(branch.phone).not.toBeNull();
      expect(branch.phone!.replace(/[^+\d]/g, '')).toMatch(/^\+\d{9,}$/);
    }
  });

  it('ships one branch that does not take bookings', () => {
    // dc.html:826 marks Termiz `open:false` and :1035 filters the booking form
    // on it. With all five bookable the filter is unreachable, and the one
    // state that separates "closed tonight" from "no reservations here" never
    // renders anywhere.
    expect(BRANCHES.filter((branch) => branch.bookable === false)).toHaveLength(1);
    expect(BRANCHES.filter((branch) => branch.bookable !== false).length).toBeGreaterThan(2);
  });

  it('keeps the five screens the header navigates to', () => {
    // dc.html:897-903 — Home · Menu · Book · Track · About. The bar had four,
    // one of which (Branches) is a section of the home page rather than a
    // screen, and Home was missing entirely.
    const here = join(process.cwd(), 'src/app/(site)/r/[restaurant]');
    const routes = readdirSync(here, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const route of ['menu', 'book', 'track', 'about', 'cart']) {
      expect(routes).toContain(route);
    }

    expect(DEPARTURES.bookingSlots).toBeTruthy();
    expect(DEPARTURES.categoryRail).toBeTruthy();
  });
});

describe('the checkout, against the design file', () => {
  it('surcharges a portion by the design’s percentage, not by a multiplier', () => {
    // dc.html:874-878 — `[0, p*0.35, p*0.75]`. The sheet carried 1.4 and 1.9,
    // which on a 96 000 so'm sharing plate quoted 19 200 so'm over the menu.
    expect(PORTIONS.map((entry) => entry.factor)).toEqual([1, 1.35, 1.75]);
    expect(PORTIONS.map((entry) => entry.delta)).toEqual(['', '+35%', '+75%']);
    expect(DEPARTURES.portionSheet).toBeTruthy();
  });

  it('offers the design’s four add-ons at the design’s four prices', () => {
    // dc.html:887 `ADDON_PRICE`. There was one add-on, labelled with the
    // group's own heading and priced at 8 000 — a number in no design file.
    expect(ADDONS.map((addon) => addon.key)).toEqual(['qazi', 'egg', 'salad', 'bread']);
    expect(ADDONS.map((addon) => addon.price)).toEqual([
      som(14_000),
      som(5_000),
      som(12_000),
      som(6_000),
    ]);

    for (const locale of ['uz', 'ru', 'en'] as const) {
      const list = copyFor(locale).site.sheet.addonList;

      for (const addon of ADDONS) expect(list[addon.key]).toBeTruthy();
    }
  });

  it('offers four rails, each of them one company', () => {
    // dc.html:1046-1051. The card button read `Click · Payme · Uzcard`: three
    // companies behind one control, so an order paid through the Payme app
    // reached the kitchen marked "card".
    expect(PAYMENT_RAILS.map((rail) => rail.id)).toEqual(['card', 'click', 'payme', 'cash']);
    expect(PAYMENT_RAILS.filter((rail) => rail.isCash)).toHaveLength(1);

    // The two brands are data; the two words are copy. A rail whose label is a
    // brand must not also carry a catalogue key, and the reverse.
    expect(PAYMENT_RAILS.filter((rail) => rail.brand !== null).map((rail) => rail.brand)).toEqual([
      'Click',
      'Payme',
    ]);
  });

  it('lets the guest say when, in five ways', () => {
    // dc.html:1040-1044 — as soon as possible, plus four sittings. The
    // checkout offered none of them and the kitchen heard no answer.
    expect(WHEN_SLOTS).toEqual(['13:00', '14:00', '19:00', '20:30']);

    for (const locale of ['uz', 'ru', 'en'] as const) {
      expect(copyFor(locale).site.cart.asap).toContain('{range}');
    }

    expect(DEPARTURES.preOrderSlots).toBeTruthy();
  });

  it('derives a venue’s own sittings from its own hours', () => {
    // Chilonzor: 10:00–23:00, read at 11:20 with an hour of lead time. Every
    // whole hour from 13:00 to 22:00, and 12:00 is absent because 12:20 is
    // inside the lead — a sitting the kitchen could not cook for is worse than
    // no sitting at all.
    const open = { opens: '10:00', closes: '23:00' };

    expect(preOrderSlots(open, '11:20')).toEqual([
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
      '19:00',
      '20:00',
      '21:00',
      '22:00',
    ]);

    // The same venue read at half past ten at night: nothing left that it could
    // cook, so the select offers "as soon as possible" alone rather than four
    // sittings nobody will be there for.
    expect(preOrderSlots(open, '22:30')).toEqual([]);

    // A kitchen that trades past midnight is not a window this can honestly
    // draw, so the design's four stand rather than an empty list.
    expect(preOrderSlots({ opens: '18:00', closes: '02:00' }, '19:00')).toEqual(WHEN_SLOTS);
  });
});

describe('tracking an order', () => {
  it('climbs the design’s five rungs, with its own clocks and its own quotes', () => {
    // dc.html:891-896 (11:24 · 11:26 · 11:31 · 11:48 · 12:05, stored as offsets
    // so a real order stamps its own hour) and :1013 for what is left to come.
    expect(TRACK_LADDER).toEqual(['received', 'confirmed', 'cooking', 'courier', 'delivered']);
    expect(STEP_MINUTES).toEqual([0, 2, 7, 24, 41]);
    expect(STEP_ETA).toEqual([38, 34, 26, 12, 0]);

    // Every rung has a word in every language, and the last one has an ETA of
    // nothing rather than a minute count beside "delivered".
    for (const locale of ['uz', 'ru', 'en'] as const) {
      const t = copyFor(locale).site.track;

      for (const step of TRACK_LADDER) expect(t.steps[step]).toBeTruthy();

      expect(t.advance).toBeTruthy();
      expect(t.paid).toContain('{rail}');
      expect(t.courierMeta).toContain('{distance}');
    }

    expect(STEP_ETA[TRACK_LADDER.length - 1]).toBe(0);
    expect(DEPARTURES.trackedOrder).toBeTruthy();
    expect(DEPARTURES.oftenWith).toBeTruthy();
  });

  it('does not gate the whole screen behind a literal', () => {
    /*
     * The bug this file exists to stop coming back.
     *
     * `const hasOrder = false` sat above the return, was never assigned
     * anywhere else, and took the ladder, the rail, the map, the courier card,
     * the line list and the total panel off the screen for every reader. A
     * literal that decides whether half a screen renders is not a state; it is
     * a screen that was switched off and shipped.
     */
    const screen = readFileSync(
      join(process.cwd(), 'src/app/(site)/r/[restaurant]/track/track-screen.tsx'),
      'utf8',
    );

    expect(screen).not.toMatch(/const hasOrder\s*=\s*(false|true)/);
    expect(screen).toContain('usePlacedOrder');
  });
});
