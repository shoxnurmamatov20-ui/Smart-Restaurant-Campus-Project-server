/**
 * The 11 Phase-1 modules of Smart Restaurant Campus.
 *
 * Keys must stay in sync with:
 *   - apps/api/modules_statuses.json
 *   - apps/api/database/seeders/RolesAndPermissionsSeeder.php (permission prefixes)
 *   - apps/web/src/app/(dashboard)/<key>/page.tsx (routes)
 */

export type ModuleKey =
  | 'menu'
  | 'orders'
  | 'kitchen'
  | 'tables'
  | 'inventory'
  | 'suppliers'
  | 'staff'
  | 'finance'
  | 'crm'
  | 'analytics'
  | 'pos';

export type ModuleDefinition = {
  key: ModuleKey;
  name_uz: string;
  name_ru: string;
  name_en: string;
  icon: string;
  order: number;
  enabled: boolean;
};

export const PHASE_1_MODULES: ReadonlyArray<ModuleDefinition> = [
  {
    key: 'menu',
    name_uz: 'Menyu',
    name_ru: 'Меню',
    name_en: 'Menu',
    icon: 'book-open',
    order: 1,
    enabled: true,
  },
  {
    key: 'orders',
    name_uz: 'Buyurtmalar',
    name_ru: 'Заказы',
    name_en: 'Orders',
    icon: 'receipt',
    order: 2,
    enabled: true,
  },
  {
    key: 'kitchen',
    name_uz: 'Oshxona',
    name_ru: 'Кухня',
    name_en: 'Kitchen (KDS)',
    icon: 'chef-hat',
    order: 3,
    enabled: true,
  },
  {
    key: 'tables',
    name_uz: 'Stollar va bronlar',
    name_ru: 'Столы и брони',
    name_en: 'Tables & Reservations',
    icon: 'armchair',
    order: 4,
    enabled: true,
  },
  {
    key: 'inventory',
    name_uz: 'Ombor',
    name_ru: 'Склад',
    name_en: 'Inventory',
    icon: 'package',
    order: 5,
    enabled: true,
  },
  {
    key: 'suppliers',
    name_uz: 'Yetkazib beruvchilar',
    name_ru: 'Поставщики',
    name_en: 'Suppliers',
    icon: 'truck',
    order: 6,
    enabled: true,
  },
  {
    key: 'staff',
    name_uz: 'Xodimlar',
    name_ru: 'Персонал',
    name_en: 'Staff',
    icon: 'users',
    order: 7,
    enabled: true,
  },
  {
    key: 'finance',
    name_uz: 'Moliya va kassa',
    name_ru: 'Финансы и касса',
    name_en: 'Finance & POS',
    icon: 'banknote',
    order: 8,
    enabled: true,
  },
  {
    key: 'crm',
    name_uz: 'Mijozlar va sodiqlik',
    name_ru: 'CRM и лояльность',
    name_en: 'CRM & Loyalty',
    icon: 'heart-handshake',
    order: 9,
    enabled: true,
  },
  {
    key: 'analytics',
    name_uz: 'Analitika',
    name_ru: 'Аналитика',
    name_en: 'Analytics & BI',
    icon: 'chart-bar',
    order: 10,
    enabled: true,
  },
  {
    key: 'pos',
    name_uz: 'Kassa (POS)',
    name_ru: 'Касса (POS)',
    name_en: 'POS',
    icon: 'credit-card',
    order: 11,
    enabled: true,
  },
] as const;

/**
 * How a till behaves. One code base serves four service patterns; a terminal
 * picks one and the UI changes shape, while the API stays the same.
 *
 * Mirrors Modules/Pos/config/config.php `modes`.
 */
export type PosMode = 'table_service' | 'quick_service' | 'bar' | 'counter';

/** Where an order came from. Mirrors MenuItem::CHANNELS on the API. */
export type SalesChannel = 'dine_in' | 'takeaway' | 'delivery' | 'aggregator';

/** Kitchen stations a dish can be routed to. */
export type KitchenStation = 'hot' | 'cold' | 'grill' | 'bar' | 'pastry';
