/**
 * The two layers under a dish: raw goods, and what the kitchen makes from them.
 *
 * The design's Menu screen has **six** tabs — `menuTabs`, `Smart Restaurant
 * OS.dc.html:11207` — and two of them were missing here: `raw` and `prep`. They
 * are not extra tables. Without them a food cost is a guess: a six-hour broth
 * carries gas, labour and a yield loss, and a dish costed straight from raw
 * kilograms never counts any of it.
 *
 * Every number below is transcribed from `RAW` and `PREP` at
 * `Smart Restaurant OS.dc.html:12653-12681`. Prices are so'm in the design file
 * and integer tiyin here, which is the repo's rule and the reason `som()`
 * exists rather than a literal with two extra zeros.
 *
 * Copy is trilingual and taken verbatim from the file's `P("uz","ru","en")`
 * calls. It lives here rather than in `src/i18n` because the catalogue is
 * shared across the whole console and this vocabulary belongs to one screen.
 */

export type Lang = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<Lang, string>>;

export const say = (text: Trilingual, lang: Lang): string => text[lang];

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/* --------------------------------------------------------------- raw goods */

/**
 * A raw good.
 *
 * `use` is the average consumed per day, and it is the only reason the cover
 * column can exist: "12 kg of beef" says nothing until it is read against the
 * 9.2 kg a day the kitchen goes through.
 */
export type RawGood = {
  id: string;
  name: Trilingual;
  category: Trilingual;
  /** The unit it is bought and counted in. */
  unit: 'kg' | 'l';
  /** Tiyin, per unit. */
  price: number;
  stock: number;
  /** Average consumption per day, in the same unit. */
  use: number;
  /** Index into STORES. */
  store: 0 | 1;
};

export const STORES: readonly Trilingual[] = [
  { uz: 'Asosiy ombor', ru: 'Основной склад', en: 'Main store' },
  { uz: 'Bar ombori', ru: 'Склад бара', en: 'Bar store' },
];

const MEAT: Trilingual = { uz: "Go'sht", ru: 'Мясо', en: 'Meat' };
const GRAINS: Trilingual = { uz: 'Yormalar', ru: 'Крупы', en: 'Grains' };
const VEG: Trilingual = { uz: 'Sabzavot', ru: 'Овощи', en: 'Vegetables' };
const DAIRY: Trilingual = { uz: 'Sut mahsulotlari', ru: 'Молочное', en: 'Dairy' };
const OILS: Trilingual = { uz: 'Moylar', ru: 'Масла', en: 'Oils' };
const SPICES: Trilingual = { uz: 'Ziravor', ru: 'Специи', en: 'Spices' };
const FRUIT: Trilingual = { uz: 'Meva', ru: 'Фрукты', en: 'Fruit' };

