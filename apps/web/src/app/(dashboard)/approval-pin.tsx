'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The manager's PIN keypad — `specs/01-os.md §4.3`.
 *
 * Eight actions in this product cannot be done alone: a discount over the
 * role's ceiling, voiding a fired line, voiding a closed ticket, a refund,
 * opening the till outside a sale, a price edit at the point of sale, a stock
 * count variance over 5%, and a branch-to-branch transfer. Every one of them is
 * supposed to open this, and until now none of them opened anything — the
 * buttons were drawn with no handler at all.
 *
 * Three things make it an approval rather than a confirmation:
 *
 *   The reason is on screen, in one line, above the keypad. A manager keying a
 *   PIN into an unlabelled box is a manager approving whatever the screen
 *   decides they approved — and the audit row will carry their name for it.
 *
 *   Four digits, entered on a keypad and never in a text field. It is the same
 *   PIN the till asks for, and a `<input type="password">` on a shared desktop
 *   is a PIN in a browser's autofill store.
 *
 *   The result goes to the caller, which writes it to the server. Nothing about
 *   this component decides anything: it collects four digits and hands them
 *   over. An approval that resolved locally would be an approval with no audit
 *   row, which is the one thing §4.3 asks for by name — approver, requester,
 *   amount, reason, timestamp.
 *
 * The physical keyboard works too. The design draws a touch keypad because the
 * till is a tablet, but a manager approving from the back office has their
 * hands on a keyboard, and making them mouse twelve times is worse.
 */
export function ApprovalPin({
  /** One line: what is being approved, and for how much. */
  reason,
  labels,
  onCancel,
  onApprove,
}: {
  reason: string;
  labels: {
    title: string;
    sub: string;
    cancel: string;
    /** Read out to a screen reader as each digit lands. */
    digitsEntered: string;
  };
  onCancel: () => void;
  /** Handed the four digits. Returning rejects — the caller decides what a bad PIN means. */
  onApprove: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');
  const dialog = useRef<HTMLDivElement>(null);

  /*
   * A ref, not the state, because this effect must not re-subscribe on every
   * digit — re-binding a keydown listener four times per approval is how a
   * keystroke lands in the gap between removeEventListener and the next add.
   */
  const latest = useRef({ pin, onApprove, onCancel });

  // Every render, before the listener can fire — a ref written during render
  // would be a render with a side effect, which React may run twice.
  useEffect(() => {
    latest.current = { pin, onApprove, onCancel };
  });

  useEffect(() => {
    dialog.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      const { pin: current, onApprove: approve, onCancel: cancel } = latest.current;

      if (event.key === 'Escape') {
        cancel();
        return;
      }

      if (event.key === 'Backspace') {
        setPin(current.slice(0, -1));
        return;
      }

      if (!/^[0-9]$/.test(event.key)) return;

      const next = (current + event.key).slice(0, 4);
      setPin(next);

      if (next.length === 4) approve(next);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const press = (key: string) => {
    if (key === '←') {
      setPin(pin.slice(0, -1));
      return;
    }

    const next = (pin + key).slice(0, 4);
    setPin(next);

    if (next.length === 4) onApprove(next);
  };

  return (
    <div
      data-fade
      className="fixed inset-0 z-[210] flex items-center justify-center p-6"
      style={{ background: 'rgba(15,19,32,.4)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        data-sheet
        className="bg-surface-raised rounded-xl border p-[28px_26px_24px] shadow-xl outline-none"
        style={{ width: 352, maxWidth: '100%' }}
      >
        <div className="text-center">
          <div className="bg-warning-50 text-warning-700 mx-auto mb-4 grid size-11 place-items-center rounded-md">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
              <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
            </svg>
          </div>

          <h3 className="font-display tracking-snug text-lg font-semibold">{labels.title}</h3>
          {/* The reason. Never optional — see the docblock. */}
          <p className="text-fg-muted mt-1.5 text-sm">{reason}</p>
          <p className="text-fg-subtle mt-1 text-xs">{labels.sub}</p>
        </div>

        <div
          className="my-[24px_0_22px] flex justify-center gap-3.5"
          role="status"
          aria-label={labels.digitsEntered.replace('{n}', String(pin.length))}
        >
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className="border-border-strong size-[13px] rounded-full border-[1.5px]"
              style={{ background: pin.length > index ? 'var(--fg)' : 'transparent' }}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '←'].map((key, index) =>
            key === '' ? (
              <span key={index} />
            ) : (
              <button
                key={index}
                type="button"
                onClick={() => press(key)}
                data-press
                className="bg-surface hover:bg-bg-muted font-display grid h-14 place-items-center rounded-md border text-xl font-semibold"
              >
                {key}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="text-fg-muted mt-3.5 h-11 w-full text-sm font-medium"
        >
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
