import type { ReactNode } from 'react';

/**
 * The small pieces every screen in this app repeats.
 *
 * Here rather than copied into eight panels because they carry decisions, not
 * just markup: the caps label is the design's one section divider, and the note
 * is where a screen tells the truth about itself. Both drifted in the prototype
 * — three different grey values for the same label — and one definition is what
 * stops that.
 */

/** The uppercase divider the design puts above every list. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-fg-subtle text-2xs tracking-caps mt-5 mb-2 font-semibold uppercase">
      {children}
    </h2>
  );
}

/**
 * A line of explanation under a heading or at the foot of a list.
 *
 * `leading-normal` is the design's 1.45 rather than Tailwind's 1.5 — these run
 * to three lines on a 390px screen and the difference is a visible step.
 */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-fg-subtle text-2xs mt-4 leading-normal">{children}</p>;
}

/**
 * The disclosure that goes above any control which changes something.
 *
 * Above rather than below, deliberately. A manager who declines a discount and
 * walks off believing the waiter was told is worse off than one who never
 * opened the screen — so this has to be read before the button, not after it.
 */
export function NotWired({ children }: { children: ReactNode }) {
  return (
    <p className="border-warning-500/30 bg-warning-50 text-warning-700 text-2xs mb-3.5 rounded-[10px] border px-3 py-2 leading-normal">
      {children}
    </p>
  );
}

/** An empty list, which says what would be here rather than apologising. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-fg-subtle py-7 text-center text-sm">{children}</p>;
}
