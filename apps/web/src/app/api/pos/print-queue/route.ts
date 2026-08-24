import { NextResponse, type NextRequest } from 'next/server';

import { apiBase } from '@/lib/server-session';
import { pairedTerminalFrom, POS_SHIFT_COOKIE } from '@/lib/pos-session';

/**
 * "Qayta urinish" — the printer chip's own button, from the till side.
 *
 * The health strip has drawn a diagnosis for a dead printer since it was built
 * and could offer only half of what the design draws (`dc.html:12568`), because
 * a retry is a *write* and the two writes Kitchen publishes —
 * `POST /kitchen/print-jobs/{job}/retry` and `POST /kitchen/printers/{printer}/test`
 * — ask for `kitchen.update` and `kitchen.manage`. A cashier holds neither, and
 * giving them one would hand the person on the counter the power to reconfigure
 * the hardware.
 *
 * `POST /api/v1/pos/print-queue/requeue` is the door built for this instead: it
 * carries `pos.sell`, reaches the spooler through
 * `App\Contracts\Printing\PrintSpooler`, and moves this venue's `failed` jobs
 * back into the queue and nothing else. A `queued` job is already being retried
 * by the backoff and a `claimed` one is in an agent's hands — re-queueing either
 * prints the same receipt twice.
 *
 * No body, because there is nothing to say: which venue is the terminal's own,
 * decided server-side from the row the device token belongs to rather than from
 * a header a tablet could change.
 *
 * The count is passed straight through. It is the whole point of the button —
 * the strip reports the number that moved, and reports zero as zero, because a
 * button that always answers "reconnected" is a cashier walking away from a
 * printer that is still dead.
 */
export async function POST(request: NextRequest) {
  const terminal = pairedTerminalFrom(request);
  const shift = request.cookies.get(POS_SHIFT_COOKIE)?.value;

  if (terminal === null || shift === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 409 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/pos/print-queue/requeue`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${shift}`,
        'X-Tenant': terminal.tenantSlug,
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: 'rejected' }, { status: upstream.status });
  }

  const body = (await upstream.json().catch(() => null)) as {
    data?: { requeued?: number; branch_id?: number | null };
  } | null;

  /*
   * An unreadable answer is not zero.
   *
   * Zero is a fact the strip says out loud — "nothing was stuck, the printer
   * itself is the problem" — and defaulting a broken payload to it would put
   * that sentence in front of a cashier on the strength of a parse failure.
   */
  if (typeof body?.data?.requeued !== 'number') {
    return NextResponse.json({ error: 'unreadable_answer' }, { status: 502 });
  }

  return NextResponse.json({
    requeued: body.data.requeued,
    branch_id: body.data.branch_id ?? null,
  });
}
