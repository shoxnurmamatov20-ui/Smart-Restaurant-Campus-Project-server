'use client';

import { useState } from 'react';

import type { Messages } from '@/i18n';

/**
 * Who the takeaway or the delivery is for.
 *
 * `specs/01-os.md §5.19` puts a guest form behind the two off-premise channels
 * and the till had neither the channels nor the form: a collection was rung up
 * anonymously and a delivery could not be rung up at all.
 *
 * **The phone number is the identity and it is first.** It is what the loyalty
 * programme is keyed on, what a courier rings, and what turns a repeat customer
 * into a name the till already knows — so it leads, and the name is optional
 * until the lookup fails.
 *
 * An address is asked for on a delivery and never on a collection. A form that
 * asks a walk-in for their street is a form that gets a fake street.
 */
export function GuestSheet({
  m,
  channel,
  busy,
  onClose,
  onOpen,
}: {
  m: Messages['console']['pos'];
  channel: 'takeaway' | 'delivery';
  busy: boolean;
  onClose: () => void;
  onOpen: (details: {
    phone: string;
    name: string;
    address: string;
    customerId: number | null;
  }) => void;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  /**
   * What the number turned out to belong to.
   *
   * `undefined` while nobody has looked, `null` for a number the CRM does not
   * know, and an id for one it does. Three states rather than two because
   * "not looked up yet" and "looked up and new" are different things to show:
   * the first is silence and the second is "first order — welcome".
   */
  const [found, setFound] = useState<{ id: number; name: string | null } | null | undefined>(
    undefined,
  );
  const [looking, setLooking] = useState(false);

  async function lookUp(fullNumber: string) {
    setLooking(true);

    try {
      const response = await fetch(`/api/pos/customer?phone=${encodeURIComponent(fullNumber)}`);
      const body = (await response.json()) as { data?: { id: number; name: string | null } | null };

      setFound(body.data ?? null);

      if (body.data?.name != null && name === '') setName(body.data.name);
    } catch {
      /* A lookup that could not run is not a refusal to serve. */
      setFound(null);
    } finally {
      setLooking(false);
    }
  }

  const digits = phone.replace(/\D/g, '').slice(0, 9);
  const ready = digits.length === 9 && (channel === 'takeaway' || address.trim().length > 3);

  return (
    <div
      data-fade
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(15,19,32,.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={channel === 'takeaway' ? m.takeaway : m.deliveryChannel}
        onClick={(event) => event.stopPropagation()}
        className="bg-surface w-full max-w-[440px] rounded-t-[18px] p-6 sm:rounded-[18px]"
      >
        <h3 className="font-display text-xl font-semibold tracking-tight">
          {channel === 'takeaway' ? m.takeaway : m.deliveryChannel}
        </h3>

        <label className="mt-5 block">
          <span className="text-fg-subtle mb-1.5 block text-xs">{m.guestPhone}</span>
          <span className="border-border bg-bg-subtle flex h-14 items-center gap-2 rounded-md border px-3.5">
            <span data-num className="text-fg-muted flex-none text-base font-semibold">
              +998
            </span>
            <input
              value={digits}
              onChange={(event) => {
                setPhone(event.target.value);
                setFound(undefined);
              }}
              onBlur={() => {
                if (digits.length === 9) void lookUp(`+998${digits}`);
              }}
              inputMode="numeric"
              maxLength={9}
              autoFocus
              data-num
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
              placeholder="90 123 45 67"
            />
          </span>
        </label>

        {/* Silence until somebody has looked. A "new customer" line before the
            number is complete is a line that is wrong most of the time. */}
        {found === undefined ? null : (
          <p
            className={`mt-2 text-xs font-medium ${
              found === null ? 'text-fg-subtle' : 'text-success-700'
            }`}
          >
            {looking ? m.guestLooking : found === null ? m.guestNew : m.guestKnown}
          </p>
        )}

        <label className="mt-3 block">
          <span className="text-fg-subtle mb-1.5 block text-xs">{m.guestName}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="border-border bg-bg-subtle h-14 w-full rounded-md border px-3.5 text-base"
          />
        </label>

        {channel === 'delivery' ? (
          <label className="mt-3 block">
            <span className="text-fg-subtle mb-1.5 block text-xs">{m.guestAddress}</span>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={m.guestAddressPh}
              className="border-border bg-bg-subtle h-14 w-full rounded-md border px-3.5 text-base"
            />
          </label>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="border-border h-14 flex-1 rounded-md border text-sm font-semibold"
          >
            {m.cancel}
          </button>
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() =>
              onOpen({
                phone: `+998${digits}`,
                name: name.trim(),
                address: address.trim(),
                customerId: found?.id ?? null,
              })
            }
            className="bg-brand-500 h-14 flex-[1.4] rounded-md text-sm font-semibold text-white disabled:opacity-45"
          >
            {busy ? m.openingBill : m.guestOpen}
          </button>
        </div>
      </div>
    </div>
  );
}
