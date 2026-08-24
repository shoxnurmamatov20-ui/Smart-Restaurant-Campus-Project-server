'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { apiId, post, type Lang } from '@/lib/console-post';

import { STEP_TIYIN, steppedTarget } from './target-steps';

/**
 * A branch's monthly revenue target, adjustable — and now saved.
 *
 * The design draws a stepper: minus, the figure, plus. Both arrows used to move
 * local state and flash "for now this is only on this screen", which was honest
 * and useless: a target set in the morning was gone by the afternoon, and
 * nobody re-checks a number they have already set.
 *
 * `PATCH /api/v1/branches/{branch}` takes `settings.target_monthly_tiyin` and
 * merges it into the venue's own document — the read side already publishes it,
 * and the comparison table above is drawn against it.
 *
 * ---------------------------------------------------------------------------
 * The figure moves before the write lands, and goes back if it does not
 *
 * A stepper that waits for a round trip before it moves feels broken on a slow
 * connection and gets pressed four times. So the number moves at once and the
 * request follows; a refusal puts it back and says so, rather than leaving a
 * manager believing they set a target the server never accepted.
 *
 * ---------------------------------------------------------------------------
 * One request per press, deliberately not debounced
 *
 * Each PATCH carries the whole figure rather than a delta, so the last one to
 * arrive wins and an out-of-order pair cannot compound. Coalescing them would
 * mean holding an unsaved number on screen, which is the state this control
 * existed in before.
 */
export function TargetStepper({
  branchId,
  initialTiyin,
  live,
  lang,
  stepClassName,
  minusLabel,
  plusLabel,
  note,
  failed,
}: {
  /** The venue's id as the register gives it; a fixture row has no numeric one. */
  branchId: string;
  initialTiyin: number;
  /** False on the demo console, where there is nothing to write to. */
  live: boolean;
  lang: Lang;
  stepClassName: string;
  minusLabel: string;
  plusLabel: string;
  /** What the manager is told once it has landed. `{n}` is the new figure. */
  note: string;
  failed: string;
}) {
  const router = useRouter();
  const [tiyin, setTiyin] = useState(initialTiyin);
  const [saving, setSaving] = useState(false);

  async function move(by: number) {
    const next = steppedTarget(tiyin, by);

    if (next === tiyin) return;

    setTiyin(next);

    const id = apiId(branchId);

    /* The demo console. Local state is the whole feature when there is no
       venue behind the row. */
    if (!live || id === null) {
      flash(note.replace('{n}', `${(next / STEP_TIYIN).toFixed(0)}M`));

      return;
    }

    setSaving(true);

    const answer = await post<unknown>(
      '/api/settings/branches/target',
      { branchId: id, targetTiyin: next },
      lang,
    );

    setSaving(false);

    if (!answer.ok) {
      setTiyin(tiyin);
      flash.problem(answer.message ?? failed);

      return;
    }

    flash(note.replace('{n}', `${(next / STEP_TIYIN).toFixed(0)}M`));
    // The rail and the attainment percentage beside this stepper are drawn
    // from the same figure, on the server.
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={stepClassName}
        aria-label={minusLabel}
        disabled={saving}
        onClick={() => void move(-1)}
      >
        −
      </button>
      <span data-num className="font-display text-md min-w-16 text-center font-semibold">
        {(tiyin / STEP_TIYIN).toFixed(0)}M
      </span>
      <button
        type="button"
        className={stepClassName}
        aria-label={plusLabel}
        disabled={saving}
        onClick={() => void move(1)}
      >
        +
      </button>
    </>
  );
}
