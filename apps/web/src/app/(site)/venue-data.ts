/**
 * A restaurant's own website, as data.
 *
 * Not `(marketing)/site-data.ts` — that one sells the platform to restaurant
 * owners, and this one sells dinner to a person in Chilonzor. Two products, two
 * audiences, and a shared file would have been the first place they got
 * confused with each other.
 *
 * House rule, again: types and fixtures here, anything that calls the server in
 * a sibling `*-server.ts` only server components import.
 *
 * Most of what is below has stopped being the answer and become the *fallback*,
 * which is a different job and worth stating: `GET /api/v1/public/site` now
 * publishes the venue and its branches, `GET /api/v1/public/branches` their
 * opening hours, and `GET /api/v1/public/menu` the dishes with their modifier
 * groups. A render with none of those behind it still has to draw a readable
 * restaurant rather than an empty page, and these are what it draws.
 *
 * The one set that is a *decision* rather than a fallback is `HIGHLIGHTS` — see
 * its own note. A rating and a thirty-day order count are the restaurant's
 * commercial figures, and this is the surface strangers read.
 */

export type SiteLocale = 'uz' | 'ru' | 'en';

export type Trilingual = Readonly<Record<SiteLocale, string>>;

export function say(value: Trilingual, locale: SiteLocale): string {
  return value[locale] || value.uz;
}

/** 1 so'm = 100 tiyin. Every amount on this site is tiyin, like everywhere. */
export function som(amount: number): number {
  return amount * 100;
}

export type VenueBranch = {
  id: string;
  /** A branch is named after its district. Not translated. */
  name: string;
  address: Trilingual;
  /**
   * The number printed on this branch's page, or null when it has none.
   *
   * Nullable, and that is the whole point of the field. It used to fall back to
   * the demo's `+998 71 200 07 00` on a live read, so a real restaurant that had
   * not filled its telephone in published the sample number on its own website
   * and in its JSON-LD — and guests rang it. A missing contact row is honest; a
   * wrong number is somebody else's phone ringing at dinner time.
   */
  phone: string | null;
  /** `HH:MM`, the venue's own clock. Null where the hours are not published. */
  opens: string | null;
  closes: string | null;
  /**
   * Minutes, as the site quotes a range — null until something publishes one.
   *
   * Delivery windows belong to Orders and pickup timing to the kitchen, and
   * neither is on `GET /public/site`. `35–50` was hardcoded onto every live
   * branch, which is a promise about how long a stranger waits for their food.
   */
  deliveryEta: string | null;
  /** How long a collection order takes to be ready. Null when unpublished. */
  pickupMinutes: number | null;
  /**
   * Whether this branch takes reservations at all — `dc.html:1035`.
   *
   * Optional and defaulting to true: four of the five do, and a field every
   * entry has to spell out is a field somebody forgets on the sixth.
   */
  bookable?: boolean;
};

/**
 * Five branches, which is what the design's venue has.
 *
 * `branches` is a core table and a real deployment reads it — but not from
 * here: this page is served to anonymous readers and the branch list carries
 * addresses and phone numbers a restaurant chooses to publish, which is a
 * different decision from the one `GET /api/v1/settings/branches` answers for
 * signed-in staff. The endpoint that publishes them does not exist yet, and
 * inventing one from the staff route would put every branch of every tenant a
 * slug-guess away.
 */
