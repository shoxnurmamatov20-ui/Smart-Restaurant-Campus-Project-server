import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import { documentHref, printLink } from '@/app/(documents)/documents/documents-copy';
import { getSession } from '@/lib/session';

import { moduleMetadata } from '../module-page';
import { ACTION, PageHead, Row, StatStrip, TableCard } from '../screen';
import { Tabs } from '../tabs';
import {
  EXPIRY,
  expiringSoon,
  LEVEL_RAIL,
  levelOf,
  MOVEMENTS,
  movementsOf,
  say,
  stockById,
  STORE_COPY,
  STORE_NAMES,
  STORE_TONE,
  type BaseUnit,
  type Lang,
  type StockMove,
  type StockRow,
  type Unit,
} from './inventory-data';
import { getLastCountAt, getStockBoard, stockIsLive } from './inventory-server';
import { OpenPurchases } from './open-purchases';
import { StoreChips, storeFrom } from './store-chips';
import {
  AddStockItem,
  ExpiryPanel,
  StockTable,
  type ExpiryRow,
  type StockTableRow,
} from './store-panels';

export const generateMetadata = () => moduleMetadata('inventory');

/**
 * The store room.
 *
 * Built to the design's Inventory screen: four figures across the top, then
 * every ingredient with what is on hand against what the kitchen set as par,
 * and a rail showing the one as a fraction of the other.
 *
 * The rail is the reason the screen works. A storekeeper does not compare two
 * numbers eleven times; they scan a column of bars and stop at the short red
 * ones. The pill beside it says the same thing in words, so the scan and the
 * reading agree.
 *
 * TODO — Phase 1 · inventory, once the module is built:
 *   - Recipe cards, so a sold dish deducts its ingredients
 *   - Goods receipt against the supplier's document
 *   - Stock counts: the count sheet and the variance it produces
 *   - Waste, with a reason
 *   - Transfers between branches
 */
const MOVE_COLUMNS =
  '[grid-template-columns:80px_minmax(0,1.2fr)_120px_minmax(0,1.3fr)_140px_120px]';