export const RAW_GOODS: readonly RawGood[] = [
  {
    id: 'r1',
    name: { uz: "Mol go'shti, orqa son", ru: 'Говядина, задняя часть', en: 'Beef, hindquarter' },
    category: MEAT,
    unit: 'kg',
    price: som(92_000),
    stock: 12,
    use: 9.2,
    store: 0,
  },
  {
    id: 'r2',
    name: { uz: "Qo'y go'shti", ru: 'Баранина', en: 'Lamb' },
    category: MEAT,
    unit: 'kg',
    price: som(118_000),
    stock: 18,
    use: 4.1,
    store: 0,
  },
  {
    id: 'r3',
    name: { uz: 'Tovuq filesi', ru: 'Куриное филе', en: 'Chicken fillet' },
    category: MEAT,
    unit: 'kg',
    price: som(46_000),
    stock: 19,
    use: 7.8,
    store: 0,
  },
  {
    id: 'r4',
    name: { uz: 'Guruch, lazer', ru: 'Рис лазер', en: 'Rice, lazer' },
    category: GRAINS,
    unit: 'kg',
    price: som(21_000),
    stock: 48,
    use: 7.9,
    store: 0,
  },
  {
    id: 'r5',
    name: { uz: 'Un, oliy nav', ru: 'Мука высший сорт', en: 'Flour, top grade' },
    category: GRAINS,
    unit: 'kg',
    price: som(8_500),
    stock: 62,
    use: 11.4,
    store: 0,
  },
  {
    id: 'r6',
    name: { uz: 'Sabzi', ru: 'Морковь', en: 'Carrot' },
    category: VEG,
    unit: 'kg',
    price: som(7_000),
    stock: 26,
    use: 6.2,
    store: 0,
  },
  {
    id: 'r7',
    name: { uz: 'Piyoz', ru: 'Лук', en: 'Onion' },
    category: VEG,
    unit: 'kg',
    price: som(5_500),
    stock: 31,
    use: 5.4,
    store: 0,
  },
  {
    id: 'r8',
    name: { uz: 'Pomidor', ru: 'Помидор', en: 'Tomato' },
    category: VEG,
    unit: 'kg',
    price: som(12_000),
    stock: 9,
    use: 4.8,
    store: 0,
  },
  {
    id: 'r9',
    name: { uz: 'Mozzarella', ru: 'Моцарелла', en: 'Mozzarella' },
    category: DAIRY,
    unit: 'kg',
    price: som(84_000),
    stock: 7,
    use: 3.9,
    store: 0,
  },
  {
    id: 'r10',
    name: { uz: 'Zaytun moyi', ru: 'Оливковое масло', en: 'Olive oil' },
    category: OILS,
    unit: 'l',
    price: som(96_000),
    stock: 14,
    use: 1.2,
    store: 0,
  },
  {
    id: 'r11',
    name: { uz: 'Paxta moyi', ru: 'Хлопковое масло', en: 'Cottonseed oil' },
    category: OILS,
    unit: 'l',
    price: som(24_000),
    stock: 38,
    use: 4.6,
    store: 0,
  },
  {
    id: 'r12',
    name: { uz: 'Tuz', ru: 'Соль', en: 'Salt' },
    category: SPICES,
    unit: 'kg',
    price: som(3_000),
    stock: 24,
    use: 0.9,
    store: 0,
  },
  {
    id: 'r13',
    name: { uz: 'Zira', ru: 'Зира', en: 'Cumin' },
    category: SPICES,
    unit: 'kg',
    price: som(62_000),
    stock: 3,
    use: 0.14,
    store: 0,
  },
  {
    id: 'r14',
    name: { uz: 'Limon', ru: 'Лимон', en: 'Lemon' },
    category: FRUIT,
    unit: 'kg',
    price: som(28_000),
    stock: 6,
    use: 1.1,
    store: 1,
  },
];

export const RAW_BY_ID = new Map(RAW_GOODS.map((row) => [row.id, row]));

/** Days of cover. Capped at 99 when nothing is consumed, never divided by zero. */
export const coverDays = (row: RawGood): number => (row.use > 0 ? row.stock / row.use : 99);

/* -------------------------------------------------------------- prep items */

/**
 * Something the kitchen makes in a batch and then spends across several dishes.
 *
 * `yieldPct` is the whole point of the layer. Eight litres of stock in the pot
 * is 6.72 litres out at 84%, and the cost per litre is the batch cost divided
 * by what came *out*, not by what went in.
 */
export type PrepItem = {
  id: string;
  name: Trilingual;
  unit: 'l' | 'kg';
  /** What goes into one batch, in `unit`. */
  batch: number;
  /** Percent of the batch that survives cooking. */
  yieldPct: number;
  /** How long a batch takes. */
  hours: number;
  /** How many dishes on the menu use it. */
  dishes: number;
  /** On hand, in `unit`. */
  stock: number;
  /** Shelf life once made. */
  expDays: number;
  /** Raw good id and how much of it one batch takes. */
  lines: readonly (readonly [string, number])[];
};

