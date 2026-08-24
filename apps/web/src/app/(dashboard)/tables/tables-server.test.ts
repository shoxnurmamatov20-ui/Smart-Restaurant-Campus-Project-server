import { describe, expect, it } from 'vitest';

import { floorFacts, type Floor } from './tables-server';
import type { Table } from './tables-data';

/**
 * The sentence over the floor plan.
 *
 * This is the line a restaurant reported: "32 of 32 tables seated", printed one
 * line above a legend that counted its own — empty — plan. The caption came
 * from the catalogue and the legend came from the data, so the two contradicted
 * each other on every console but the demo's.
 */
function table(over: Partial<Table> = {}): Table {
  return { name: '1', seats: 4, status: 'free', ...over } as Table;
}

function floor(tables: readonly Table[], live = true): Floor {
  return {
    zones: [{ key: 'z1', label: 'Zal', tables }],
    live,
    branchId: 1,
    tableIds: {},
    orderIds: {},
  };
}

describe('floorFacts', () => {
  it('says nothing of its own over the design’s own plan', () => {
    expect(floorFacts(floor([table()], false), 'Chilonzor')).toBeNull();
  });

  it('counts an owner’s estate even though it is pinned to no venue', () => {
    // `branchId` is null for an owner reading the whole business, and reading
    // liveness off it would caption a chain's floor with the demo's sentence.
    const estate: Floor = { ...floor([table()]), branchId: null };

    expect(floorFacts(estate, 'Smart Restaurant')).toMatchObject({ tables: 1 });
  });

  it('counts what is seated the way the legend does', () => {
    const facts = floorFacts(
      floor([
        table({ name: '1', status: 'seated', guests: 4 }),
        table({ name: '2', status: 'to_pay', guests: 2 }),
        table({ name: '3', status: 'free' }),
        table({ name: '4', status: 'reserved' }),
      ]),
      'Chilonzor',
    );

    expect(facts).toEqual({ place: 'Chilonzor', tables: 4, seated: 2, covers: 6 });
  });

  it('reports an empty plan as empty rather than as thirty-two tables', () => {
    expect(floorFacts(floor([]), 'Yangi joy')).toEqual({
      place: 'Yangi joy',
      tables: 0,
      seated: 0,
      covers: 0,
    });
  });

  it('does not count covers on a table nobody is sitting at', () => {
    // A free table carries no `guests` key at all — see getFloor's spread.
    expect(floorFacts(floor([table({ status: 'free' })]), 'Chilonzor')).toMatchObject({
      covers: 0,
    });
  });
});
