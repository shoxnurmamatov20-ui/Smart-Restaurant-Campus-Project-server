import type { Messages } from '@/i18n';

/**
 * Who the restaurant buys from, as the design's screen lists it.
 *
 * TODO(api): GET /api/v1/suppliers — with the on-time figure computed from
 * received purchase orders rather than stored, so it cannot go stale.
 */

type Suppliers = Messages['console']['suppliers'];

export type SupplierRow = {
  id: string;
  /** A company name is a proper noun; it is not translated. */
  name: string;
  category: keyof Pick<
    Suppliers,
    'catMeat' | 'catDry' | 'catDairy' | 'catProduce' | 'catBeverages' | 'catPoultry'
  >;
  lead: keyof Pick<Suppliers, 'leadNextDay' | 'leadTwoDays' | 'leadThreeDays' | 'leadSameDay'>;
  /** Deliveries that arrived when they said they would, as a percentage. */
  onTime: number;
  openPurchases: number;
  contact: string;
  /** This quarter, in tiyin. */
  spend: number;
};

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

export const SUPPLIERS: readonly SupplierRow[] = [
  {
    id: 'fargona-meat',
    name: "Farg'ona Meat",
    category: 'catMeat',
    lead: 'leadNextDay',
    onTime: 96,
    openPurchases: 2,
    contact: '+998 90 123 45 67',
    spend: som(42_800_000),
  },
  {
    id: 'osiyo-savdo',
    name: 'Osiyo Savdo',
    category: 'catDry',
    lead: 'leadTwoDays',
    onTime: 91,
    openPurchases: 1,
    contact: '+998 91 220 11 08',
    spend: som(28_100_000),
  },
  {
    id: 'milko',
    name: 'Milko',
    category: 'catDairy',
    lead: 'leadNextDay',
    onTime: 88,
    openPurchases: 3,
    contact: '+998 93 507 62 30',
    spend: som(16_400_000),
  },
  {
    id: 'chorsu',
    name: 'Chorsu Bozor',
    category: 'catProduce',
    lead: 'leadSameDay',
    onTime: 99,
    openPurchases: 0,
    contact: '+998 90 774 19 52',
    spend: som(12_700_000),
  },
  {
    id: 'coca-cola',
    name: 'Coca-Cola UZ',
    category: 'catBeverages',
    lead: 'leadThreeDays',
    onTime: 94,
    openPurchases: 1,
    contact: '+998 78 140 00 00',
    spend: som(9_300_000),
  },
  {
    id: 'parranda',
    name: 'Parranda Plus',
    category: 'catPoultry',
    lead: 'leadTwoDays',
    onTime: 82,
    openPurchases: 1,
    contact: '+998 97 331 84 26',
    spend: som(7_600_000),
  },
];

/**
 * How the on-time figure is coloured.
 *
 * The design's thresholds: 92 and up is fine, 85 and up is worth watching,
 * below that is a supplier the kitchen has to plan around.
 */
export function onTimeTone(percent: number): 'success' | 'warning' | 'danger' {
  if (percent >= 92) return 'success';
  if (percent >= 85) return 'warning';

  return 'danger';
}