/** The pill's tint, matched to the level word beside it. */
const LEVEL_CLASS = {
  critical: 'bg-danger-50 text-danger-700',
  belowPar: 'bg-warning-50 text-warning-700',
  healthy: 'bg-success-50 text-success-700',
} as const;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [asked, nav, t, common, blank, locale] = await Promise.all([
    searchParams,
    getTranslations('console.nav'),
    getTranslations('console.inventory'),
    getTranslations('console.common'),
    getTranslations('console.empty'),
    getLocale(),
  ]);

  const lang = locale as Lang;

  /**
   * A unit, in the reader's language.
   *
   * Three of the four come from the console catalogue; the case does not, and
   * cannot until the catalogue grows a word for it. Resolved here rather than
   * in the client island so the catalogue stays on the server.
   */
  const unitLabel = (unit: Unit): string =>
    unit === 'unitCase' ? say(STORE_COPY.unitCase, lang) : t(unit);

  /** Grams and millilitres are the same word everywhere; pieces are not. */
  const baseLabel = (unit: BaseUnit | null): string | null =>
    unit === null ? null : unit === 'pcs' ? say(STORE_COPY.basePcs, lang) : unit;

  // The API when there is a session, the fixtures when there is not. The four
  // figures come back with the rows rather than being counted here, so the
  // strip and the table are always reading the same list.
  const board = await getStockBoard();
  const { rows: stock, summary } = board;

  /*
   * The line under the title.
   *
   * It used to be a catalogue sentence — "Chilonzor ombori · bugun 07:30 da
   * Sardor N. sanagan" — which named a warehouse this tenant does not have and
   * credited a stock count to somebody who does not work here. Now: the venue
   * from the session, and the newest `stock_take` movement from the ledger,
   * with an honest "never counted yet" when there is none.
   */
  const [session, lastCountAt] = await Promise.all([
    getSession(),
    stockIsLive(board) ? getLastCountAt() : Promise.resolve(null),
  ]);

  const subtitle = !stockIsLive(board)
    ? t('subtitle')
    : lastCountAt === null
      ? t('subtitleUncounted', { place: session.placeName })
      : t('subtitleCounted', { place: session.placeName, when: countedAt(lastCountAt, locale) });

  /*
   * The chip above the tab strip, resolved from the URL.
   *
   * A `?store=` naming nothing falls back to all of them rather than 404ing —
   * a mistyped query parameter is not a missing page, which is the same call
   * `dashboard` makes about `?period=`.
   */
  const store = storeFrom(asked.store);
  const shelf = store === null ? stock : stock.filter((row) => row.store === store);

  /*
   * The shelf, resolved into words before it crosses into the browser.
   *
   * The table is a client island now because every row opens the drawer, and
   * the drawer is where the design keeps the correction form. Units, level
   * words, store names and the last movement are all lookups, so they happen
   * here and travel as strings — the catalogue stays on the server.
   */
  const tableRows: readonly StockTableRow[] = shelf.map((row) => {
    const level = levelOf(row);
    const unit = unitLabel(row.unit);

    return {
      id: row.id,
      name: row.name,
      unit,
      baseUnit: baseLabel(row.baseUnit),
      factor: row.factor,
      price: row.price,
      shelfLife: row.shelfLife,
      onHand: row.onHand,
      par: row.par,
      supplier: row.supplier,
      /* Three fields the table never draws and the write path cannot do
         without: who to raise the order with, what unit the document states,
         and the price per base unit it is written at. Carried rather than
         re-derived in the browser, because dividing the purchase price by the
         factor twice is two roundings of one number. */
      supplierId: row.supplierId ?? null,
      baseUnitCode: row.baseUnit,
      priceBase: row.factor > 0 ? Math.round(row.price / row.factor) : row.price,
      store: row.store === null ? null : say(STORE_NAMES[row.store], lang),
      storeTone: row.store === null ? 'var(--fg-subtle)' : STORE_TONE[row.store],
      /* This line's own history, in the reader's language. Joined by id, so a
         live row — whose id is the API's — simply has none yet, and the drawer
         says so rather than showing another ingredient's movements. */
      moves: movementsOf(row.id).map((move) => ({
        id: move.id,
        at: move.at,
        source: say(move.source, lang),
        quantity: move.quantity,
      })),
      lastMove: describeMove(row, unit, baseLabel(row.baseUnit), lang),
      percent: row.par > 0 ? Math.round((row.onHand / row.par) * 100) : 100,
      railColour: LEVEL_RAIL[level],
      levelLabel: t(level),
      levelClass: LEVEL_CLASS[level],
    };
  });

  /* The batch list, joined to the line it belongs to. A batch whose line is not
     on the shelf any more is dropped rather than drawn with a blank name. */
  const expiryRows: readonly ExpiryRow[] = EXPIRY.flatMap((batch) => {
    const line = stockById(batch.item);

    if (line === undefined) return [];

    return [
      {
        batch: batch.batch,
        name: line.name,
        quantity: batch.quantity,
        unit: unitLabel(line.unit),
        arrived: batch.arrived,
        expires: batch.expires,
        left: batch.left,
      },
    ];
  });

  return (
    <>
      {/* Heading first, then the figures. The design's order, and the readable
          one: the four numbers mean nothing until the page says what they
          count. */}
      <PageHead title={nav('inventory')} subtitle={subtitle}>
        <Link
          href="/inventory/operations?tab=count"
          data-press
          className={`grid place-items-center ${ACTION}`}
        >
          {t('stockCount')}
        </Link>
        {/* The paper version of the same job. It is printed *empty* — the
            system's own figure never goes onto it, or the storekeeper confirms
            a number instead of counting one — so it is a different action from
            the on-screen count beside it, not a duplicate of it. */}
        <Link
          href={documentHref('stock-count')}
          data-press
          className={`grid place-items-center ${ACTION}`}
        >
          {printLink('stock-count', lang)}
        </Link>
        <Link
          href="/inventory/operations?tab=waste"
          data-press
          className={`grid place-items-center ${ACTION}`}
        >
          {t('logWaste')}
        </Link>
        <AddStockItem lang={lang} supplierLabel={t('colSupplier')} />
      </PageHead>

      <StatStrip
        stats={[
          { label: t('kStockValue'), value: formatTiyinAmount(summary.valueTiyin, lang) },
          {
            label: t('kBelowPar'),
            value: `${summary.belowPar} ${common('items')}`,
            tone: 'warning',
          },
          /*
           * The design's third figure is the expiry window, not today's waste
           * (`ivExpCount`, `Smart Restaurant OS.dc.html:14516`). The two answer
           * different questions and only one of them is actionable this
           * morning: waste is what has already been lost.
           */
          {
            label: say(STORE_COPY.expSoon, lang),
            value: `${expiringSoon()} ${say(STORE_COPY.batches, lang)}`,
            tone: 'danger',
          },
          { label: t('kOpenPurchases'), value: <OpenPurchases base={summary.openPurchases} /> },
        ]}
      />

      <StoreChips rows={stock} store={store} lang={lang} />

      <Tabs
        ariaLabel={nav('inventory')}
        tabs={[
          { key: 'stock', label: t('tabStock') },
          { key: 'expiry', label: say(STORE_COPY.tabExpiry, lang) },
          { key: 'movements', label: t('tabMovements') },
        ]}
        panels={{
          stock: (
            <StockTable
              rows={tableRows}
              lang={lang}
              labels={{
                item: t('colIngredient'),
                onHand: t('colOnHand'),
                par: t('colPar'),
                coverage: t('colCoverage'),
                state: t('colState'),
                order: t('order'),
                emptyTitle: blank('inventory'),
                emptyBody: blank('inventorySub'),
              }}
            />
          ),
          expiry: (
            <ExpiryPanel
              rows={expiryRows}
              lang={lang}
              labels={{
                item: t('colIngredient'),
                quantity: t('colQuantity'),
                empty: blank('genericSub'),
              }}
            />
          ),
          movements: (
            <>
              {/*
               * The note the design puts above this table, and the reason the
               * table has an AUTO tag at all: most of a day's stock movement is
               * nobody's decision. Saying which lines were typed by a person
               * turns a wall of numbers into a short list worth reading.
               */}
              <div className="border-l-brand-500 bg-brand-50 mb-3.5 flex items-start gap-[11px] rounded-md border border-l-[3px] px-[18px] py-3.5">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--brand-600)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="mt-0.5 flex-none"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 16v-4M12 8h0" />
                </svg>
                <p className="text-fg-muted m-0 text-sm leading-relaxed">
                  {say(STORE_COPY.autoNote, lang)}
                </p>
              </div>

              <TableCard
                columns={MOVE_COLUMNS}
                head={[
                  t('colTime'),
                  t('colIngredient'),
                  { label: say(STORE_COPY.colChange, lang), align: 'right' },
                  say(STORE_COPY.colSource, lang),
                  t('colWho'),
                  { label: say(STORE_COPY.colBalance, lang), align: 'right' },
                ]}
                empty={{ title: blank('generic'), body: blank('genericSub') }}
              >
                {MOVEMENTS.map((move) => {
                  /* Joined to the fixture shelf, not the live one: this ledger
                     is still a fixture, and the movements endpoint that would
                     replace it answers in base units against numeric ids. */
                  const line = stockById(move.item);

                  if (line === undefined) return null;

                  const unit = unitLabel(line.unit);
                  const sign = move.quantity > 0 ? '+' : '−';

                  return (
                    <Row key={move.id} columns={MOVE_COLUMNS} className="py-3">
                      <span data-num className="text-fg-subtle font-mono text-xs">
                        {move.at}
                      </span>

                      <span className="min-w-0 truncate text-sm font-semibold">{line.name}</span>

                      <span
                        data-num
                        className={`text-right text-sm font-semibold ${
                          move.quantity > 0 ? 'text-success-600' : 'text-danger-600'
                        }`}
                      >
                        {sign}
                        {formatNumber(Math.round(Math.abs(move.quantity) * 100) / 100, lang)} {unit}
                      </span>

                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-fg-muted truncate text-sm">
                          {say(move.source, lang)}
                        </span>
                        {move.who === null ? (
                          <span className="rounded-pill bg-brand-50 text-brand-600 tracking-caps text-3xs flex-none px-[7px] py-0.5 font-semibold">
                            {say(STORE_COPY.auto, lang)}
                          </span>
                        ) : null}
                      </span>

                      {/* The recipe card is not a person. Named rather than
                          left blank, because a blank column reads as data that
                          failed to load. */}
                      <span className="text-fg-muted truncate text-sm">
                        {move.who ?? say(STORE_COPY.system, lang)}
                      </span>

                      <span data-num className="text-fg-muted text-right text-sm">
                        {formatNumber(line.onHand, lang)} {unit}
                      </span>
                    </Row>
                  );
                })}
              </TableCard>
            </>
          ),
        }}
      />
    </>
  );
}