export const BRANCHES: readonly VenueBranch[] = [
  {
    id: 'chilonzor',
    name: 'Chilonzor',
    address: {
      uz: 'Chilonzor 24, Bunyodkor ko‘chasi 12',
      ru: 'Чиланзар 24, ул. Бунёдкор 12',
      en: 'Chilonzor 24, Bunyodkor street 12',
    },
    phone: '+998 71 200 07 01',
    opens: '10:00',
    closes: '23:00',
    deliveryEta: '25–40',
    pickupMinutes: 20,
  },
  {
    id: 'yunusobod',
    name: 'Yunusobod',
    address: {
      uz: 'Yunusobod 4, Amir Temur 108',
      ru: 'Юнусабад 4, Амира Темура 108',
      en: 'Yunusobod 4, Amir Temur 108',
    },
    phone: '+998 71 200 07 02',
    opens: '10:00',
    closes: '23:00',
    deliveryEta: '30–45',
    pickupMinutes: 25,
  },
  {
    id: 'sergeli',
    name: 'Sergeli',
    address: {
      uz: 'Sergeli 7, Yangi Sergeli 22',
      ru: 'Сергели 7, Янги Сергели 22',
      en: 'Sergeli 7, Yangi Sergeli 22',
    },
    phone: '+998 71 200 07 03',
    opens: '11:00',
    closes: '22:00',
    deliveryEta: '40–55',
    pickupMinutes: 30,
  },
  {
    id: 'mirzo-ulugbek',
    name: "Mirzo Ulug'bek",
    address: {
      uz: 'Mirzo Ulug‘bek, Buyuk Ipak Yo‘li 64',
      ru: 'Мирзо Улугбек, Буюк Ипак Йули 64',
      en: 'Mirzo Ulug‘bek, Buyuk Ipak Yo‘li 64',
    },
    phone: '+998 71 200 07 04',
    opens: '10:00',
    closes: '23:00',
    deliveryEta: '35–45',
    pickupMinutes: 25,
  },
  {
    id: 'termiz',
    name: 'Termiz',
    address: {
      uz: 'Termiz, Al-Termiziy 9',
      ru: 'Термез, Ал-Термизий 9',
      en: 'Termiz, Al-Termiziy 9',
    },
    phone: '+998 76 220 07 05',
    opens: '11:00',
    closes: '22:00',
    deliveryEta: '35–50',
    pickupMinutes: 35,
    /*
     * The one branch that does not take bookings — `dc.html:826`, `open:false`,
     * and `pickBranches` filters on it.
     *
     * It is a state a five-branch fixture has to carry, because the booking
     * form's branch list is the only place the difference between "closed right
     * now" and "not taking bookings" shows up. Every branch being bookable made
     * the filter unreachable and the state untestable.
     */
    bookable: false,
  },
];

/** What the hero says about the venue, above the fold and in the meta tags. */
export const VENUE = {
  /** A restaurant's name is a proper noun. One spelling, three languages. */
  name: 'Osh Xona',
  since: 2014,
  rating: '4.9',
  ratingCount: 1_240,
  /**
   * Free delivery above this, in tiyin.
   *
   * 150 000 so'm, and it is asserted in four places on this surface — the hero
   * strip, the delivery quick-action, the FAQ answer and the cart's fee rule.
   * They all read this constant for the same reason the receipt and the phone
   * read one price: a threshold a guest is told twice and charged once by is
   * how a delivery fee turns into a complaint.
   */
  freeDeliveryOver: som(150_000),
  /** Charged below the threshold, in tiyin. */
  deliveryFee: som(15_000),
  /** What a party has to reach before the site sends them to the telephone. */
  largeOrderFrom: 8,
  /** The number the large-order card and the footer both print. */
  phone: '+998 71 200 07 00',
  email: 'salom@oshxona.uz',
  telegram: 't.me/oshxona',
  /** Initials for the monogram the header and footer both draw. */
  monogram: 'OX',
} as const;

/**
 * The three social accounts the footer links.
 *
 * Hrefs rather than handles, because two of the three are not `t.me/<name>` and
 * a footer that builds a URL from a handle gets Instagram wrong. `icon` is a
 * single path so the footer draws one `<svg>` shape for all three.
 */
export const SOCIALS: readonly { id: string; label: string; href: string; icon: string }[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    href: 'https://t.me/oshxona',
    icon: 'm21.5 4.5-3 15.5-6-4.5-3 3v-4.5l9-8-11 6.5-4.5-1.5z',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    href: 'https://instagram.com/oshxona',
    icon: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM17.5 6.5h.01',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    href: 'https://youtube.com/@oshxona',
    icon: 'M2.5 8.5a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3zM10 9.5l5 2.5-5 2.5z',
  },
];

