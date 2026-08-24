'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { apiId, post, type Lang } from '@/lib/console-post';

import type { DeliveryTerms } from './branches-server';

/**
 * What this venue charges to deliver — the three figures the order endpoint
 * actually prices from.
 *
 * There was no control for any of them, and the reason is worth recording: the
 * keys were undeclared in `config/settings.php`, which validates the settings
 * document and drops an undeclared path without saying so. A restaurant could
 * not have set a delivery fee if the screen had existed. The schema declares
 * them now, the public branch list quotes the same keys the order charges, and
 * this is where a manager sets them.
 *
 * ---------------------------------------------------------------------------
 * So'm on screen, tiyin on the wire
 *
 * Money is an integer in tiyin (binding convention 1) and nobody types tiyin.
 * The field takes so'm, the request carries `× 100`, and the conversion happens
 * in one place so a stray float never reaches the column that a bill is added
 * up from.
 *
 * ---------------------------------------------------------------------------
 * Saved on blur, not on every keystroke
 *
 * A PATCH per character would race itself and land out of order. Blur is when a
 * number is finished, and the field keeps what was typed if the write is
 * refused rather than silently reverting to a figure the guest is not being
 * charged.
 */
const SOM = 100;

export function DeliveryTermsRow({
  branchId,
  initial,
  live,
  lang,
  labels,
}: {
  branchId: string;
  initial: DeliveryTerms;
  /** False on the demo console, where there is no venue to write to. */
  live: boolean;
  lang: Lang;
  labels: {
    fee: string;
    freeOver: string;
    minimum: string;
    kitchen: string;
    travel: string;
    pickup: string;
    saved: string;
    failed: string;
  };
}) {
  const router = useRouter();
  const [terms, setTerms] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save(next: DeliveryTerms) {
    const id = apiId(branchId);

    if (!live || id === null) {
      flash(labels.saved);

      return;
    }

    setSaving(true);

    const answer = await post<unknown>(
      '/api/settings/branches/delivery',
      {
        branchId: id,
        feeTiyin: next.feeTiyin,
        freeOverTiyin: next.freeOverTiyin,
        minimumTiyin: next.minimumTiyin,
        kitchenMinutes: next.kitchenMinutes,
        travelMinutes: next.travelMinutes,
        pickupMinutes: next.pickupMinutes,
      },
      lang,
    );

    setSaving(false);

    if (!answer.ok) {
      // The typed figure stays on screen: reverting it would leave a manager
      // believing the old number is what a guest is being charged.
      flash.problem(answer.message ?? labels.failed);

      return;
    }

    flash(labels.saved);
    // The storefront reads the same three keys, so the screens that quote them
    // are drawn again from the server.
    router.refresh();
  }

  /**
   * One field. `scale` is what separates the two halves of this panel: money is
   * typed in so'm and stored in tiyin, minutes are typed and stored as minutes.
   */
  const field = (key: keyof DeliveryTerms, label: string, scale: number, step: number) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-fg-subtle text-2xs tracking-caps font-semibold uppercase">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={step}
        disabled={saving}
        data-num
        value={terms[key] / scale}
        onChange={(event) => {
          const typed = Number(event.target.value);

          setTerms((was) => ({
            ...was,
            // `Math.round` rather than a cast: a browser hands back a float for
            // a number input, and half a tiyin does not exist.
            [key]: Number.isFinite(typed) && typed > 0 ? Math.round(typed) * scale : 0,
          }));
        }}
        onBlur={() => void save(terms)}
        className="border-border bg-surface h-9 w-full rounded-md border px-2.5 text-sm font-semibold"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-end gap-3">
        {field('feeTiyin', labels.fee, SOM, 1000)}
        {field('freeOverTiyin', labels.freeOver, SOM, 10_000)}
        {field('minimumTiyin', labels.minimum, SOM, 10_000)}
      </div>

      {/* What the venue promises. Three minutes rather than one, because the
          kitchen, the road and the counter are three different waits and only
          the first is the same for a pickup and a delivery. */}
      <div className="flex items-end gap-3">
        {field('kitchenMinutes', labels.kitchen, 1, 5)}
        {field('travelMinutes', labels.travel, 1, 5)}
        {field('pickupMinutes', labels.pickup, 1, 5)}
      </div>
    </div>
  );
}
