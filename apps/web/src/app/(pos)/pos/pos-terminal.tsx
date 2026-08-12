'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useMessages } from 'next-intl';
import { formatTiyinAmount } from '@restaurant/utils';

import type { Messages } from '@/i18n';

import {
  billTotals,
  CATEGORIES,
  MODIFIERS,
  TABLE_STATUS,
  type CategoryId,
  type MenuItem,
  type PosTable,
} from './pos-data';

/**
 * The status word per table state.
 *
 * Keys into `console.floor`, which the Tables screen already uses — a table
 * that reads *Band* on the floor plan must not read *Occupied* on the tablet.
 */
const STATUS_LABEL = {
  free: 'statusFree',
  seated: 'statusSeated',
  reserved: 'statusReserved',
  cleaning: 'statusCleaning',
  to_pay: 'statusToPay',
} as const;

/**
 * The waiter's terminal.
 *
 * Touch-first, gloves-on: every target is at least 44px and the keypad-sized
 * ones are 56px. No hover state carries meaning — a tablet has no pointer — so
 * selection is shown by fill and border, never by a colour that only appears
 * when something is under a cursor.
 *
 * Three columns on landscape, stacked below 820px: categories, items, ticket.
 * The ticket is sticky and its actions are pinned to the bottom, because the
 * one thing a waiter does on this screen forty times a shift is press *send*,
 * and a button that moves as the order grows is a button that gets mis-pressed.
 *
 * State is local and optimistic. A waiter cannot wait on a round trip with a
 * table watching them, so the line lands in the ticket immediately; the API
 * call and the `order.*` broadcast are what make it true.
 */

/** A line on the ticket: an item, a quantity, and whatever was chosen with it. */
type CartLine = {
  /** Unique per line, not per item — two lines of the same dish differ by mods. */
  key: string;
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: readonly string[];
  /** What the modifiers add, per unit, in tiyin. */
  extra: number;
};