export const PREP_ITEMS: readonly PrepItem[] = [
  {
    id: 's1',
    name: { uz: 'Qaynatma, mol', ru: 'Бульон говяжий', en: 'Beef broth' },
    unit: 'l',
    batch: 8,
    yieldPct: 84,
    hours: 6,
    dishes: 4,
    stock: 11,
    expDays: 2,
    lines: [
      ['r1', 5],
      ['r6', 1.2],
      ['r7', 0.8],
      ['r12', 0.1],
    ],
  },
  {
    id: 's2',
    name: { uz: 'Xamir, chuchvara', ru: 'Тесто пельменное', en: 'Dumpling dough' },
    unit: 'kg',
    batch: 12,
    yieldPct: 96,
    hours: 1.5,
    dishes: 3,
    stock: 4,
    expDays: 1,
    lines: [
      ['r5', 10],
      ['r12', 0.15],
    ],
  },
  {
    id: 's3',
    name: { uz: 'Qiyma, aralash', ru: 'Фарш смешанный', en: 'Mixed mince' },
    unit: 'kg',
    batch: 6,
    yieldPct: 92,
    hours: 1,
    dishes: 5,
    stock: 2.4,
    expDays: 1,
    lines: [
      ['r1', 3.5],
      ['r2', 2.5],
      ['r7', 0.6],
      ['r12', 0.08],
    ],
  },
  {
    id: 's4',
    name: { uz: 'Pomidor sousi', ru: 'Томатный соус', en: 'Tomato sauce' },
    unit: 'l',
    batch: 5,
    yieldPct: 78,
    hours: 2,
    dishes: 6,
    stock: 0.8,
    expDays: 4,
    lines: [
      ['r8', 4.5],
      ['r7', 0.5],
      ['r10', 0.3],
      ['r12', 0.06],
    ],
  },
  {
    id: 's5',
    name: { uz: 'Sezar sousi', ru: 'Соус Цезарь', en: 'Caesar dressing' },
    unit: 'l',
    batch: 2,
    yieldPct: 95,
    hours: 0.5,
    dishes: 2,
    stock: 1.4,
    expDays: 3,
    lines: [
      ['r10', 0.9],
      ['r14', 0.4],
      ['r12', 0.03],
    ],
  },
];

/** What one batch of raw goods costs, in tiyin. */
export const batchCost = (item: PrepItem): number =>
  item.lines.reduce((sum, [id, quantity]) => {
    const raw = RAW_BY_ID.get(id);

    return sum + (raw ? raw.price * quantity : 0);
  }, 0);

/** What actually comes out of one batch, after the yield loss. */
export const outQty = (item: PrepItem): number =>
  Number((item.batch * (item.yieldPct / 100)).toFixed(2));

/** Tiyin per finished unit — batch cost over what came out, never over what went in. */
export const prepUnitCost = (item: PrepItem): number =>
  Math.round(batchCost(item) / Math.max(0.01, outQty(item)));

/* ------------------------------------------------- what the prep panel draws */

/**
 * A prep card as the panel renders it — the kitchen's own, or the fixture's.
 *
 * Two sources draw the same tab. `GET /api/v1/inventory/prep` answers rows out
 * of `inventory.prep_items`, costed by the server; with no session there is no
 * answer and the fixtures above stand in. Rather than teach the panel which of
 * the two it is holding, both are mapped onto this shape first — the mapping is
 * where the difference lives, and it is a pure function so it can be tested
 * without a server.
 *
 * Quantities are in `unit` and nothing converts them. The API holds prep in
 * base units (`g`, `ml`) and the fixtures in `kg` and `l`; a card carries its
 * own unit and prints it, which is one arithmetic drift fewer than a table of
 * conversions that has to agree with the server's.
 */
export type PrepCardRow = {
  /**
   * The row `POST /api/inventory/prep` names, or null for a fixture card.
   *
   * Null is the whole guard on the record button: a demo card has nothing on
   * the server to produce against, and posting `s1` would be refused as a
   * validation error the panel would then have to show as a real failure.
   */
  id: number | null;
  /** Stable across a re-render — which card is selected, and React's key. */
  key: string;
  name: string;
  unit: string;
  /** What goes into one batch, in `unit`. */
  batch: number;
  /** Percent of the batch that survives cooking. */
  yieldPct: number;
  /** What one batch actually yields, in `unit` — the batch less the loss. */
  made: number;
  /** How long a batch takes, or null: `prep_items` does not record it. */
  hours: number | null;
  /** Menu items using it, or null — the prep endpoint does not join the menu. */
  dishes: number | null;
  /** On hand, in `unit`. */
  onHand: number;
  shelfDays: number;
  /** Tiyin, for one batch of raw goods. */
  batchCost: number;
  /** Tiyin per finished `unit`. */
  unitCost: number;
  lines: readonly PrepLineRow[];
};

