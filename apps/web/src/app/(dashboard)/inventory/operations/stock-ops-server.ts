import { apiGet, type Paginated } from '@/lib/api-server';

import type { Lang, Trilingual } from './stock-ops-data';

/**
 * The three lists the operations screen needs REAL ids for.
 *
 * Server half of ./stock-ops-data.ts — the split every screen here follows:
 * types and fixtures in `*-data.ts`, server calls in a sibling only server
 * components import (`tables-server.ts` explains why the two cannot be one
 * file).
 *
 * What this fetches is deliberately narrow. The tabs draw a great deal from
 * fixtures still, and that is fine while they only display; what they could not
 * do was WRITE, and every one of those three writes needs an id the fixtures do
 * not have. A transfer needs two branch ids and an ingredient id, a prep batch
 * needs a prep-item id, and neither `chilonzor` nor `zirvak` is one.
 *
 * Every function answers `null` rather than throwing, like every other
 * `*-server.ts`: no session, an expired token or an API mid-restart puts the
 * screen back on its fixtures with `session.live === false` beside them.
 */

/** `GET /api/v1/branches` — the venues a transfer can run between. */
type ApiBranch = { id: number; name: string; status?: string };

/** `GET /api/v1/inventory/ingredients` — narrowed to what a transfer line needs. */
type ApiIngredient = {
  id: number;
  name: string;
  unit: string;
  stock_quantity: number;
  /** Tiyin per one base unit — what a write-off costs the kitchen. */
  cost_per_unit: number;
};

/** `GET /api/v1/inventory/prep` — a card, costed by the server. */
type ApiPrepItem = {
  id: number;
  code: string;
  name: Record<string, string> | string;
  unit: string;
  batch_quantity: number;
  loss_percent: number;
  yield: number;
  shelf_life_days: number;
  on_hand: number;
  batch_cost_tiyin: number;
  unit_cost_tiyin: number;
  components: readonly {
    ingredient_id: number;
    name: string | null;
    unit: string | null;
    quantity: number;
  }[];
};

/** `GET /api/v1/inventory/transfers` — what has moved, and what is in a van. */
type ApiTransfer = {
  id: number;
  number: string;
  status: string;
  from: { id: number; name: string | null };
  to: { id: number; name: string | null };
  lines: readonly { name: string | null; unit: string | null; quantity: number }[];
  sent_at: string | null;
  received_at: string | null;
};

/** A venue, as the two transfer selects need it. */
export type Venue = { id: number; name: string };

/** A product, as a transfer line, a count sheet and a waste form need it. */
export type StockItem = {
  id: number;
  name: string;
  /** The base unit the balance is held in: `g`, `ml`, `pcs`. */
  unit: string;
  /** Base units on the shelf. */
  onHand: number;
  /** Tiyin per base unit. */
  costPerUnit: number;
};

/** A prep card, as the prep tab draws it. */
export type PrepCard = {
  id: number;
  code: string;
  name: string;
  unit: string;
  batch: number;
  lossPercent: number;
  usableYield: number;
  shelfDays: number;
  onHand: number;
  batchCostTiyin: number;
  unitCostTiyin: number;
  lines: readonly { name: string; unit: string; quantity: number }[];
};

/** One transfer, in the shape the list under the form already renders. */
export type LiveTransfer = {
  id: number;
  number: string;
  what: string;
  route: string;
  state: 'inTransit' | 'received';
  time: string;
};

export async function fetchVenues(): Promise<readonly Venue[] | null> {
  const answer = await apiGet<Paginated<ApiBranch>>('/branches?per_page=100');

  if (answer === null) return null;

  return answer.data
    .filter((branch) => branch.status === undefined || branch.status === 'active')
    .map((branch) => ({ id: branch.id, name: branch.name }));
}

/**
 * Everything on the shelf, for the transfer line's picker.
 *
 * A hundred at a time and no paging control, because the picker is a select
 * rather than a table: a storekeeper who cannot find the product they are
 * moving in the first hundred is looking at the wrong screen, and a second page
 * inside a dropdown is a worse answer than a search box (which is what
 * `GET inventory/items?q=` is already for, when this grows one).
 */
export async function fetchStockItems(): Promise<readonly StockItem[] | null> {
  const answer = await apiGet<Paginated<ApiIngredient>>(
    '/inventory/ingredients?per_page=100&filter[is_active]=1',
  );

  if (answer === null) return null;

  return answer.data.map((row) => ({
    id: row.id,
    name: row.name,
    unit: row.unit,
    onHand: row.stock_quantity,
    costPerUnit: row.cost_per_unit,
  }));
}