export function PosTerminal({
  menu,
  tables,
}: {
  menu: readonly MenuItem[];
  tables: readonly PosTable[];
}) {
  const messages = useMessages() as Messages;
  const m = messages.console.pos;
  const menuCopy = messages.console.menu;
  const floor = messages.console.floor;
  const common = messages.console.common;

  const [table, setTable] = useState<PosTable | null>(null);
  const [takeaway, setTakeaway] = useState(false);
  const [category, setCategory] = useState<CategoryId>('national');
  const [cart, setCart] = useState<readonly CartLine[]>([]);
  const [modFor, setModFor] = useState<MenuItem | null>(null);
  const [discounted, setDiscounted] = useState(false);
  const [sent, setSent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * One toast at a time, replaced rather than stacked, gone after 2.6s.
   *
   * The timer is held in a ref so a second toast cancels the first one's
   * dismissal — without that, toast A's timeout fires mid-life of toast B and
   * the reader watches a message vanish after half a second.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function flash(message: string) {
    if (timer.current) clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(null), 2600);
  }

  function add(item: MenuItem, modifiers: readonly string[] = []) {
    if (item.is86) {
      flash(m.toastSoldOut.replace('{name}', item.name));
      return;
    }

    const extra = modifiers.reduce(
      (sum, id) => sum + (MODIFIERS.find((mod) => mod.id === id)?.price ?? 0),
      0,
    );
    const key = `${item.id}:${[...modifiers].sort().join(',')}`;

    setCart((current) => {
      const existing = current.findIndex((line) => line.key === key);
      if (existing >= 0) {
        return current.map((line, index) =>
          index === existing ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }

      return [
        ...current,
        { key, itemId: item.id, name: item.name, price: item.price, quantity: 1, modifiers, extra },
      ];
    });
    setSent(false);
  }

  function step(key: string, by: number) {
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, quantity: line.quantity + by } : line))
        .filter((line) => line.quantity > 0),
    );
    setSent(false);
  }

  const subtotal = cart.reduce((sum, line) => sum + (line.price + line.extra) * line.quantity, 0);
  const totals = billTotals(subtotal, discounted);
  const items = menu.filter((item) => item.category === category);

  /* ---- the table picker, before anything is open ---- */

  if (!table && !takeaway) {
    return (
      <div className="flex h-screen flex-col">
        <PosHeader m={m} />

        <div data-scroll className="min-h-0 flex-1 p-6">
          <div className="mx-auto max-w-[900px]">
            <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight">
              {m.pick}
            </h2>
            <p className="text-fg-muted text-md mt-2">{m.pickSub}</p>

            <div className="mt-6 grid [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {tables.map((option) => {
                const style = TABLE_STATUS[option.status];

                return (
                  <button
                    key={option.name}
                    type="button"
                    onClick={() => setTable(option)}
                    className={`flex min-h-[104px] flex-col items-start rounded-md border p-4 text-left ${style.tile}`}
                  >
                    <span className="flex w-full items-baseline justify-between gap-2">
                      <span
                        data-num
                        className="font-display text-2xl leading-none font-bold tracking-tight"
                      >
                        {option.name}
                      </span>
                      <span aria-hidden style={{ color: style.dot }}>
                        {style.glyph}
                      </span>
                    </span>
                    <span data-num className="text-fg-subtle mt-1.5 text-xs">
                      {option.seats} {common.seats}
                    </span>
                    <span className={`mt-auto pt-2 text-xs font-semibold ${style.label}`}>
                      {floor[STATUS_LABEL[option.status]]}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setTakeaway(true)}
                className="bg-bg-muted flex min-h-[104px] flex-col items-start rounded-md border border-dashed p-4 text-left"
              >
                <span className="font-display text-lg leading-tight font-semibold">
                  {m.takeaway}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- the terminal proper ---- */

  return (
    <div className="flex h-screen flex-col">
      <PosHeader
        m={m}
        where={table ? table.name : m.takeaway}
        covers={table?.guests ?? null}
        coversLabel={m.covers}
        onBack={() => {
          setTable(null);
          setTakeaway(false);
          setCart([]);
          setSent(false);
          setDiscounted(false);
        }}
      />

      <div
        data-pos
        className="grid min-h-0 flex-1 [grid-template-columns:108px_minmax(0,1fr)_380px]"
      >
        {/* ---- categories ---- */}
        <nav data-scroll className="border-border flex flex-col gap-1.5 border-r p-2.5">
          {CATEGORIES.map((entry) => {
            const count = menu.filter((item) => item.category === entry.id).length;
            const active = entry.id === category;

            return (
              <button
                key={entry.id}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setCategory(entry.id)}
                className={`flex h-[72px] flex-col justify-center rounded-md border px-2.5 text-left ${
                  active ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-surface'
                }`}
              >
                <span className="text-xs leading-tight font-semibold">{menuCopy[entry.label]}</span>
                <span data-num className="text-fg-subtle text-2xs mt-1">
                  {count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* ---- items ---- */}
        <div data-scroll className="min-w-0 p-4">
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => (item.is86 ? add(item) : setModFor(item))}
                aria-disabled={item.is86}
                className={`flex h-[88px] flex-col items-start justify-between rounded-[12px] border p-3 text-left ${
                  item.is86 ? 'border-dashed opacity-45' : 'bg-surface'
                }`}
              >
                <span className="text-md leading-snug font-semibold">{item.name}</span>

                {item.is86 ? (
                  <span className="bg-danger-50 text-danger-700 rounded-pill text-2xs px-2 py-0.5 font-bold">
                    {menuCopy.soldOut}
                  </span>
                ) : (
                  <span data-num className="text-fg-muted text-sm">
                    {formatTiyinAmount(item.price)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ---- ticket ---- */}
        <aside className="border-border bg-surface flex min-h-0 flex-col border-l">
          <header className="border-divider flex-none border-b px-4 py-3.5">
            <div className="font-display tracking-snug text-lg leading-tight font-semibold">
              {table ? table.name : m.takeaway}
            </div>
            <div data-num className="text-fg-subtle mt-0.5 text-xs">
              {cart.length} {m.itemCount}
              {table?.guests ? ` · ${table.guests} ${m.covers}` : ''}
              {sent ? ` · ${m.sent}` : ''}
            </div>
          </header>

          {cart.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="text-md font-semibold">{m.cartEmptyTitle}</div>
              <p className="text-fg-subtle mt-1.5 text-sm leading-normal">{m.cartEmptyBody}</p>
            </div>
          ) : (
            <div data-scroll className="min-h-0 flex-1 px-4 py-3">
              {cart.map((line) => (
                <div
                  key={line.key}
                  className="border-divider flex gap-3 border-b py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug font-semibold">{line.name}</div>
                    {line.modifiers.length > 0 ? (
                      <div className="text-fg-subtle mt-1 text-xs">
                        {line.modifiers
                          .map((id) => {
                            const mod = MODIFIERS.find((entry) => entry.id === id);
                            return mod ? m[mod.label] : id;
                          })
                          .join(' · ')}
                      </div>
                    ) : null}

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={m.decrease}
                        onClick={() => step(line.key, -1)}
                        className="bg-bg-muted rounded-pill grid size-9 place-items-center text-lg font-semibold"
                      >
                        −
                      </button>
                      <span data-num className="w-6 text-center text-sm font-semibold">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={m.increase}
                        onClick={() => step(line.key, 1)}
                        className="bg-bg-muted rounded-pill grid size-9 place-items-center text-lg font-semibold"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-none flex-col items-end justify-between">
                    <button
                      type="button"
                      aria-label={m.remove}
                      onClick={() => step(line.key, -line.quantity)}
                      className="text-fg-subtle text-md grid size-8 place-items-center rounded-md"
                    >
                      ×
                    </button>
                    <span data-num className="text-sm font-semibold">
                      {formatTiyinAmount((line.price + line.extra) * line.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <footer className="border-divider flex-none border-t p-4">
            <dl className="mb-3.5 flex flex-col gap-1.5 text-xs">
              <Row label={m.subtotal} value={formatTiyinAmount(totals.subtotal)} />
              <Row label={m.service} value={formatTiyinAmount(totals.service)} />
              {discounted ? (
                <Row
                  label={m.discountLine}
                  value={`−${formatTiyinAmount(Math.abs(totals.discount))}`}
                  tone="danger"
                />
              ) : null}
              <Row label={m.vat} value={formatTiyinAmount(totals.vat)} muted />
              <div className="border-divider mt-1.5 flex items-baseline justify-between gap-3 border-t pt-2.5">
                <dt className="text-md font-semibold">{m.total}</dt>
                <dd data-num className="font-display tracking-snug text-xl font-bold">
                  {formatTiyinAmount(totals.total)}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => {
                // TODO(api): POST /api/v1/orders/{id}/fire. The lines go to the
                // KDS on `order.*`; until then this marks the ticket locally so
                // the state the button drives is visible.
                setSent(true);
                flash(m.toastSent);
              }}
              className="bg-brand-500 text-md h-[52px] w-full rounded-md font-semibold text-white disabled:opacity-40"
            >
              {m.send}
            </button>

            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {(
                [
                  ['split', m.split],
                  ['merge', m.merge],
                  ['transfer', m.transfer],
                  ['discount', m.discount],
                  ['pay', m.pay],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  disabled={cart.length === 0}
                  onClick={() => {
                    // A waiter's ceiling is 5%; this is 10%, so the design sends
                    // it to a manager. The keypad modal lands with the endpoint.
                    if (id === 'discount') {
                      flash(m.needsApproval);
                      setDiscounted(true);
                      return;
                    }
                    flash(label);
                  }}
                  className="bg-bg-muted text-fg-muted text-2xs h-11 rounded-md px-1 font-semibold disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
          </footer>
        </aside>
      </div>

      {modFor ? (
        <ModifierSheet
          item={modFor}
          m={m}
          onClose={() => setModFor(null)}
          onConfirm={(chosen) => {
            add(modFor, chosen);
            setModFor(null);
          }}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          className="bg-n-900 fixed bottom-8 left-1/2 z-60 -translate-x-1/2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-xl"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: 'danger';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? 'text-fg-subtle' : 'text-fg-muted'}>{label}</dt>
      <dd
        data-num
        className={`font-semibold ${tone === 'danger' ? 'text-danger-700' : muted ? 'text-fg-subtle' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

function PosHeader({
  m,
  where,
  covers,
  coversLabel,
  onBack,
}: {
  m: Messages['console']['pos'];
  where?: string;
  covers?: number | null;
  coversLabel?: string;
  onBack?: () => void;
}) {
  return (
    <header className="border-border bg-surface flex h-16 flex-none items-center gap-4 border-b px-5">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="bg-bg-muted text-fg-muted grid size-11 flex-none place-items-center rounded-md text-lg"
          aria-label={m.pick}
        >
          ‹
        </button>
      ) : null}

      <div className="min-w-0">
        <div className="font-display text-md tracking-snug leading-tight font-semibold">
          {where ?? m.heading}
        </div>
        <div data-num className="text-fg-subtle mt-0.5 text-xs">
          {where && covers ? `${covers} ${coversLabel}` : m.sub}
        </div>
      </div>

      <div className="ml-auto flex flex-none items-center gap-2.5">
        <Link
          href="/kds"
          className="bg-bg-muted text-fg-muted flex h-11 items-center rounded-md px-3.5 text-sm font-semibold"
        >
          {m.kitchenView}
        </Link>
        <Link
          href="/dashboard"
          className="bg-bg-muted text-fg-muted flex h-11 items-center rounded-md px-3.5 text-sm font-semibold"
        >
          {m.back}
        </Link>
      </div>
    </header>
  );
}

/**
 * What goes with the dish.
 *
 * A sheet on the way in rather than an edit afterwards: the modifiers that
 * matter — no onion, extra spicy — are the ones the kitchen needs *before* it
 * starts, and a waiter who has to remember to go back and add them is a waiter
 * who sometimes does not.
 */
function ModifierSheet({
  item,
  m,
  onClose,
  onConfirm,
}: {
  item: MenuItem;
  m: Messages['console']['pos'];
  onClose: () => void;
  onConfirm: (modifiers: readonly string[]) => void;
}) {
  const [chosen, setChosen] = useState<readonly string[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="bg-surface flex max-h-[86vh] w-full max-w-[560px] flex-col rounded-t-xl sm:rounded-xl"
      >
        <header className="border-divider flex-none border-b px-6 py-5">
          <h2 className="font-display tracking-snug text-xl font-semibold">{item.name}</h2>
          <p className="text-fg-muted mt-1 text-sm leading-normal">{m.modSub}</p>
        </header>

        <div data-scroll className="grid min-h-0 gap-2 p-6">
          {MODIFIERS.map((mod) => {
            const on = chosen.includes(mod.id);

            return (
              <button
                key={mod.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setChosen((current) =>
                    on ? current.filter((id) => id !== mod.id) : [...current, mod.id],
                  )
                }
                className={`flex h-14 items-center justify-between gap-3 rounded-md border px-4 text-left ${
                  on ? 'bg-brand-50 border-brand-200' : 'bg-bg-subtle'
                }`}
              >
                <span className="text-md font-semibold">{m[mod.label]}</span>
                {mod.price > 0 ? (
                  <span data-num className="text-fg-muted flex-none text-sm">
                    +{formatTiyinAmount(mod.price)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <footer className="border-divider flex-none border-t p-4">
          <button
            type="button"
            onClick={() => onConfirm(chosen)}
            className="bg-brand-500 text-md h-[52px] w-full rounded-md font-semibold text-white"
          >
            {m.modDone}
          </button>
        </footer>
      </div>
    </div>
  );
}
