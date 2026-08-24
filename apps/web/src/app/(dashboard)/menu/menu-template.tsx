'use client';

import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';

import type { Lang } from './prep-data';

/**
 * "Write me a menu to start from."
 *
 * The design's starter-template button, which for as long as it existed was an
 * `ActionButton`: it flashed "template downloaded" and downloaded nothing. What
 * it names is not a spreadsheet — a sheet the owner then has to import is two
 * steps where one will do, and the import path already exists for a restaurant
 * that has its own list. What somebody with no list needs is a menu on the
 * screen they can edit, which is what `POST /api/v1/menu/seed-template` writes.
 *
 * Three answers rather than two, because "nothing was created" is a real and
 * useful one: a restaurant that already ran it is told every row was skipped,
 * which is the difference between a button that is safe to press twice and a
 * button nobody dares press once.
 *
 * The page reloads on success rather than prepending rows locally. Sixty-eight
 * dishes across eight sections change every count and every chip on this
 * screen, and a table that grew by one section while the caption still said
 * "0 items" would be a screen arguing with itself.
 */
export function StarterTemplate({
  lang,
  labels,
}: {
  lang: Lang;
  labels: {
    action: string;
    hint: string;
    working: string;
    /** `{items}` and `{categories}` — the counts only the answer knows. */
    done: string;
    nothing: string;
    failed: string;
  };
}) {
  const [busy, setBusy] = useState(false);

  async function write() {
    setBusy(true);

    const answer = await post<{
      data: { categories_created: number; items_created: number; skipped: number };
    }>('/api/menu/seed-template', {}, lang);

    setBusy(false);

    if (!answer.ok) {
      flash.problem(answer.message ?? labels.failed);

      return;
    }

    const items = answer.data.data.items_created;
    const categories = answer.data.data.categories_created;

    if (items === 0 && categories === 0) {
      // Everything was already there. Said plainly rather than as a success,
      // because a person who expected sixty-eight dishes and got none needs to
      // know why nothing appeared.
      flash(labels.nothing);

      return;
    }

    flash(
      labels.done.replace('{items}', String(items)).replace('{categories}', String(categories)),
    );

    // The counts, the chips and the category tab all change at once.
    window.location.reload();
  }

  return (
    <div className="border-divider mt-6 border-t pt-5">
      <button
        type="button"
        data-press
        disabled={busy}
        onClick={() => void write()}
        className="border-border-strong bg-surface text-fg h-[34px] rounded-md border px-3.5 text-sm font-semibold disabled:opacity-45"
      >
        {busy ? labels.working : labels.action}
      </button>

      <p className="text-fg-subtle mt-2 text-xs leading-normal">{labels.hint}</p>
    </div>
  );
}