/** One recipe line: how much of one raw good a single batch takes. */
export type PrepLineRow = {
  /** Unique within the card — the fixture's raw id, or the ingredient's. */
  key: string;
  name: string;
  /** Per batch, in `unit`. */
  per: number;
  unit: string;
  /** Tiyin per `unit`. */
  price: number;
  /**
   * What is on the shelf, or null when this render cannot know.
   *
   * The fixture shelf is right here in `RAW_GOODS`. A live card's is not: the
   * prep endpoint answers a recipe and its cost, never a balance, so a live
   * line prints what it will take and no comparison. Printing a zero instead
   * would read as "none left" and stop a kitchen from making the stock.
   */
  have: number | null;
};

/** What `GET /api/v1/inventory/prep` answers, narrowed to what this tab draws. */
export type ApiPrepItem = {
  id: number;
  code: string;
  /** The jsonb `{uz, ru, en}` column, or a plain string on an older row. */
  name: Partial<Trilingual> | string | null;
  unit: string;
  batch_quantity: number | string;
  loss_percent: number | string;
  /** `usable_yield` — the batch less the loss, never stored. */
  yield: number | string;
  shelf_life_days: number | string;
  on_hand: number | string;
  batch_cost_tiyin: number | string;
  unit_cost_tiyin: number | string;
  components: readonly {
    ingredient_id: number;
    name: string | null;
    unit: string | null;
    quantity: number | string;
    cost_per_unit: number | string | null;
  }[];
};

/**
 * A number the API sent, whatever it sent it as.
 *
 * `PrepItem` casts its columns to `integer` today, so these arrive as JSON
 * numbers. They are typed as either because a decimal column that loses its
 * cast comes back from PDO as a string, and a string reaching the arithmetic
 * below does not throw — it concatenates. `4.2 + 1.8` becoming `"4.21.8"` on a
 * stock figure is the kind of wrong that gets read as real.
 */
const count = (value: number | string | null | undefined): number => {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
};

/** The stored `{uz, ru, en}` name resolved for the reader, or the card's code. */
const nameOf = (value: ApiPrepItem['name'], fallback: string, lang: Lang): string => {
  if (typeof value === 'string') return value === '' ? fallback : value;
  if (value === null || value === undefined) return fallback;

  return value[lang] ?? value.uz ?? value.ru ?? value.en ?? fallback;
};

/** One card from the API, in the shape the panel draws. */
export const prepCardFrom = (row: ApiPrepItem, lang: Lang): PrepCardRow => ({
  id: row.id,
  key: String(row.id),
  name: nameOf(row.name, row.code, lang),
  unit: row.unit,
  batch: count(row.batch_quantity),
  // The server sends the loss; the card shows what survives it, which is the
  // figure the design's yield row and its "low yield" warning are drawn from.
  yieldPct: 100 - count(row.loss_percent),
  made: count(row.yield),
  hours: null,
  dishes: null,
  onHand: count(row.on_hand),
  shelfDays: count(row.shelf_life_days),
  batchCost: count(row.batch_cost_tiyin),
  unitCost: count(row.unit_cost_tiyin),
  lines: row.components.map((line) => ({
    key: String(line.ingredient_id),
    // An ingredient that has been deleted under the card leaves the line with
    // no name. It still costs and is still consumed, so it is drawn.
    name: line.name ?? '—',
    per: count(line.quantity),
    unit: line.unit ?? row.unit,
    price: count(line.cost_per_unit),
    have: null,
  })),
});

/** Every card the API answered with. */
export const prepCardsFrom = (rows: readonly ApiPrepItem[], lang: Lang): readonly PrepCardRow[] =>
  rows.map((row) => prepCardFrom(row, lang));

/**
 * The fixture cards in the same shape, for the console with no session.
 *
 * These carry `id: null`, which is what stops the record button posting them,
 * and a real `have` per line, because the demo shelf is `RAW_GOODS` above.
 */
