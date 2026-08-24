import Link from 'next/link';

import {
  isStoreId,
  lowIn,
  say,
  STORE_COPY,
  STORE_IDS,
  STORE_KEEPER,
  STORE_NAMES,
  STORE_NOTE,
  type Lang,
  type StockRow,
  type StoreId,
} from './inventory-data';

/**
 * Which store the shelf is being read for — `Smart Restaurant OS.dc.html:2098-2110`.
 *
 * Four pills above the tab strip: all stores, then main, kitchen and bar. Each
 * carries its own row count, and a warning dot with a second count where
 * something in that store has fallen under half its par. Under them, one line
 * naming what the chosen store holds and who answers for it.
 *
 * **The filter lives in the URL, not in state.** The design holds it in
 * `S.ivStore`, but the console's tab strip is a client island whose panels are
 * server-rendered and handed to it as children — so a chip that set React state
 * would have to reach across that boundary to a table it does not own. `?store=`
 * crosses it without anybody holding state at all: the chips are links, the page
 * reads the parameter, and the table it renders is already filtered. It is also
 * how `?period=` and `?d=` work elsewhere here, and it means a storekeeper can
 * send "the bar is short" as a link.
 *
 * The KPI strip above deliberately does *not* follow the chip — the design's
 * four figures are the branch's, and a stock value that changed when you looked
 * at the bar would be answering a question nobody asked.
 */
export function StoreChips({
  rows,
  store,
  lang,
}: {
  rows: readonly StockRow[];
  /** The chosen store, or `null` for all of them. */
  store: StoreId | null;
  lang: Lang;
}) {
  const chips: readonly { id: StoreId | null; name: string }[] = [
    { id: null, name: say(STORE_COPY.allStores, lang) },
    ...STORE_IDS.map((id) => ({ id, name: say(STORE_NAMES[id], lang) })),
  ];

  const note =
    store === null
      ? say(STORE_COPY.allNote, lang)
      : `${say(STORE_NOTE[store], lang)} · ${say(STORE_COPY.keptBy, lang)} ${STORE_KEEPER[store]}`;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chips.map((chip) => {
          const on = chip.id === store;
          const count =
            chip.id === null ? rows.length : rows.filter((r) => r.store === chip.id).length;
          const low = lowIn(rows, chip.id);

          return (
            <Link
              key={chip.id ?? 'all'}
              /* The chosen store leaves the URL rather than being written as
                 empty — `/inventory` is the whole shelf, and a bare path is
                 what a reader would type for it. */
              href={chip.id === null ? '/inventory' : `/inventory?store=${chip.id}`}
              scroll={false}
              data-press
              aria-current={on ? 'true' : undefined}
              className={`rounded-pill flex h-[38px] items-center gap-[9px] border px-[15px] text-sm font-semibold ${
                on ? 'bg-brand-500 border-brand-500 text-white' : 'bg-surface text-fg-muted'
              }`}
            >
              <span>{chip.name}</span>
              <span
                data-num
                className={`text-2xs font-semibold ${on ? 'text-white/70' : 'text-fg-subtle'}`}
              >
                {count}
              </span>

              {low > 0 ? (
                <span
                  data-num
                  className={`text-3xs inline-flex items-center gap-1 font-bold ${
                    on ? 'text-white/70' : 'text-fg-subtle'
                  }`}
                >
                  <span aria-hidden className="bg-warning-500 size-[5px] rounded-full" />
                  {low}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <p className="text-fg-subtle mb-[18px] text-xs leading-normal">{note}</p>
    </>
  );
}

/** `?store=` as a `StoreId`, or `null` when it named nothing. */
export const storeFrom = (value: unknown): StoreId | null => (isStoreId(value) ? value : null);
