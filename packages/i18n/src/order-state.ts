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

/**
 * Which channels a state can occur on. A dine-in bill is never `enroute`.
 *
 * These are the API's own values, which are the database's. They were `dine`,
 * `delivery`, `pickup` — the design file's vocabulary — while `orders.channel`
 * stored `dine_in`, `takeaway`, `delivery`, `aggregator`, so no real order's
 * channel could be checked against this list. One vocabulary now, and it is the
 * one on the wire.
 */
export type OrderChannel = 'dine_in' | 'takeaway' | 'delivery' | 'aggregator';

export type Locale = 'uz' | 'ru' | 'en';

/**
 * The six tones a status can wear, matching `StatusChip` in `packages/ui`.
 *
 * `neutral` covers every state the design draws in `--bg-muted`: a draft, an
 * order that has been served, one that has been handed over, one that is paid.
 * Those are not *good* or *bad*, they are *done* — and colouring a completed
 * order green tells a manager scanning a list that something needs attention.
 */
export type StateTone = 'neutral' | 'brand' | 'warning' | 'success' | 'danger';

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
  /**
   * How the state is tinted, wherever it is drawn.
   *
   * The design gives every row in its `STATES` table a `bg`/`fg`/`dot` triple —
   * `Smart Restaurant OS.dc.html:10503-10529` — and the whole point of listing
   * them there rather than at each call site is that `cooking` is amber on the
   * KDS, on the order list, on the guest's tracker and on the merchant's card.
   * The labels moved here and the colours did not, so each surface picked its
   * own and the same state came out in three different tones.
   *
   * A tone, not a colour: `packages/ui`'s `StatusChip` already knows the
   * 50/700/500 pairing for each, and both steps are remapped for dark. Naming a
   * hex here would work in light and break in the room the till stands in.
   */
  readonly tone: StateTone;
}

const t = (uz: string, ru: string, en: string): Label => ({ uz, ru, en });

export const ORDER_STATE_SPECS: Readonly<Record<OrderState, OrderStateSpec>> = {
  draft: {
    key: 'draft',
    channels: ['dine_in'],
    staff: t('Qoralama', 'Черновик', 'Draft'),
    kitchen: null,
    guest: null,
    terminal: false,
    tone: 'neutral',
  },
  placed: {
    key: 'placed',
    channels: ['dine_in', 'takeaway', 'delivery', 'aggregator'],
    staff: t('Yangi', 'Новый', 'New'),
    kitchen: t('Yangi', 'Новый', 'New'),
    guest: t('Qabul qilindi', 'Принят', 'Received'),
    terminal: false,
    tone: 'neutral',
  },
  accepted: {
    key: 'accepted',
    channels: ['dine_in', 'takeaway', 'delivery', 'aggregator'],
    staff: t('Qabul qilindi', 'Принят', 'Accepted'),
    kitchen: t('Qabul qilindi', 'Принят', 'Accepted'),
    guest: t('Tasdiqlandi', 'Подтверждён', 'Confirmed'),
    terminal: false,
    tone: 'brand',
  },
  cooking: {
    key: 'cooking',
    channels: ['dine_in', 'takeaway', 'delivery', 'aggregator'],
    staff: t('Tayyorlanmoqda', 'Готовится', 'Cooking'),
    kitchen: t('Tayyorlanmoqda', 'Готовится', 'Cooking'),
    guest: t('Oshxonada', 'На кухне', 'In the kitchen'),
    terminal: false,
    tone: 'warning',
  },
  ready: {
    key: 'ready',
    channels: ['dine_in', 'takeaway', 'delivery', 'aggregator'],
    staff: t('Tayyor', 'Готов', 'Ready'),
    kitchen: t('Tayyor', 'Готов', 'Ready'),
    guest: t('Tayyor', 'Готов', 'Ready'),
    terminal: false,
    tone: 'success',
  },
  served: {
    key: 'served',
    channels: ['dine_in'],
    staff: t('Berildi', 'Подано', 'Served'),
    kitchen: t('Berildi', 'Подано', 'Served'),
    guest: t('Stolda', 'На столе', 'At your table'),
    terminal: false,
    tone: 'neutral',
  },
  enroute: {
    key: 'enroute',
    channels: ['delivery', 'aggregator'],
    staff: t('Kuryerda', 'У курьера', 'With courier'),
    kitchen: null,
    guest: t("Kuryer yo'lda", 'Курьер в пути', 'Courier on the way'),
    terminal: false,
    tone: 'brand',
  },
  handed: {
    key: 'handed',
    channels: ['takeaway', 'delivery', 'aggregator'],
    staff: t('Yetkazildi', 'Доставлен', 'Delivered'),
    kitchen: null,
    guest: t('Yetkazildi', 'Доставлен', 'Delivered'),
    terminal: false,
    tone: 'neutral',
  },
  topay: {
    key: 'topay',
    channels: ['dine_in'],
    staff: t("To'lov kutilmoqda", 'К оплате', 'To pay'),
    kitchen: null,
    guest: t('Hisob tayyor', 'Счёт готов', 'Bill is ready'),
    terminal: false,
    tone: 'warning',
  },
  paid: {
    key: 'paid',
    channels: ['dine_in', 'takeaway', 'delivery', 'aggregator'],
    staff: t("To'landi", 'Оплачен', 'Paid'),
    kitchen: null,
    guest: t('Yopildi', 'Закрыт', 'Closed'),
    terminal: true,
    tone: 'neutral',
  },
  voided: {
    key: 'voided',
    channels: ['dine_in', 'takeaway', 'delivery', 'aggregator'],
    staff: t('Bekor qilindi', 'Отменён', 'Voided'),
    kitchen: t('Bekor qilindi', 'Отменён', 'Voided'),
    guest: t('Bekor qilindi', 'Отменён', 'Cancelled'),
    terminal: true,
    tone: 'danger',
  },
  refunded: {
    key: 'refunded',
    channels: ['dine_in', 'takeaway', 'delivery', 'aggregator'],
    staff: t('Qaytarildi', 'Возвращён', 'Refunded'),
    kitchen: null,
    guest: t('Pul qaytarildi', 'Деньги возвращены', 'Money refunded'),
    terminal: true,
    tone: 'danger',
  },
  comped: {
    key: 'comped',
    channels: ['dine_in', 'takeaway', 'delivery', 'aggregator'],
    staff: t("Sovg'a", 'Подарок', 'Comped'),
    kitchen: null,
    guest: null,
    terminal: true,
    tone: 'warning',
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