export async function fetchPrepCards(lang: Lang): Promise<readonly PrepCard[] | null> {
  const answer = await apiGet<{ data: ApiPrepItem[] }>('/inventory/prep');

  if (answer === null) return null;

  return answer.data.map((row) => ({
    id: row.id,
    code: row.code,
    name: translate(row.name, lang) || row.code,
    unit: row.unit,
    batch: row.batch_quantity,
    lossPercent: row.loss_percent,
    usableYield: row.yield,
    shelfDays: row.shelf_life_days,
    onHand: row.on_hand,
    batchCostTiyin: row.batch_cost_tiyin,
    unitCostTiyin: row.unit_cost_tiyin,
    lines: row.components.map((line) => ({
      name: line.name ?? '—',
      unit: line.unit ?? '',
      quantity: line.quantity,
    })),
  }));
}

export async function fetchTransfers(): Promise<readonly LiveTransfer[] | null> {
  const answer = await apiGet<Paginated<ApiTransfer>>('/inventory/transfers?per_page=20');

  if (answer === null) return null;

  return answer.data.map((row) => ({
    id: row.id,
    number: row.number,
    what: row.lines
      .map((line) => `${line.name ?? '—'} · ${line.quantity} ${line.unit ?? ''}`.trim())
      .join(', '),
    route: `${row.from.name ?? '—'} → ${row.to.name ?? '—'}`,
    /*
     * Two states on the screen, three in the table.
     *
     * A draft has not left and does not belong on a list of things in motion;
     * the list is filtered to what is either on the road or arrived. `sent` is
     * the design's `inTransit` chip, which is what "the stock has left one
     * venue and not yet reached the other" was always drawn for.
     */
    state: row.status === 'received' ? 'received' : 'inTransit',
    time: clock(row.received_at ?? row.sent_at),
  }));
}

/**
 * `HH:mm` from an ISO timestamp, or an em dash.
 *
 * The list prints a time of day rather than a date, exactly as the fixtures do:
 * a transfer list is read the day it happens, and a full timestamp on every row
 * costs the width the route needs.
 */
