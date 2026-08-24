import { NextResponse, type NextRequest } from 'next/server';

import { apiBase, SESSION_COOKIE } from '@/lib/server-session';

/**
 * One standard report, as the file an accountant opens — or as the message a
 * manager gets on their phone.
 *
 * `POST /api/v1/reports/export` answers two different things depending on where
 * the reader asked it to put the report, and that is the whole shape of this
 * handler. A download comes back as CSV bytes rather than JSON, which is why
 * this does not go through `lib/api-proxy.ts` — `forward()` parses the body as
 * JSON and would turn a spreadsheet into a 502. The bytes are passed through
 * untouched, as an `ArrayBuffer`: the server writes a UTF-8 byte-order mark on
 * the front so Excel does not mangle `Ko'kat`, and decoding to a string and
 * re-encoding is exactly how that mark gets lost.
 *
 * A delivery — email or Telegram — comes back as JSON, and that body is
 * returned through with the upstream's own status. Reading it as bytes instead
 * is not a cosmetic mistake: a refusal would arrive in the reader's downloads
 * folder as a file called `report.csv` containing an error envelope, and the
 * dialog would flash "sent" over the top of it.
 *
 * ---------------------------------------------------------------------------
 * Why the browser cannot just be sent to the URL
 *
 * A download is normally a link. This one cannot be: the API is on another
 * origin and the session token is in an httpOnly cookie that only Node can
 * read, so an `<a href>` would arrive unauthenticated. The reader's own token
 * goes up from here, the API decides `analytics.view` against the person who
 * actually clicked, and the file that comes back is scoped to their restaurant
 * and their venue.
 *
 * A POST, because that is what the endpoint is — it reads nothing, but it is
 * inside the `tenant` group and therefore wants an `Idempotency-Key` like every
 * other write. A fresh one per request: two exports of the same report are two
 * legitimate downloads, and a reused key would replay the first file with a
 * JSON content type.
 *
 * ---------------------------------------------------------------------------
 * Every enum is checked here as well as upstream
 *
 * `kind`, `period`, `format` and `deliver` are all closed sets, and an
 * unchecked value is a fragment forwarded into somebody else's URL — cheap to
 * validate, and the failure it prevents is not a validation error.
 *
 * `period` keeps its old behaviour and falls back to the default window,
 * because a wrong window is a smaller report about the right thing. `format`
 * and `deliver` are refused outright instead, because quietly defaulting them
 * changes *what* the reader gets and *who* gets it: a `deliver=telegram` typo
 * downgraded to a download is a file that never reaches the person it was meant
 * for, under a toast that says it did.
 *
 * `pdf` is deliberately absent from `FORMATS`. There is no PDF renderer on the
 * server and none is being built — the export dialog opens the report as a
 * printable sheet at `/documents?d=report` and lets the browser make the PDF,
 * so a `format=pdf` arriving here is a caller that has lost track of that and
 * should hear about it rather than be handed a CSV with the wrong extension.
 */
/**
 * Nine now, not five.
 *
 * `zreport`, `items`, `vat` and `branches` were added when `StandardReports`
 * learned to answer them — four of the six catalogue cards that used to flash
 * "building · it will be emailed to you" and queue nothing. The two that are
 * still absent stay absent on purpose: stock movement needs Inventory, which
 * Analytics may not read, and labour needs per-person attendance, which the
 * Staff contract withholds.
 */
const KINDS = [
  'waiters',
  'dishes',
  'voids',
  'stock',
  'cashflow',
  'zreport',
  'items',
  'vat',
  'branches',
] as const;

const PERIODS = ['today', 'week', 'month'] as const;

/** The two dialects the server writes. Both arrive as a `.csv` file. */
const FORMATS = ['csv', '1c'] as const;

/** The three places it can put one. */
const DELIVERIES = ['download', 'email', 'telegram'] as const;

