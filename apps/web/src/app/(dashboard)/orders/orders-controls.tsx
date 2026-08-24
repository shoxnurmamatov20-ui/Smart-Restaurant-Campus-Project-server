'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post, type Lang } from '@/lib/console-post';

/**
 * The two head controls the design draws — "Filters" and "New order".
 *
 * Both were `ActionButton`s: they flashed a sentence describing a panel that
 * does not exist and opened nothing. Neither needed an endpoint. Filtering is a
 * panel over `filter[channel|status|waiter|intake_channel]`, which
 * `OrderController::index` has always accepted and no component ever asked for;
 * opening a bill is `POST /v1/orders/orders`.
 *
 * ---------------------------------------------------------------------------
 * The filters live in the URL, not in this component
 *
 * Same argument the menu screen's `?filter=no-photo` makes: a selection is a
 * PLACE. It survives a refresh, it can be sent to the manager who asked the
 * question, and the list is re-read on the server with the narrowing applied —
 * which matters because the table is paged upstream, and a filter applied in
 * the browser would filter one page of a hundred and call it the answer.
 *
 * ---------------------------------------------------------------------------
 * "New order" opens a bill; it does not fill one
 *
 * Choosing dishes, modifiers, seats and courses is the POS terminal's whole
 * screen, and a second till inside a table view is a second till that drifts.
 * What an operator taking a call needs is the bill opened against the right
 * conversation — which channel, whose telephone number, where it is going — and
 * the terminal adds the dishes to it.
 */
export type PickerOption = { value: string; label: string };

export function OrderControls({
  lang,
  channels,
  statuses,
  waiters,
  tables,
  canCreate,
  labels,
}: {
  lang: Lang;
  channels: readonly PickerOption[];
  statuses: readonly PickerOption[];
  /** People with a bill open tonight. Empty on the demo console. */
  waiters: readonly PickerOption[];
  /** Where a dine-in bill can be opened. Empty on the demo console. */
  tables: readonly PickerOption[];
  /**
   * Whether this render is a real restaurant's.
   *
   * The form is not offered otherwise: a table id from the fixtures is not a
   * primary key, and a button that posts something the API cannot address is
   * the thing this whole pass exists to remove.
   */
  canCreate: boolean;
  labels: Record<string, string>;
}) {
  const [panel, setPanel] = useState<'none' | 'filters' | 'new'>('none');

  return (
    <div data-pageactions className="flex flex-none flex-wrap justify-end gap-2.5">
      <button
        type="button"
        data-press
        onClick={() => setPanel((current) => (current === 'filters' ? 'none' : 'filters'))}
        className="border-border-strong bg-surface text-fg h-[34px] rounded-md border px-3.5 text-sm font-semibold"
      >
        {labels.filters}
      </button>

      {canCreate ? (
        <button
          type="button"
          data-press
          onClick={() => setPanel((current) => (current === 'new' ? 'none' : 'new'))}
          className="bg-brand-500 hover:bg-brand-600 h-[34px] rounded-md px-3.5 text-sm font-semibold text-white"
        >
          {labels.newOrder}
        </button>
      ) : null}

      {panel === 'filters' ? (
        <FilterPanel channels={channels} statuses={statuses} waiters={waiters} labels={labels} />
      ) : null}

      {panel === 'new' ? (
        <NewOrder
          lang={lang}
          channels={channels}
          tables={tables}
          labels={labels}
          onOpened={() => setPanel('none')}
        />
      ) : null}
    </div>
  );
}

const FIELD = 'border-border-strong bg-bg-subtle h-9 w-full rounded-md border px-2.5 text-sm';
const LABEL = 'text-fg-subtle mb-1 block text-xs';
const SHEET =
  'bg-surface absolute right-0 z-30 mt-11 w-[min(520px,90vw)] rounded-lg border p-4 shadow-lg';

