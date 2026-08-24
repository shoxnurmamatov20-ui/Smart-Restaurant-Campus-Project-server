import type { Lang } from './lib/locale';

/**
 * The four surfaces this one binary carries, and where each begins.
 *
 * The design draws each as its own app with its own icon — and the web build
 * ships them that way, as four manifests. A native build has one icon, so the
 * first screen has to ask which product the person came for. Nothing in the
 * handoff draws that screen; it is the cost of the single-binary decision and
 * this file is where it is paid, once.
 *
 * Names and descriptions are the web manifests' own (`apps/web/public/
 * manifest-*.json`), so the words under a home-screen icon and the words on
 * this card are the same words.
 */
export type SurfaceId = 'customer' | 'crew' | 'mp' | 'guest';

export type Surface = {
  id: SurfaceId;
  /** Where it starts — the web route, segment for segment. */
  href: '/customer' | '/crew' | '/mp' | '/qr';
  name: Readonly<Record<Lang, string>>;
  description: Readonly<Record<Lang, string>>;
  /** Two letters for the tile. */
  mark: string;
};

export const SURFACES: readonly Surface[] = [
  {
    id: 'customer',
    href: '/customer',
    mark: 'Bu',
    name: { uz: 'Buyurtma', ru: 'Заказ', en: 'Order' },
    description: {
      uz: 'Menyu, yetkazib berish va olib ketish',
      ru: 'Меню, доставка и самовывоз',
      en: 'Menu, delivery and pickup',
    },
  },
  {
    id: 'mp',
    href: '/mp',
    mark: 'My',
    name: { uz: 'MyPOS', ru: 'MyPOS', en: 'MyPOS' },
    description: {
      uz: 'Yaqin atrofdagi restoranlardan buyurtma',
      ru: 'Заказ из ближайших ресторанов',
      en: 'Order from restaurants nearby',
    },
  },
  {
    id: 'guest',
    href: '/qr',
    mark: 'QR',
    name: { uz: 'Stol', ru: 'Стол', en: 'Table' },
    description: {
      uz: 'Stoldagi QR kodni o‘qing',
      ru: 'Отсканируйте QR-код на столе',
      en: 'Scan the QR code on your table',
    },
  },
  {
    id: 'crew',
    href: '/crew',
    mark: 'Xo',
    name: { uz: 'Xodimlar', ru: 'Сотрудники', en: 'Staff' },
    description: {
      uz: 'Stollar, buyurtmalar, tasdiqlar va smena',
      ru: 'Столы, заказы, подтверждения и смена',
      en: 'Tables, orders, approvals and the shift',
    },
  },
];