/**
 * The last thing that happened to this line.
 *
 * Signed, because the direction is the whole message: a minus is the kitchen
 * using it up and a plus is a delivery, and a storekeeper scanning the column
 * is looking for the ones that only ever go down. The time is shown only when
 * it was today, which is what makes a `+30 kg 08:10` mean "this morning" rather
 * than "at some point".
 */
function describeMove(row: StockRow, unit: string, base: string | null, lang: Lang): string {
  const move: StockMove | null = row.lastMove;

  if (move === null) return '—';

  /* Cases are bought and bottles are taken: the cola line moves 42 pieces, and
     saying "1.75 cases" would be arithmetic nobody did. */
  const label = move.base === true && base !== null ? base : unit;
  const sign = move.quantity > 0 ? '+' : '−';
  /* The reader's decimal mark, not the default one. `6,4 kg` in Russian and
     `6.4 kg` elsewhere — the same figure written two ways in one column is how
     a comma gets read as a thousands separator. */
  const size = `${sign}${formatNumber(Math.abs(move.quantity), lang)} ${label}`;

  return move.at === null ? size : `${size} ${move.at}`;
}

/**
 * When the last count happened, in the reader's words.
 *
 * Date and time, because "yesterday at 19:40" and "yesterday at 07:30" are
 * different answers to "is this figure worth trusting" — and because a count
 * that ran across midnight is the one a storekeeper most wants to place.
 */
function countedAt(stamp: string, locale: string): string {
  const at = new Date(stamp);

  if (Number.isNaN(at.getTime())) return stamp;

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}