function clock(at: string | null): string {
  if (at === null) return '—';

  const when = new Date(at);

  return Number.isNaN(when.getTime())
    ? '—'
    : `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
}

/** A jsonb `{uz,ru,en}` column, or a plain string from an older row. */
function translate(value: Record<string, string> | string | null, lang: Lang): string {
  if (typeof value === 'string') return value;
  if (value === null) return '';

  const trilingual = value as Partial<Trilingual>;

  return trilingual[lang] ?? trilingual.uz ?? Object.values(value)[0] ?? '';
}

/* ============================================================
   The three lists that only DISPLAYED, and displayed somebody else's shop

   Deliveries, the movement ledger and the waste log were rendered straight from
   `DELIVERIES`, `ADJUSTMENTS` and `WASTE_LOG` with no fetch at all — so a
   storekeeper on their first morning was shown vans waiting to be signed for,
   a costed waste log and an adjustment history belonging to the demo
   restaurant, with buttons that appeared to act on them. Every one of the three
   has an endpoint; none of them had a caller.
   ============================================================ */

/** `GET /api/v1/suppliers/purchase-orders?filter[open]=1&include=supplier,items`. */
type ApiOpenOrder = {
  id: number;
  number: string;
  status: string;
  expected_at: string | null;
  supplier?: { id: number; name: string } | null;
  items?: readonly {
    id: number;
    ingredient_id: number | null;
    name: string;
    unit: string | null;
    quantity: number;
    /** What was counted off the van, or null when nobody counted. */
    received_quantity: number | null;
    /** Tiyin per base unit, as the supplier invoiced it. */
    unit_price: number;
  }[];
};

/**
 * A van still to be signed for.
 *
 * `received` is what somebody counted off it, and null means nobody has —
 * which is not the same as "none arrived" and not the same as "all of it did".
 * Every delivery signed for before `suppliers.purchase_order_items` grew the
 * column carries null, as does every one a storekeeper confirms whole from a
 * phone at the service entrance. The cell draws an em dash for it, and the
 * shortfall banner cannot fire on a figure nobody measured.
 *
 * `lineId` is what a count is addressed by. Null never happens on a live row —
 * it exists because the fixture deliveries are keyed by document number and
 * have no primary keys at all, which is exactly what stops the demo posting.
 */
export type Delivery = {
  id: string;
  supplier: string;
  /** The document's own number, which is what a storekeeper checks against. */
  number: string;
  when: string;
  lines: readonly {
    key: string;
    lineId: number | null;
    name: string;
    unit: string;
    ordered: number;
    received: number | null;
    /** Tiyin per base unit — what a missing unit is worth on the credit note. */
    unitPriceTiyin: number;
  }[];
  /** Tiyin: what the lines somebody counted short are worth. */
  shortfallTiyin: number;
};

export async function fetchDeliveries(): Promise<readonly Delivery[] | null> {
  const answer = await apiGet<Paginated<ApiOpenOrder>>(
    '/suppliers/purchase-orders?per_page=50&filter[open]=1&include=supplier,items&sort=expected_at',
  );

  if (answer === null) return null;

  return (
    answer.data
      // A draft has not been sent to anybody and cannot arrive. The list is what
      // is on its way, which is what a person standing at the door is checking.
      .filter((order) => order.status === 'sent' || order.status === 'confirmed')
      .map((order) => ({
        id: String(order.id),
        number: order.number,
        supplier: order.supplier?.name ?? '—',
        when: order.expected_at === null ? '—' : order.expected_at.slice(0, 10),
        lines: (order.items ?? []).map((line, index) => ({
          key: `${order.id}:${line.id ?? index}`,
          lineId: line.id,
          name: line.name,
          unit: line.unit ?? '',
          ordered: line.quantity,
          received: line.received_quantity,
          unitPriceTiyin: line.unit_price,
        })),
        /*
         * What the shortfall is worth, at the price the invoice charges.
         *
         * Only lines somebody counted contribute: a null is "not counted" and
         * counting it as a shortfall would put a credit note on every delivery
         * that arrived before this column existed. Over-delivery is not
         * netted off either — a supplier who sent 5 kg instead of 4.5 has not
         * paid for the 2 kg of beef they left out of a different line.
         */
        shortfallTiyin: (order.items ?? []).reduce((total, line) => {
          const missing =
            line.received_quantity === null ? 0 : line.quantity - line.received_quantity;

          return missing > 0 ? total + missing * line.unit_price : total;
        }, 0),
      }))
  );
}

/** `GET /api/v1/inventory/movements`. */
type ApiMovement = {
  id: number;
  ingredient_id: number;
  kind: string;
  /** Signed: positive in, negative out. Base units. */
  quantity: number;
  reason: string | null;
  reference: string | null;
  happened_at: string | null;
};

/** One line of the adjustment log, in the shape the list already draws. */
export type LedgerEntry = {
  id: number;
  time: string;
  kind: 'receiving' | 'count' | 'waste' | 'transfer' | 'correction';
  what: string;
  delta: string;
  who: string;
};

/**
 * The five movement kinds the API records against the five chips this tab has.
 *
 * `consumption` is deliberately absent from the log: a sale takes stock off the
 * shelf automatically and the tab's own note says everything on it is somebody's
 * decision. It is filtered out below rather than mapped to a sixth chip.
 */
const LEDGER_KIND: Readonly<Record<string, LedgerEntry['kind']>> = {
  receipt: 'receiving',
  stock_take: 'count',
  write_off: 'waste',
  transfer: 'transfer',
};

export async function fetchLedger(
  items: readonly StockItem[] | null,
): Promise<readonly LedgerEntry[] | null> {
  const answer = await apiGet<Paginated<ApiMovement>>(
    '/inventory/movements?per_page=60&sort=-happened_at',
  );

  if (answer === null) return null;

  const named = new Map((items ?? []).map((item) => [item.id, item]));

  return answer.data
    .filter((movement) => LEDGER_KIND[movement.kind] !== undefined)
    .map((movement) => {
      const item = named.get(movement.ingredient_id);

      return {
        id: movement.id,
        time: clock(movement.happened_at),
        kind: LEDGER_KIND[movement.kind] as LedgerEntry['kind'],
        what: item?.name ?? `#${movement.ingredient_id}`,
        delta:
          `${movement.quantity > 0 ? '+' : '−'}${Math.abs(movement.quantity)} ${item?.unit ?? ''}`.trim(),
        /*
         * The ledger carries no author.
         *
         * `StockMovement` records what moved, not who moved it — the audit
         * trail does, in `activity_log`, and this endpoint does not join it.
         * The reason a person typed is the honest substitute; an em dash is
         * better than a name invented to fill the column.
         */
        who: movement.reason ?? movement.reference ?? '—',
      };
    });
}

/** One line of the waste log, costed. */
export type WasteEntry = {
  id: number;
  time: string;
  name: string;
  quantity: string;
  reason: string | null;
  costTiyin: number;
};

