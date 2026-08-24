'use client';

import { flash } from '@restaurant/ui';

/**
 * A control the design draws, on an endpoint that does not exist yet.
 *
 * A handful of screens across both consoles ended with a button that did nothing
 * at all: retrying a failed invoice, inviting a teammate, adding a branch,
 * saving a permission matrix. All are pure server
 * actions — there is no local state a click could honestly change — so the
 * pattern used elsewhere in this console (change it locally, `flash()` the
 * confirmation) does not apply.
 *
 * The alternatives were a disabled control or a silent one. Silent is the worst
 * of the three: an operator taps *Qayta urinish*, nothing happens, and the only
 * conclusion available is that the console is broken. Disabled is honest but
 * says nothing about *why*, and this is a screen whose reader can do something
 * about it — they are the platform operator.
 *
 * So the button stays as the design draws it and says what happened. The
 * sentence names the operation rather than apologising, which is
 * `FOUNDATIONS §5`: state what failed and what to do.
 *
 * Delete this the day the endpoint lands; the call site becomes an ordinary
 * `onClick`. It is deliberately not a general-purpose "coming soon" component —
 * every unbuilt screen gets one; it is for a control the design draws on an
 * endpoint that is genuinely the next thing to build.
 */
export function PendingAction({
  label,
  note,
  className,
}: {
  label: string;
  /** What the operator is told. A finished sentence in their language. */
  note: string;
  className?: string;
}) {
  return (
    <button type="button" onClick={() => flash.problem(note)} className={className}>
      {label}
    </button>
  );
}
