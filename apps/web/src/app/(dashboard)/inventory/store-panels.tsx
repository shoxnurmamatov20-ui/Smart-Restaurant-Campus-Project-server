'use client';

import { useState } from 'react';
import { flash } from '@restaurant/ui';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import { ACTION_PRIMARY } from '../screen';
import {
  ADD_BASE_UNITS,
  ADD_SUPPLIERS,
  addedToast,
  CORRECTION_REASONS,
  say,
  STORE_COPY,
  type Lang,
} from './inventory-data';
import { apiId, post } from '@/lib/console-post';

import { markOrdered, useOrdered } from './purchase-store';

/**
 * The store's interactive pieces: the expiry list, the item drawer, and the
 * modal that adds a line.
 *
 * All three come from `Smart Restaurant OS.dc.html` — the expiry table at
 * `:2136-2155`, the drawer at `:2178-2258`, the add modal at `:2262-2338`. They
 * are here rather than on the page because each changes what it says when
 * somebody presses something: a batch sent to waste leaves the list, a
 * corrected quantity is the whole point of the drawer, and the modal's
 * conversion line answers the factor field while it is being typed.
 *
 * None of them writes to the server yet. What they do instead is what the
 * design does — change the screen in front of the person who pressed, and say
 * so.
 */

/** Two decimals, as the design's `fd()` rounds every quantity on this screen. */
const round2 = (value: number): number => Math.round(Math.abs(value) * 100) / 100;

/**
 * A quantity with its sign in front, the way the ledger writes one.
 *
 * A true minus sign (U+2212), not a hyphen: these sit in a `data-num` column
 * beside figures, and a hyphen is half the width and a third of the weight —
 * at a glance the row reads as a positive number with dust in front of it.
 */
const signed = (quantity: number, unit: string, lang: Lang): string =>
  `${quantity > 0 ? '+' : '−'}${formatNumber(round2(quantity), lang)} ${unit}`;

/** A row of the expiry table, already joined to its stock line's name and unit. */
export type ExpiryRow = {
  batch: string;
  name: string;
  quantity: number;
  unit: string;
  arrived: string;
  expires: string;
  left: number;
};

const EXPIRY_COLUMNS =
  '[grid-template-columns:minmax(0,1.3fr)_130px_110px_120px_120px_140px_110px]';

