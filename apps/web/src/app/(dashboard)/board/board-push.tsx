'use client';

import { useTransition } from 'react';
import { flash } from '@restaurant/ui';

import { ACTION_PRIMARY } from '../screen';
import { pushBoard } from './board-actions';

/**
 * "Push to board", and it really pushes.
 *
 * `ActionButton` could not do this: it takes one sentence and shows it, which
 * is right for a head that has nothing to write. This one has three answers to
 * give and they are not interchangeable.
 *
 *   PUBLISHED    rows were stamped and `branch.{id}.board` was told. The
 *                televisions re-read within the second.
 *   ALREADY      nothing had changed, so nothing was written and nothing was
 *                announced. A manager pressing the button to check deserves to
 *                be told that rather than shown a green tick claiming work.
 *   REFUSED      the write did not happen. Saying nothing here is the worst of
 *                the three: the wall keeps last week's price and the person who
 *                pressed the button believes it is fixed.
 *
 * On the fixture console there is nothing to publish, so it flashes the demo
 * sentence exactly as `ActionButton` would — the design's own handler does the
 * same thing.
 */
export function BoardPushButton({
  label,
  live,
  labels,
}: {
  label: string;
  /** Whether this console is reading a real board. */
  live: boolean;
  labels: {
    /** Published, and how many screens were told. */
    pushed: string;
    /** Nothing had changed. */
    upToDate: string;
    /** The write did not happen. */
    failed: string;
  };
}) {
  const [pushing, startPushing] = useTransition();

  const press = () => {
    if (!live) {
      flash(labels.pushed);

      return;
    }

    startPushing(async () => {
      const answer = await pushBoard();

      if (!answer.ok) {
        flash.problem(labels.failed);

        return;
      }

      // Zero is a success with nothing in it. The API writes nothing and
      // broadcasts nothing for a push that changed nothing, so a wall that
      // appears to flicker during service cannot start here.
      flash(answer.pushed === 0 ? labels.upToDate : labels.pushed);
    });
  };

  return (
    <button type="button" data-press disabled={pushing} onClick={press} className={ACTION_PRIMARY}>
      {label}
    </button>
  );
}
