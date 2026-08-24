import { beforeEach, describe, expect, it } from 'vitest';

import { addLine, cartCount, cartSubtotal, clearCart, lineKey, setQuantity } from './guest-cart';

/**
 * The basket, against the two mistakes it can actually make.
 *
 * It is a small module and most of it is plumbing, but two behaviours are worth
 * a test because getting either wrong is silent and expensive: **the same dish
 * ordered twice with different options must be two lines**, and **two
 * restaurants must never share a basket**. Both fail quietly — a guest simply
 * receives the wrong food, or sees somebody else's order.
 *
 * `localStorage` is stubbed rather than mocked away, so the read path is the
 * one that runs in a browser: the store parses what it wrote.
 */
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();

  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
    writable: true,
  });

  // The module caches one basket at a time; clearing forces a fresh read.
  clearCart('reset');
});

const dish = {
  dishId: 'd1',
  name: 'Osh',
  unitPrice: 45_000_00,
  quantity: 1,
  options: [],
  note: '',
};

describe('the guest basket', () => {
  it('merges a repeat of exactly the same thing', () => {
    addLine('osh-xona', dish);
    addLine('osh-xona', dish);

    clearCart('other');
    addLine('osh-xona', { ...dish, quantity: 0 });

    // Three calls, one line, quantity two — the third added nothing.
    const raw = JSON.parse(store.get('srcp.cart.osh-xona') ?? '{"lines":[]}') as {
      lines: { quantity: number }[];
    };

    expect(raw.lines).toHaveLength(1);
    expect(raw.lines[0]?.quantity).toBe(2);
  });

  it('keeps the same dish with a different note apart', () => {
    // The failure this prevents: one guest wants no onion and the other does
    // not care, and the kitchen is told about one plate.
    expect(lineKey('d1', [], 'no onion')).not.toBe(lineKey('d1', [], ''));
    expect(lineKey('d1', ['extra'], '')).not.toBe(lineKey('d1', [], ''));

    // Order of the options must not matter — the same two add-ons picked in
    // the other order are the same plate.
    expect(lineKey('d1', ['a', 'b'], '')).toBe(lineKey('d1', ['b', 'a'], ''));
  });

  it('never lets one restaurant read another’s basket', () => {
    addLine('osh-xona', dish);
    addLine('choyxona', { ...dish, name: 'Lag‘mon' });

    expect(store.has('srcp.cart.osh-xona')).toBe(true);
    expect(store.has('srcp.cart.choyxona')).toBe(true);

    const osh = JSON.parse(store.get('srcp.cart.osh-xona') ?? '{"lines":[]}') as {
      lines: { name: string }[];
    };

    expect(osh.lines.map((line) => line.name)).toEqual(['Osh']);
  });

  it('removes a line when its quantity reaches zero', () => {
    addLine('osh-xona', dish);

    const key = lineKey('d1', [], '');
    setQuantity('osh-xona', key, 0);

    const raw = JSON.parse(store.get('srcp.cart.osh-xona') ?? '{"lines":[]}') as {
      lines: unknown[];
    };

    expect(raw.lines).toHaveLength(0);
  });

  it('counts quantities, not lines', () => {
    const cart = {
      restaurant: 'osh-xona',
      lines: [
        { ...dish, key: 'a', quantity: 3 },
        { ...dish, key: 'b', quantity: 2, unitPrice: 10_000_00 },
      ],
    };

    expect(cartCount(cart)).toBe(5);
    expect(cartSubtotal(cart)).toBe(45_000_00 * 3 + 10_000_00 * 2);
  });
});
