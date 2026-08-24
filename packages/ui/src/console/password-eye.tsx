'use client';

import * as React from 'react';

import { cn } from '@restaurant/utils';

/**
 * The eye on a password field.
 *
 * Not in the design handoff, and here because the owner asked for it — the same
 * standing as the crew app's day/night switch. It earns the place on the
 * sign-in screens in particular: the password a platform operator reads out
 * when a restaurant is opened is sixteen generated characters, and somebody
 * typing that into a phone has no other way to tell whether they got it right.
 * The only feedback without it is "wrong email or password", which is also what
 * a mistyped *address* says — so the field with the real mistake in it is the
 * one you cannot see.
 *
 * In `packages/ui` rather than beside either form, because there are three
 * password fields on this product and they are in two apps: the owner's door
 * and the platform door on `apps/web`'s `/login`, and the operator's door on
 * `apps/admin`'s. Three copies of a control is how a design system becomes a
 * folder of near-misses.
 *
 * `type="button"` is load-bearing. A bare `<button>` inside a `<form>` submits
 * it, so the default would sign in on every press of the eye.
 *
 * The caller flips the input's own `type` rather than this painting a mask over
 * it, so a password manager still recognises the field it filled. `aria-pressed`
 * carries the state and the label says what the press will DO — the two
 * together are what stops a screen reader announcing "show password" over a
 * password that is already showing.
 *
 * Positioned against the field, so the caller wraps its input in a `relative`
 * box; 44px, because the sign-in screens are surfaces the design never drew for
 * a phone and the platform's own touch rule applies there. The offset assumes
 * the shared field shape — `mt-[7px] h-11` — and `className` is there for the
 * caller whose field is a different height.
 */
export function PasswordEye({
  shown,
  onToggle,
  showLabel,
  hideLabel,
  className,
}: {
  /** Whether the field it sits on is currently readable. */
  shown: boolean;
  onToggle: () => void;
  /** What the press will do when the password is hidden. */
  showLabel: string;
  /** ...and when it is showing. */
  hideLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      aria-label={shown ? hideLabel : showLabel}
      title={shown ? hideLabel : showLabel}
      className={cn(
        'text-fg-subtle hover:text-fg absolute top-[7px] right-0 grid size-11 place-items-center rounded-md',
        className,
      )}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {shown ? (
          <>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </>
        ) : (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}
