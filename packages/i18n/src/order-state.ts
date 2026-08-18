/**
 * The canonical order state ladder — one row, three audiences.
 *
 * The audit that produced this file found five vocabularies for one concept:
 * `Order::STATUSES` in the API (nine values, including `in_kitchen`, which
 * exists in no design artefact), the KDS ticket set (six), the console's own
 * strings (six), a ten-entry `TABLE_STATE` map in tables-server.ts, and the
 * design file's twelve. They had already drifted. This is the single source.
 *
 * Two rules follow from it and are enforced by the types below:
 *
 *   1. The database stores the KEY. `cooking`, never "Tayyorlanmoqda".
 *      A state that reaches a screen as a string has already lost the
 *      translation the other two audiences needed.
 *
 *   2. The label depends on WHO IS READING. The waiter, the cook and the
 *      guest see three different words for the same row, on purpose — a guest
 *      told "Berildi" learns nothing, and a cook shown "Yopildi" is being
 *      asked to care about the till.
 *
 * Keys are the design file's (`Smart Restaurant OS.dc.html`, STATES), not
 * DATABASE.md's — the handoff's own rule is that the file wins where the two
 * disagree, and they disagree on four of them: the file has `enroute`,
 * `handed` and `topay` where the document has `out_for_delivery`, `delivered`
 * and no waiting-to-pay state at all. `comped` is the one addition: the file
 * omits it, DECISIONS Q8 requires it, and a comp is not a void — different
 * money, different stock, different revenue.
 */

