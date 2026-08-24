'use client';

import { flash } from '@restaurant/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { clearQueue } from '../crew-queue';

/**
 * Ending a turn, and the sheet the design puts behind it — `dc.html` §More.
 *
 * The row used to be a plain `<Link href="/crew">`, which took the person back
 * to the PIN screen and **left the session cookie in the handset**. The next
 * person to pick up the phone was signed in as them: every action recorded
 * against the wrong name, on a device that is passed around a kitchen all
 * evening. That is the single worst defect a shared-handset app can have, and
 * it looked exactly like working software.
 *
 * So the row calls `DELETE /crew/session`, which revokes the token upstream and
 * clears the cookie here, and only then navigates. The enrolment survives — the
 * handset is still this restaurant's handset; it is the person who leaves.
 *
 * **The sheet, and why there is one.** The design asks before it acts, because
 * the button sits in a list a thumb scrolls past and "end the session" is not
 * something to do by accident mid-service. It also names the consequence the
 * copy names: open orders stay with the person, they are not released.
 */
export function SwitchAccountRow({
  label,
  note,
  confirm,
  cancel,
  working,
  signedOut,
  className,
  children,
}: {
  label: string;
  note: string;
  confirm: string;
  cancel: string;
  working: string;
  /**
   * What is said on the way out, and it names what did *not* happen.
   *
   * The design's own line: the person signed out, the shift did not close.
   * Those are two different things on a shared handset and conflating them is
   * how a waiter walks away believing their open tables were released.
   */
  signedOut: string;
  className: string;
  /** The row's own inner markup, so it matches every other More row exactly. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const end = async () => {
    if (busy) return;

    setBusy(true);

    try {
      await fetch('/crew/session', { method: 'DELETE' });
    } catch {
      /* The cookie is cleared server-side either way, and a person who pressed
         this must end up signed out of the handset regardless. */
    }

    /*
     * The unsent list goes with the person, not with the handset.
     *
     * `POST /staff/actions` keys `local_id` per **user**, so anything left here
     * would be posted under the next person's token and recorded against their
     * name — on a phone that is passed around a kitchen all evening. That is
     * the same defect this row was written to end, one layer down.
     */
    clearQueue();

    flash(signedOut);

    router.push('/crew');
    router.refresh();
  };

  return (
    <>
      <button type="button" data-press onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center">
          <button
            type="button"
            aria-label={cancel}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="bg-surface relative w-full max-w-[var(--crew-measure,480px)] rounded-t-2xl px-[var(--crew-gutter)] pt-5"
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <h2 className="font-display tracking-snug text-lg font-semibold">{label}</h2>
            <p className="text-fg-muted mt-1.5 text-sm leading-normal">{note}</p>

            <button
              type="button"
              onClick={() => void end()}
              disabled={busy}
              className="bg-danger-600 mt-5 grid h-12 w-full place-items-center rounded-md text-sm font-semibold text-white disabled:opacity-45"
            >
              {busy ? working : confirm}
            </button>

            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="text-fg-muted mt-2 h-12 w-full text-sm font-semibold"
            >
              {cancel}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
