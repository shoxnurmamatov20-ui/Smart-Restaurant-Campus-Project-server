'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { flash } from '@restaurant/ui';
import { formatTiyinAmount } from '@restaurant/utils';

import { apiId, post } from '@/lib/console-post';

import { ApprovalPin } from '../../approval-pin';
import type {
  Delivery,
  LedgerEntry,
  LiveTransfer,
  PrepCard,
  RecipeCard,
  StockItem,
  Venue,
  WasteEntry,
} from './stock-ops-server';
import {
  ADJUSTMENTS,
  BRANCHES,
  BY_KEY,
  COUNT_SHEET,
  DELIVERIES,
  MARGIN_FLOOR,
  marginPercent,
  needsApproval,
  PREP_BY_KEY,
  PREP_ITEMS,
  RECIPES,
  recipeCost,
  lineCost,
  say,
  shortfallValue,
  TRANSFERS,
  VARIANCE_CEILING,
  WASTE_LOG,
  WASTE_REASONS,
  foodCostPercent,
  type Lang,
  type WasteReason,
  TAB_ORDER,
  type TabKey,
} from './stock-ops-data';

/**
 * The seven tabs, and they switch.
 *
 * This screen shipped with the strip drawn as `data-active={index === 0}` and
 * no handler — five labels of which one was ever reachable. That is worse than
 * shipping one tab: a control that looks like a control and does nothing reads
 * as a broken product, and a storekeeper who cannot open the count sheet counts
 * on paper and types the result in somewhere else.
 *
 * A client component because all of it is interaction: entering counted
 * quantities, choosing a waste reason, picking two branches, selecting a
 * recipe. Everything it draws is passed in already translated and already
 * formatted, so the catalogue and the money formatter stay on the server.
 *
 * One of the seven tabs writes: receiving posts through
 * `POST /api/v1/suppliers/purchase-orders/{purchaseOrder}/receive`, which
 * raises the stock, closes the order and grows the supplier's debt in one
 * transaction. The others each say what stands between them and their endpoint,
 * and it is not the same obstacle twice — the count sheet and the waste form
 * are keyed by fixture names with no ingredient id to write against, and a
 * branch transfer has no per-venue balance to move.
 */
export function StockOpsTabs({
  lang,
  labels,
  money,
  initial = 'recv',
  venues = null,
  items = null,
  transfers = null,
  prepCards = null,
  deliveries = null,
  ledger = null,
  wasteLog = null,
  recipes = null,
}: {
  lang: Lang;
  labels: Record<string, string>;
  /** Every amount this screen can show, pre-formatted by key. */
  money: Readonly<Record<string, string>>;
  /**
   * The four live lists, or null for the demo console.
   *
   * Read on the server by `stock-ops-server.ts` and handed down, because the
   * three tabs that WRITE need ids the fixtures do not have: a transfer is two
   * branch ids and an ingredient id, and a batch is a prep-item id. Null means
   * the screen keeps its fixtures and its buttons keep confirming, which is
   * what a console with no session is for.
   */
  venues?: readonly Venue[] | null;
  items?: readonly StockItem[] | null;
  transfers?: readonly LiveTransfer[] | null;
  prepCards?: readonly PrepCard[] | null;
  /**
   * The three lists that used to be drawn straight from the fixtures.
   *
   * Null is the demo console and only then; an empty array is a restaurant
   * with nothing waiting, nothing thrown away and nothing adjusted, which is
   * what a first morning looks like and what the panels now say.
   */
  deliveries?: readonly Delivery[] | null;
  ledger?: readonly LedgerEntry[] | null;
  wasteLog?: readonly WasteEntry[] | null;
  /**
   * The dishes that have a technical card, costed against today's shelf.
   *
   * Null is the demo console, where the design's four costed dishes are the
   * honest thing to draw. An empty array is a restaurant that has costed
   * nothing yet — which is most of them on their first week — and the tab says
   * so rather than showing somebody else's kitchen.
   */
  recipes?: readonly RecipeCard[] | null;
  /**
   * Which tab to open on.
   *
   * The store screen's head sends a storekeeper straight here — "Inventarizatsiya"
   * means the count sheet, not the receiving list. Landing on the wrong tab is
   * the same as landing on the wrong screen for anyone who then has to go
   * looking for the one they asked for.
   */
  initial?: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(initial);

  return (
    <>
      <div className="bg-bg-muted mb-5 flex w-fit flex-wrap gap-0.5 rounded-md p-[3px]">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            data-seg
            data-active={tab === key ? 'true' : undefined}
            onClick={() => setTab(key)}
            className="h-8 rounded-[7px] border-0 bg-transparent px-3.5 text-sm font-medium"
          >
            {labels[`tab_${key}`]}
          </button>
        ))}
      </div>

      {tab === 'recv' ? (
        <Receiving lang={lang} labels={labels} money={money} deliveries={deliveries} />
      ) : null}
      {tab === 'count' ? <StockCount lang={lang} labels={labels} items={items} /> : null}
      {tab === 'waste' ? (
        <Waste lang={lang} labels={labels} money={money} items={items} log={wasteLog} />
      ) : null}
      {tab === 'move' ? (
        <TransferPanel
          lang={lang}
          labels={labels}
          venues={venues}
          items={items}
          transfers={transfers}
        />
      ) : null}
      {tab === 'recipe' ? <RecipeCards lang={lang} labels={labels} cards={recipes} /> : null}
      {tab === 'prep' ? <Prep lang={lang} labels={labels} money={money} cards={prepCards} /> : null}
      {tab === 'log' ? <Log lang={lang} labels={labels} entries={ledger} /> : null}
    </>
  );
}

/* ------------------------------------------------------------- receiving */

/**
 * The fixture vans in the shape the live ones arrive in.
 *
 * One shape for both, so the table below is written once. The design's
 * deliveries carry a received quantity per line — a partial delivery is the
 * whole point of the variance column — and so, now, do the live ones:
 * `suppliers.purchase_order_items.received_quantity` is what somebody counted
 * off the van, and null there means nobody counted rather than nothing came.
 * The fixture rows carry no line ids, which is what keeps the demo from
 * addressing a real order.
 */
