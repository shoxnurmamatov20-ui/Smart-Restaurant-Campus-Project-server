import { describe, expect, it } from 'vitest';

import {
  ORDER_STATES,
  ORDER_STATE_SPECS,
  isOrderState,
  orderStateSpecs,
  stateAppliesTo,
  stateLabel,
  statesForChannel,
  type Locale,
  type StateAudience,
} from './order-state';

const LOCALES: Locale[] = ['uz', 'ru', 'en'];
const AUDIENCES: StateAudience[] = ['staff', 'kitchen', 'guest'];

describe('the canonical ladder', () => {
  it('carries the design file’s keys, not the document’s', () => {
    // DATABASE.md says out_for_delivery/delivered and has no waiting-to-pay
    // state; the design file — which the handoff says wins — says otherwise.
    expect(ORDER_STATES).toContain('enroute');
    expect(ORDER_STATES).toContain('handed');
    expect(ORDER_STATES).toContain('topay');
    expect(ORDER_STATES).not.toContain('out_for_delivery');
    expect(ORDER_STATES).not.toContain('delivered');
  });

  it('keeps comped, which the design file omits and DECISIONS Q8 requires', () => {
    expect(ORDER_STATES).toContain('comped');
  });

  it('has no in_kitchen — the value the API invented', () => {
    expect(ORDER_STATES).not.toContain('in_kitchen');
    expect(isOrderState('in_kitchen')).toBe(false);
  });

  it('is thirteen states with no duplicates', () => {
    expect(ORDER_STATES).toHaveLength(13);
    expect(new Set(ORDER_STATES).size).toBe(13);
  });

  it('keys its own spec consistently', () => {
    for (const s of orderStateSpecs()) expect(ORDER_STATE_SPECS[s.key].key).toBe(s.key);
  });
});

describe('one row, three audiences', () => {
  it('says three different things about cooking', () => {
    expect(stateLabel('cooking', 'staff', 'uz')).toBe('Tayyorlanmoqda');
    expect(stateLabel('cooking', 'kitchen', 'uz')).toBe('Tayyorlanmoqda');
    expect(stateLabel('cooking', 'guest', 'uz')).toBe('Oshxonada');
  });

  it('translates the guest vocabulary, not just the staff one', () => {
    expect(stateLabel('cooking', 'guest', 'ru')).toBe('На кухне');
    expect(stateLabel('cooking', 'guest', 'en')).toBe('In the kitchen');
  });

  it('hides from an audience rather than borrowing another’s word', () => {
    // A guest must never be told the restaurant wrote their bill off, and the
    // line must never be asked to care about the till.
    expect(stateLabel('comped', 'guest', 'uz')).toBeNull();
    expect(stateLabel('paid', 'kitchen', 'uz')).toBeNull();
    expect(stateLabel('draft', 'guest', 'uz')).toBeNull();
    expect(stateLabel('enroute', 'kitchen', 'uz')).toBeNull();
  });

  it('gives every state a staff label, because staff see everything', () => {
    for (const s of ORDER_STATES) {
      for (const l of LOCALES) expect(stateLabel(s, 'staff', l)).toBeTruthy();
    }
  });

  it('never leaves a locale missing where a label exists', () => {
    for (const s of ORDER_STATES) {
      for (const a of AUDIENCES) {
        const label = ORDER_STATE_SPECS[s][a];
        if (label === null) continue;
        for (const l of LOCALES) expect(label[l].length).toBeGreaterThan(0);
      }
    }
  });
});

describe('channel applicability', () => {
  /*
   * The channel names are the API's, which are the database's. They were the
   * design file's — dine, delivery, pickup — while `orders.channel` stored
   * dine_in, takeaway, delivery, aggregator, so nothing could check a real
   * order's channel against this ladder. One vocabulary now, and an
   * OrderStateLadderTest on the PHP side asserts the two files still agree.
   */
  it('keeps a dine-in bill off the road', () => {
    expect(stateAppliesTo('enroute', 'dine_in')).toBe(false);
    expect(stateAppliesTo('enroute', 'delivery')).toBe(true);
    // Somebody else's courier is still a courier.
    expect(stateAppliesTo('enroute', 'aggregator')).toBe(true);
  });

  it('keeps served and topay to the room', () => {
    expect(statesForChannel('delivery')).not.toContain('served');
    expect(statesForChannel('delivery')).not.toContain('topay');
    expect(statesForChannel('dine_in')).toContain('served');
  });

  it('hands food over on every channel that leaves the building', () => {
    expect(statesForChannel('takeaway')).toContain('handed');
    expect(statesForChannel('delivery')).toContain('handed');
    expect(statesForChannel('aggregator')).toContain('handed');
    // A dine-in guest is served at the table, never handed anything at a door.
    expect(statesForChannel('dine_in')).not.toContain('handed');
  });

  it('lets every channel reach paid and voided', () => {
    for (const c of ['dine_in', 'takeaway', 'delivery', 'aggregator'] as const) {
      expect(statesForChannel(c)).toContain('paid');
      expect(statesForChannel(c)).toContain('voided');
    }
  });

  it('returns channel states in ladder order', () => {
    const dine = statesForChannel('dine_in');
    const order = dine.map((s) => ORDER_STATES.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('void, refund and comp stay three events', () => {
  it('keeps them distinct and terminal', () => {
    for (const s of ['voided', 'refunded', 'comped'] as const) {
      expect(ORDER_STATE_SPECS[s].terminal).toBe(true);
    }
    const words = ['voided', 'refunded', 'comped'].map((s) =>
      stateLabel(s as never, 'staff', 'uz'),
    );
    expect(new Set(words).size).toBe(3);
  });
});