function FilterPanel({
  channels,
  statuses,
  waiters,
  labels,
}: {
  channels: readonly PickerOption[];
  statuses: readonly PickerOption[];
  waiters: readonly PickerOption[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  /**
   * Write one filter into the URL and re-read the list.
   *
   * The other filters are preserved because they are already in `params`:
   * narrowing to a channel and then to a waiter is two questions, not two
   * separate answers, and a panel that dropped the first would make the second
   * press undo the first.
   */
  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());

    if (value === '') next.delete(key);
    else next.set(key, value);

    const query = next.toString();

    router.push(query === '' ? '/orders' : `/orders?${query}`);
  }

  const picker = (key: string, options: readonly PickerOption[], label: string) => (
    <label className="min-w-[150px] flex-1">
      <span className={LABEL}>{label}</span>
      <select
        value={params.get(key) ?? ''}
        onChange={(event) => set(key, event.target.value)}
        className={FIELD}
      >
        <option value="">{labels.filterAny}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className={SHEET}>
      <div className="flex flex-wrap gap-3 text-left">
        {picker('channel', channels, labels.colWhere)}
        {picker('status', statuses, labels.colStatus)}
        {/* Only when somebody has a bill open. An empty picker is a control
            that cannot answer, and the list this is derived from is exactly the
            people worth narrowing to. */}
        {waiters.length === 0 ? null : picker('waiter', waiters, labels.colWaiter)}
      </div>

      <button
        type="button"
        onClick={() => router.push('/orders')}
        className="text-fg-muted hover:text-fg mt-3 text-xs font-semibold"
      >
        {labels.filterClear}
      </button>
    </div>
  );
}

function NewOrder({
  lang,
  channels,
  tables,
  labels,
  onOpened,
}: {
  lang: Lang;
  channels: readonly PickerOption[];
  tables: readonly PickerOption[];
  labels: Record<string, string>;
  onOpened: () => void;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState('dine_in');
  const [tableId, setTableId] = useState('');
  const [guests, setGuests] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  const delivery = channel === 'delivery';

  async function open() {
    if (delivery && address.trim() === '') {
      // A delivery with no address is not a degraded order; it is not an order.
      flash.problem(labels.newAddressNeeded);

      return;
    }

    setBusy(true);

    const answer = await post<{ data: { number: string } }>(
      '/api/orders/new',
      {
        channel,
        // The console's own desk. `phone` is the honest default for a bill
        // somebody is typing up while holding a handset; anything else is a
        // guess about a conversation this form did not have.
        intakeChannel: channel === 'dine_in' ? null : 'phone',
        tableId: tableId === '' ? null : Number(tableId),
        guests: guests === '' ? null : Number(guests),
        customerName: name,
        customerPhone: phone,
        address,
      },
      lang,
    );

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.newFailed);

      return;
    }

    flash(labels.newOpened.replace('{number}', answer.data.data.number));
    onOpened();
    // The table above is a server read and the new bill belongs at the top of
    // it; prepending a row locally would give the drawer an order it could not
    // then reload.
    router.refresh();
  }

  return (
    <div className={SHEET}>
      <div className="grid gap-3 text-left sm:grid-cols-2">
        <label>
          <span className={LABEL}>{labels.colWhere}</span>
          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            className={FIELD}
          >
            {channels.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {channel === 'dine_in' ? (
          <>
            <label>
              <span className={LABEL}>{labels.newTable}</span>
              <select
                value={tableId}
                onChange={(event) => setTableId(event.target.value)}
                className={FIELD}
              >
                <option value="">—</option>
                {tables.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={LABEL}>{labels.newGuests}</span>
              <input
                inputMode="numeric"
                value={guests}
                onChange={(event) => setGuests(event.target.value)}
                className={FIELD}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              <span className={LABEL}>{labels.newName}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={FIELD}
              />
            </label>

            <label>
              <span className={LABEL}>{labels.newPhone}</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={FIELD}
              />
            </label>

            {delivery ? (
              <label className="sm:col-span-2">
                <span className={LABEL}>{labels.newAddress}</span>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className={FIELD}
                />
              </label>
            ) : null}
          </>
        )}
      </div>

      <p className="text-fg-subtle mt-3 text-xs leading-normal">{labels.newHint}</p>

      <button
        type="button"
        data-press
        disabled={busy}
        onClick={() => void open()}
        className="bg-brand-500 hover:bg-brand-600 mt-3 h-9 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-45"
      >
        {busy ? labels.newOpening : labels.newOpen}
      </button>
    </div>
  );
}
