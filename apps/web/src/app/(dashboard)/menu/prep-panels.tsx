'use client';

import { useMemo, useState } from 'react';
import { flash } from '@restaurant/ui';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import { post } from '@/lib/console-post';

import type { ShelfItem } from './prep-server';

import {
  coverDays,
  fixturePrepCards,
  prepCardFrom,
  PREP_COPY,
  RAW_GOODS,
  say,
  STORES,
  type ApiPrepItem,
  type Lang,
  type PrepCardRow,
} from './prep-data';

/**
 * The Menu screen's fourth and fifth tabs: raw goods, and prep items.
 *
 * Both are drawn to `Smart Restaurant OS.dc.html:1864-1992`. A client island
 * because both are interactions the design specifies — searching the raw list,
 * choosing which prep item the card shows, and stepping the batch count before
 * recording production — and because production has to change what the screen
 * says the moment it is recorded.
 *
 * The prep tab writes. `POST /api/inventory/prep` — through the route handler,
 * because the session token is an httpOnly cookie a browser cannot read — posts
 * the whole run in one transaction: a `consumption` on every component and a
 * receipt of what came out. The panel then redraws the card from the item the
 * API sent back rather than from its own arithmetic, so what a cook reads after
 * pressing is what the ledger holds, down to the gram.
 *
 * The raw tab still draws fixtures, and that is a different gap: it lists what
 * is on the shelf, which is `GET /v1/inventory/ingredients` and a screen of its
 * own (`inventory/operations`) rather than anything the prep endpoint answers.
 */

/**
 * One recorded batch, as the design's `sfLog` row: what, how much and when.
 *
 * The design's row names the cook. Nothing on this screen knows who that is —
 * the run is posted with the reader's own token and the API attributes it, but
 * it does not send a name back — so the second line carries the run itself
 * (`09:41 · 2 × 1000 g`) instead. A plausible name printed beside a real
 * quantity would be the one invented thing in a panel that has stopped
 * inventing.
 */
type ProducedLine = { id: string; name: string; quantity: string; run: string };

/** What `POST /api/inventory/prep` answers with: the run, and the rewritten card. */
type ProduceAnswer = {
  data: { produced: number | string; batches: number; item: ApiPrepItem };
};

/** Two decimals at most, and never a trailing `.00` — the design's `fd()`. */
const qty = (value: number, lang: Lang): string =>
  formatNumber(Math.round(value * 100) / 100, lang);

/**
 * The same two decimals, as a number.
 *
 * Applied wherever a quantity is multiplied or subtracted rather than only at
 * the point it is printed: 0.1 × 3 is 0.30000000000000004 in binary floating
 * point, and a shelf figure carrying that tail compares as short against a
 * requirement it exactly meets.
 */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** "4 dishes use it", or — for a card the menu has not been joined to — "3 ingredients". */
const subLine = (row: PrepCardRow, lang: Lang): string => {
  if (row.dishes === null) return `${row.lines.length} ${say(PREP_COPY.ingredients, lang)}`;

  return row.dishes > 0
    ? `${row.dishes} ${say(PREP_COPY.dishes, lang)}`
    : say(PREP_COPY.noDish, lang);
};

const RAW_COLUMNS =
  '[grid-template-columns:minmax(180px,2fr)_110px_130px_110px_minmax(120px,1fr)_96px]';

const PREP_COLUMNS = '[grid-template-columns:minmax(160px,2fr)_100px_120px_110px_92px]';

