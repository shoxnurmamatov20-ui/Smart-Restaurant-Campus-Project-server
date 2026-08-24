'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { flash } from '@restaurant/ui';
import { formatNumber, formatTiyinAmount } from '@restaurant/utils';

import { apiId, post } from '@/lib/console-post';

import { linesFor, suggestedFor, type OrderPad, type PadLine } from './order-pad';
import { ORDER_COPY, PURCHASE_BUDGET, say, VAT_RATE, type Lang } from './suppliers-data';

/**
 * Raising an order — the design's third supplier tab, `poAtNew`
 * (`Smart Restaurant OS.dc.html:2390-2452`).
 *
 * Two columns: the catalogue with a suggested quantity per line on the left,
 * and what the order comes to on the right. The suggestion is the part that
 * matters — it is the shortfall rounded up to a whole pack. A purchasing screen
 * that only shows prices makes a manager do that arithmetic in their head once
 * per line, which is how a kitchen ends up with four days of tomatoes and none
 * of the beef.
 *
 * Above the budget the order still sends. The warning is a warning because a
 * hard block on a Friday night is a block somebody works around by phoning the
 * supplier directly, and then the order is nowhere at all.
 *
 * **Both buttons write.** They used to flash: Send announced `XB-0185
 * yuborildi` — the same invented document number every time, against a supplier
 * from the design file — and Save-as-draft announced a draft it stored nowhere.
 * Both now go through `POST /api/suppliers/purchase-orders`, the route handler
 * the store screen's per-row order button already uses, and the two differ only
 * by the `status` they ask for: `draft` stays in the book for somebody to check,
 * `sent` is the document leaving the building. The number comes back from the
 * branch counter, which is the only place this platform issues one.
 *
 * On the demo console the pad carries `supplierId: null` and nothing is posted
 * — see `fixturePad()`. The panel says so on the card rather than pretending.
 */
