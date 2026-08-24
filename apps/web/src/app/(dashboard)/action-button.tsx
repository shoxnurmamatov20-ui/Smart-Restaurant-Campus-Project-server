'use client';

import { flash } from '@restaurant/ui';

import { ACTION, ACTION_PRIMARY } from './screen';

/**
 * A page-head button that answers.
 *
 * The console's server-rendered heads could not carry a handler — a server
 * component cannot pass a function to the browser — so they carried none, and
 * shipped as decoration. This is the smallest client boundary that fixes that:
 * data in, a toast out, nothing else hydrated.
 *
 * `message` is already in the reader's language. Resolving it on the server
 * keeps the catalogue there, and keeps this component from needing to know
 * anything about locales.
 *
 * ---------------------------------------------------------------------------
 * What this must never be used for
 *
 * A control that CLAIMS AN EFFECT. A toast is an acknowledgement, not an
 * action: "Yangi buyurtma — kanal, stol yoki manzil, so'ng savat" told an owner
 * something had been created when nothing had, and after two or three of those
 * the whole console reads as broken. Most of the page-head buttons that used to
 * be `ActionButton`s are gone or wired now — see `staff/add-staff.tsx` for the
 * shape a real one takes: a route handler under `src/app/api/` forwarding
 * through `forward()`, and a client calling `post()` from `@/lib/console-post`.
 *
 * What is left for it is the one honest case: a button whose entire job is to
 * say something back — an explanation, a "copied", a "nothing to do here yet".
 * If a button would need an endpoint to mean anything and there is none, delete
 * the button.
 */
export function ActionButton({
  label,
  message,
  primary,
  className,
}: {
  label: string;
  /** What the toast says. Required, because a button with nothing to say is the bug. */
  message: string;
  primary?: boolean;
  /** For the buttons the design draws at a size other than the page head's. */
  className?: string;
}) {
  return (
    <button
      type="button"
      data-press
      onClick={() => flash(message)}
      className={className ?? (primary ? ACTION_PRIMARY : ACTION)}
    >
      {label}
    </button>
  );
}
