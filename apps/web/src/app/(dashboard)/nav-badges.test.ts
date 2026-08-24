import { describe, expect, it } from 'vitest';

import { ROLES } from '@/lib/roles';

import { navGroupsFor } from './nav';

const owner = ROLES.owner;
const flat = (counts: Parameters<typeof navGroupsFor>[1]) =>
  Object.fromEntries(
    navGroupsFor(owner, counts)
      .flatMap((group) => group.items)
      .map((item) => [item.key, item.badge ?? null]),
  );

describe('sidebar badges', () => {
  it('keeps the design figures for the fixture console', () => {
    expect(flat(null)).toMatchObject({ orders: '12', kitchen: '7', inventory: '4', cases: '3' });
  });

  it('wears the live counts, and no badge at all for a zero', () => {
    const badges = flat({ orders: 2, kitchen: 0, inventory: 1, cases: 0 });

    expect(badges).toMatchObject({ orders: '2', inventory: '1' });
    expect(badges.kitchen).toBeNull();
    expect(badges.cases).toBeNull();
  });

  it('shows a brand-new restaurant no numbers it has not earned', () => {
    const badges = flat({ orders: 0, kitchen: 0, inventory: 0, cases: 0 });

    expect(Object.values(badges).filter((badge) => badge !== null)).toEqual([]);
  });
});