export function RawGoodsPanel({ lang }: { lang: Lang }) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle === '') return RAW_GOODS;

    return RAW_GOODS.filter(
      (row) =>
        say(row.name, lang).toLowerCase().includes(needle) ||
        say(row.category, lang).toLowerCase().includes(needle),
    );
  }, [query, lang]);

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={say(PREP_COPY.searchRaw, lang)}
          aria-label={say(PREP_COPY.searchRaw, lang)}
          className="bg-surface border-border-strong h-9 max-w-[320px] min-w-[200px] flex-1 rounded-md border px-3 text-sm"
        />
        <span data-num className="text-fg-subtle ml-auto text-xs">
          {rows.length} {say(PREP_COPY.found, lang)}
        </span>
      </div>

      <div data-table className="bg-surface overflow-hidden rounded-lg border">
        <div
          className={`bg-bg-subtle text-fg-subtle grid ${RAW_COLUMNS} tracking-caps text-2xs gap-3 border-b px-[18px] py-[11px] font-semibold uppercase`}
        >
          <span>{say(PREP_COPY.name, lang)}</span>
          <span>{say(PREP_COPY.unit, lang)}</span>
          <span className="text-right">{say(PREP_COPY.price, lang)}</span>
          <span className="text-right">{say(PREP_COPY.stock, lang)}</span>
          <span>{say(PREP_COPY.store, lang)}</span>
          <span className="text-right">{say(PREP_COPY.cover, lang)}</span>
        </div>

        {rows.length === 0 ? (
          <p className="text-fg-subtle px-5 py-14 text-center text-sm">
            {say(PREP_COPY.rawEmpty, lang)}
          </p>
        ) : (
          rows.map((row) => {
            const cover = coverDays(row);

            /* The two thresholds are the design's: under a day and a half is
               red, under three is amber. They are days of cover, not a
               quantity — a kilogram of cumin is a fortnight and a kilogram of
               beef is two hours. */
            const ink =
              cover < 1.5 ? 'text-danger-600' : cover < 3 ? 'text-warning-600' : 'text-fg';
            const chip =
              cover < 1.5
                ? 'bg-danger-50 text-danger-700'
                : cover < 3
                  ? 'bg-warning-50 text-warning-700'
                  : 'bg-bg-muted text-fg-muted';

            return (
              <div
                key={row.id}
                data-row
                className={`border-divider grid ${RAW_COLUMNS} items-center gap-3 border-b px-[18px] py-3.5`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {say(row.name, lang)}
                  </span>
                  <span className="text-fg-subtle text-2xs mt-0.5 block">
                    {say(row.category, lang)}
                  </span>
                </span>

                <span className="text-fg-muted text-sm">{row.unit}</span>

                <span data-num className="text-right text-sm font-semibold">
                  {formatTiyinAmount(row.price, lang)}
                </span>

                <span data-num className={`text-right text-sm font-semibold ${ink}`}>
                  {qty(row.stock, lang)} {row.unit}
                </span>

                <span className="text-fg-muted min-w-0 truncate text-xs">
                  {say(STORES[row.store]!, lang)}
                </span>

                <span
                  data-num
                  className={`rounded-pill justify-self-end px-2 py-[3px] text-[11px] font-bold ${chip}`}
                >
                  {cover > 30 ? '30+' : cover.toFixed(1)} {say(PREP_COPY.day, lang)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <p className="text-fg-subtle text-2xs mx-0.5 mt-3 max-w-[760px] leading-relaxed">
        {say(PREP_COPY.rawNote, lang)}
      </p>
    </>
  );
}

/**
 * The prep tab: what the kitchen makes, and the button that records making it.
 *
 * `cards` is the API's answer, or null when there was no session, no
 * `inventory.view`, or no API. Null falls back to the fixture kitchen, whose
 * cards carry `id: null` — which is what keeps the record button from posting a
 * demo row and getting a validation error back that the panel would then have
 * to show as a real failure.
 */
export function PrepPanel({
  lang,
  cards,
  shelf = null,
}: {
  lang: Lang;
  cards: readonly PrepCardRow[] | null;
  /**
   * The shelf, for the new-card form's component picker.
   *
   * Null is the demo console — and then the form is not offered at all, because
   * a card is a list of INGREDIENT IDS and a demo has none. That is the same
   * rule the batch button already follows: a fixture card carries `id: null`
   * and cannot post.
   */
  shelf?: readonly ShelfItem[] | null;
}) {
  const base = useMemo(() => cards ?? fixturePrepCards(lang), [cards, lang]);

  const [selected, setSelected] = useState<string>(base[0]?.key ?? '');
  const [batches, setBatches] = useState(1);
  const [busy, setBusy] = useState(false);

  /*
   * Cards as they stand after a batch, by key.
   *
   * A whole card rather than a delta, because after a live run the server sends
   * the item it just rewrote and that answer is better than anything this panel
   * could compute: it carries the balance the ledger holds, and the cost of a
   * batch at today's ingredient prices. Local rather than a router refresh so a
   * cook making three batches in a row keeps their place on the list.
   */
  const [recorded, setRecorded] = useState<Record<string, PrepCardRow>>({});

  /*
   * Raw taken off the FIXTURE shelf this session. Empty on a live console: a
   * live card knows what it will consume and not what is in the store room, so
   * there is no balance here to draw down (see `PrepLineRow.have`).
   */
  const [usedRaw, setUsedRaw] = useState<Record<string, number>>({});
  const [log, setLog] = useState<readonly ProducedLine[]>([]);

  /* Whether the new-card form is open. Closed by default: the panel's job is
     running cards, and writing one is the occasional act. */
  const [drafting, setDrafting] = useState(false);

  const rows = base.map((row) => recorded[row.key] ?? row);

  // A live restaurant that preps nothing is a real answer, not a failure, and
  // substituting the demo kitchen for it would invent four cards it does not
  // have.
  if (rows.length === 0) {
    /*
     * A live restaurant that preps nothing is a real answer, not a failure —
     * and it is also exactly the restaurant that needs the form. The empty
     * state carries it rather than sending somebody to look for a button that
     * only appears once they already have a card.
     */
    return (
      <div className="bg-surface rounded-lg border px-5 py-10">
        <p className="text-fg-subtle text-center text-sm">{say(PREP_COPY.cardsEmpty, lang)}</p>

        {shelf === null ? null : (
          <div className="mt-4 text-center">
            <button
              type="button"
              data-press
              onClick={() => setDrafting((open) => !open)}
              className="border-border-strong bg-surface text-fg h-[30px] rounded-md border px-3 text-xs font-semibold"
            >
              {say(drafting ? PREP_COPY.newCardClose : PREP_COPY.newCard, lang)}
            </button>
          </div>
        )}

        {drafting && shelf !== null ? (
          <NewPrepCard lang={lang} shelf={shelf} onWritten={() => setDrafting(false)} />
        ) : null}
      </div>
    );
  }

  const item = rows.find((row) => row.key === selected) ?? rows[0]!;

  const willUse = item.lines.map((line) => {
    const need = round2(line.per * batches);
    const have =
      line.have === null ? null : Math.max(0, round2(line.have - (usedRaw[line.key] ?? 0)));

    return { ...line, need, have, short: have !== null && need > have };
  });

  const shortage = willUse.filter((line) => line.short);
  const made = round2(item.made * batches);

  /**
   * The run, at the top of today's list.
   *
   * `runs` is a parameter rather than the stepper's own state because after a
   * live batch the count that belongs in the log is the one the API says it
   * accepted, not the one this screen asked for.
   */
  const note = (card: PrepCardRow, quantity: number, runs: number) => {
    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setLog((current) => [
      {
        id: `${card.key}-${now.getTime()}`,
        name: card.name,
        quantity: `+${qty(quantity, lang)} ${card.unit}`,
        run: `${clock} · ${runs} × ${qty(card.batch, lang)} ${card.unit}`,
      },
      ...current,
    ]);
  };

  const record = async () => {
    if (busy) return;

    if (shortage.length > 0) {
      flash.problem(say(PREP_COPY.runShort, lang));

      return;
    }

    /*
     * A fixture card has no row to produce against, so this branch writes
     * nothing and the toast says so. It is kept rather than disabled because
     * with no session the demo kitchen is the entire tab, and a stepper that
     * did nothing at all reads as broken rather than as a sample.
     */
    if (item.id === null) {
      setUsedRaw((current) => {
        const next = { ...current };

        for (const line of willUse) next[line.key] = round2((next[line.key] ?? 0) + line.need);

        return next;
      });

      setRecorded((current) => ({
        ...current,
        [item.key]: { ...item, onHand: round2(item.onHand + made) },
      }));

      note(item, made, batches);
      setBatches(1);
      flash(
        `${item.name} · ${qty(made, lang)} ${item.unit} ${say(PREP_COPY.produced, lang)} · ${say(PREP_COPY.demoRun, lang)}`,
      );

      return;
    }

    setBusy(true);

    /*
     * One request for the whole run. The API takes a card and a batch count and
     * posts every leg inside a transaction — a client looping over the recipe
     * would leave the raw goods deducted and the batch missing the moment one
     * call failed, which is a shortfall nobody can reconcile at the stock-take.
     */
    const answer = await post<ProduceAnswer>(
      '/api/inventory/prep',
      { prepItemId: item.id, batches },
      lang,
    );

    setBusy(false);

    if (!answer.ok) {
      /*
       * The API's own sentence, in the reader's language — `stock
       * .prep_card_empty` for a card with no recipe, a validation refusal for a
       * batch count out of range. Nothing is added to the log and no balance
       * moves: a panel that showed the batch anyway would be telling a kitchen
       * it has stock the ledger has never heard of.
       */
      flash.problem(answer.message ?? say(PREP_COPY.runFailed, lang));

      return;
    }

    const card = prepCardFrom(answer.data.data.item, lang);
    const accepted = Number(answer.data.data.batches);
    const runs = Number.isFinite(accepted) ? accepted : batches;
    const produced = Number(answer.data.data.produced);
    // What the server says came out, which is the yield times the batches it
    // accepted — not `made`, which is only what this screen asked for.
    const quantity = Number.isFinite(produced) ? produced : card.made * runs;

    setRecorded((current) => ({ ...current, [card.key]: card }));
    note(card, quantity, runs);
    setBatches(1);
    flash(`${card.name} · +${qty(quantity, lang)} ${card.unit} ${say(PREP_COPY.produced, lang)}`);
  };

  return (
    <div className="grid items-start gap-5 lg:[grid-template-columns:minmax(0,1fr)_360px]">
      <div className="bg-surface overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between gap-3.5 border-b px-[18px] py-[15px]">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{say(PREP_COPY.prepTitle, lang)}</div>
            <div className="text-fg-subtle text-2xs mt-0.5">{say(PREP_COPY.prepSub, lang)}</div>
          </div>

          {/*
            The design's "new prep item" button. It used to flash a hint listing
            the fields a form would ask for and open nothing, beside two
            controls on the same panel that do post — the worst place for a dead
            one.

            `POST /v1/inventory/prep` is PRODUCTION and its route says so; the
            card itself is written by `POST /v1/inventory/prep-items`, which is
            what this opens. Offered only when the shelf is live, because a card
            is a list of ingredient IDS and a demo console has none.
          */}
          {shelf === null ? null : (
            <button
              type="button"
              data-press
              onClick={() => setDrafting((open) => !open)}
              className="border-border-strong bg-surface text-fg h-[30px] flex-none rounded-md border px-3 text-xs font-semibold"
            >
              {say(drafting ? PREP_COPY.newCardClose : PREP_COPY.newCard, lang)}
            </button>
          )}
        </div>

        {drafting && shelf !== null ? (
          <NewPrepCard lang={lang} shelf={shelf} onWritten={() => setDrafting(false)} />
        ) : null}

        {rows.map((row) => {
          const low = row.onHand < row.made * 0.4;

          return (
            <button
              key={row.key}
              type="button"
              data-row
              data-press
              onClick={() => {
                setSelected(row.key);
                setBatches(1);
              }}
              className={`border-divider grid w-full ${PREP_COLUMNS} items-center gap-3 border-b px-[18px] py-3.5 text-left ${
                row.key === selected ? 'bg-brand-50' : 'bg-surface'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{row.name}</span>
                <span className="text-fg-subtle text-2xs mt-0.5 block">{subLine(row, lang)}</span>
              </span>

              <span data-num className="text-fg-muted text-xs">
                {row.yieldPct}% · {qty(row.made, lang)} {row.unit}
              </span>

              <span data-num className="text-right text-sm font-semibold">
                {formatTiyinAmount(row.unitCost, lang)} / {row.unit}
              </span>

              <span
                data-num
                className={`text-right text-sm font-semibold ${low ? 'text-danger-600' : 'text-fg'}`}
              >
                {qty(row.onHand, lang)} {row.unit}
              </span>

              <span
                data-num
                className={`rounded-pill justify-self-end px-2 py-[3px] text-[11px] font-bold ${
                  row.shelfDays <= 1
                    ? 'bg-warning-50 text-warning-700'
                    : 'bg-bg-muted text-fg-muted'
                }`}
              >
                {row.shelfDays} {say(PREP_COPY.day, lang)}
              </span>
            </button>
          );
        })}

        <p className="text-fg-subtle text-2xs px-[18px] py-3.5 leading-relaxed">
          {say(PREP_COPY.prepNote, lang)}
        </p>
      </div>

      <div className="flex flex-col gap-3.5">
        <PrepCard item={item} lang={lang} />

        <div className="bg-surface rounded-lg border px-5 py-[18px]">
          <div className="text-sm font-semibold">{say(PREP_COPY.produce, lang)}</div>
          <div className="text-fg-subtle text-2xs mt-1 leading-normal">
            {say(PREP_COPY.produceSub, lang)}
          </div>

          <div className="mt-3.5 flex items-center gap-2.5">
            <button
              type="button"
              data-press
              aria-label="−"
              onClick={() => setBatches((n) => Math.max(1, n - 1))}
              className="bg-surface border-border-strong grid size-[38px] flex-none place-items-center rounded-md border text-[17px] font-semibold"
            >
              −
            </button>
            <span data-num className="font-display flex-1 text-center text-2xl font-bold">
              {batches}
            </span>
            <button
              type="button"
              data-press
              aria-label="+"
              /* Twenty, where the API stops at fifty. The cap that matters is
                 the typing one — a slipped keypress reading 220 instead of 2 —
                 and a stepper cannot slip; this is the design's own ceiling. */
              onClick={() => setBatches((n) => Math.min(20, n + 1))}
              className="bg-surface border-border-strong grid size-[38px] flex-none place-items-center rounded-md border text-[17px] font-semibold"
            >
              +
            </button>
          </div>

          <div data-num className="text-fg-subtle text-2xs mt-1.5 text-center">
            {batches} × {qty(item.batch, lang)} {item.unit} → {qty(made, lang)} {item.unit}
          </div>

          <div className="bg-bg-subtle mt-3.5 rounded-md border px-3.5 py-3">
            <div className="text-fg-subtle tracking-caps mb-[7px] text-[9px] font-semibold uppercase">
              {say(PREP_COPY.willUse, lang)}
            </div>

            {willUse.map((line) => (
              <div key={line.key} className="mt-[5px] flex items-baseline justify-between gap-2.5">
                <span className="text-fg-muted min-w-0 truncate text-xs">{line.name}</span>
                <span
                  data-num
                  className={`flex-none text-xs font-semibold ${line.short ? 'text-danger-600' : 'text-fg'}`}
                >
                  {/* The shelf figure only when there is one. A live card is
                      answered by the prep endpoint, which costs a recipe and
                      never reports a balance — printing a zero there would read
                      as "none left". */}
                  {qty(line.need, lang)} {line.unit}
                  {line.have === null ? '' : ` / ${qty(line.have, lang)} ${line.unit}`}
                </span>
              </div>
            ))}
          </div>

          {/* Disabled rather than hidden when raw goods are short: the button is
              the answer to "why can I not make this", and a button that
              vanished would take the question with it. Genuinely disabled only
              while a run is in flight, where a second press would post a second
              batch under its own idempotency key. */}
          <button
            type="button"
            data-press
            disabled={busy}
            onClick={record}
            className={`mt-3.5 flex h-[46px] w-full items-center justify-center rounded-md text-sm font-semibold text-white ${
              shortage.length > 0 || busy ? 'bg-n-300' : 'bg-brand-500 hover:bg-brand-600'
            }`}
          >
            {busy ? say(PREP_COPY.runBusy, lang) : say(PREP_COPY.runBtn, lang)}
          </button>

          <div
            className={`text-2xs mt-2 leading-normal ${shortage.length > 0 ? 'text-danger-600' : 'text-fg-subtle'}`}
          >
            {shortage.length > 0
              ? `${shortage.length} ${say(PREP_COPY.warnShort, lang)}`
              : say(item.id === null ? PREP_COPY.demoRun : PREP_COPY.warnOk, lang)}
          </div>
        </div>

        <div className="bg-surface rounded-lg border px-[18px] py-4">
          <div className="text-sm font-semibold">{say(PREP_COPY.log, lang)}</div>
          <div className="text-fg-subtle text-2xs mt-0.5">{say(PREP_COPY.logSub, lang)}</div>

          {log.length === 0 ? (
            <p className="text-fg-subtle py-4 text-center text-xs">
              {say(PREP_COPY.logEmpty, lang)}
            </p>
          ) : (
            log.map((line) => (
              <div
                key={line.id}
                className="border-divider flex items-baseline justify-between gap-2.5 border-b py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{line.name}</span>
                  <span data-num className="text-fg-subtle mt-px block text-[10px]">
                    {line.run}
                  </span>
                </span>
                <span data-num className="text-success-700 flex-none text-xs font-semibold">
                  {line.quantity}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** The selected prep item: what a batch costs, what goes in it, what comes out. */
function PrepCard({ item, lang }: { item: PrepCardRow; lang: Lang }) {
  /*
   * The design's three facts under the name: what a batch yields, how long it
   * takes, how many dishes want it. Only the first is on `prep_items` — the
   * hours are nobody's column yet and the dish count is a join the endpoint
   * does not make — so the line is assembled from what this card actually
   * knows rather than padded with zeroes.
   */
  const facts = [
    `${qty(item.made, lang)} ${item.unit}`,
    item.hours === null ? null : `${item.hours} ${say(PREP_COPY.hour, lang)}`,
    subLine(item, lang),
  ].filter((fact) => fact !== null);

  return (
    <div className="bg-surface rounded-lg border px-5 py-[18px]">
      <div className="font-display tracking-snug text-lg font-bold">{item.name}</div>
      <div className="text-fg-subtle text-2xs mt-[3px]">{facts.join(' · ')}</div>

      <div className="bg-divider mt-3.5 grid grid-cols-2 gap-px overflow-hidden rounded-md border">
        <div className="bg-surface px-3.5 py-[11px]">
          <div className="text-fg-subtle tracking-caps text-[9px] font-semibold uppercase">
            {say(PREP_COPY.batchCost, lang)}
          </div>
          <div data-num className="font-display mt-[3px] text-lg font-bold">
            {formatTiyinAmount(item.batchCost, lang)}
          </div>
        </div>
        <div className="bg-surface px-3.5 py-[11px]">
          <div className="text-fg-subtle tracking-caps text-[9px] font-semibold uppercase">
            {say(PREP_COPY.unitCost, lang)}
          </div>
          <div data-num className="font-display mt-[3px] text-lg font-bold">
            {formatTiyinAmount(item.unitCost, lang)} / {item.unit}
          </div>
        </div>
      </div>

      <div className="text-fg-subtle tracking-caps text-2xs mt-4 mb-2 font-semibold uppercase">
        {say(PREP_COPY.recipe, lang)}
      </div>

      {item.lines.map((line) => (
        <div key={line.key} className="border-divider flex items-center gap-2.5 border-b py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm">{line.name}</span>
          <span data-num className="flex-none text-sm font-semibold">
            {qty(line.per, lang)} {line.unit}
          </span>
          <span data-num className="text-fg-muted w-[88px] flex-none text-right text-xs">
            {formatTiyinAmount(Math.round(line.price * line.per), lang)}
          </span>
        </div>
      ))}

      <div className="mt-3 flex items-baseline justify-between border-t pt-3">
        <span className="text-fg-muted text-xs">{say(PREP_COPY.yieldLbl, lang)}</span>
        <span
          data-num
          className={`text-sm font-semibold ${item.yieldPct < 85 ? 'text-warning-600' : 'text-fg'}`}
        >
          {item.yieldPct}% · {qty(item.batch, lang)} → {qty(item.made, lang)} {item.unit}
        </span>
      </div>

      <div className="text-fg-subtle text-2xs mt-1.5 leading-normal">
        {say(item.yieldPct < 85 ? PREP_COPY.yieldLow : PREP_COPY.yieldOk, lang)}
      </div>
    </div>
  );
}

/* --------------------------------------------------- a new prep card */

/** One row of the component list while somebody is filling it in. */
type DraftLine = { key: string; ingredientId: string; quantity: string };

const blankLine = (): DraftLine => ({
  key: `l-${Math.random().toString(36).slice(2, 9)}`,
  ingredientId: '',
  quantity: '',
});

/**
 * The form behind the design's "new prep item" button.
 *
 * A card is four facts and a list: what it is called, what it is measured in,
 * how much one batch yields before loss, and what goes into that batch. The
 * loss percentage is the one worth explaining on screen — it is why the cost
 * per gram is not the batch cost divided by the batch size — so the field
 * carries its own note rather than a tooltip nobody opens.
 *
 * **Ingredient ids, never names.** The picker is fed from
 * `GET /v1/inventory/ingredients`, because a component is a foreign key and a
 * free-text box at a field that needs one is a form that cannot post. The same
 * argument the transfer form on the operations screen makes about its own
 * picker.
 *
 * On success the page reloads rather than prepending the card locally: a new
 * card changes the list, the selected card and the batch button's target all at
 * once, and a panel that grew a row while the runner still pointed at the old
 * one is a panel that produces the wrong thing.
 */
function NewPrepCard({
  lang,
  shelf,
  onWritten,
}: {
  lang: Lang;
  shelf: readonly ShelfItem[];
  onWritten: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<'g' | 'ml'>('g');
  const [batch, setBatch] = useState('');
  const [loss, setLoss] = useState('0');
  const [shelfDays, setShelfDays] = useState('1');
  const [lines, setLines] = useState<readonly DraftLine[]>([blankLine()]);
  const [busy, setBusy] = useState(false);

  if (shelf.length === 0) {
    // No shelf, no components, no card. Said out loud rather than shown as an
    // empty dropdown beside a button that would always refuse.
    return (
      <p className="border-warning-500/30 bg-warning-50 text-warning-700 mt-4 rounded-md border px-3.5 py-2.5 text-xs leading-normal">
        {say(PREP_COPY.shelfEmpty, lang)}
      </p>
    );
  }

  async function save() {
    const components = lines
      .map((line) => ({
        ingredientId: Number(line.ingredientId),
        quantity: Number(line.quantity),
      }))
      .filter(
        (line) =>
          Number.isInteger(line.ingredientId) &&
          line.ingredientId > 0 &&
          Number.isInteger(line.quantity) &&
          line.quantity > 0,
      );

    if (code.trim() === '' || name.trim() === '' || Number(batch) <= 0 || components.length === 0) {
      flash.problem(say(PREP_COPY.cardIncomplete, lang));

      return;
    }

    setBusy(true);

    const answer = await post(
      '/api/inventory/prep-items',
      {
        code: code.trim().toLowerCase(),
        name: name.trim(),
        unit,
        batchQuantity: Math.round(Number(batch)),
        lossPercent: Math.round(Number(loss) || 0),
        shelfLifeDays: Math.round(Number(shelfDays) || 0),
        components,
      },
      lang,
    );

    setBusy(false);

    if (!answer.ok) {
      // The API's own sentence when there is one — a duplicate code, a
      // component that is not this restaurant's — because "could not save"
      // tells somebody nothing they can act on.
      flash.problem(answer.message ?? say(PREP_COPY.cardFailed, lang));

      return;
    }

    flash(say(PREP_COPY.cardSaved, lang));
    onWritten();
    window.location.reload();
  }

  const field = 'border-border-strong bg-bg-subtle h-9 w-full rounded-md border px-2.5 text-sm';
  const label = 'text-fg-subtle mb-1 block text-xs';
  const hint = 'text-fg-subtle mt-1 text-2xs leading-normal';

  return (
    <div className="border-divider bg-bg-subtle/40 border-t px-[18px] py-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className={label}>{say(PREP_COPY.cardCode, lang)}</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="zirvak"
            className={field}
          />
          <span className={hint}>{say(PREP_COPY.cardCodeHint, lang)}</span>
        </label>

        <label className="sm:col-span-2">
          <span className={label}>{say(PREP_COPY.cardName, lang)}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className={field} />
        </label>

        <label>
          <span className={label}>{say(PREP_COPY.cardUnit, lang)}</span>
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value === 'ml' ? 'ml' : 'g')}
            className={field}
          >
            <option value="g">g</option>
            <option value="ml">ml</option>
          </select>
        </label>

        <label>
          <span className={label}>{say(PREP_COPY.cardBatch, lang)}</span>
          <input
            inputMode="numeric"
            value={batch}
            onChange={(event) => setBatch(event.target.value)}
            className={field}
          />
          <span className={hint}>{say(PREP_COPY.cardBatchHint, lang)}</span>
        </label>

        <label>
          <span className={label}>{say(PREP_COPY.cardLoss, lang)}</span>
          <input
            inputMode="numeric"
            value={loss}
            onChange={(event) => setLoss(event.target.value)}
            className={field}
          />
          <span className={hint}>{say(PREP_COPY.cardLossHint, lang)}</span>
        </label>

        <label>
          <span className={label}>{say(PREP_COPY.cardShelf, lang)}</span>
          <input
            inputMode="numeric"
            value={shelfDays}
            onChange={(event) => setShelfDays(event.target.value)}
            className={field}
          />
        </label>
      </div>

      <h4 className="text-2xs tracking-caps text-fg-subtle mt-4 mb-1 font-semibold uppercase">
        {say(PREP_COPY.cardLines, lang)}
      </h4>
      <p className={hint}>{say(PREP_COPY.cardLinesHint, lang)}</p>

      <div className="mt-2 grid gap-2">
        {lines.map((line) => (
          <div key={line.key} className="flex flex-wrap items-center gap-2">
            <select
              value={line.ingredientId}
              aria-label={say(PREP_COPY.cardLines, lang)}
              onChange={(event) =>
                setLines((current) =>
                  current.map((row) =>
                    row.key === line.key ? { ...row, ingredientId: event.target.value } : row,
                  ),
                )
              }
              className={`${field} min-w-[180px] flex-1`}
            >
              <option value="">—</option>
              {shelf.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.unit}
                </option>
              ))}
            </select>

            <input
              inputMode="numeric"
              value={line.quantity}
              aria-label={say(PREP_COPY.cardBatch, lang)}
              onChange={(event) =>
                setLines((current) =>
                  current.map((row) =>
                    row.key === line.key ? { ...row, quantity: event.target.value } : row,
                  ),
                )
              }
              className={`${field} w-28`}
            />

            <button
              type="button"
              onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}
              className="text-fg-subtle hover:text-danger-600 h-9 px-2 text-sm"
              aria-label={say(PREP_COPY.newCardClose, lang)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-press
          onClick={() => setLines((current) => [...current, blankLine()])}
          className="border-border-strong bg-surface text-fg h-[30px] rounded-md border px-3 text-xs font-semibold"
        >
          {say(PREP_COPY.cardAddLine, lang)}
        </button>

        <button
          type="button"
          data-press
          disabled={busy}
          onClick={() => void save()}
          className="bg-brand-500 hover:bg-brand-600 h-[30px] rounded-md px-3.5 text-xs font-semibold text-white disabled:opacity-45"
        >
          {busy ? say(PREP_COPY.cardSaving, lang) : say(PREP_COPY.cardSave, lang)}
        </button>
      </div>
    </div>
  );
}
