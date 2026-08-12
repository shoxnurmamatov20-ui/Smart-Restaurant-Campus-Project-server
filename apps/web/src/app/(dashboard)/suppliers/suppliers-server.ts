import { apiGet, type Paginated } from '@/lib/api-server';

import { SUPPLIERS, type SupplierRow } from './suppliers-data';

/**
 * The supplier list, from the API.
 *
 * Seven columns, two sources. The supplier record answers the name, the
 * contact, what they sell and how long they take — the last two only since the
 * migration that added them, because nothing recorded either.
 *
 * The three figures are **derived from the purchase orders**, not stored:
 *
 * - **Spend** is the total of what has actually been received. An order still
 *   in draft is not money spent, and counting it would overstate every
 *   supplier the moment somebody started writing one.
 * - **Open orders** is everything placed and not yet received. That is the
 *   number a storekeeper chases.
 * - **On time** compares `received_at` against `expected_at` on the orders that
 *   have arrived. A supplier with no deliveries yet has no record, and the
 *   screen says so rather than crediting them with a perfect one.
 *
 * Deriving beats storing here: a stored percentage is a percentage that drifts
 * from the orders it claims to summarise, and the first person to notice is the
 * supplier being told they are late.
 */
export type SupplierScreenRow = Omit<SupplierRow, 'category' | 'lead'> & {
  categoryLabel: string;
  leadLabel: string;
};

type ApiSupplier = {
  id: number;
  name: string;
  category: string | null;
  contact_name: string | null;
  phone: string | null;
  lead_time_days: number | null;
  is_active: boolean;
};

type ApiPurchaseOrder = {
  supplier: { id: number } | null;
  status: string;
  total: number;
  expected_at: string | null;
  received_at: string | null;
};

/** The API's categories against the catalogue's words. */
const CATEGORY_KEYS: Readonly<Record<string, SupplierRow['category']>> = {
  meat: 'catMeat',
  poultry: 'catPoultry',
  produce: 'catProduce',
  dairy: 'catDairy',
  dry: 'catDry',
  beverages: 'catBeverages',
};

/** Lead times the design words rather than numbers. */
const LEAD_KEYS: Readonly<Record<number, SupplierRow['lead']>> = {
  0: 'leadSameDay',
  1: 'leadNextDay',
  2: 'leadTwoDays',
  3: 'leadThreeDays',
};

export async function getSuppliers(
  t: (key: string) => string,
  em = '—',
): Promise<readonly SupplierScreenRow[]> {
  const [suppliers, orders] = await Promise.all([
    apiGet<Paginated<ApiSupplier>>('/suppliers/suppliers?per_page=100'),
    apiGet<Paginated<ApiPurchaseOrder>>('/suppliers/purchase-orders?per_page=200'),
  ]);

  if (!suppliers?.data) {
    return SUPPLIERS.map((supplier) => ({
      ...supplier,
      categoryLabel: t(supplier.category),
      leadLabel: t(supplier.lead),
    }));
  }

  /** Per supplier: money received, orders outstanding, deliveries on time. */
  const stats = new Map<number, { spend: number; open: number; late: number; done: number }>();

  for (const order of orders?.data ?? []) {
    const id = order.supplier?.id;

    if (id === undefined || id === null || order.status === 'cancelled') continue;

    const entry = stats.get(id) ?? { spend: 0, open: 0, late: 0, done: 0 };

    if (order.status === 'received') {
      entry.spend += order.total;
      entry.done += 1;

      // Late only when both dates exist. An order received without a promised
      // date cannot be late — nobody promised anything.
      if (order.expected_at && order.received_at && order.received_at > order.expected_at) {
        entry.late += 1;
      }
    } else if (order.status !== 'draft') {
      entry.open += 1;
    }

    stats.set(id, entry);
  }

  return suppliers.data
    .filter((supplier) => supplier.is_active)
    .map((supplier) => {
      const stat = stats.get(supplier.id);
      const lead = supplier.lead_time_days;

      return {
        id: String(supplier.id),
        name: supplier.name,
        categoryLabel: supplier.category ? t(CATEGORY_KEYS[supplier.category] ?? 'catDry') : em,
        leadLabel:
          lead === null
            ? em
            : (LEAD_KEYS[lead] ?? undefined)
              ? t(LEAD_KEYS[lead] as SupplierRow['lead'])
              : `${lead} ${t('days')}`,
        // No deliveries yet is not a hundred per cent. It is no record, and
        // the difference matters to whoever is choosing a supplier.
        onTime: stat && stat.done > 0 ? Math.round(((stat.done - stat.late) / stat.done) * 100) : 0,
        openPurchases: stat?.open ?? 0,
        contact: supplier.contact_name ?? supplier.phone ?? em,
        spend: stat?.spend ?? 0,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}
