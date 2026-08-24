import { describe, expect, it } from 'vitest';

import { copyFor, som as money, somParts } from '../(guest)/guest-session';
import { BRANCHES, isOpenAt, say, som, VENUE } from './venue-data';

/**
 * "Is the kitchen open?" — the question this site answers before any other.
 *
 * It is the first line of the hero and the badge on every branch card, and it
 * is read by somebody standing outside deciding whether to go in. Wrong in one
 * direction it turns people away from an open restaurant; wrong in the other it
 * sends them to a locked door.
 */
describe('isOpenAt', () => {
  const branch = BRANCHES[0]!;

  it('is open between the hours the venue keeps', () => {
    expect(isOpenAt(branch, '10:00')).toBe(true);
    expect(isOpenAt(branch, '19:40')).toBe(true);
    expect(isOpenAt(branch, '22:59')).toBe(true);
  });

  it('is shut before opening and at closing time', () => {
    expect(isOpenAt(branch, '09:59')).toBe(false);

    /*
     * Closing time is shut, not open.
     *
     * A kitchen that closes at 23:00 is not taking an order at 23:00 — the
     * inclusive version puts a guest at the door as the lights go off, which is
     * a worse outcome than a minute of caution.
     */
    expect(isOpenAt(branch, '23:00')).toBe(false);
    expect(isOpenAt(branch, '23:30')).toBe(false);
  });

  it('answers per branch, because they do not all close together', () => {
    const late = BRANCHES.find((row) => row.closes === '23:00');
    const early = BRANCHES.find((row) => row.closes === '22:00');

    expect(late).toBeDefined();
    expect(early).toBeDefined();
    expect(isOpenAt(late!, '22:30')).toBe(true);
    expect(isOpenAt(early!, '22:30')).toBe(false);
  });
});

describe('the venue’s own figures', () => {
  it('keeps money in tiyin like everything else on the platform', () => {
    // 1 so'm = 100 tiyin. A site that quoted so'm while the API quoted tiyin
    // would be wrong by a factor of a hundred in the guest's favour, once.
    expect(som(250_000)).toBe(25_000_000);
    expect(VENUE.freeDeliveryOver).toBe(som(150_000));
    expect(VENUE.deliveryFee).toBe(som(15_000));
  });

  it('holds the threshold the FAQ and the cart both quote', () => {
    // 150 000 so'm is asserted in four places on this surface — the hero strip,
    // the delivery card, the FAQ answer and the cart's fee rule. Three of them
    // read this constant; the fourth is a sentence in the copy catalogue, and
    // this is what catches the day somebody edits one and not the other.
    for (const locale of ['uz', 'ru', 'en'] as const) {
      expect(copyFor(locale).site.about.questions[1]!.a).toContain('150 000');
    }
  });

  it('gives every branch a phone number a guest can press', () => {
    // The whole point of publishing one on a phone is that it is a `tel:` link,
    // and a blank one renders as an anchor to nowhere.
    for (const branch of BRANCHES) {
      expect(branch.phone).not.toBeNull();
      expect(branch.phone!.replace(/\s/g, '')).toMatch(/^\+\d{9,}$/);
    }
  });

  it('names every branch in all three languages', () => {
    for (const branch of BRANCHES) {
      expect(say(branch.address, 'uz')).not.toBe('');
      expect(say(branch.address, 'ru')).not.toBe('');
      expect(say(branch.address, 'en')).not.toBe('');
    }
  });
});

describe('the way money is set on a guest surface', () => {
  it('groups with a narrow no-break space in all three languages', () => {
    // FOUNDATIONS §CONTENT RULES: thin-space separators. `toLocaleString` gives
    // a comma in English and a full-width no-break space in Russian, so without
    // this the same price read "150,000" in one language and "150 000" in the
    // next — on one menu, to one guest switching languages.
    for (const locale of ['uz', 'ru', 'en'] as const) {
      expect(somParts(VENUE.freeDeliveryOver, locale).amount).toBe('150\u202f000');
    }
  });

  it('never lets a comma or a plain space back into a price', () => {
    // Narrow *no-break*, so a phone cannot wrap "150" onto one line and "000"
    // onto the next, which reads as a hundred and fifty so'm.
    const printed = money(som(1_234_567), 'en');

    expect(printed).not.toMatch(/[,\u0020\u00a0]\d/);
    expect(printed.startsWith('1\u202f234\u202f567')).toBe(true);
  });
});