export const ORDER_STATES = [
  'draft',
  'placed',
  'accepted',
  'cooking',
  'ready',
  'served',
  'enroute',
  'handed',
  'topay',
  'paid',
  'voided',
  'refunded',
  'comped',
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

/** Who is reading the state. The same row reads differently to each. */
export type StateAudience = 'staff' | 'kitchen' | 'guest';

/** Which channels a state can occur on. A dine-in bill is never `enroute`. */
export type OrderChannel = 'dine' | 'delivery' | 'pickup';

export type Locale = 'uz' | 'ru' | 'en';

/** `null` means: this audience never sees this state, and must not be shown it. */
type Label = Readonly<Record<Locale, string>> | null;

export interface OrderStateSpec {
  readonly key: OrderState;
  readonly channels: readonly OrderChannel[];
  readonly staff: Label;
  readonly kitchen: Label;
  readonly guest: Label;
  /** Terminal states close a bill; nothing transitions out of them. */
  readonly terminal: boolean;
}

const t = (uz: string, ru: string, en: string): Label => ({ uz, ru, en });

export const ORDER_STATE_SPECS: Readonly<Record<OrderState, OrderStateSpec>> = {
  draft: {
    key: 'draft',
    channels: ['dine'],
    staff: t('Qoralama', 'Черновик', 'Draft'),
    kitchen: null,
    guest: null,
    terminal: false,
  },
  placed: {
    key: 'placed',
    channels: ['dine', 'delivery', 'pickup'],
    staff: t('Yangi', 'Новый', 'New'),
    kitchen: t('Yangi', 'Новый', 'New'),
    guest: t('Qabul qilindi', 'Принят', 'Received'),
    terminal: false,
  },
  accepted: {
    key: 'accepted',
    channels: ['dine', 'delivery', 'pickup'],
    staff: t('Qabul qilindi', 'Принят', 'Accepted'),
    kitchen: t('Qabul qilindi', 'Принят', 'Accepted'),
    guest: t('Tasdiqlandi', 'Подтверждён', 'Confirmed'),
    terminal: false,
  },
  cooking: {
    key: 'cooking',
    channels: ['dine', 'delivery', 'pickup'],
    staff: t('Tayyorlanmoqda', 'Готовится', 'Cooking'),
    kitchen: t('Tayyorlanmoqda', 'Готовится', 'Cooking'),
    guest: t('Oshxonada', 'На кухне', 'In the kitchen'),
    terminal: false,
  },
  ready: {
    key: 'ready',
    channels: ['dine', 'delivery', 'pickup'],
    staff: t('Tayyor', 'Готов', 'Ready'),
    kitchen: t('Tayyor', 'Готов', 'Ready'),
    guest: t('Tayyor', 'Готов', 'Ready'),
    terminal: false,
  },
  served: {
    key: 'served',
    channels: ['dine'],
    staff: t('Berildi', 'Подано', 'Served'),
    kitchen: t('Berildi', 'Подано', 'Served'),
    guest: t('Stolda', 'На столе', 'At your table'),
    terminal: false,
  },
  enroute: {
    key: 'enroute',
    channels: ['delivery'],
    staff: t('Kuryerda', 'У курьера', 'With courier'),
    kitchen: null,
    guest: t("Kuryer yo'lda", 'Курьер в пути', 'Courier on the way'),
    terminal: false,
  },
  handed: {
    key: 'handed',
    channels: ['delivery', 'pickup'],
    staff: t('Yetkazildi', 'Доставлен', 'Delivered'),
    kitchen: null,
    guest: t('Yetkazildi', 'Доставлен', 'Delivered'),
    terminal: false,
  },
  topay: {
    key: 'topay',
    channels: ['dine'],
    staff: t("To'lov kutilmoqda", 'К оплате', 'To pay'),
    kitchen: null,
    guest: t('Hisob tayyor', 'Счёт готов', 'Bill is ready'),
    terminal: false,
  },
  paid: {
    key: 'paid',
    channels: ['dine', 'delivery', 'pickup'],
    staff: t("To'landi", 'Оплачен', 'Paid'),
    kitchen: null,
    guest: t('Yopildi', 'Закрыт', 'Closed'),
    terminal: true,
  },
  voided: {
    key: 'voided',
    channels: ['dine', 'delivery', 'pickup'],
    staff: t('Bekor qilindi', 'Отменён', 'Voided'),
    kitchen: t('Bekor qilindi', 'Отменён', 'Voided'),
    guest: t('Bekor qilindi', 'Отменён', 'Cancelled'),
    terminal: true,
  },
  refunded: {
    key: 'refunded',
    channels: ['dine', 'delivery', 'pickup'],
    staff: t('Qaytarildi', 'Возвращён', 'Refunded'),
    kitchen: null,
    guest: t('Pul qaytarildi', 'Деньги возвращены', 'Money refunded'),
    terminal: true,
  },
  comped: {
    key: 'comped',
    channels: ['dine', 'delivery', 'pickup'],
    staff: t("Sovg'a", 'Подарок', 'Comped'),
    kitchen: null,
    guest: null,
    terminal: true,
  },
};

/** Every state, in ladder order. */
export const orderStateSpecs = (): readonly OrderStateSpec[] =>
  ORDER_STATES.map((k) => ORDER_STATE_SPECS[k]);

export const isOrderState = (v: unknown): v is OrderState =>
  typeof v === 'string' && (ORDER_STATES as readonly string[]).includes(v);

/**
 * The label this audience reads for this state, or `null` when the audience
 * is not shown it at all.
 *
 * Callers must handle `null` rather than falling back to the staff word: a
 * guest shown "Sovg'a" has been told the restaurant wrote their bill off, and
 * a kitchen screen showing "To'landi" is asking the line to care about money.
 */
export function stateLabel(
  state: OrderState,
  audience: StateAudience,
  locale: Locale,
): string | null {
  const label = ORDER_STATE_SPECS[state][audience];
  return label ? label[locale] : null;
}

/** Whether a state can occur on a channel — a dine-in bill is never `enroute`. */
export const stateAppliesTo = (state: OrderState, channel: OrderChannel): boolean =>
  ORDER_STATE_SPECS[state].channels.includes(channel);

/** The states a channel can actually reach, in ladder order. */
export const statesForChannel = (channel: OrderChannel): readonly OrderState[] =>
  ORDER_STATES.filter((s) => stateAppliesTo(s, channel));