/**
 * The four dishes the home page calls "ordered most often", and their numbers.
 *
 * The strip used to be `dishes.slice(0, 4)` under a heading that said "over the
 * last 30 days" — the heading asserted a ranking the data had never been sorted
 * by, which is the one kind of wrong a menu must not be: a guest reads it as
 * the kitchen's own recommendation.
 *
 * So the set is curated, exactly as the design curates it, and it is matched to
 * the live menu by name rather than by id — the design's `d1`/`d6` ids belong
 * to its own fixture and a real tenant's ids are whatever the database issued.
 * A highlight that matches nothing is dropped rather than drawn, and if none
 * match the page falls back to the first four dishes **under a different
 * subtitle**, so the claim disappears together with the evidence for it.
 *
 * ---------------------------------------------------------------------------
 * The numbers stay editorial, and that is the decision rather than a gap
 *
 * A real "412 orders in thirty days" is a `count(*)` over `order_items`, and
 * publishing it means publishing a restaurant's per-dish sales figures on an
 * endpoint with no login, at a stable URL, where the competitor across the road
 * reads the same page every morning. Rank, volume and the shape of a week are
 * the most commercially sensitive things a kitchen has; none of them belong on
 * the one surface built to be indexed by strangers.
 *
 * So this is not an endpoint waiting to be written. It is a venue's own choice
 * of four dishes to put in the window — the same choice it makes with a
 * blackboard outside — matched to the live menu by name so it can never quote a
 * price the kitchen did not set. The subtitle only claims a ranking when all
 * four resolved; otherwise the page says "some of what we cook" instead.
 */
export type Highlight = {
  /** Lowercase substring of the dish name. First match in menu order wins. */
  match: string;
  orders30d: number;
  rating: string;
  badge?: 'mostOrdered' | 'baked';
};

export const HIGHLIGHTS: readonly Highlight[] = [
  { match: 'osh', orders30d: 412, rating: '4.9', badge: 'mostOrdered' },
  { match: 'somsa', orders30d: 286, rating: '4.7' },
  { match: 'kabob', orders30d: 331, rating: '4.8' },
  { match: 'non', orders30d: 508, rating: '4.9', badge: 'baked' },
];

/**
 * Whether the kitchen is open, by the venue's own clock.
 *
 * `HH:MM` string comparison rather than dates, and it is not laziness: the
 * question is "is 19:40 between 10:00 and 23:00 in Tashkent", and building two
 * `Date` objects to ask it drags the server's timezone into an answer that has
 * nothing to do with where the server is. A venue that closes after midnight
 * would need more than this, and none of the five does.
 */
export function isOpenAt(branch: VenueBranch, hhmm: string): boolean {
  // A venue that has not published its hours is not claimed to be open. "Open
  // now" is the line a guest sets out on.
  if (branch.opens === null || branch.closes === null) return false;

  return hhmm >= branch.opens && hhmm < branch.closes;
}

/**
 * The three portions the dish sheet offers, and what each adds.
 *
 * `dc.html:874-878` — the surcharge is a **percentage of the dish**, not a
 * fixed sum: `[0, p*0.35, p*0.75]`. The build carried 1.4× and 1.9× instead,
 * which on a 96 000 so'm sharing plate quoted 9 600 so'm more than the design
 * and 19 200 more than the menu it was printed from.
 *
 * `delta` is the label the sheet draws down the right edge. It is a formatted
 * percentage rather than a computed one because the design prints exactly these
 * two strings, and nothing on this surface should be rendering `+35.0000001%`.
 *
 * **This is now the fallback rather than the answer.** `GET /api/v1/public/menu`
 * carries `modifier_groups` per dish — the venue's own sizes, at the venue's own
 * surcharges, with the kitchen's own choice ids — and `SiteOptionGroup` below is
 * that payload. A dish that publishes groups is priced from them; one that
 * publishes none falls back to these three, because a menu the API could not
 * answer for still has to open a sheet a guest can read.
 */
export type SitePortion = {
  key: 'one' | 'large' | 'two';
  /** Multiplied into the dish price. 1 is the base portion. */
  factor: number;
  /** What the sheet prints on the right — empty for the base portion. */
  delta: string;
};

export const PORTIONS: readonly SitePortion[] = [
  { key: 'one', factor: 1, delta: '' },
  { key: 'large', factor: 1.35, delta: '+35%' },
  { key: 'two', factor: 1.75, delta: '+75%' },
];