export function ExpiryPanel({
  rows,
  lang,
  labels,
}: {
  rows: readonly ExpiryRow[];
  lang: Lang;
  /** Column headings that already exist in the console catalogue. */
  labels: { item: string; quantity: string; empty: string };
}) {
  const [wasted, setWasted] = useState<readonly string[]>([]);

  const shown = rows.filter((row) => !wasted.includes(row.batch));

  function sendToWaste(row: ExpiryRow) {
    if (wasted.includes(row.batch)) {
      flash.problem(say(STORE_COPY.alreadyWasted, lang));

      return;
    }

    setWasted((current) => [...current, row.batch]);

    /*
     * Local, and the endpoint is not what is missing.
     *
     * `POST /api/v1/inventory/ingredients/{id}/movements` with `kind:
     * write_off` takes exactly this, and the drawer beside it already posts
     * through the count route. What this panel has is a **batch** — `B-2411`,
     * arrived Tuesday, expires Friday — and there is no batch table: stock is a
     * single running balance per ingredient. Writing this off against the
     * ingredient would be right about the quantity and silent about which crate
     * went, which is the one thing an expiry list exists to record.
     */
    flash(`${row.name} · ${row.batch} ${say(STORE_COPY.wasted, lang)}`);
  }

  return (
    <div data-table className="bg-surface overflow-hidden rounded-lg border">
      <div
        className={`bg-bg-subtle text-fg-subtle grid ${EXPIRY_COLUMNS} gap-4 border-b px-5 py-[11px] text-xs font-semibold tracking-wide`}
      >
        <span>{labels.item}</span>
        <span>{say(STORE_COPY.colBatch, lang)}</span>
        <span className="text-right">{labels.quantity}</span>
        <span>{say(STORE_COPY.colArrived, lang)}</span>
        <span>{say(STORE_COPY.colExpires, lang)}</span>
        <span>{say(STORE_COPY.colLeft, lang)}</span>
        <span />
      </div>

      {shown.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <p className="text-sm font-semibold">{say(STORE_COPY.expiryEmpty, lang)}</p>
          <p className="text-fg-subtle mx-auto mt-1.5 max-w-[44ch] text-xs leading-normal">
            {labels.empty}
          </p>
        </div>
      ) : (
        shown.map((row) => {
          /* Two days and five days, the design's own bands. They are days and
             not a fraction of shelf life on purpose: a storekeeper's morning is
             the same length whatever the product is. */
          const critical = row.left <= 2;
          const warning = row.left <= 5;

          const chip = critical
            ? 'bg-danger-50 text-danger-700'
            : warning
              ? 'bg-warning-50 text-warning-700'
              : 'bg-bg-muted text-fg-muted';

          const dot = critical
            ? 'var(--danger-500)'
            : warning
              ? 'var(--warning-500)'
              : 'var(--n-400)';

          return (
            <div
              key={row.batch}
              data-row
              data-late={critical ? 'true' : undefined}
              className={`border-divider grid ${EXPIRY_COLUMNS} items-center gap-4 border-b px-5 py-3`}
            >
              <span className="min-w-0 truncate text-sm font-semibold">{row.name}</span>

              <span data-num className="text-fg-subtle font-mono text-xs">
                {row.batch}
              </span>

              <span data-num className="text-right text-sm font-semibold">
                {formatNumber(row.quantity, lang)} {row.unit}
              </span>

              <span data-num className="text-fg-muted text-sm">
                {row.arrived}
              </span>
              <span data-num className="text-fg-muted text-sm">
                {row.expires}
              </span>

              <span>
                <span
                  className={`rounded-pill text-2xs inline-flex items-center gap-[7px] px-2.5 py-1 font-semibold ${chip}`}
                >
                  <span className="size-1.5 rounded-full" style={{ background: dot }} />
                  {row.left} {say(STORE_COPY.days, lang)}
                </span>
              </span>

              <button
                type="button"
                data-press
                onClick={() => sendToWaste(row)}
                className="text-danger-600 text-right text-xs font-semibold"
              >
                {say(STORE_COPY.toWaste, lang)}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

/** One line of this item's own history, as the drawer lists it. */
export type DrawerMove = {
  id: string;
  at: string;
  /** What caused it, already in the reader's language. */
  source: string;
  /** Signed, in the line's purchase unit. */
  quantity: number;
};

/** One stock line, as the drawer shows it. Money in tiyin, like everywhere else. */
export type DrawerItem = {
  id: string;
  name: string;
  /** The purchase unit's label, already translated. */
  unit: string;
  /** The base unit's label, or `null` when the line has no second unit. */
  baseUnit: string | null;
  /** Base units in one purchase unit. */
  factor: number;
  /** Tiyin per purchase unit. */
  price: number;
  /** Days, or `null` where nothing knows it yet. */
  shelfLife: number | null;
  onHand: number;
  par: number;
  supplier: string;
  /** The API's id for the company, when the row came from the API. */
  supplierId?: string | null;
  /** The raw base unit — `g`, `ml`, `pcs` — as the API spells it. */
  baseUnitCode?: string | null;
  /** Tiyin per one BASE unit, which is what an order line is priced in. */
  priceBase?: number;
  moves: readonly DrawerMove[];
};

/**
 * The item drawer, and the correction form inside it.
 *
 * The console had corrections as a *tab*. The design does not: `ivCorrH` lives
 * inside the drawer for one line, next to that line's own numbers. That
 * placement is the control — a correction typed against a list is a correction
 * typed without looking at what is being corrected, and the difference between
 * 4.2 and 42 is invisible until it is beside the 18 the kitchen expects.
 */
export function ItemDrawer({
  item,
  lang,
  labels,
  onClose,
}: {
  item: DrawerItem;
  lang: Lang;
  labels: { onHand: string; par: string };
  onClose: () => void;
}) {
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState(0);
  const [document, setDocument] = useState('');
  const [onHand, setOnHand] = useState(item.onHand);

  const parsed = counted.trim() === '' ? null : Number.parseFloat(counted.replace(',', '.'));
  const difference = parsed !== null && !Number.isNaN(parsed) ? parsed - onHand : 0;
  /* Coverage is stock against a third of par, which is the design's arithmetic
     and reads as "days": par is what the kitchen wants on the shelf for about
     three days of trade. Floored at zero — a negative shelf is a bug in the
     ledger, and printing "−2 days" invites somebody to explain it away. */
  const cover = item.par > 0 ? Math.max(0, Math.round((onHand / (item.par / 3)) * 10) / 10) : 0;

  async function save() {
    if (parsed === null || Number.isNaN(parsed) || parsed < 0) {
      flash.problem(say(STORE_COPY.corrNeedNumber, lang));

      return;
    }

    if (difference === 0) {
      flash.problem(say(STORE_COPY.corrNothingToDo, lang));

      return;
    }

    const told = `${item.name} · ${signed(difference, item.unit, lang)} · ${say(CORRECTION_REASONS[reason]!, lang)}`;
    const ingredientId = apiId(item.id);

    if (ingredientId === null) {
      // A fixture line. The drawer still does its arithmetic, which is what the
      // demo console is for.
      setOnHand(parsed);
      flash(told);
      onClose();

      return;
    }

    /*
     * A correction is a count of one row, so it goes through the count
     * endpoint rather than a second door of its own — the API takes both
     * through one route for the same reason. The counted figure is sent
     * absolute and in base units: sending the gap would be doing the
     * subtraction against a balance that may have moved since the drawer
     * opened, which is the one arithmetic a count exists to avoid.
     */
    const answer = await post(
      '/api/inventory/counts',
      {
        reference: document.trim() === '' ? null : document.trim(),
        lines: [{ ingredientId, counted: Math.round(parsed * item.factor) }],
      },
      lang,
    );

    if (!answer.ok) {
      flash.problem(answer.message ?? say(STORE_COPY.corrNeedNumber, lang));

      return;
    }

    setOnHand(parsed);
    flash(told);
    onClose();
  }

  return (
    <div
      data-scrim
      className="fixed inset-0 z-[200] flex justify-end"
      style={{ background: 'rgba(15,19,32,.4)' }}
      onClick={onClose}
      role="presentation"
    >
      <aside
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={(event) => event.stopPropagation()}
        className="bg-surface flex h-full w-[520px] max-w-full flex-col border-l"
      >
        <div className="flex flex-none items-start justify-between gap-4 border-b px-6 py-5">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold tracking-tight">{item.name}</h3>
            <p className="text-fg-muted mt-1.5 text-sm">{item.supplier}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={say(STORE_COPY.close, lang)}
            title={say(STORE_COPY.close, lang)}
            className="bg-bg-muted text-fg-muted hover:bg-border grid size-8 flex-none place-items-center rounded-[9px]"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-6 py-[22px]">
          <div className="grid grid-cols-3 gap-3.5">
            <Figure label={labels.onHand} value={`${formatNumber(onHand, lang)} ${item.unit}`} />
            <Figure
              label={labels.par}
              value={`${formatNumber(item.par, lang)} ${item.unit}`}
              muted
            />
            <Figure
              label={say(STORE_COPY.cover, lang)}
              value={`${cover} ${say(STORE_COPY.days, lang)}`}
              tone={cover < 1 ? 'text-danger-600' : cover < 2 ? 'text-warning-700' : undefined}
            />
          </div>

          {/*
           * Units of measure.
           *
           * The one block on this screen that explains the rest of it. A recipe
           * card spends 180 g and a delivery arrives as 12 kg, and until the
           * factor between them is on the screen, every quantity here is a
           * number somebody has to take on faith. The two prices are the same
           * fact said twice on purpose: the buyer argues about the price of a
           * kilo and the chef costs a dish in grams.
           */}
          <div className="bg-bg-subtle mt-[22px] rounded-md border px-[18px] py-4">
            <div className="text-fg-subtle tracking-caps text-2xs uppercase">
              {say(STORE_COPY.units, lang)}
            </div>

            {item.baseUnit === null ? null : (
              <>
                <div className="text-md mt-[9px] flex items-baseline gap-2 font-semibold">
                  <span data-num>
                    1 {item.unit} = {formatNumber(item.factor, lang)} {item.baseUnit}
                  </span>
                </div>
                <div className="text-fg-muted mt-[7px] text-xs leading-relaxed">
                  {say(STORE_COPY.unitsNote, lang)}
                </div>
              </>
            )}

            <div className="mt-[13px] flex gap-[22px] border-t pt-[13px]">
              <SmallFigure
                label={say(STORE_COPY.buyPrice, lang)}
                value={`${formatTiyinAmount(item.price, lang)} / ${item.unit}`}
              />

              {item.baseUnit === null ? null : (
                <SmallFigure
                  label={say(STORE_COPY.basePrice, lang)}
                  value={`${formatTiyinAmount(Math.round(item.price / item.factor), lang)} / ${item.baseUnit}`}
                />
              )}

              {/* Omitted rather than guessed: the API has no shelf-life column
                  yet, and a default printed beside two real figures is the one
                  a storekeeper would act on. */}
              {item.shelfLife === null ? null : (
                <SmallFigure
                  label={say(STORE_COPY.shelf, lang)}
                  value={`${item.shelfLife} ${say(STORE_COPY.days, lang)}`}
                />
              )}
            </div>
          </div>

          <div className="mt-[22px] rounded-md border p-[18px]">
            <div className="text-md font-semibold">{say(STORE_COPY.corrHead, lang)}</div>
            <p className="text-fg-muted mt-1.5 text-xs leading-relaxed">
              {say(STORE_COPY.corrBody, lang)}
            </p>

            <div className="mt-3.5 grid grid-cols-2 gap-3">
              <div>
                <span className="text-fg-muted block text-xs font-semibold">
                  {say(STORE_COPY.corrOld, lang)}
                </span>
                <div
                  data-num
                  className="bg-bg-muted text-fg-muted mt-1.5 flex h-10 items-center rounded-md border px-3 text-sm font-semibold"
                >
                  {formatNumber(onHand, lang)} {item.unit}
                </div>
              </div>

              <label className="block">
                <span className="text-fg-muted block text-xs font-semibold">
                  {say(STORE_COPY.corrNew, lang)}
                </span>
                <input
                  value={counted}
                  onChange={(event) => setCounted(event.target.value)}
                  inputMode="decimal"
                  data-num
                  className="bg-surface border-border-strong mt-1.5 h-10 w-full rounded-md border px-3 font-mono text-sm font-semibold"
                />
              </label>
            </div>

            <div className="mt-3">
              <span className="text-fg-muted block text-xs font-semibold">
                {say(STORE_COPY.corrWhy, lang)}
              </span>
              <div className="mt-2 flex flex-wrap gap-[7px]">
                {CORRECTION_REASONS.map((entry, index) => (
                  <button
                    key={entry.en}
                    type="button"
                    data-press
                    onClick={() => setReason(index)}
                    className={`rounded-pill h-8 border px-3 text-xs font-semibold ${
                      reason === index
                        ? 'bg-fg text-bg border-fg'
                        : 'bg-surface border-border-strong'
                    }`}
                  >
                    {say(entry, lang)}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-3 block">
              <span className="text-fg-muted block text-xs font-semibold">
                {say(STORE_COPY.corrDoc, lang)}
              </span>
              <input
                value={document}
                onChange={(event) => setDocument(event.target.value)}
                placeholder={say(STORE_COPY.corrDocPlaceholder, lang)}
                className="bg-surface border-border-strong mt-1.5 h-10 w-full rounded-md border px-3 text-sm"
              />
            </label>

            <div className="border-divider mt-4 flex items-center justify-between gap-3.5 border-t pt-3.5">
              <span
                data-num
                className={`text-sm font-semibold ${
                  difference === 0
                    ? 'text-fg-muted'
                    : difference > 0
                      ? 'text-success-600'
                      : 'text-danger-600'
                }`}
              >
                {/* The design puts money next to the quantity, and that is the
                    line that decides whether this needs a signature: three
                    kilos of onion and three kilos of lamb are the same
                    correction until somebody prices them. */}
                {difference === 0
                  ? say(STORE_COPY.corrNoDiff, lang)
                  : `${signed(difference, item.unit, lang)} · ${formatTiyinAmount(
                      Math.abs(Math.round(difference * item.price)),
                      lang,
                    )} ${say(STORE_COPY.som, lang)}`}
              </span>

              <button
                type="button"
                data-press
                onClick={save}
                className="bg-brand-500 hover:bg-brand-600 h-[38px] rounded-md px-4 text-sm font-semibold text-white"
              >
                {say(STORE_COPY.corrSave, lang)}
              </button>
            </div>
          </div>

          {/*
           * This line's own history.
           *
           * The same ledger the Movements tab draws, filtered to one item —
           * deliberately the same list rather than a second one, because the
           * tab and the drawer disagreeing about the same minute is a fault
           * nobody can see from either screen.
           */}
          <div className="mt-[22px]">
            <div className="text-fg-subtle tracking-caps text-2xs mb-2.5 uppercase">
              {say(STORE_COPY.itemMoves, lang)}
            </div>

            {item.moves.length === 0 ? (
              <p className="text-fg-subtle text-xs leading-normal">
                {say(STORE_COPY.itemMovesEmpty, lang)}
              </p>
            ) : (
              item.moves.map((move) => (
                <div
                  key={move.id}
                  className="border-divider grid grid-cols-[56px_1fr_96px] items-center gap-3 border-b py-2.5"
                >
                  <span data-num className="text-fg-subtle font-mono text-xs">
                    {move.at}
                  </span>
                  <span className="text-fg-muted min-w-0 truncate text-sm">{move.source}</span>
                  <span
                    data-num
                    className={`text-right text-sm font-semibold ${
                      move.quantity > 0 ? 'text-success-600' : 'text-danger-600'
                    }`}
                  >
                    {signed(move.quantity, item.unit, lang)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Figure({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-fg-subtle tracking-caps text-2xs uppercase">{label}</div>
      <div
        data-num
        className={`font-display mt-1 text-2xl font-bold tracking-tight ${tone ?? (muted ? 'text-fg-muted' : '')}`}
      >
        {value}
      </div>
    </div>
  );
}

/** The smaller pair inside the units block: a caption over one figure. */
function SmallFigure({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-fg-subtle text-2xs block">{label}</span>
      <span data-num className="mt-0.5 block text-sm font-semibold">
        {value}
      </span>
    </span>
  );
}

/* -------------------------------------------------------- the add modal */

/**
 * The button in the page head, and the modal behind it.
 *
 * A modal rather than a page because of what the design says in it: choosing
 * the base unit is the decision that cannot be taken back later, since every
 * recipe card is then written in it. A form that small, with one irreversible
 * field, belongs in front of the list it is adding to.
 *
 * Local only. There is no endpoint yet — the ingredient table has no purchase
 * unit, no factor and no shelf-life column — so the modal validates what it can
 * and says what it would have written.
 */
/**
 * What the API calls the unit each base unit is bought in.
 *
 * The drawer's own field is free text and translated — a storekeeper types
 * "quti" or "ящик" — and a column holding the Russian for "case" is a column
 * nothing can filter on. So the label stays a label and the code comes from
 * the base unit, which is the one thing the drawer asks about unambiguously.
 */
const PURCHASE_CODE: Readonly<Record<string, string>> = { g: 'kg', ml: 'l', pcs: 'case' };

export function AddStockItem({ lang, supplierLabel }: { lang: Lang; supplierLabel: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [base, setBase] = useState(0);
  /* Null means "still following the base unit". The design does the same with
     `S.gBuyU === undefined`: the fields carry a sensible default until somebody
     types over them, and picking a different base then re-answers them. */
  const [purchaseUnit, setPurchaseUnit] = useState<string | null>(null);
  const [factor, setFactor] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [minimum, setMinimum] = useState('');
  const [shelf, setShelf] = useState('');
  const [supplier, setSupplier] = useState(0);

  const pick = ADD_BASE_UNITS[base]!;
  const baseLabel = pick.base === 'pcs' ? say(STORE_COPY.basePcs, lang) : pick.base;
  const purchaseLabel = purchaseUnit ?? say(pick.purchase, lang);
  const factorText = factor ?? String(pick.factor);
  const factorNumber = Number.parseFloat(factorText.replace(',', '.'));

  /* The line under the two fields, recomputed as they are typed. It reads the
     fields rather than the defaults behind them, which is the point: a preview
     that ignores what was just typed is a preview that contradicts it. */
  const conversion = `1 ${purchaseLabel} = ${
    Number.isFinite(factorNumber) ? formatNumber(factorNumber, lang) : factorText
  } ${baseLabel}`;

  function close() {
    setOpen(false);
  }

  async function save() {
    const trimmed = name.trim();

    if (trimmed === '') {
      flash.problem(say(STORE_COPY.addNeedName, lang));

      return;
    }

    /* Three characters. Not fussiness: a store list is searched by typing, and
       a line called "M" is a line nobody finds twice. */
    if (trimmed.length < 3) {
      flash.problem(say(STORE_COPY.addShortName, lang));

      return;
    }

    if (!Number.isFinite(factorNumber) || factorNumber <= 0) {
      flash.problem(say(STORE_COPY.addBadFactor, lang));

      return;
    }

    /*
     * Eight of the nine fields land in a column now (`2026_08_22_110000`); the
     * ninth is the supplier, which has no place on an ingredient — who brings a
     * thing is a fact about the orders it arrives on, and the shelf reads it
     * back from them. Picking one here still helps: it is what the storekeeper
     * will raise the first order against.
     */
    const answer = await post(
      '/api/inventory/ingredients',
      {
        name: trimmed,
        base: pick.base,
        /* The API's own vocabulary, not the label on the field. `purchaseUnit`
         holds whatever the storekeeper typed over the default — "quti", "ящик"
         — and a column that stored the Russian for "case" would be a column
         nothing could filter on. The base unit decides the code; the typed
         label is a display choice. */
        purchaseUnit: PURCHASE_CODE[pick.base],
        factor: Math.round(factorNumber),
        // Tiyin per purchase unit. The route divides it down by the factor, once.
        price: Math.round((Number.parseFloat(price.replace(',', '.')) || 0) * 100),
        minimum: Math.round(Number.parseFloat(minimum.replace(',', '.')) || 0),
        shelfLife: Math.round(Number.parseFloat(shelf.replace(',', '.')) || 0),
      },
      lang,
    );

    /*
     * A refusal keeps the drawer open with everything still typed in it. The
     * one that actually happens is a duplicate code, and clearing the form
     * would make somebody retype nine fields to change one of them.
     */
    if (!answer.ok) {
      flash.problem(answer.message ?? say(STORE_COPY.addNeedName, lang));

      return;
    }

    setOpen(false);
    /* The per-item answers are cleared and the unit setup is kept: somebody
       adding a second line is usually adding another of the same shape, and
       nobody wants the previous item's price already filled in. */
    setName('');
    setPrice('');
    setMinimum('');
    setShelf('');

    flash(addedToast(trimmed, conversion, lang));
  }

  return (
    <>
      <button type="button" data-press onClick={() => setOpen(true)} className={ACTION_PRIMARY}>
        {say(STORE_COPY.add, lang)}
      </button>

      {!open ? null : (
        <div
          data-scrim
          className="fixed inset-0 z-[200] grid place-items-center p-4"
          style={{ background: 'rgba(15,19,32,.4)' }}
          onClick={close}
          role="presentation"
        >
          <div
            data-sheet
            role="dialog"
            aria-modal="true"
            aria-label={say(STORE_COPY.addHead, lang)}
            onClick={(event) => event.stopPropagation()}
            className="bg-surface max-h-[calc(100dvh-64px)] w-[600px] max-w-full overflow-y-auto rounded-xl border p-[26px] shadow-xl"
          >
            <h3 className="font-display text-xl font-bold tracking-tight">
              {say(STORE_COPY.addHead, lang)}
            </h3>
            <p className="text-fg-muted mt-1.5 text-sm leading-relaxed">
              {say(STORE_COPY.addBody, lang)}
            </p>

            <label className="mt-5 block">
              <span className="text-fg-muted block text-xs font-semibold">
                {say(STORE_COPY.addName, lang)}
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={say(STORE_COPY.addNamePlaceholder, lang)}
                className="bg-surface border-border-strong mt-1.5 h-[42px] w-full rounded-md border px-3 text-sm"
              />
            </label>

            <div className="mt-4">
              <span className="text-fg-muted block text-xs font-semibold">
                {say(STORE_COPY.addBase, lang)}
              </span>
              <div className="mt-2 flex gap-[7px]">
                {ADD_BASE_UNITS.map((entry, index) => (
                  <button
                    key={entry.base}
                    type="button"
                    data-press
                    onClick={() => {
                      setBase(index);
                      setPurchaseUnit(null);
                      setFactor(null);
                    }}
                    className={`h-10 flex-1 rounded-md border text-sm font-semibold ${
                      base === index
                        ? 'bg-brand-50 text-brand-600 border-brand-200'
                        : 'bg-surface border-border-strong'
                    }`}
                  >
                    {entry.base === 'pcs' ? say(STORE_COPY.basePcs, lang) : entry.base}
                  </button>
                ))}
              </div>
              <p className="text-fg-subtle mt-[7px] text-xs leading-snug">
                {say(STORE_COPY.addBaseNote, lang)}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-fg-muted block text-xs font-semibold">
                  {say(STORE_COPY.addBuy, lang)}
                </span>
                <input
                  value={purchaseLabel}
                  onChange={(event) => setPurchaseUnit(event.target.value)}
                  className="bg-surface border-border-strong mt-1.5 h-[42px] w-full rounded-md border px-3 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-fg-muted block text-xs font-semibold">
                  {say(STORE_COPY.addFactor, lang)}
                </span>
                <input
                  value={factorText}
                  onChange={(event) => setFactor(event.target.value)}
                  inputMode="decimal"
                  data-num
                  className="bg-surface border-border-strong mt-1.5 h-[42px] w-full rounded-md border px-3 font-mono text-sm font-semibold"
                />
              </label>
            </div>

            <div data-num className="text-brand-600 mt-2 text-xs font-medium">
              {conversion}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <NumberField
                label={say(STORE_COPY.addPrice, lang)}
                value={price}
                onChange={setPrice}
              />
              <NumberField
                label={say(STORE_COPY.addMin, lang)}
                value={minimum}
                onChange={setMinimum}
              />
              <NumberField
                label={say(STORE_COPY.addShelf, lang)}
                value={shelf}
                onChange={setShelf}
              />
            </div>

            <div className="mt-4">
              <span className="text-fg-muted block text-xs font-semibold">{supplierLabel}</span>
              <div className="mt-2 flex flex-wrap gap-[7px]">
                {ADD_SUPPLIERS.map((entry, index) => (
                  <button
                    key={entry}
                    type="button"
                    data-press
                    onClick={() => setSupplier(index)}
                    className={`rounded-pill h-[34px] border px-[13px] text-xs font-semibold ${
                      supplier === index
                        ? 'bg-brand-50 text-brand-600 border-brand-200'
                        : 'bg-surface text-fg-muted border-border-strong'
                    }`}
                  >
                    {entry}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-divider mt-6 flex justify-end gap-2.5 border-t pt-[18px]">
              <button
                type="button"
                data-press
                onClick={close}
                className="bg-surface border-border-strong hover:bg-bg-subtle h-10 rounded-md border px-4 text-sm font-semibold"
              >
                {say(STORE_COPY.cancel, lang)}
              </button>
              <button
                type="button"
                data-press
                onClick={save}
                className="bg-brand-500 hover:bg-brand-600 h-10 rounded-md px-[18px] text-sm font-semibold text-white"
              >
                {say(STORE_COPY.addSave, lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** One of the modal's three numeric answers: price, minimum level, shelf life. */
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-fg-muted block text-xs font-semibold">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        data-num
        className="bg-surface border-border-strong mt-1.5 h-[42px] w-full rounded-md border px-3 font-mono text-sm font-semibold"
      />
    </label>
  );
}

/* ------------------------------------------------------------ stock table */

/** One shelf line, with everything the server already resolved into words. */
export type StockTableRow = DrawerItem & {
  /** The last movement, said in the reader's language. */
  lastMove: string;
  /** How full the rail is, 0–100. */
  percent: number;
  railColour: string;
  levelLabel: string;
  levelClass: string;
  /** Which store holds it, or `null` when nothing knows. */
  store: string | null;
  storeTone: string;
};

const STOCK_COLUMNS =
  '[grid-template-columns:minmax(0,1.4fr)_110px_110px_150px_120px_minmax(0,1fr)_96px]';

/**
 * The shelf.
 *
 * Every row opens the drawer — `r.open` in the design — which is the only way
 * the correction form is reachable at all, and the reason it is not a tab. The
 * order button beside it drafts a purchase for the shortfall and then says the
 * line is already on order, rather than accepting the same press twice.
 */
export function StockTable({
  rows,
  lang,
  labels,
}: {
  rows: readonly StockTableRow[];
  lang: Lang;
  labels: {
    item: string;
    onHand: string;
    par: string;
    coverage: string;
    state: string;
    order: string;
    emptyTitle: string;
    emptyBody: string;
  };
}) {
  const [open, setOpen] = useState<StockTableRow | null>(null);
  /*
   * The ordered set is shared rather than local: the KPI strip above the tab
   * bar prints `8 + ordered.length` and cannot see this component's state. See
   * `purchase-store.ts`.
   */
  const ordered = useOrdered();

  async function order(row: StockTableRow) {
    if (ordered.includes(row.id)) {
      flash.problem(`${row.name}${say(STORE_COPY.alreadyOrdered, lang)}`);

      return;
    }

    /* A fifth above par, less what is on the shelf — the design's own sizing.
       Ordering exactly to par means ordering again the same week, and rounding
       up means a supplier never gets asked for 3.4 kg of anything. */
    const need = Math.max(0, Math.ceil(row.par * 1.2 - row.onHand));

    /* Marked before the request, and left marked whatever comes back.
       The button is a control against ordering the same thing twice in one
       sitting, and a storekeeper who taps it, sees a network error and taps
       again is exactly who it is for. A real refusal says so in the toast. */
    markOrdered(row.id);

    const drafted = `${say(STORE_COPY.orderDrafted, lang)}${row.name}, ${formatNumber(need, lang)} ${row.unit} · ${row.supplier}`;
    const ingredientId = apiId(row.id);
    const supplierId =
      row.supplierId === null || row.supplierId === undefined ? null : apiId(row.supplierId);

    /* No session behind this render, so the row is a fixture and there is
       nothing real to order against. The toast is the whole feature on the
       demo console, and it says the same thing it would have said. */
    if (ingredientId === null || supplierId === null) {
      flash(drafted);

      return;
    }

    const answer = await post(
      '/api/suppliers/purchase-orders',
      {
        supplierId,
        // A draft. An order that left the building the instant somebody tapped a
        // row would be an order nobody checked — see the route handler.
        status: 'draft',
        items: [
          {
            ingredientId,
            name: row.name,
            unit: row.baseUnitCode ?? null,
            // Base units: the shelf is shown in kilograms and the document is
            // written in grams, and the conversion happens once, here.
            quantity: need * row.factor,
            unitPrice: row.priceBase ?? Math.round(row.price / Math.max(1, row.factor)),
          },
        ],
      },
      lang,
    );

    if (answer.ok) {
      flash(drafted);

      return;
    }

    flash.problem(answer.message ?? say(STORE_COPY.alreadyOrdered, lang));
  }

  return (
    <>
      <div data-table className="bg-surface overflow-hidden rounded-lg border">
        <div
          className={`bg-bg-subtle text-fg-subtle grid ${STOCK_COLUMNS} gap-4 border-b px-5 py-[11px] text-xs font-semibold tracking-wide`}
        >
          <span>{labels.item}</span>
          <span className="text-right">{labels.onHand}</span>
          <span className="text-right">{labels.par}</span>
          <span>{labels.coverage}</span>
          <span>{labels.state}</span>
          <span>{say(STORE_COPY.colStore, lang)}</span>
          <span />
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm font-semibold">{labels.emptyTitle}</p>
            <p className="text-fg-subtle mx-auto mt-1.5 max-w-[44ch] text-xs leading-normal">
              {labels.emptyBody}
            </p>
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              data-row
              className={`border-divider grid ${STOCK_COLUMNS} items-center gap-4 border-b px-5 py-3`}
            >
              <button
                type="button"
                onClick={() => setOpen(row)}
                className="min-w-0 border-0 bg-transparent p-0 text-left"
              >
                <span className="block truncate text-sm font-semibold">{row.name}</span>
                <span className="text-fg-subtle mt-0.5 block text-xs">{row.lastMove}</span>
              </button>

              <span data-num className="text-right text-sm font-semibold">
                {formatNumber(row.onHand, lang)} {row.unit}
              </span>
              <span data-num className="text-fg-muted text-right text-sm">
                {formatNumber(row.par, lang)} {row.unit}
              </span>

              <span className="bg-bg-muted block h-[5px] overflow-hidden rounded-[3px]">
                <span
                  className="block h-full rounded-[3px]"
                  style={{
                    width: `${Math.min(100, row.percent)}%`,
                    background: row.railColour,
                  }}
                />
              </span>

              <span>
                <span
                  className={`rounded-pill text-2xs inline-flex items-center px-[9px] py-1 font-semibold whitespace-nowrap ${row.levelClass}`}
                >
                  {row.levelLabel}
                </span>
              </span>

              {/* Store over supplier: which shelf it is on, then who refills
                  it. A storekeeper walks to the first and phones the second. */}
              <span className="min-w-0">
                {row.store === null ? null : (
                  <span
                    className="block truncate text-sm font-medium"
                    style={{ color: row.storeTone }}
                  >
                    {row.store}
                  </span>
                )}
                <span className="text-fg-subtle mt-0.5 block truncate text-xs">{row.supplier}</span>
              </span>

              <button
                type="button"
                data-press
                onClick={() => order(row)}
                className="text-fg-brand text-right text-xs font-semibold"
              >
                {ordered.includes(row.id) ? say(STORE_COPY.ordered, lang) : labels.order}
              </button>
            </div>
          ))
        )}
      </div>

      {open === null ? null : (
        <ItemDrawer
          item={open}
          lang={lang}
          labels={{ onHand: labels.onHand, par: labels.par }}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