export const fixturePrepCards = (lang: Lang): readonly PrepCardRow[] =>
  PREP_ITEMS.map((item) => ({
    id: null,
    key: item.id,
    name: say(item.name, lang),
    unit: item.unit,
    batch: item.batch,
    yieldPct: item.yieldPct,
    made: outQty(item),
    hours: item.hours,
    dishes: item.dishes,
    onHand: item.stock,
    shelfDays: item.expDays,
    batchCost: Math.round(batchCost(item)),
    unitCost: prepUnitCost(item),
    lines: item.lines.map(([id, per]) => {
      const raw = RAW_BY_ID.get(id);

      return {
        key: id,
        name: raw === undefined ? id : say(raw.name, lang),
        per,
        unit: raw?.unit ?? '',
        price: raw?.price ?? 0,
        have: raw?.stock ?? null,
      };
    }),
  }));

/* ------------------------------------------------------------------ copy */

export const PREP_COPY = {
  tabRaw: { uz: 'Xomashyo', ru: 'Сырьё', en: 'Raw goods' },
  tabPrep: { uz: 'Yarim tayyor', ru: 'Полуфабрикаты', en: 'Prep items' },

  searchRaw: {
    uz: "Xomashyo nomi bo'yicha qidirish",
    ru: 'Поиск по названию сырья',
    en: 'Search raw goods',
  },
  found: { uz: 'ta pozitsiya', ru: 'позиций', en: 'items' },
  name: { uz: 'Nomi', ru: 'Название', en: 'Name' },
  unit: { uz: "O'lchov", ru: 'Ед. изм.', en: 'Unit' },
  price: { uz: 'Narxi', ru: 'Цена', en: 'Unit price' },
  stock: { uz: 'Qoldiq', ru: 'Остаток', en: 'On hand' },
  store: { uz: 'Ombor', ru: 'Склад', en: 'Store' },
  cover: { uz: 'Yetadi', ru: 'Хватит', en: 'Cover' },
  day: { uz: 'kun', ru: 'дн', en: 'd' },
  rawNote: {
    uz: "Xomashyo — bevosita sotilmaydigan mahsulot. U yarim tayyor mahsulotga yoki to'g'ridan-to'g'ri taomga kiradi. Qoldiq har bir sotuvda texnologik karta bo'yicha avtomatik kamayadi.",
    ru: 'Сырьё не продаётся напрямую. Оно идёт в полуфабрикат или сразу в блюдо. Остаток списывается автоматически по техкарте при каждой продаже.',
    en: 'Raw goods are never sold directly. They go into a prep item or straight into a dish. Stock is deducted automatically by recipe on every sale.',
  },
  rawEmpty: {
    uz: 'Bunday xomashyo topilmadi',
    ru: 'Такого сырья не нашлось',
    en: 'No raw good matches that',
  },

  prepTitle: { uz: 'Yarim tayyor mahsulotlar', ru: 'Полуфабрикаты', en: 'Prep items' },
  prepSub: {
    uz: 'Partiya bilan tayyorlanadi, keyin bir necha taomga ketadi',
    ru: 'Готовятся партией и расходятся по нескольким блюдам',
    en: 'Made in batches, then used across several dishes',
  },
  newPrep: { uz: "Qo'shish", ru: 'Добавить', en: 'Add' },
  newPrepHint: {
    uz: "Yangi yarim tayyor mahsulot — nom, o'lchov, chiqim foizi va retsept kiritiladi",
    ru: 'Новый полуфабрикат — название, единица, процент выхода и рецепт',
    en: 'A new prep item — name, unit, yield percentage and recipe',
  },
  prepNote: {
    uz: "Yarim tayyor qatlami bo'lmasa tannarx noto'g'ri chiqadi: 6 soatlik qaynatmaning gazi, ish vaqti va chiqim yo'qotishi hisobga olinmaydi.",
    ru: 'Без слоя полуфабрикатов себестоимость неверна: газ, рабочее время и потери выхода шестичасового бульона не учитываются.',
    en: 'Without the prep layer the food cost is wrong: the gas, labour and yield loss of a six-hour broth are never counted.',
  },
  dishes: { uz: 'ta taomda ishlatiladi', ru: 'блюд используют', en: 'dishes use it' },
  noDish: {
    uz: 'hech qaysi taomda ishlatilmaydi',
    ru: 'не используется ни в одном блюде',
    en: 'not used in any dish',
  },
  hour: { uz: 'soat', ru: 'ч', en: 'h' },
  batchCost: { uz: 'Partiya tannarxi', ru: 'Себестоимость партии', en: 'Batch cost' },
  unitCost: { uz: 'Birlik tannarxi', ru: 'Себестоимость единицы', en: 'Cost per unit' },
  recipe: {
    uz: 'Retsept — bitta partiyaga',
    ru: 'Рецепт — на одну партию',
    en: 'Recipe — one batch',
  },
  yieldLbl: { uz: 'Chiqim', ru: 'Выход', en: 'Yield' },
  yieldLow: {
    uz: "Chiqim past — qaynatishda yo'qotish katta. Tannarx shu yo'qotishni hisobga oladi.",
    ru: 'Низкий выход — большие потери при варке. Себестоимость это учитывает.',
    en: 'Low yield — heavy loss in cooking. The cost per unit accounts for it.',
  },
  yieldOk: {
    uz: "Chiqim me'yorda. Tannarx yo'qotishni hisobga olib hisoblangan.",
    ru: 'Выход в норме. Себестоимость посчитана с учётом потерь.',
    en: 'Yield is normal. The unit cost already includes the loss.',
  },
  produce: { uz: 'Ishlab chiqarish', ru: 'Производство', en: 'Produce a batch' },
  produceSub: {
    uz: "Necha partiya tayyorlanadi. Tasdiqlanganda xomashyo yechiladi va yarim tayyor qoldig'i oshadi.",
    ru: 'Сколько партий готовим. При подтверждении сырьё списывается, остаток полуфабриката растёт.',
    en: 'How many batches. On confirm the raw goods are deducted and the prep stock goes up.',
  },
  willUse: { uz: 'Yechiladigan xomashyo', ru: 'Будет списано сырьё', en: 'Raw goods to be used' },
  runBtn: {
    uz: 'Ishlab chiqarishni qayd etish',
    ru: 'Записать производство',
    en: 'Record production',
  },
  runShort: { uz: 'Xomashyo yetmaydi', ru: 'Не хватает сырья', en: 'Not enough raw goods' },
  warnShort: {
    uz: 'xomashyo yetmaydi — avval qabul qiling yoki partiyani kamaytiring',
    ru: 'позиций сырья не хватает — сначала оформите приёмку или уменьшите партию',
    en: 'raw lines are short — receive stock first or reduce the batch',
  },
  warnOk: {
    uz: 'Yechilgan xomashyo ombor jurnaliga tushadi va tannarx shu narxda qotadi.',
    ru: 'Списанное сырьё попадёт в журнал склада, а себестоимость зафиксируется по этой цене.',
    en: 'The raw goods go to the stock journal and the cost is locked at this price.',
  },
  produced: { uz: 'tayyorlandi', ru: 'произведено', en: 'produced' },
  log: { uz: 'Bugungi ishlab chiqarish', ru: 'Производство за сегодня', en: 'Produced today' },
  logSub: { uz: 'Kim, qachon, qancha', ru: 'Кто, когда, сколько', en: 'Who, when, how much' },
  logEmpty: {
    uz: 'Bugun hali hech narsa tayyorlanmagan',
    ru: 'Сегодня ещё ничего не готовили',
    en: 'Nothing has been produced today yet',
  },
  cardsEmpty: {
    uz: "Bu restoranda hali yarim tayyor karta yo'q",
    ru: 'В этом ресторане ещё нет карточек полуфабрикатов',
    en: 'This restaurant has no prep cards yet',
  },
  ingredients: { uz: 'ta xomashyo', ru: 'позиций сырья', en: 'ingredients' },

  /* ---- The new-card form ---- */
  newCard: { uz: 'Yangi karta', ru: 'Новая карточка', en: 'New card' },
  newCardClose: { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
  cardCode: { uz: 'Kod', ru: 'Код', en: 'Code' },
  cardCodeHint: {
    uz: 'Retsept shu kod bilan chaqiradi — zirvak, xamir. Kichik harflar',
    ru: 'Рецепт ссылается на этот код — zirvak, xamir. Строчные буквы',
    en: 'A recipe refers to the card by this code — zirvak, dough. Lowercase',
  },
  cardName: { uz: 'Nomi', ru: 'Название', en: 'Name' },
  cardUnit: { uz: 'Birlik', ru: 'Единица', en: 'Unit' },
  cardBatch: { uz: 'Bir partiya', ru: 'Одна партия', en: 'One batch' },
  cardBatchHint: {
    uz: "Yo'qotishdan OLDIN qancha chiqadi",
    ru: 'Сколько выходит ДО потерь',
    en: 'What one batch yields BEFORE loss',
  },
  cardLoss: { uz: "Yo'qotish, %", ru: 'Потери, %', en: 'Loss, %' },
  cardLossHint: {
    uz: "Suv, qirqim, bug'lanish. Xarajat qolgan qismga bo'linadi",
    ru: 'Вода, обрезь, испарение. Себестоимость делится на остаток',
    en: 'Water, trim, evaporation. The cost is divided by what is left',
  },
  cardShelf: { uz: 'Saqlash, kun', ru: 'Хранение, дней', en: 'Shelf life, days' },
  cardLines: { uz: 'Tarkibi', ru: 'Состав', en: 'Components' },
  cardLinesHint: {
    uz: 'Bir partiyaga ketadigan miqdor, asosiy birlikda',
    ru: 'Количество на одну партию, в базовой единице',
    en: 'How much goes into ONE batch, in base units',
  },
  cardAddLine: { uz: "Qator qo'shish", ru: 'Добавить строку', en: 'Add a row' },
  cardSave: { uz: 'Kartani saqlash', ru: 'Сохранить карточку', en: 'Save the card' },
  cardSaving: { uz: 'Saqlanmoqda…', ru: 'Сохраняем…', en: 'Saving…' },
  cardSaved: { uz: 'Karta yaratildi', ru: 'Карточка создана', en: 'The card was created' },
  cardIncomplete: {
    uz: "Kod, nomi, partiya va kamida bitta tarkib qatori to'ldirilishi shart",
    ru: 'Нужны код, название, размер партии и хотя бы одна строка состава',
    en: 'A code, a name, a batch size and at least one component are required',
  },
  cardFailed: {
    uz: 'Server javob bermadi — karta yaratilmadi',
    ru: 'Сервер не ответил — карточка не создана',
    en: 'The server did not answer — no card was created',
  },
  shelfEmpty: {
    uz: "Omborda faol xomashyo yo'q — avval xomashyo qo'shing",
    ru: 'На складе нет активного сырья — сначала добавьте сырьё',
    en: 'There is no active stock on the shelf — add ingredients first',
  },
  runBusy: { uz: 'Yozilmoqda…', ru: 'Записываем…', en: 'Recording…' },
  runFailed: {
    uz: 'Server javob bermadi — partiya qayd etilmadi',
    ru: 'Сервер не ответил — партия не записана',
    en: 'The server did not answer — the batch was not recorded',
  },
  demoRun: {
    uz: 'Namunaviy karta — serverda hech narsa yozilmadi',
    ru: 'Демонстрационная карточка — на сервере ничего не записано',
    en: 'Sample card — nothing was recorded on the server',
  },
} as const satisfies Record<string, Trilingual>;

/**
 * What the item editor says back.
 *
 * `mnu.save` at `Smart Restaurant OS.dc.html:11389` refuses three things before
 * it writes anything, and each refusal is a sentence rather than a red border:
 * a missing Uzbek name, a price of nothing, and a food cost at or above the
 * price. The third is the one worth having — a dish that costs more than it
 * sells for is not a typo the kitchen will notice.
 */
export const EDITOR_COPY = {
  needName: {
    uz: "O'zbekcha nomi majburiy",
    ru: 'Название на узбекском обязательно',
    en: 'The Uzbek name is required',
  },
  needPrice: {
    uz: "Narx 0 dan katta bo'lishi kerak",
    ru: 'Цена должна быть больше 0',
    en: 'Price must be greater than 0',
  },
  costTooHigh: {
    uz: "Tannarx narxdan past bo'lishi kerak",
    ru: 'Себестоимость должна быть ниже цены',
    en: 'Food cost must be below the price',
  },
  saved: { uz: 'saqlandi', ru: 'сохранено', en: 'saved' },
} as const satisfies Record<string, Trilingual>;