/**
 * The four add-ons the sheet offers — `dc.html:882-887`, `ADDON_PRICE`.
 *
 * The build had **one**, labelled with the group's own heading
 * ("Qo'shimchalar") and priced at 8 000 so'm, which is a number that appears
 * nowhere in the design. A guest ticking it was charged for something the menu
 * does not sell.
 *
 * Prices are tiyin, as everywhere: the design writes so'm and `som()` converts,
 * so the two can never be read as the same unit by accident.
 *
 * **The fallback half, like `PORTIONS` above.** These four belong to
 * `modifier_groups`, and the public menu publishes them: the same rows the till
 * reads through `App\Contracts\Menu\ModifierQuestion`, resolved for the reader's
 * language and carrying the option ids `POST /api/v1/public/orders` prices a
 * line by. A live sheet draws those; this is what a sheet shows when the
 * catalogue did not answer.
 */
export type SiteAddon = {
  key: 'qazi' | 'egg' | 'salad' | 'bread';
  /** Tiyin, added to the unit price once. */
  price: number;
};

export const ADDONS: readonly SiteAddon[] = [
  { key: 'qazi', price: som(14_000) },
  { key: 'egg', price: som(5_000) },
  { key: 'salad', price: som(12_000) },
  { key: 'bread', price: som(6_000) },
];

/**
 * One question a dish asks, exactly as the public menu publishes it.
 *
 * `Modules\Menu\Http\Resources\ModifierGroupResource` field for field, with the
 * snake case unwound — and the ids kept as strings because everything else on
 * this surface identifies a dish with one. They are the kitchen's own numbers:
 * `POST /api/v1/public/orders` re-prices every line through
 * `App\Contracts\Menu\MenuCatalog` and accepts a choice only if the dish
 * actually offers it, so a sheet that sent its own labels would have the guest
 * charged for a base portion after quoting a sharing plate.
 *
 * `min`/`max` are what makes the control a radio or a checkbox. A group that
 * must be answered (`min >= 1`) opens with its first choice already picked,
 * because the alternative is an add button a guest cannot press and no sentence
 * saying why.
 */
export type SiteChoice = {
  id: string;
  title: string;
  /** Tiyin, signed: a small cup is worth less than nothing, "no onion" nothing. */
  priceDelta: number;
};

export type SiteOptionGroup = {
  id: string;
  title: string;
  /** More than one answer allowed — the design's checkbox rather than its dot. */
  multi: boolean;
  min: number;
  /** `null` where the kitchen set no ceiling. */
  max: number | null;
  choices: readonly SiteChoice[];
};

/**
 * The four sittings the checkout offers besides "as soon as possible".
 *
 * `dc.html:1040-1044`. Times rather than a picker, and only four of them: a
 * kitchen that quotes 25–40 minutes has no use for a guest asking for 03:15,
 * and a native `<input type="time">` cannot say which hours the kitchen is
 * actually taking pre-orders for.
 *
 * The fallback, now that `preOrderSlots()` below derives the real ones from the
 * venue's own opening hours. Kept because it is what a checkout draws when the
 * branch list came from the fixtures — and because these four are the design's
 * own, which is what the fidelity test reads.
 */
export const WHEN_SLOTS: readonly string[] = ['13:00', '14:00', '19:00', '20:30'];

/**
 * Which whole hours this venue can be asked to cook for.
 *
 * The design draws four fixed sittings and they are the same four for every
 * branch, which is wrong the moment a venue closes at ten: a guest offered
 * 20:30 at a kitchen that shuts at 22:00 in Sergeli and at 23:00 in Chilonzor is
 * being offered one branch's hours on another's page. `GET
 * /api/v1/public/branches` publishes `opens` and `closes` per venue, and this is
 * that read as sittings — every full hour the kitchen is open for, from the
 * first one far enough ahead to cook.
 *
 * `WHEN_SLOTS` stays as the fallback and is what a render with no API behind it
 * draws. Pure and parameterised on the clock rather than reading it, so the test
 * checks an exact list rather than "roughly this evening".
 *
 * @param nowHere `HH:MM` on the venue's own clock — a guest in Berlin ordering
 *   at half past midnight is ordering for the restaurant's tomorrow.
 * @param leadMinutes How long the kitchen needs before the first sitting.
 */
