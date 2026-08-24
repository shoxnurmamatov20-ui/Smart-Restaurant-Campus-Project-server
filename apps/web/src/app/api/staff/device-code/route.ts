import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody } from '@/lib/api-proxy';

/**
 * A pairing code for one employee's phone.
 *
 * `POST /api/v1/staff/devices/code` has existed since the crew app did, and
 * nothing in this console called it: the endpoint issued eight characters a
 * manager could read out loud, and there was no screen to read them from. A
 * restaurant could install the staff app and never get past its first field.
 *
 * The code is short-lived and single-use — the server decides both — so this
 * handler carries no state of its own. It forwards, and the screen shows what
 * comes back.
 */
type Body = {
  userId?: unknown;
  label?: unknown;
};

export async function POST(request: NextRequest) {
  const body = await jsonBody<Body>(request);

  if (body === null) return badRequest('invalid_body');

  /*
   * The id arrives as a string from the form and goes out as a number, because
   * `IssueDeviceCodeRequest` reads it with `integer()` — a numeric string that
   * is not an id is the one input this endpoint can be given by hand.
   */
  const userId =
    typeof body.userId === 'string' && /^[0-9]+$/.test(body.userId)
      ? Number(body.userId)
      : typeof body.userId === 'number' && Number.isInteger(body.userId)
        ? body.userId
        : null;

  if (userId === null || userId < 1) return badRequest('invalid_user');

  /*
   * What the phone will be called in the device list. A manager naming it
   * after the person is the point — "Aziza · Samsung" is what makes a lost
   * handset findable later — so it is free text, trimmed and bounded rather
   * than validated into a shape.
   */
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : '';

  return forward(request, '/staff/devices/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, label: label === '' ? 'Telefon' : label }),
  });
}