/**
 * The longest `to` the API accepts, mirrored here.
 *
 * Refused rather than truncated: `to` is an email address or a Telegram chat
 * id, and the first 160 characters of an address that was too long is a
 * different, possibly real, address. Left out entirely when it is empty, so the
 * API applies its own default — the signed-in reader's own mailbox, or the
 * restaurant's notification chat.
 */
const TO_MAX = 160;

type Body = {
  kind?: unknown;
  period?: unknown;
  format?: unknown;
  deliver?: unknown;
  to?: unknown;
};

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token === undefined) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  let body: Body;

  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const kind = typeof body.kind === 'string' ? body.kind : '';
  const period = typeof body.period === 'string' ? body.period : 'month';
  const format = typeof body.format === 'string' ? body.format : 'csv';
  const deliver = typeof body.deliver === 'string' ? body.deliver : 'download';
  const to = typeof body.to === 'string' ? body.to.trim() : '';

  if (!(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: 'unknown_report' }, { status: 400 });
  }

  if (!(FORMATS as readonly string[]).includes(format)) {
    return NextResponse.json({ error: 'unknown_format' }, { status: 400 });
  }

  if (!(DELIVERIES as readonly string[]).includes(deliver)) {
    return NextResponse.json({ error: 'unknown_destination' }, { status: 400 });
  }

  if (to.length > TO_MAX) {
    return NextResponse.json({ error: 'invalid_destination' }, { status: 400 });
  }

  const window = (PERIODS as readonly string[]).includes(period) ? period : 'month';

  /* A download is bytes; the other two are an answer about whether it landed. */
  const wantsBytes = deliver === 'download';

  let upstream: Response;

  try {
    upstream = await fetch(`${apiBase()}/reports/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: wantsBytes ? 'text/csv' : 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        kind,
        period: window,
        format,
        deliver,
        ...(to === '' ? {} : { to }),
      }),
      // Per person and per request. A report cached at the edge would be one
      // restaurant's takings served to the next reader who asked for the same
      // file — the one failure this whole tenancy layer exists to prevent.
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'api_unreachable' }, { status: 502 });
  }

  if (!wantsBytes) {
    /*
     * JSON in, JSON out — the body and the status, unchanged.
     *
     * Both halves matter. `{"data":{"delivered":1,…}}` is what lets the dialog
     * say "sent" only when something was actually sent, and the refusal
     * envelope carries `message_uz` / `message_ru` / `message_en` — the API's
     * own sentence about *why*, in the reader's language. Rewriting it here
     * into `{error:'rejected'}` would replace "this restaurant has no Telegram
     * chat configured" with a status code, and the reader would have no idea
     * which of the two ends to fix.
     */
    let payload: unknown;

    try {
      payload = await upstream.json();
    } catch {
      // A body that is not JSON on the JSON path is an upstream fault rather
      // than a refusal, so it does not get to masquerade as a 200.
      return NextResponse.json(
        { error: 'rejected' },
        { status: upstream.ok ? 502 : upstream.status },
      );
    }

    return NextResponse.json(payload, { status: upstream.status });
  }

  if (!upstream.ok) {
    /*
     * Deliberately not the envelope. The dialog falls back to the file the
     * browser writes from the rows already on screen, so the reader gets a
     * table either way and a toast naming an HTTP status would be noise about a
     * failure that had no consequence.
     */
    return NextResponse.json({ error: 'rejected' }, { status: upstream.status });
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    status: 200,
    headers: {
      /*
       * `1c` is the same transport as `csv` and a different dialect inside it —
       * semicolons, a BOM and 1C's own column names — so it is still a CSV
       * file and still says so here.
       */
      'Content-Type': 'text/csv; charset=UTF-8',
      /*
       * The server names the file after the kind and the window it actually
       * used — `voids-2026-07-23_2026-08-21.csv`. Kept rather than renamed
       * here, because the dates in that name are the API's answer to "which
       * window is a month", and a file whose name disagrees with its contents
       * is the thing somebody notices a week later.
       */
      'Content-Disposition':
        upstream.headers.get('Content-Disposition') ?? `attachment; filename="${kind}.csv"`,
    },
  });
}
