import { type NextRequest } from 'next/server';

import { badRequest, forward, jsonBody, whole } from '@/lib/api-proxy';

/**
 * What the console writes into CRM.
 *
 * One handler for four screens — the complaints desk, the review queue, the
 * promotions tab and the automation tab — because they are one module's
 * endpoints seen from four desks, and four handlers would be this file's
 * plumbing written four times. The same reasoning as `api/orders/route.ts`,
 * which serves the orders table and the intake queue together.
 *
 * The action is a key into a fixed table, never a path fragment taken off the
 * request. This route is reachable from the browser with a real session behind
 * it, and interpolating a caller's string into an upstream path would point the
 * reader's own token at any endpoint it happens to reach.
 *
 * Nothing here decides anything. Every refusal — the ceiling on a refund, a
 * campaign that has already gone out, a segment with nobody in it — is the
 * API's, and comes back with its code and its three sentences for the screen to
 * show. A console that pre-empted any of them would be a second place the rule
 * lives.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

type Body = {
  action?: unknown;
  id?: unknown;
  outcome?: unknown;
  amountTiyin?: unknown;
  note?: unknown;
  on?: unknown;
  body?: unknown;
  segment?: unknown;
};

/** The four answers, as a closed set. Anything else never reaches the API. */
const OUTCOMES: ReadonlySet<string> = new Set(['refunded', 'partly', 'points', 'declined']);

export async function POST(request: NextRequest) {
  const payload = await jsonBody<Body>(request);

  if (payload === null) return badRequest('invalid_body');

  switch (payload.action) {
    /* ------------------------------------------------ the complaints desk */

    case 'decide': {
      const id = whole(payload.id);

      // A fixture row has no id. Refused here as well as on the screen: this is
      // the last place before a real token reaches the API.
      if (id === null) return badRequest('invalid_case');

      const outcome = typeof payload.outcome === 'string' ? payload.outcome : '';

      if (!OUTCOMES.has(outcome)) return badRequest('invalid_outcome');

      /*
       * The amount is forwarded only when the screen actually sent one.
       *
       * Omitting it means "the obvious amount for this outcome", which the API
       * computes — the whole disputed sum, or half of it rounded to the nearest
       * thousand so'm. Sending a zero instead would record every refund as
       * costing nothing.
       */
      const amount = whole(payload.amountTiyin);

      return forward(request, `/crm/cases/${id}/decide`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          outcome,
          ...(amount === null ? {} : { amount_tiyin: amount }),
          ...(typeof payload.note === 'string' && payload.note !== ''
            ? { note: payload.note }
            : {}),
        }),
      });
    }

    /** Open a complaints desk on a review somebody left. */
    case 'case-from-feedback': {
      const id = whole(payload.id);

      if (id === null) return badRequest('invalid_feedback');

      return forward(request, `/crm/feedbacks/${id}/case`, { method: 'POST' });
    }

    /* --------------------------------------------------------- promotions */

    case 'promotion-pause':
    case 'promotion-resume': {
      const id = whole(payload.id);

      if (id === null) return badRequest('invalid_promotion');

      /*
       * Two actions rather than a PATCH carrying `is_active`, because the
       * console's control is one tap with no form behind it: a PATCH assembled
       * from a stale card could quietly rewrite the hours, the dishes or the
       * channel while doing nothing more than switching the offer off.
       */
      const verb = payload.action === 'promotion-pause' ? 'pause' : 'resume';

      return forward(request, `/crm/promotions/${id}/${verb}`, { method: 'POST' });
    }

    /* -------------------------------------------------------- automations */

    case 'trigger-toggle': {
      const id = whole(payload.id);

      if (id === null) return badRequest('invalid_trigger');

      return forward(request, `/crm/triggers/${id}/toggle`, {
        method: 'POST',
        headers: JSON_HEADERS,
        // The state the screen believes it is moving to, sent explicitly: a
        // toggle that flipped whatever the server currently holds would move
        // the wrong way on a card somebody left open.
        body: JSON.stringify({ is_active: payload.on === true }),
      });
    }

    /* ---------------------------------------------------------- campaigns */

    /**
     * What a message would cost this segment, before anything is written.
     *
     * A POST because the body travels in it, and a message with a guest's name
     * and an apostrophe in a query string is a message somebody's proxy logs.
     */
    case 'campaign-estimate': {
      const text = typeof payload.body === 'string' ? payload.body : '';

      if (text.trim() === '') return badRequest('empty_message');

      return forward(request, '/crm/campaigns/estimate', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          body: text,
          segment: typeof payload.segment === 'string' ? payload.segment : 'all',
        }),
      });
    }

    /** Write the draft and send it, which is two calls and one button. */
    case 'campaign-send': {
      const text = typeof payload.body === 'string' ? payload.body : '';

      if (text.trim() === '') return badRequest('empty_message');

      const created = await forward(request, '/crm/campaigns', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          name:
            typeof payload.note === 'string' && payload.note !== ''
              ? payload.note
              : text.slice(0, 60),
          body: text,
          segment: typeof payload.segment === 'string' ? payload.segment : 'all',
        }),
      });

      // The draft was refused — no permission, a body over four parts. Its own
      // envelope is the answer; a second call would replace it with a 404.
      if (created.status >= 400) return created;

      const draft = (await created.json()) as { data?: { id?: unknown } };
      const id = whole(draft.data?.id);

      if (id === null) return badRequest('invalid_campaign');

      return forward(request, `/crm/campaigns/${id}/send`, { method: 'POST' });
    }

    default:
      return badRequest('unknown_action');
  }
}
