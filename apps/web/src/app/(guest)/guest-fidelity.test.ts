import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { copyFor } from './guest-session';
import {
  GOLD_CARD_PERCENT,
  SPLIT_RANGE,
  TABLE_RAILS,
  WIFI_NETWORK,
} from '@restaurant/surfaces/guest/table-data';

/**
 * The guest (QR) and customer surfaces, checked against the design files.
 *
 * `Smart Restaurant Mehmon.dc.html` and `Smart Restaurant Mijoz ilovasi.dc.html`.
 * As with the site's own fidelity test, this covers the parts that are *data* —
 * a number, a range, a state that has to be reachable — because those are what
 * rot silently. Two of the three below had already drifted once.
 */
const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('the table bill', () => {
  it('charges the design’s gold-card discount', () => {
    // Mehmon.dc.html:639 `Math.round(items * 0.05)`, and :742 prints "5%" on the
    // line itself. The build charged 10% while three sentences said five — the
    // guest is told one number and billed another, at the table.
    expect(GOLD_CARD_PERCENT).toBe(5);

    for (const locale of ['uz', 'ru', 'en'] as const) {
      expect(copyFor(locale).qr.bill.discount).toContain('{percent}');
    }
  });

  it('splits two to twelve ways, opening at four', () => {
    // Mehmon.dc.html:585 (`splitWays: 4`), :1005 (floor at 2), :1006 (`min(12)`).
    expect(SPLIT_RANGE).toEqual({ min: 2, max: 12, start: 4 });
  });

  it('says what each rail does, not only what it is called', () => {
    // Mehmon.dc.html:876-881 gives all four a second line. Four bare labels
    // made Click and Payme read as two spellings of one thing, and gave the
    // cash row no way to say that choosing it fetches a waiter.
    expect(TABLE_RAILS.map((rail) => rail.id)).toEqual(['card', 'click', 'payme', 'cash']);
    expect(TABLE_RAILS.map((rail) => rail.sub)).toEqual(['schemes', 'app', 'app', 'waiter']);

    for (const locale of ['uz', 'ru', 'en'] as const) {
      expect(copyFor(locale).qr.bill.railApp).toBeTruthy();
      expect(copyFor(locale).qr.bill.railWaiter).toBeTruthy();
    }
  });
});

describe('states the screens have to be able to reach', () => {
  it('draws a sold-out dish rather than disabling the row that explains it', () => {
    // The customer menu row used to be `disabled` when a dish was 86'd, which
    // put DISH.soldOutBody behind a control that refused to be pressed.
    const board = source('src/app/(customer)/customer/menu/menu-board.tsx');

    expect(board).toContain('onClick={() => setOpen(dish)}');
    expect(board).not.toContain('disabled={dish.soldOut}\n                    className');
  });

  it('never puts an emoji in a control on the customer surface', () => {
    // CONTENT RULES: emoji are the Telegram bot's, nowhere else. The cart's
    // quantity stepper turned into a wastebasket at quantity one — a different
    // picture on every platform, and not a thing a minus button does.
    const cart = source('src/app/(customer)/customer/cart/cart-board.tsx');

    expect(cart).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it('caps a kitchen note where the design caps it, and counts up to it', () => {
    // Mehmon.dc.html:1044 — `slice(0, 90)`, drawn as `0 / 90`. The board
    // allowed 120 and counted down, so a guest saw "83" beside a box and had
    // no idea what it was 83 of.
    const board = source('src/app/(guest)/qr/[restaurant]/[table]/menu/menu-board.tsx');

    expect(board).toContain('const NOTE_MAX = 90;');
    expect(board).toContain('{note.length} / {NOTE_MAX}');
  });

  it('lets a guest call a waiter rather than drawing the control shut', () => {
    // Mehmon.dc.html:113-119. The card was rendered `aria-disabled` at 45%,
    // which is the second most-pressed thing on the surface reading as broken.
    const door = source('src/app/(guest)/qr/[restaurant]/[table]/call-waiter.tsx');

    expect(door).toContain('flash(');

    for (const locale of ['uz', 'ru', 'en'] as const) {
      expect(copyFor(locale).qr.common.waiterOnWay).toContain('{waiter}');
    }
  });

  it('names the Wi-Fi the table card publishes', () => {
    // Mehmon.dc.html:135. The line was in all three catalogues and no screen
    // rendered it, so the second question every guest at a table has went
    // unanswered on the screen built to answer the first.
    expect(WIFI_NETWORK).not.toBe('');

    for (const locale of ['uz', 'ru', 'en'] as const) {
      expect(copyFor(locale).qr.scan.wifi).toContain('{network}');
    }
  });
});