export function preOrderSlots(
  branch: Pick<VenueBranch, 'opens' | 'closes'>,
  nowHere: string,
  leadMinutes = 60,
): readonly string[] {
  const open = branch.opens === null ? null : minutesOf(branch.opens);
  const close = branch.closes === null ? null : minutesOf(branch.closes);

  // A venue that trades past midnight, or one whose hours did not parse. Neither
  // is a window this can honestly draw, and the design's four are the answer
  // that at least came from a designer.
  if (open === null || close === null || close <= open) return WHEN_SLOTS;

  const earliest = Math.max(open, (minutesOf(nowHere) ?? 0) + leadMinutes);
  const slots: string[] = [];

  for (let at = Math.ceil(earliest / 60) * 60; at < close; at += 60) {
    slots.push(`${String(Math.floor(at / 60)).padStart(2, '0')}:00`);
  }

  // Everything left today is inside the lead time — the kitchen closes before it
  // could cook. "As soon as possible" is then the only honest answer and the
  // select falls back to offering just that.
  return slots;
}

/** `HH:MM` to minutes past midnight, or null for anything that is not one. */
function minutesOf(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);

  if (match === null) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours > 23 || minutes > 59 ? null : hours * 60 + minutes;
}

/**
 * A venue as the checkout needs it, whichever list it came from.
 *
 * The screen draws one list and the server assembles it, because the two
 * possible sources answer different halves. `GET /api/v1/public/branches` has
 * the row id and the delivery fee and no pickup timing; `BRANCHES` above has
 * the design's timings and no ids at all. Folding them here means the checkout
 * has one shape to render and one rule to obey: **`apiId === null` is a venue
 * this order cannot be sent to.**
 *
 * That null is the honest half. An order names a branch by id, and a checkout
 * that invented one would put somebody's dinner in another district — so a
 * fixture venue can be drawn, chosen and priced, and the placement refuses
 * before it is sent rather than after.
 */
export type CartVenue = {
  /** The slug, for the radio's own identity. */
  id: string;
  /** The row id `branch_id` is sent as, or null for a venue off the fixtures. */
  apiId: number | null;
  name: string;
  address: Trilingual;
  /**
   * Minutes until a collection order is ready, or null when unpublished.
   *
   * Nothing on the API carries a pickup time yet — see `VenueBranch`. Null
   * rather than the design's twenty, because this figure is a promise made to
   * somebody who is about to set out for the restaurant.
   */
  pickupMinutes: number | null;
  /** The range the "as soon as possible" line quotes, or null when unpublished. */
  deliveryEta: string | null;
  delivers: boolean;
  /** Tiyin, off this venue's own settings; null where nothing published one. */
  deliveryFee: number | null;
  /** The sittings this kitchen is open for — `preOrderSlots()` against its clock. */
  slots: readonly string[];
};

/**
 * The four rails the checkout offers — `dc.html:1046-1051`.
 *
 * The build had two, and the card button was labelled `Click · Payme · Uzcard`:
 * three different companies behind one control, so a guest who meant to pay
 * through the Payme app could not say so and the order reached the kitchen
 * marked "card".
 *
 * `brand` is the half that is **not** copy. Click is Click in all three
 * languages and `i18n.test.ts` rejects a catalogue key whose three values
 * match; the translated half (`Karta`, `Naqd`, and every description) lives in
 * `site.cart.pay.*`.
 */
export type PaymentRail = {
  id: 'card' | 'click' | 'payme' | 'cash';
  /** The company's own name, or `null` when the label is a translated word. */
  brand: string | null;
  /** Whether the courier has to make change — the rounding line depends on it. */
  isCash: boolean;
};

export const PAYMENT_RAILS: readonly PaymentRail[] = [
  { id: 'card', brand: null, isCash: false },
  { id: 'click', brand: 'Click', isCash: false },
  { id: 'payme', brand: 'Payme', isCash: false },
  { id: 'cash', brand: null, isCash: true },
];

/** The card schemes the card rail accepts. Identical in three languages, so data. */
export const CARD_SCHEMES = 'Uzcard, Humo, Visa';

/**
 * A rail's name, in the reader's language.
 *
 * Two halves from two places on purpose: `Click` and `Payme` are companies and
 * live in the table above, `Karta` and `Naqd` are words and live in the copy
 * catalogue. A rail label assembled anywhere else would end up as a fourth
 * spelling of one of the four.
 */
export function railLabel(id: string, words: { card: string; cash: string }): string {
  const rail = PAYMENT_RAILS.find((entry) => entry.id === id);

  if (rail === undefined) return id;
  if (rail.brand !== null) return rail.brand;

  return rail.isCash ? words.cash : words.card;
}
