import { type NextRequest } from 'next/server';

import { forward } from '@/lib/api-proxy';

/**
 * Putting the draft on the internet.
 *
 * The **Nashr qilish** button on `(dashboard)/web`, and it is a different act
 * from the save beside it. `PUT /settings/site` writes the draft — a marketer
 * rewriting a blurb over a lunch break, a section switched off to see what it
 * looks like — and none of that is on the public site until somebody decides it
 * is. `POST /settings/site/publish` takes the snapshot a stranger reads.
 *
 * No body at all: publishing is "what is saved, now" rather than a payload.
 * Sending the document again would open the one gap the split exists to close —
 * a stale tab publishing what it had loaded half an hour ago over what somebody
 * else has since saved.
 */
export async function POST(request: NextRequest) {
  return forward(request, '/settings/site/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}
