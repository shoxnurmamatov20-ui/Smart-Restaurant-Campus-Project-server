'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner';

/**
 * The toast, as the design draws it — and the design draws it a lot.
 *
 * `flash()` is called **445 times** across the fourteen prototypes: 237 in the
 * console alone, 45 in the staff app, 25 in the merchant panel. It is not a
 * garnish, it is how every one of those screens says *the thing you pressed
 * happened*. The build mounted a `<Toaster>` and then called `toast()` exactly
 * three times, all of them in the `/design` gallery — so a waiter who fired an
 * order, a manager who approved a discount and a storekeeper who booked a
 * delivery all got the same feedback: none.
 *
 * Measurements are `Smart Restaurant OS.dc.html:8318` verbatim, not
 * `FOUNDATIONS §5` — the two disagree on the inset and the radius and the file
 * wins:
 *
 *   fixed, bottom 28px, centred · `--bg-inverse` on `--fg-inverse` ·
 *   `--radius-md` · `--shadow-xl` · 13px 18px padding · 12px gap ·
 *   a 17px check at stroke 2.2 · 13px/500 label · `toastIn` on the way in
 *
 * **One at a time.** The prototype's `flash()` clears its own timer before
 * setting the next message, so a second toast replaces the first rather than
 * stacking under it. `visibleToasts={1}` is that rule. It matters on a till:
 * three stacked confirmations over the cart are three things covering the
 * total.
 *
 * The dwell is the file's 2800ms. FOUNDATIONS says 2.6s; the code the designer
 * actually shipped says 2.8, and a fifth of a second is the difference between
 * a cashier reading it and a cashier catching the tail of it.
 */

const PANEL =
  'flex items-center gap-3 rounded-md px-[18px] py-[13px] text-sm font-medium ' +
  'bg-bg-inverse text-fg-inverse shadow-xl';

/** The design's glyph: a bare check, inheriting the toast's own ink. */
function Check() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
      aria-hidden
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="bottom-center"
      offset={28}
      duration={2800}
      visibleToasts={1}
      /* The design has no dismiss control: the message is short, it is never
         the only place an outcome is recorded, and a close button on a 2.8s
         panel is a button nobody reaches in time. */
      toastOptions={{
        unstyled: true,
        classNames: { toast: PANEL, title: 'text-sm font-medium', description: 'text-xs' },
      }}
      {...props}
    />
  );
};

/**
 * Say that something happened.
 *
 * The prototype's `flash(msg)`, with its semantics: replaces whatever is on
 * screen, carries the design's check, and goes away on its own. Callers pass a
 * finished sentence in the reader's language — this layer does no translation,
 * because the catalogue is the app's and `packages/ui` cannot see it.
 *
 * `flash.problem()` is the one variant. The design writes failures in the same
 * panel rather than a red one — `FOUNDATIONS §5` asks an error to state what
 * failed and what to do, and a colour is not a sentence — so the difference is
 * the missing check, not a different palette.
 */
function flash(message: string) {
  return toast.custom(
    () => (
      <div data-toast role="status" className={PANEL}>
        <Check />
        <span>{message}</span>
      </div>
    ),
    { duration: 2800 },
  );
}

flash.problem = (message: string) =>
  toast.custom(
    () => (
      <div data-toast role="status" className={PANEL}>
        <span>{message}</span>
      </div>
    ),
    { duration: 3600 },
  );

export { Toaster, flash, toast };
