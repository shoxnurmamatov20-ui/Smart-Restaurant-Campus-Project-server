import { describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-server', () => ({ apiGet }));

import { supplierFacts, suppliersAreLive } from './suppliers-server';
import { SUPPLIERS, type PurchaseOrderRow, type SupplierRow } from './suppliers-data';

/**
 * The line under the Suppliers heading.
 *
 * "6 ta faol · 8 ta ochiq xarid · bu chorakda 117M so'm" was printed above a
 * table showing its own — correct — empty state, so the screen contradicted
 * itself on every console but the demo's.
 */
const supplier = (over: Partial<SupplierRow> = {}): SupplierRow =>
  ({
    id: '1',
    name: "Farg'ona Meat",
    category: 'catMeat',
    lead: 'leadNextDay',
    onTime: 92,
    openPurchases: 1,
    contact: '+998901234567',
    spend: 117_000_000_00,
    ...over,
  }) as SupplierRow;

const order = (status: PurchaseOrderRow['status']): PurchaseOrderRow =>
  ({
    id: '1',
    number: 'X-1',
    supplier: 'A',
    expected: null,
    lines: 1,
    status,
    total: 0,
  }) as PurchaseOrderRow;

describe('supplierFacts', () => {
  it('says nothing of its own over the design’s own tables', () => {
    expect(supplierFacts(SUPPLIERS, [], suppliersAreLive(SUPPLIERS))).toBeNull();
  });

  it('counts the suppliers, the open orders and the quarter’s spend', () => {
    expect(
      supplierFacts(
        [supplier({ id: '1', spend: 100_000_000_00 }), supplier({ id: '2', spend: 17_000_000_00 })],
        [order('draft'), order('sent'), order('confirmed'), order('received'), order('cancelled')],
        true,
      ),
    ).toEqual({ active: 2, open: 3, spend: 117_000_000_00 });
  });

  it('reports a restaurant with no suppliers as having none', () => {
    expect(supplierFacts([], [], true)).toEqual({ active: 0, open: 0, spend: 0 });
  });
});

describe('suppliersAreLive', () => {
  it('knows the fixture list by identity, not by length', () => {
    expect(suppliersAreLive(SUPPLIERS)).toBe(false);
    expect(suppliersAreLive([...SUPPLIERS])).toBe(true);
  });
});