/**
 * What was thrown away, and what it cost.
 *
 * Costed here from the ingredient's current price rather than from a figure
 * stored on the movement, because no such figure is stored. That is a real
 * approximation and it errs in one direction only — a price that has risen
 * since makes last week's waste look dearer — which is the safe way round for
 * a number read as "stop doing this".
 */
export async function fetchWasteLog(
  items: readonly StockItem[] | null,
): Promise<readonly WasteEntry[] | null> {
  const answer = await apiGet<Paginated<ApiMovement>>(
    '/inventory/movements?per_page=40&sort=-happened_at&filter[kind]=write_off',
  );

  if (answer === null) return null;

  const named = new Map((items ?? []).map((item) => [item.id, item]));

  return answer.data.map((movement) => {
    const item = named.get(movement.ingredient_id);
    const quantity = Math.abs(movement.quantity);

    return {
      id: movement.id,
      time: clock(movement.happened_at),
      name: item?.name ?? `#${movement.ingredient_id}`,
      quantity: `${quantity} ${item?.unit ?? ''}`.trim(),
      reason: movement.reason,
      costTiyin: quantity * (item?.costPerUnit ?? 0),
    };
  });
}

/* ============================================================
   Technical cards — what a dish is made of

   The recipe tab drew four costed dishes out of `stock-ops-data.ts`: plov,
   lag'mon and two more, with their yields and their sell prices, shown to live
   restaurants as their own. There was no read for them, because a dish's card
   — the join between `menu.menu_items` and the shelf — was not a table.

   `GET /api/v1/menu/recipes` is that read. It costs every line against what the
   shelf costs today rather than against `menu_items.cost_price`, which is a
   number somebody typed, and it says so when a line cannot be priced at all.
   ============================================================ */

/** `GET /api/v1/menu/recipes` → `data[]`, exactly as it is sent. */
type ApiRecipeCard = {
  menu_item_id: number;
  name: string | null;
  sell_tiyin: number;
  /** Null when a line could not be priced — see `unresolved_lines`. */
  cost_tiyin: number | null;
  unresolved_lines: number;
  margin_percent: number | null;
  food_cost_percent: number | null;
  lines: readonly {
    id: number;
    kind: 'raw' | 'prep';
    name: string | null;
    unit: string | null;
    quantity: number;
    unit_cost_tiyin: number | null;
    line_cost_tiyin: number | null;
  }[];
};

/** One card, in the shape the tab draws. */
export type RecipeCard = {
  key: string;
  name: string;
  sellTiyin: number;
  costTiyin: number | null;
  marginPercent: number | null;
  foodCostPercent: number | null;
  /** How many lines the shelf could not price. Zero on a healthy card. */
  unresolved: number;
  lines: readonly {
    key: string;
    prep: boolean;
    name: string | null;
    unit: string;
    quantity: number;
    unitCostTiyin: number | null;
    lineCostTiyin: number | null;
  }[];
};

/**
 * Every costed dish, or null when there is no session.
 *
 * An empty list is a real answer and is not the fixture: a restaurant that has
 * costed nothing yet has costed nothing, and drawing the design's four dishes
 * over that is precisely what this tab used to do. Null — no session, an
 * expired token, a reader without `menu.view` — is the demo console, where the
 * design's own cards are the honest thing to show.
 *
 * Unpaged, because the endpoint answers a plain collection: a menu has tens of
 * costed dishes, and the tab is a picker rather than a report.
 */
export async function fetchRecipeCards(): Promise<readonly RecipeCard[] | null> {
  const answer = await apiGet<{ data?: readonly ApiRecipeCard[] }>('/menu/recipes');

  if (!answer?.data) return null;

  return answer.data.map((card) => ({
    key: String(card.menu_item_id),
    name: card.name ?? '—',
    sellTiyin: card.sell_tiyin,
    costTiyin: card.cost_tiyin,
    marginPercent: card.margin_percent,
    foodCostPercent: card.food_cost_percent,
    unresolved: card.unresolved_lines,
    lines: card.lines.map((line) => ({
      key: String(line.id),
      prep: line.kind === 'prep',
      name: line.name,
      // A component the shelf could not resolve has no unit either. The row is
      // still drawn — a card with a hole in it has to look like one.
      unit: line.unit ?? '',
      quantity: line.quantity,
      unitCostTiyin: line.unit_cost_tiyin,
      lineCostTiyin: line.line_cost_tiyin,
    })),
  }));
}