export function NewOrderPanel({ pad, lang }: { pad: OrderPad; lang: Lang }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(pad.suppliers[0]?.id ?? '');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const supplier = pad.suppliers.find((row) => row.id === supplierId) ?? pad.suppliers[0];
  const lines = supplier === undefined ? [] : linesFor(pad, supplier.id);

  const quantityOf = (id: string, fallback: number): number => quantities[id] ?? fallback;

  const priced = lines.map((line) => {
    const quantity = quantityOf(line.id, suggestedFor(line));

    return { line, quantity, sum: quantity * line.price };
  });

  const total = priced.reduce((sum, row) => sum + row.sum, 0);
  const picked = priced.filter((row) => row.quantity > 0).length;
  const overBudget = total > PURCHASE_BUDGET;

  function step(id: string, current: number, pack: number, direction: 1 | -1) {
    setQuantities((state) => ({ ...state, [id]: Math.max(0, current + direction * pack) }));
  }

  /**
   * One document, in whichever of its two states the button asked for.
   *
   * Quantities are converted to base units here — the shelf is shown in
   * kilograms and a purchase order is written in grams — using the same factor
   * the store screen sends, so the two documents are denominated identically.
   */
  async function raise(status: 'draft' | 'sent'): Promise<void> {
    if (busy) return;

    if (picked === 0) {
      flash.problem(say(ORDER_COPY.nothingPicked, lang));

      return;
    }

    const target = supplier === undefined ? null : apiIdOf(supplier.supplierId);

    /* The demo console. Nothing real to raise an order against, and posting a
       fixture key would be refused upstream as a failure the reader cannot
       act on. The card already says this pad is a sample. */
    if (target === null) {
      flash(say(ORDER_COPY.demoOnly, lang));

      return;
    }

    setBusy(true);

    const answer = await post<{ data: { number?: string } }>(
      '/api/suppliers/purchase-orders',
      {
        supplierId: target,
        status,
        items: priced
          .filter((row) => row.quantity > 0 && row.line.ingredientId !== null)
          .map((row) => ({
            ingredientId: row.line.ingredientId,
            name: row.line.name,
            unit: row.line.baseUnit,
            quantity: row.quantity * Math.max(1, row.line.factor),
            unitPrice: row.line.priceBase,
          })),
      },
      lang,
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? say(ORDER_COPY.sendFailed, lang));

      return;
    }

    setQuantities({});

    // The number the API allocated, never one invented here. A draft has one
    // too — it is the document's name from the moment it exists.
    const number = answer.data.data.number ?? '';

    flash(
      status === 'draft'
        ? `${number} · ${say(ORDER_COPY.draftSaved, lang)}`.trim()
        : `${number} ${say(ORDER_COPY.sent, lang)} · ${supplier?.name ?? ''}`.trim(),
    );

    // The order book on the neighbouring tab reads the same table.
    router.refresh();
  }

  if (supplier === undefined) {
    return (
      <div className="bg-surface rounded-lg border px-6 py-14 text-center">
        <p className="text-fg-subtle text-sm">{say(ORDER_COPY.noSuppliers, lang)}</p>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:[grid-template-columns:minmax(0,1fr)_380px]">
      <div className="bg-surface rounded-lg border px-6 py-[22px]">
        <div className="text-sm font-semibold">{say(ORDER_COPY.pickSupplier, lang)}</div>

        <div className="mt-3 flex flex-wrap gap-[7px]">
          {pad.suppliers.map((row) => (
            <button
              key={row.id}
              type="button"
              data-press
              onClick={() => {
                setSupplierId(row.id);
                setQuantities({});
              }}
              className={`rounded-pill h-8 border px-3.5 text-xs font-semibold ${
                row.id === supplierId
                  ? 'bg-brand-500 border-brand-500 text-white'
                  : 'bg-surface border-border-strong text-fg-muted'
              }`}
            >
              {row.name}
            </button>
          ))}
        </div>

        <div className="border-divider mt-6 flex items-center justify-between border-b pb-3">
          <span className="text-sm font-semibold">{say(ORDER_COPY.suggested, lang)}</span>
          <span className="text-fg-subtle text-xs">{say(ORDER_COPY.suggestedNote, lang)}</span>
        </div>

        {priced.length === 0 ? (
          <p className="text-fg-subtle py-10 text-center text-sm">
            {say(ORDER_COPY.noLines, lang)}
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-0.5">
            {priced.map(({ line, quantity, sum }) => (
              <div
                key={line.id}
                className="border-divider grid [grid-template-columns:minmax(0,1fr)_96px_116px_100px] items-center gap-3.5 border-b px-1 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{line.name}</div>
                  <div
                    data-num
                    className={`mt-[3px] text-xs ${isLow(line) ? 'text-danger-600' : 'text-fg-subtle'}`}
                  >
                    {coverage(line, quantity, lang)}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    data-press
                    aria-label="−"
                    onClick={() => step(line.id, quantity, line.pack, -1)}
                    className="bg-surface border-border-strong hover:bg-bg-muted grid size-[26px] flex-none place-items-center rounded-[7px] border text-[15px] leading-none"
                  >
                    −
                  </button>
                  <span data-num className="min-w-[26px] text-center text-sm font-bold">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    data-press
                    aria-label="+"
                    onClick={() => step(line.id, quantity, line.pack, 1)}
                    className="bg-surface border-border-strong hover:bg-bg-muted grid size-[26px] flex-none place-items-center rounded-[7px] border text-[15px] leading-none"
                  >
                    +
                  </button>
                </div>

                <span data-num className="text-fg-muted text-right text-sm">
                  {formatTiyinAmount(line.price, lang)}/{line.unit}
                </span>

                <span data-num className="text-right text-sm font-semibold">
                  {quantity > 0 ? formatTiyinAmount(sum, lang) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-lg border p-[22px]">
        <div className="text-sm font-semibold">{supplier.name}</div>
        <div data-num className="text-fg-subtle mt-1 text-xs">
          {supplier.contact}
        </div>

        <dl className="mt-[18px] flex flex-col gap-2.5 text-sm">
          <Line label={say(ORDER_COPY.positions, lang)} value={`${picked} / ${lines.length}`} />
          <Line
            label={say(ORDER_COPY.lead, lang)}
            value={`${supplier.lead} ${say(ORDER_COPY.days, lang)}`}
          />
          <Line label={say(ORDER_COPY.eta, lang)} value={etaLabel(supplier.lead, lang)} />
          <Line label={say(ORDER_COPY.terms, lang)} value={supplier.terms} />
        </dl>

        <div className="mt-4 flex items-baseline justify-between border-t pt-3.5">
          <span className="text-sm font-semibold">{say(ORDER_COPY.total, lang)}</span>
          <span data-num className="font-display text-2xl font-bold tracking-tight">
            {formatTiyinAmount(total, lang)}
          </span>
        </div>

        {/* VAT is inside the total, not added to it — the design says «of which»
            and the arithmetic follows: total − total/1.12. */}
        <div data-num className="text-fg-subtle mt-1.5 text-right text-xs">
          {say(ORDER_COPY.vat, lang)}{' '}
          {formatTiyinAmount(Math.round(total - total / (1 + VAT_RATE)), lang)}
        </div>

        {overBudget ? (
          <div className="border-warning-500/25 bg-warning-50 mt-3.5 flex gap-2.5 rounded-md border px-3.5 py-3">
            <span className="bg-warning-500 mt-1.5 size-1.5 flex-none rounded-full" />
            <span data-num className="text-warning-600 text-xs leading-relaxed font-medium">
              {say(ORDER_COPY.overBudgetBefore, lang)}
              {formatTiyinAmount(Math.max(0, total - PURCHASE_BUDGET), lang)}
              {say(ORDER_COPY.overBudgetAfter, lang)}
            </span>
          </div>
        ) : null}

        <button
          type="button"
          data-press
          disabled={busy}
          onClick={() => void raise('sent')}
          className="bg-brand-500 hover:bg-brand-600 mt-4 h-11 w-full rounded-md text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? say(ORDER_COPY.sending, lang) : say(ORDER_COPY.send, lang)}
        </button>

        <button
          type="button"
          data-press
          disabled={busy}
          onClick={() => void raise('draft')}
          className="bg-surface border-border-strong hover:bg-bg-muted mt-2.5 h-[38px] w-full rounded-md border text-sm font-semibold disabled:opacity-60"
        >
          {say(ORDER_COPY.draft, lang)}
        </button>

        <p className="text-fg-subtle mt-3 text-xs leading-relaxed">
          {pad.live ? say(ORDER_COPY.note, lang) : say(ORDER_COPY.demoOnly, lang)}
        </p>
      </div>
    </div>
  );
}

/** A supplier's row id, or null for a fixture chip that cannot be ordered from. */
function apiIdOf(id: number | null): number | null {
  return id === null ? null : apiId(String(id));
}

/** Under par, which is the one thing on the row worth a colour. */
function isLow(line: PadLine): boolean {
  return line.have < line.need;
}

/**
 * The second line under a name: days of cover when something measures it, and
 * the par level when nothing does.
 *
 * The design writes "1.3 days · 4.6 after delivery" from an average daily
 * consumption. The ingredients endpoint carries no usage history, so a live pad
 * has `daily: null` and says what it does know — what is on the shelf and what
 * the shelf is meant to hold — rather than inventing the figure a buyer would
 * plan a week around.
 */
function coverage(line: PadLine, quantity: number, lang: Lang): string {
  const stock = `${say(ORDER_COPY.inStock, lang)} ${formatNumber(line.have, lang)} ${line.unit}`;

  if (line.daily === null || line.daily <= 0) {
    return `${stock} · ${say(ORDER_COPY.parLevel, lang)} ${formatNumber(line.need, lang)} ${line.unit}`;
  }

  const now = line.have / line.daily;
  const after = ((line.have + quantity) / line.daily).toFixed(1);

  return `${stock} · ${now.toFixed(1)} ${say(ORDER_COPY.days, lang)} · ${say(ORDER_COPY.afterDelivery, lang)} ${after}`;
}

/**
 * When it lands, counted from today.
 *
 * It used to read `${12 + lead - 1}-avgust` — the twelfth of August, hard-coded
 * from the day the design was drawn, so every order in September was promised
 * for August.
 */
function etaLabel(lead: number, lang: Lang): string {
  if (lead <= 1) return say(ORDER_COPY.tomorrow, lang);

  const at = new Date();
  at.setDate(at.getDate() + lead);

  return new Intl.DateTimeFormat(lang === 'uz' ? 'uz-UZ' : lang, {
    day: 'numeric',
    month: 'long',
  }).format(at);
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-fg-muted">{label}</dt>
      <dd data-num className="font-semibold">
        {value}
      </dd>
    </div>
  );
}