function fixtureDeliveries(lang: Lang): readonly Delivery[] {
  return DELIVERIES.map((delivery) => ({
    id: delivery.id,
    number: delivery.id,
    supplier: delivery.supplier,
    when: delivery.time,
    lines: delivery.lines.map((line) => {
      const item = BY_KEY.get(line.ingredient)!;

      return {
        key: line.ingredient,
        // No primary keys on a drawing, which is exactly what stops the demo
        // posting a count against somebody's real order.
        lineId: null,
        name: say(item.name, lang),
        unit: item.unit,
        ordered: line.ordered,
        received: line.received,
        unitPriceTiyin: item.price,
      };
    }),
    shortfallTiyin: shortfallValue(delivery),
  }));
}

function Receiving({
  lang,
  labels,
  money,
  deliveries,
}: {
  lang: Lang;
  labels: Record<string, string>;
  money: Readonly<Record<string, string>>;
  deliveries: readonly Delivery[] | null;
}) {
  /* Which documents this session has already signed for, so the button cannot
     post the same van twice while the list still shows it. The API refuses a
     second attempt as well (`purchase_order.already_received`); this is what
     stops the second press from being made in the first place. */
  const [received, setReceived] = useState<readonly string[]>([]);

  /*
   * What the person at the door has counted, keyed by line.
   *
   * Empty until they type something, and that is the whole design: an untouched
   * form signs for the document as raised, which is what this button has always
   * done and what a storekeeper with one hand free needs it to keep doing. A
   * field pre-filled with the ordered quantity would look like a count somebody
   * took — and a zero variance on every line is the exact fiction the received
   * column exists to stop.
   */
  const [counts, setCounts] = useState<Readonly<Record<string, string>>>({});

  // The API's list when there is one, the design's vans when there is not.
  const rows = deliveries ?? fixtureDeliveries(lang);

  async function accept(id: string) {
    const told = `${id} · ${labels.deliveryAccepted}`;
    const purchaseOrder = apiId(id);

    if (purchaseOrder === null) {
      // A fixture delivery — the demo console's documents are numbered
      // `INV-4862`, not by primary key. It still confirms, because that is what
      // the demo is for.
      setReceived((current) => [...current, id]);
      flash(told);

      return;
    }

    /*
     * Only the lines somebody actually typed into.
     *
     * A blank field is "not counted" and must stay absent from the payload:
     * sending it as the ordered quantity would record a count nobody took, and
     * sending it as zero would empty the shelf. `Number.isInteger` filters both
     * a half-typed minus sign and a decimal the base unit cannot hold.
     */
    const lines: { id: number; received: number }[] = [];

    for (const line of rows.find((row) => row.id === id)?.lines ?? []) {
      const typed = (counts[line.key] ?? '').trim();

      if (line.lineId === null || typed === '') continue;

      const counted = Number(typed);

      if (!Number.isInteger(counted) || counted < 0) continue;

      lines.push({ id: line.lineId, received: counted });
    }

    const answer = await post(
      '/api/suppliers/purchase-orders/receive',
      { id: purchaseOrder, lines },
      lang,
    );

    if (!answer.ok) {
      // `purchase_order.already_received` and `…invalid_transition` both arrive
      // here with their own sentence in the reader's language — which says more
      // than "could not accept" ever could.
      flash.problem(answer.message ?? told);

      return;
    }

    setReceived((current) => [...current, id]);
    flash(told);
  }

  return (
    <>
      <p className="text-fg-muted mb-4 text-sm">{labels.recvSub}</p>

      {rows.length === 0 ? (
        <p className="bg-surface text-fg-subtle rounded-lg border px-5 py-14 text-center text-sm">
          {labels.recvEmpty}
        </p>
      ) : null}

      {rows.map((delivery) => {
        const shortfall = delivery.shortfallTiyin;
        const done = received.includes(delivery.id);

        return (
          <section key={delivery.id} className="bg-surface mb-4 overflow-hidden rounded-lg border">
            <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-5 pt-4 pb-3.5">
              <div>
                <h3 className="text-md tracking-snug font-semibold">{delivery.supplier}</h3>
                <p className="text-fg-subtle mt-1 text-xs">
                  {labels.docMeta
                    .replace('{doc}', delivery.number)
                    .replace('{time}', delivery.when)}
                </p>
              </div>

              {/*
               * `POST /api/v1/suppliers/purchase-orders/{purchaseOrder}/receive`,
               * through the route handler. It raises every line's stock, closes
               * the order and grows the supplier's debt in one transaction —
               * which is why this is one button rather than three.
               *
               * Disabled once it has gone rather than hidden: a delivery that
               * vanished from the list the instant it was signed for is a
               * delivery nobody can check they signed for.
               */}
              <button
                type="button"
                data-press
                disabled={done}
                onClick={() => void accept(delivery.id)}
                className="bg-brand-500 hover:bg-brand-600 h-[34px] rounded-md px-4 text-sm font-semibold text-white disabled:opacity-45"
              >
                {labels.accept}
              </button>
            </div>

            {/* The card clips to keep its rounded corners, so the table needs its own
                scroller — without one a phone loses the right-hand columns entirely,
                and a clipped column is worse than a scrolled one: nobody can reach it. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-fg-subtle text-2xs tracking-caps border-divider border-b uppercase">
                    <th className="px-5 py-2.5 text-left font-semibold">{labels.colItem}</th>
                    <th className="px-3 py-2.5 text-right font-semibold">{labels.colOrdered}</th>
                    <th className="px-3 py-2.5 text-right font-semibold">{labels.colReceived}</th>
                    <th className="px-5 py-2.5 text-right font-semibold">{labels.colVariance}</th>
                  </tr>
                </thead>
                <tbody>
                  {delivery.lines.map((line) => {
                    /*
                     * What is on screen right now: the count somebody has typed,
                     * or the one already recorded against the line. An untouched
                     * field on an uncounted line is null, and the variance cell
                     * then says it does not know rather than claiming zero.
                     */
                    const typed = (counts[line.key] ?? '').trim();
                    const shown =
                      typed === ''
                        ? line.received
                        : Number.isInteger(Number(typed))
                          ? Number(typed)
                          : null;
                    const variance = shown === null ? null : shown - line.ordered;

                    return (
                      <tr key={line.key} className="border-divider border-b last:border-0">
                        <td className="px-5 py-3 font-medium">{line.name}</td>
                        <td data-num className="text-fg-muted px-3 py-3 text-right">
                          {line.ordered} {line.unit}
                        </td>
                        <td data-num className="px-3 py-3 text-right font-semibold">
                          {/*
                          A field rather than a figure, once the line has an id
                          to address. Counting is what the desk does and the
                          phone at the service entrance does not — an empty
                          field still signs for the document as raised, which is
                          what that phone has always sent.
                        */}
                          {done || line.lineId === null ? (
                            shown === null ? (
                              '—'
                            ) : (
                              `${shown} ${line.unit}`
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <input
                                inputMode="numeric"
                                value={counts[line.key] ?? ''}
                                aria-label={`${line.name} · ${labels.colReceived}`}
                                placeholder={String(line.ordered)}
                                onChange={(event) =>
                                  setCounts((current) => ({
                                    ...current,
                                    [line.key]: event.target.value,
                                  }))
                                }
                                className="border-border-strong bg-bg-subtle h-8 w-20 rounded-md border px-2 text-right text-sm"
                              />
                              <span className="text-fg-subtle text-xs">{line.unit}</span>
                            </span>
                          )}
                        </td>
                        {/* A short delivery is the only cell worth a colour. */}
                        <td
                          data-num
                          className={`px-5 py-3 text-right font-semibold ${
                            variance !== null && variance < 0 ? 'text-danger-700' : 'text-fg-subtle'
                          }`}
                        >
                          {variance === null || variance === 0
                            ? '—'
                            : `${variance > 0 ? '+' : '−'}${Math.abs(variance)} ${line.unit}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/*
             * What the shortfall is worth. The variance column says two
             * kilograms; this says what two kilograms of beef costs, which is
             * the number that goes on the credit note.
             */}
            {shortfall > 0 ? (
              <p className="border-danger-500/30 bg-danger-50 text-danger-700 m-4 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
                {labels.shortfall.replace('{amount}', money[`short_${delivery.id}`] ?? '')}
              </p>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

/* ----------------------------------------------------------- stock count */

/** A sheet row: what to count, and the balance the variance is measured against. */
type CountRow = {
  key: string;
  ingredientId: number | null;
  name: string;
  unit: string;
  system: number;
};

/**
 * The sheet, live or fixture.
 *
 * Live it is the shelf itself — every active ingredient, in the base unit the
 * balance is held in, which is also the unit `POST /inventory/counts` expects.
 * The fixture sheet is the design's eight lines, keyed `beef`, `rice`, which is
 * exactly why nothing could be posted from it: those keys are not ingredient
 * ids and every line would have come back unknown.
 */
function countRows(items: readonly StockItem[] | null, lang: Lang): readonly CountRow[] {
  if (items !== null) {
    return items.map((item) => ({
      key: String(item.id),
      ingredientId: item.id,
      name: item.name,
      unit: item.unit,
      system: item.onHand,
    }));
  }

  return COUNT_SHEET.map((row) => {
    const item = BY_KEY.get(row.ingredient)!;

    return {
      key: row.ingredient,
      ingredientId: null,
      name: say(item.name, lang),
      unit: item.unit,
      system: row.system,
    };
  });
}

function StockCount({
  lang,
  labels,
  items,
}: {
  lang: Lang;
  labels: Record<string, string>;
  items: readonly StockItem[] | null;
}) {
  const router = useRouter();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState<string | null>(null);
  const [approved, setApproved] = useState<Record<string, true>>({});
  const [saving, setSaving] = useState(false);

  const rows = countRows(items, lang);

  const parse = (raw: string | undefined): number | null => {
    if (raw === undefined || raw.trim() === '') return null;
    const value = Number.parseFloat(raw.replace(',', '.'));
    return Number.isNaN(value) ? null : value;
  };

  /**
   * The sheet, written.
   *
   * `POST /api/inventory/counts` takes a reference and one absolute line per
   * ingredient in base units — the same door the store screen's correction
   * drawer uses, because a count of forty and a count of one are the same act
   * at two sizes. The button used to flash "variances written to the journal"
   * and write nothing, which is the worst sentence a control can say.
   *
   * Blank rows are left out rather than sent as zero: an uncounted shelf is not
   * an empty shelf, and posting zero would write off everything on it.
   */
  async function finish(): Promise<void> {
    if (saving) return;

    const lines = rows
      .map((row) => ({ row, value: parse(counted[row.key]) }))
      .filter((entry) => entry.value !== null && entry.row.ingredientId !== null)
      .map((entry) => ({
        ingredientId: entry.row.ingredientId,
        // Whole base units. A gram is the smallest thing counted and 4.237 kg
        // is 4237 g, so nothing here is ever a fraction by the time it posts.
        counted: Math.max(0, Math.round(entry.value as number)),
      }));

    if (lines.length === 0) {
      flash.problem(labels.countNothing);

      return;
    }

    setSaving(true);

    const answer = await post(
      '/api/inventory/counts',
      { reference: `${labels.tab_count} · ${new Date().toISOString().slice(0, 10)}`, lines },
      lang,
    );

    setSaving(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.countFailed);

      return;
    }

    setCounted({});
    flash(labels.countFinished);
    // The balances this sheet just moved are read by every other tab.
    router.refresh();
  }

  return (
    <>
      <p className="text-fg-muted mb-1 text-sm">{labels.countSub}</p>
      {/*
       * The rule, stated where somebody is about to count. The system quantity
       * is not on this screen and this sentence is why — otherwise its absence
       * reads as a column that failed to load.
       */}
      <p className="text-fg-subtle mb-4 text-xs leading-normal">{labels.countHidden}</p>

      <div className="bg-surface overflow-hidden rounded-lg border">
        {/* The card clips to keep its rounded corners, so the table needs its own
            scroller — without one a phone loses the right-hand columns entirely,
            and a clipped column is worse than a scrolled one: nobody can reach it. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-fg-subtle text-2xs tracking-caps border-divider border-b uppercase">
                <th className="px-5 py-2.5 text-left font-semibold">{labels.colItem}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{labels.colCounted}</th>
                <th className="px-5 py-2.5 text-right font-semibold">{labels.colVariance}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const value = parse(counted[row.key]);
                const variance = value === null ? null : value - row.system;
                const wants = value !== null && needsApproval(row.system, value);
                const signed = approved[row.key] === true;

                return (
                  <tr key={row.key} className="border-divider border-b last:border-0">
                    <td className="px-5 py-3 font-medium">{row.name}</td>

                    <td className="px-3 py-2 text-right">
                      <input
                        inputMode="decimal"
                        value={counted[row.key] ?? ''}
                        onChange={(event) =>
                          setCounted((current) => ({
                            ...current,
                            [row.key]: event.target.value,
                          }))
                        }
                        aria-label={row.name}
                        className="bg-bg-subtle border-border h-9 w-24 rounded-md border px-2.5 text-right"
                        data-num
                      />
                      <span className="text-fg-subtle ml-2 text-xs">{row.unit}</span>
                    </td>

                    <td className="px-5 py-3 text-right">
                      {variance === null ? (
                        <span className="text-fg-subtle">—</span>
                      ) : variance === 0 ? (
                        <span className="text-success-600 font-semibold">{labels.matched}</span>
                      ) : (
                        <span className="inline-flex items-center justify-end gap-2">
                          <span
                            data-num
                            className={`font-semibold ${wants ? 'text-danger-600' : 'text-warning-700'}`}
                          >
                            {variance > 0 ? '+' : '−'}
                            {Math.abs(variance)} {row.unit}
                          </span>

                          {wants ? (
                            signed ? (
                              <span className="text-success-700 text-2xs font-semibold">
                                {labels.signed}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setAsking(row.key)}
                                className="bg-warning-500 text-2xs h-7 rounded-md px-2.5 font-semibold text-white"
                              >
                                {labels.needsPin}
                              </button>
                            )
                          ) : null}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-fg-subtle mt-3 text-xs">
        {labels.varianceRule.replace('{percent}', String(VARIANCE_CEILING * 100))}
      </p>

      <button
        type="button"
        data-press
        disabled={saving}
        onClick={() => void finish()}
        className="bg-brand-500 hover:bg-brand-600 mt-4 h-10 rounded-md px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {labels.finishCount}
      </button>

      {asking ? (
        <ApprovalPin
          reason={labels.countReason.replace(
            '{item}',
            rows.find((row) => row.key === asking)?.name ?? '',
          )}
          labels={{
            title: labels.pinTitle,
            sub: labels.pinSub,
            cancel: labels.cancel,
            digitsEntered: labels.digitsEntered,
          }}
          onCancel={() => setAsking(null)}
          onApprove={() => {
            setApproved((current) => ({ ...current, [asking]: true }));
            setAsking(null);
          }}
        />
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------- waste */

function Waste({
  lang,
  labels,
  money,
  items,
  log,
}: {
  lang: Lang;
  labels: Record<string, string>;
  money: Readonly<Record<string, string>>;
  items: readonly StockItem[] | null;
  log: readonly WasteEntry[] | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<WasteReason>('expired');
  const [ingredientId, setIngredientId] = useState<string>('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);

  const picked = items?.find((item) => String(item.id) === ingredientId) ?? items?.[0] ?? null;

  /**
   * A write-off, recorded.
   *
   * The button used to flash "chiqindi qayd etildi" and write nothing, over a
   * free-text field with no id behind it — so a restaurant that logged waste
   * all week found an empty movements list and no warning that it had been
   * throwing the entries away. The endpoint was always there: `POST
   * /api/inventory/movements`, which forwards to
   * `/inventory/ingredients/{id}/movements` with `kind: write_off`.
   *
   * The reason is required by the API and by this form, in that order.
   * Unexplained shrinkage is the thing the stock module exists to surface.
   */
  async function record(): Promise<void> {
    if (saving) return;

    const amount = Number.parseFloat(quantity.replace(',', '.'));

    if (picked === null || !Number.isFinite(amount) || amount <= 0) {
      flash.problem(labels.wasteIncomplete);

      return;
    }

    setSaving(true);

    const answer = await post(
      '/api/inventory/movements',
      {
        ingredientId: picked.id,
        // Base units, whole. The select shows the base unit beside the field so
        // nobody types kilograms into a gram column.
        quantity: Math.round(amount),
        reason: labels[`reason_${reason}`] ?? reason,
      },
      lang,
    );

    setSaving(false);

    if (!answer.ok) {
      // `stock.insufficient` arrives with its own sentence in the reader's
      // language, which says far more than "could not save".
      flash.problem(answer.message ?? labels.wasteFailed);

      return;
    }

    setQuantity('');
    flash(labels.wasteLogged);
    router.refresh();
  }

  return (
    <>
      <p className="text-fg-muted mb-4 text-sm">{labels.wasteSub}</p>

      <div className="bg-surface mb-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1">
            <span className="text-fg-subtle mb-1.5 block text-xs">{labels.colItem}</span>
            {/* A picker, not free text. The old field could not name a row the
                API knows, which is why nothing could be written against it. */}
            <select
              value={picked === null ? '' : String(picked.id)}
              onChange={(event) => setIngredientId(event.target.value)}
              disabled={items === null || items.length === 0}
              aria-label={labels.colItem}
              className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
            >
              {items === null || items.length === 0 ? (
                <option value="">{labels.wastePlaceholder}</option>
              ) : (
                items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="w-28">
            <span className="text-fg-subtle mb-1.5 block text-xs">
              {labels.colQuantity}
              {picked === null ? '' : ` · ${picked.unit}`}
            </span>
            <input
              inputMode="decimal"
              data-num
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
            />
          </label>

          <label className="min-w-[180px]">
            <span className="text-fg-subtle mb-1.5 block text-xs">{labels.colReason}</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as WasteReason)}
              className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
            >
              {WASTE_REASONS.map((key) => (
                <option key={key} value={key}>
                  {labels[`reason_${key}`]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            data-press
            disabled={saving || picked === null}
            onClick={() => void record()}
            className="bg-brand-500 hover:bg-brand-600 h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {labels.wasteAdd}
          </button>
        </div>
      </div>

      <div className="bg-surface overflow-hidden rounded-lg border">
        {/* The card clips to keep its rounded corners, so the table needs its own
            scroller — without one a phone loses the right-hand columns entirely,
            and a clipped column is worse than a scrolled one: nobody can reach it. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-fg-subtle text-2xs tracking-caps border-divider border-b uppercase">
                <th className="px-5 py-2.5 text-left font-semibold">{labels.colTime}</th>
                <th className="px-3 py-2.5 text-left font-semibold">{labels.colItem}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{labels.colQuantity}</th>
                <th className="px-3 py-2.5 text-left font-semibold">{labels.colReason}</th>
                <th className="px-5 py-2.5 text-right font-semibold">{labels.colCost}</th>
              </tr>
            </thead>
            <tbody>
              {log === null
                ? WASTE_LOG.map((entry) => (
                    <tr key={entry.id} className="border-divider border-b last:border-0">
                      <td data-num className="text-fg-muted px-5 py-3">
                        {entry.time}
                      </td>
                      <td className="px-3 py-3 font-medium">{say(entry.name, lang)}</td>
                      <td data-num className="px-3 py-3 text-right">
                        {entry.quantity}
                      </td>
                      <td className="text-fg-muted px-3 py-3">
                        {labels[`reason_${entry.reason}`]}
                      </td>
                      <td data-num className="text-danger-700 px-5 py-3 text-right font-semibold">
                        {money[`waste_${entry.id}`]}
                      </td>
                    </tr>
                  ))
                : log.map((entry) => (
                    <tr key={entry.id} className="border-divider border-b last:border-0">
                      <td data-num className="text-fg-muted px-5 py-3">
                        {entry.time}
                      </td>
                      <td className="px-3 py-3 font-medium">{entry.name}</td>
                      <td data-num className="px-3 py-3 text-right">
                        {entry.quantity}
                      </td>
                      {/* The sentence the person typed, not a chip: the API stores
                        a free-text reason and mapping it back onto four buttons
                        would quietly relabel anything typed by hand. */}
                      <td className="text-fg-muted px-3 py-3">{entry.reason ?? '—'}</td>
                      <td data-num className="text-danger-700 px-5 py-3 text-right font-semibold">
                        {money[`liveWaste_${entry.id}`]}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {log !== null && log.length === 0 ? (
          <p className="text-fg-subtle px-5 py-12 text-center text-sm">{labels.wasteEmpty}</p>
        ) : null}
      </div>

      <p className="text-fg-subtle mt-3 text-xs">
        {labels.wasteTotal.replace(
          '{amount}',
          (log === null ? money.wasteTotal : money.liveWasteTotal) ?? '',
        )}
      </p>
    </>
  );
}

/* -------------------------------------------------------------- transfer */

function TransferPanel({
  lang,
  labels,
  venues,
  items,
  transfers,
}: {
  lang: Lang;
  labels: Record<string, string>;
  venues: readonly Venue[] | null;
  items: readonly StockItem[] | null;
  transfers: readonly LiveTransfer[] | null;
}) {
  /*
   * Live venues when there are any, the design's five otherwise.
   *
   * The demo console has no session and no branches, and a transfer form with
   * an empty pair of selects is a screen that looks broken rather than one that
   * is a demo. The fixture keys are strings and the live ones are ids, which is
   * exactly what decides whether the button posts — see `send()`.
   */
  const places: readonly { key: string; name: string }[] =
    venues !== null && venues.length > 0
      ? venues.map((venue) => ({ key: String(venue.id), name: venue.name }))
      : BRANCHES;

  const [from, setFrom] = useState(places[0]?.key ?? '');
  const [to, setTo] = useState(places[1]?.key ?? places[0]?.key ?? '');
  const [item, setItem] = useState(items?.[0] ? String(items[0].id) : '');
  const [quantity, setQuantity] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<readonly LiveTransfer[]>([]);

  const sameBranch = from === to;
  const live = venues !== null && items !== null && items.length > 0;

  const STATE_STYLE: Record<string, string> = {
    inTransit: 'bg-warning-50 text-warning-700',
    received: 'bg-success-50 text-success-700',
    delivered: 'bg-success-50 text-success-700',
  };

  async function send() {
    if (sameBranch) return;

    /*
     * The demo console keeps confirming, because that is what the demo is for
     * — the same arrangement the receiving tab already uses (`apiId`). What
     * separates the two here is whether a venue is an id or the word
     * `chilonzor`.
     */
    if (!live) {
      flash(labels.transferSent);

      return;
    }

    const moved = Number(quantity);
    const product = items.find((row) => String(row.id) === item);

    if (product === undefined || !Number.isFinite(moved) || moved <= 0) {
      flash.problem(labels.samePlace);

      return;
    }

    setSending(true);
    const answer = await post<{ data: { number: string; status: string } }>(
      '/api/inventory/transfers',
      {
        from: Number(from),
        to: Number(to),
        lines: [{ ingredientId: product.id, quantity: Math.round(moved) }],
      },
      lang,
    );
    setSending(false);

    if (!answer.ok) {
      // `stock.transfer_not_pending`, a venue that is not this restaurant's, a
      // transfer to yourself — each arrives with its own sentence in the
      // reader's language, which says more than "could not send".
      flash.problem(answer.message ?? labels.transferSent);

      return;
    }

    /*
     * Prepended locally rather than re-fetched. The list under this form is a
     * server read and a router refresh would redraw the whole tab, losing the
     * two venues the storekeeper has just chosen — and they are about to send a
     * second product to the same place.
     */
    setSent((current) => [
      {
        id: -current.length - 1,
        number: answer.data.data.number,
        what: `${product.name} · ${Math.round(moved)} ${product.unit}`,
        route: `${places.find((place) => place.key === from)?.name ?? '—'} → ${
          places.find((place) => place.key === to)?.name ?? '—'
        }`,
        state: 'inTransit',
        time: '—',
      },
      ...current,
    ]);
    setQuantity('');
    flash(labels.transferSent);
  }

  const rows: readonly LiveTransfer[] | null = transfers === null ? null : [...sent, ...transfers];

  return (
    <>
      <p className="text-fg-muted mb-4 text-sm">{labels.moveSub}</p>

      <div className="bg-surface mb-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[150px]">
            <span className="text-fg-subtle mb-1.5 block text-xs">{labels.from}</span>
            <select
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
            >
              {places.map((place) => (
                <option key={place.key} value={place.key}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[150px]">
            <span className="text-fg-subtle mb-1.5 block text-xs">{labels.to}</span>
            <select
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
            >
              {places.map((place) => (
                <option key={place.key} value={place.key}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[180px] flex-1">
            <span className="text-fg-subtle mb-1.5 block text-xs">{labels.colItem}</span>
            {/*
             * A picker rather than a text box once the shelf is live. The old
             * free-text field could not have produced an ingredient id, which
             * is what a transfer line is made of; typing a product name at a
             * form that needs a primary key is how a storekeeper ends up
             * pressing a button that does nothing.
             */}
            {items !== null && items.length > 0 ? (
              <select
                value={item}
                onChange={(event) => setItem(event.target.value)}
                className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
              >
                {items.map((row) => (
                  <option key={row.id} value={String(row.id)}>
                    {row.name}
                  </option>
                ))}
              </select>
            ) : (
              <input className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm" />
            )}
          </label>

          <label className="w-28">
            <span className="text-fg-subtle mb-1.5 block text-xs">{labels.colQuantity}</span>
            <input
              inputMode="decimal"
              data-num
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="bg-bg-subtle border-border h-10 w-full rounded-md border px-3 text-sm"
            />
          </label>

          {/*
           * Disabled when the two venues are the same, because a transfer to
           * yourself is the one mistake this form makes easy — and the server
           * refuses it too (`StoreStockTransferRequest`), because a select can
           * be submitted before it has updated.
           */}
          <button
            type="button"
            data-press
            disabled={sameBranch || sending}
            onClick={() => void send()}
            className="bg-brand-500 hover:bg-brand-600 h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {labels.moveSend}
          </button>
        </div>

        {sameBranch ? <p className="text-warning-700 mt-2.5 text-xs">{labels.samePlace}</p> : null}
      </div>

      <ul className="bg-surface divide-divider divide-y rounded-lg border">
        {rows !== null
          ? rows.map((transfer) => (
              <li key={transfer.id} className="flex items-center gap-3 px-5 py-3">
                <span data-num className="text-fg-muted w-14 flex-none text-xs">
                  {transfer.time}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{transfer.what}</span>
                  <span className="text-fg-subtle block text-xs">{transfer.route}</span>
                </span>
                <span
                  className={`rounded-pill text-2xs px-2.5 py-1 font-semibold ${STATE_STYLE[transfer.state]}`}
                >
                  {labels[`state_${transfer.state}`]}
                </span>
              </li>
            ))
          : TRANSFERS.map((transfer) => (
              <li key={transfer.id} className="flex items-center gap-3 px-5 py-3">
                <span data-num className="text-fg-muted w-14 flex-none text-xs">
                  {transfer.time}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{say(transfer.what, lang)}</span>
                  <span className="text-fg-subtle block text-xs">{transfer.route}</span>
                </span>
                <span
                  className={`rounded-pill text-2xs px-2.5 py-1 font-semibold ${STATE_STYLE[transfer.state]}`}
                >
                  {labels[`state_${transfer.state}`]}
                </span>
              </li>
            ))}
      </ul>
    </>
  );
}

/* ---------------------------------------------------------- recipe cards */

/**
 * A dish's technical card — what it is made of, and what that costs today.
 *
 * The tab drew four costed dishes out of the design file for as long as it
 * existed: plov, lag'mon and two more, with their yields and their sell prices,
 * shown to live restaurants as their own, with a food-cost percentage an owner
 * would act on. There was no read for them, because a dish's card was not a
 * table.
 *
 * It is one now (`menu.recipe_lines`), and `GET /v1/menu/recipes` costs every
 * line against what the shelf costs TODAY rather than against
 * `menu_items.cost_price` — a number somebody typed once. The two things that
 * makes visible are worth stating:
 *
 *   A card can be **uncosted**: a line whose ingredient was deleted cannot be
 *   priced, and the total then reads "—" rather than a smaller number. A
 *   partial total looks like a food cost and is guaranteed too low, which is
 *   the direction that makes a dish look worth keeping.
 *
 *   A restaurant can have **no cards at all**, which is most of them in their
 *   first week. That is an empty state, not a reason to draw somebody else's
 *   kitchen.
 */
function RecipeCards({
  lang,
  labels,
  cards,
}: {
  lang: Lang;
  labels: Record<string, string>;
  /** The API's cards, or null on a console with no session behind it. */
  cards: readonly RecipeCard[] | null;
}) {
  /*
   * One list for both, built from the design's four when there is no session.
   *
   * The fixture's costs are computed here rather than read out of `money`
   * because the two sources are keyed differently — the fixture by dish slug,
   * the API by row id — and one shape below is what stops the panel being
   * written twice.
   */
  const rows: readonly RecipeCard[] =
    cards ??
    RECIPES.map((recipe) => ({
      key: recipe.key,
      name: say(recipe.name, lang),
      sellTiyin: recipe.sell,
      costTiyin: Math.round(recipeCost(recipe)),
      marginPercent: Math.round(marginPercent(recipe)),
      foodCostPercent: Math.round(foodCostPercent(recipe)),
      unresolved: 0,
      lines: recipe.lines.map((line, index) => {
        const isPrep = line.kind === 'prep';
        const source = isPrep ? PREP_BY_KEY.get(line.prep) : BY_KEY.get(line.ingredient);

        return {
          key: `${recipe.key}:${index}`,
          prep: isPrep,
          name: source === undefined ? null : say(source.name, lang),
          unit: isPrep ? (PREP_BY_KEY.get(line.prep)?.unit ?? 'g') : 'g',
          quantity: line.quantity,
          unitCostTiyin: Math.round(lineCost(line) / Math.max(1, line.quantity)),
          lineCostTiyin: Math.round(lineCost(line)),
        };
      }),
    }));

  const [selected, setSelected] = useState<string | null>(null);
  const card = rows.find((row) => row.key === selected) ?? rows[0];

  if (card === undefined) {
    return (
      <>
        <p className="text-fg-muted mb-4 text-sm">{labels.recipeSub}</p>
        <p className="bg-surface text-fg-subtle rounded-lg border px-5 py-14 text-center text-sm leading-normal">
          {labels.recipeEmpty}
        </p>
      </>
    );
  }

  const margin = card.marginPercent;
  const food = card.foodCostPercent;

  const marginInk =
    margin === null
      ? 'text-fg-subtle'
      : margin < MARGIN_FLOOR
        ? 'text-danger-600'
        : margin < 50
          ? 'text-warning-700'
          : 'text-success-600';

  const amount = (tiyin: number | null): string =>
    tiyin === null ? '—' : formatTiyinAmount(tiyin, lang);

  return (
    <>
      <p className="text-fg-muted mb-4 text-sm">{labels.recipeSub}</p>

      <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
        <ul className="bg-surface h-fit rounded-lg border p-1.5">
          {rows.map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => setSelected(entry.key)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm ${
                  entry.key === card.key
                    ? 'bg-brand-50 text-brand-700 font-bold'
                    : 'hover:bg-bg-muted font-medium'
                }`}
              >
                <span className="min-w-0 truncate">{entry.name}</span>
                <span
                  data-num
                  className={`text-xs font-semibold ${
                    entry.marginPercent !== null && entry.marginPercent < MARGIN_FLOOR
                      ? 'text-danger-600'
                      : 'text-fg-muted'
                  }`}
                >
                  {entry.marginPercent === null ? '—' : `${entry.marginPercent}%`}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <section className="bg-surface rounded-lg border p-5">
          <h3 className="font-display tracking-snug text-lg font-bold">{card.name}</h3>

          {/* The card clips to keep its rounded corners, so the table needs its own
              scroller — without one a phone loses the right-hand columns entirely,
              and a clipped column is worse than a scrolled one: nobody can reach it. */}
          <div className="overflow-x-auto">
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-fg-subtle text-2xs tracking-caps border-divider border-b uppercase">
                  <th className="py-2 text-left font-semibold">{labels.colIngredient}</th>
                  <th className="py-2 text-right font-semibold">{labels.colQuantity}</th>
                  <th className="py-2 text-right font-semibold">{labels.colUnitCost}</th>
                  <th className="py-2 text-right font-semibold">{labels.colCost}</th>
                </tr>
              </thead>
              <tbody>
                {card.lines.map((line) => (
                  <tr key={line.key} className="border-divider border-b last:border-0">
                    <td className="py-2.5">
                      {/* A component the shelf no longer has. The row stays —
                        a card with a hole in it has to look like one — and the
                        note under the table says how many. */}
                      <span
                        className={`font-medium ${line.name === null ? 'text-danger-600' : ''}`}
                      >
                        {line.name ?? labels.recipeMissingLine}
                      </span>
                      {/*
                       * A prep line is marked, because its cost comes from
                       * another card. Somebody auditing a dish that looks
                       * expensive needs to know which card to open next.
                       */}
                      {line.prep ? (
                        <span className="bg-accent-50 text-accent-700 rounded-pill text-2xs ml-2 px-2 py-0.5 font-semibold">
                          {labels.prepTag}
                        </span>
                      ) : null}
                    </td>
                    <td data-num className="text-fg-muted py-2.5 text-right">
                      {line.quantity} {line.unit}
                    </td>
                    <td data-num className="text-fg-muted py-2.5 text-right">
                      {amount(line.unitCostTiyin)}
                    </td>
                    <td data-num className="py-2.5 text-right font-medium">
                      {amount(line.lineCostTiyin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="border-divider mt-4 grid gap-x-6 gap-y-2 border-t pt-4 sm:grid-cols-4">
            <div>
              <dt className="text-fg-subtle text-xs">{labels.totalCost}</dt>
              <dd data-num className="text-md font-semibold">
                {amount(card.costTiyin)}
              </dd>
            </div>
            <div>
              <dt className="text-fg-subtle text-xs">{labels.sellPrice}</dt>
              <dd data-num className="text-md font-semibold">
                {amount(card.sellTiyin)}
              </dd>
            </div>
            <div>
              <dt className="text-fg-subtle text-xs">{labels.margin}</dt>
              <dd data-num className={`text-md font-semibold ${marginInk}`}>
                {margin === null ? '—' : `${margin}%`}
              </dd>
            </div>
            <div>
              <dt className="text-fg-subtle text-xs">{labels.foodCost}</dt>
              <dd
                data-num
                className={`text-md font-semibold ${
                  food === null
                    ? ''
                    : food > 40
                      ? 'text-danger-600'
                      : food > 33
                        ? 'text-warning-700'
                        : ''
                }`}
              >
                {food === null ? '—' : `${food}%`}
              </dd>
            </div>
          </dl>

          {card.unresolved > 0 ? (
            <p className="border-warning-500/30 bg-warning-50 text-warning-700 mt-4 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
              {labels.recipeUnresolved.replace('{n}', String(card.unresolved))}
            </p>
          ) : margin !== null && margin < MARGIN_FLOOR ? (
            <p className="border-danger-500/30 bg-danger-50 text-danger-700 mt-4 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
              {labels.recipeFloor}
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

/* ----------------------------------------------------------- prep items */

function Prep({
  lang,
  labels,
  money,
  cards,
}: {
  lang: Lang;
  labels: Record<string, string>;
  money: Readonly<Record<string, string>>;
  /** The kitchen's own cards, costed by the server. Null is the demo console. */
  cards: readonly PrepCard[] | null;
}) {
  /*
   * What has been made this session, added to the balance the server sent.
   *
   * Local rather than a router refresh, for the same reason the transfer list
   * is: a cook making three batches in a row would otherwise lose the table's
   * scroll position between each one.
   */
  const [made, setMade] = useState<Readonly<Record<number, number>>>({});
  const [busy, setBusy] = useState<number | null>(null);

  async function produce(card: PrepCard) {
    setBusy(card.id);
    const answer = await post<{ data: { produced: number } }>(
      '/api/inventory/prep',
      { prepItemId: card.id, batches: 1 },
      lang,
    );
    setBusy(null);

    if (!answer.ok) {
      // `stock.prep_card_empty` and a shelf that could not be found both arrive
      // with their own sentence in the reader's language.
      flash.problem(answer.message ?? labels.prepMake);

      return;
    }

    const produced = answer.data.data.produced;

    setMade((current) => ({ ...current, [card.id]: (current[card.id] ?? 0) + produced }));
    flash(labels.prepMade.replace('{n}', String(produced)).replace('{unit}', card.unit));
  }

  return (
    <>
      <p className="text-fg-muted mb-4 text-sm">{labels.prepSub}</p>

      <div className="bg-surface overflow-hidden rounded-lg border">
        {/* The card clips to keep its rounded corners, so the table needs its own
            scroller — without one a phone loses the right-hand columns entirely,
            and a clipped column is worse than a scrolled one: nobody can reach it. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-fg-subtle text-2xs tracking-caps border-divider border-b uppercase">
                <th className="px-5 py-2.5 text-left font-semibold">{labels.colItem}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{labels.colBatch}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{labels.colLoss}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{labels.colUnitCost}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{labels.colShelf}</th>
                <th className="px-5 py-2.5 text-right font-semibold">{labels.colOnHand}</th>
              </tr>
            </thead>
            <tbody>
              {cards !== null
                ? cards.map((card) => {
                    const onHand = card.onHand + (made[card.id] ?? 0);

                    return (
                      <tr key={card.id} className="border-divider border-b last:border-0">
                        <td className="px-5 py-3">
                          <span className="font-medium">{card.name}</span>
                          <span className="text-fg-subtle block text-xs">
                            {money[`liveBatch_${card.id}`]} · {card.lines.length}{' '}
                            {labels.ingredients}
                          </span>
                        </td>
                        <td data-num className="text-fg-muted px-3 py-3 text-right">
                          {card.batch} {card.unit}
                        </td>
                        <td
                          data-num
                          className={`px-3 py-3 text-right ${card.lossPercent >= 15 ? 'text-warning-700 font-semibold' : 'text-fg-muted'}`}
                        >
                          {card.lossPercent}%
                        </td>
                        <td data-num className="px-3 py-3 text-right font-medium">
                          {money[`liveUnit_${card.id}`]}
                        </td>
                        <td data-num className="text-fg-muted px-3 py-3 text-right">
                          {labels.days.replace('{n}', String(card.shelfDays))}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            data-num
                            className={`font-semibold ${onHand === 0 ? 'text-danger-600' : ''}`}
                          >
                            {onHand} {card.unit}
                          </span>
                          {/*
                           * One batch a press, and no quantity field.
                           *
                           * A cook works in whole batches — the card yields what
                           * it yields — and a number box would invite "500 g of
                           * zirvak", which cannot be made without scaling every
                           * component to a fraction of a gram. The API caps a
                           * single call at fifty for the same reason a typed
                           * number is dangerous.
                           */}
                          <button
                            type="button"
                            data-press
                            disabled={busy === card.id}
                            onClick={() => void produce(card)}
                            className="border-border bg-surface text-fg-muted ml-3 h-7 rounded-md border px-2.5 text-xs font-semibold disabled:opacity-40"
                          >
                            {labels.prepMake}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                : PREP_ITEMS.map((item) => (
                    <tr key={item.key} className="border-divider border-b last:border-0">
                      <td className="px-5 py-3">
                        <span className="font-medium">{say(item.name, lang)}</span>
                        <span className="text-fg-subtle block text-xs">
                          {money[`batch_${item.key}`]} · {item.lines.length} {labels.ingredients}
                        </span>
                      </td>
                      <td data-num className="text-fg-muted px-3 py-3 text-right">
                        {item.batch} {item.unit}
                      </td>
                      {/* Loss is the number that makes a prep card honest, so it is
                        the one that is coloured when it is large. */}
                      <td
                        data-num
                        className={`px-3 py-3 text-right ${item.lossPercent >= 15 ? 'text-warning-700 font-semibold' : 'text-fg-muted'}`}
                      >
                        {item.lossPercent}%
                      </td>
                      <td data-num className="px-3 py-3 text-right font-medium">
                        {money[`prepUnit_${item.key}`]}
                      </td>
                      <td data-num className="text-fg-muted px-3 py-3 text-right">
                        {labels.days.replace('{n}', String(item.shelfDays))}
                      </td>
                      <td
                        data-num
                        className={`px-5 py-3 text-right font-semibold ${item.onHand === 0 ? 'text-danger-600' : ''}`}
                      >
                        {item.onHand} {item.unit}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- log */

function Log({
  lang,
  labels,
  entries,
}: {
  lang: Lang;
  labels: Record<string, string>;
  entries: readonly LedgerEntry[] | null;
}) {
  const KIND_STYLE: Record<string, string> = {
    receiving: 'bg-success-50 text-success-700',
    count: 'bg-brand-50 text-brand-700',
    waste: 'bg-danger-50 text-danger-700',
    transfer: 'bg-warning-50 text-warning-700',
    correction: 'bg-bg-muted text-fg-muted',
  };

  return (
    <>
      <p className="text-fg-muted mb-1 text-sm">{labels.logSub}</p>
      {/* The point of the tab: a sale is never here, because a sale is
          automatic. Everything on this list is somebody's decision. */}
      <p className="text-fg-subtle mb-4 text-xs leading-normal">{labels.logNote}</p>

      {/* The API's ledger when there is one; the design's history when there is
          not. An empty live list is a restaurant nothing has been adjusted in
          yet, which is a sentence rather than eight borrowed rows. */}
      <ul className="bg-surface divide-divider divide-y rounded-lg border">
        {(entries ?? ADJUSTMENTS.map((entry) => ({ ...entry, what: say(entry.what, lang) }))).map(
          (entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
              <span data-num className="text-fg-muted w-14 flex-none text-xs">
                {entry.time}
              </span>
              <span
                className={`rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold ${KIND_STYLE[entry.kind]}`}
              >
                {labels[`kind_${entry.kind}`]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.what}</span>
              <span data-num className="flex-none text-sm font-semibold">
                {entry.delta}
              </span>
              <span className="text-fg-subtle w-36 flex-none text-right text-xs">{entry.who}</span>
            </li>
          ),
        )}

        {entries !== null && entries.length === 0 ? (
          <li className="text-fg-subtle px-5 py-12 text-center text-sm">{labels.logEmpty}</li>
        ) : null}
      </ul>
    </>
  );
}
