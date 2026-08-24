import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import {
  customerMenuFrom,
  customerVenuesFrom,
  DEMO_MENU,
  DEMO_VENUES,
  MENU_POLL_MS,
  type CustomerMenu,
  type CustomerVenues,
  type GuestBranchEnvelope,
} from '@restaurant/surfaces/customer/live';
import type { GuestMenuPayload } from '@restaurant/surfaces/guest/menu-data';

import { Failure, get } from '../lib/api';
import type { Lang } from '../lib/locale';

/**
 * The customer app's catalogue, from the API.
 *
 * `GET /api/v1/public/menu` — the same endpoint the QR menu reads, mapped by
 * the same function (`@restaurant/surfaces/customer/live`) the browser build
 * uses. One payload, one mapping: `pricing.ts` already said why, and it applies
 * to the whole menu and not only to the arithmetic. If the phone quotes one
 * price and the till prints another, the cashier is the one who gets blamed.
 *
 * **No bearer.** A customer browsing before they sign in is anonymous, and
 * sending whatever staff token happens to sit in the Keychain would ask a
 * public endpoint a signed-in question.
 *
 * Four states rather than two, because they need four different sentences: a
 * screen that is still asking, a menu, a restaurant with nothing on sale, and a
 * server that did not answer. The last one falls back to the fixtures and says
 * so, which is `live: false` on the menu it hands back.
 */
export type CustomerMenuState =
  | { status: 'loading' }
  | { status: 'ready'; menu: CustomerMenu }
  | { status: 'failed'; menu: CustomerMenu; retryable: boolean };

/**
 * Which restaurant this build serves.
 *
 * The QR surface takes it from the sticker's own URL; this app has no such
 * segment, so the build names one — the same arrangement `apps/web` uses with
 * `NEXT_PUBLIC_DEFAULT_TENANT`. A consumer app serving several restaurants
 * needs a real chooser, and that is a product decision rather than a fetch.
 */
export function customerTenant(): string {
  const configured = (Constants.expoConfig?.extra as { defaultTenant?: string } | undefined)
    ?.defaultTenant;

  return configured ?? 'demo-restaurant';
}

export function useCustomerMenu(lang: Lang) {
  const [state, setState] = useState<CustomerMenuState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;

    const ask = () => {
      /*
       * `channel=delivery`, because that is what this app is.
       *
       * A dish sold only in the dining room must not appear in a delivery
       * basket — the endpoint filters on the channel and the alternative is a
       * courier being handed something the kitchen does not box.
       */
      get<GuestMenuPayload>('/public/menu?channel=delivery', {
        tenant: customerTenant(),
        locale: lang,
        bearer: null,
      })
        .then((payload) => {
          if (!live) return;

          const menu = customerMenuFrom(payload);

          setState(
            menu === null
              ? { status: 'failed', menu: DEMO_MENU, retryable: true }
              : { status: 'ready', menu },
          );
        })
        .catch((error: unknown) => {
          if (!live) return;

          setState({
            status: 'failed',
            menu: DEMO_MENU,
            retryable: error instanceof Failure ? error.retryable : true,
          });
        });
    };

    setState({ status: 'loading' });
    ask();

    /*
     * And again every minute, which is how a stop-list reaches a customer.
     *
     * The 86 sheet broadcasts on `branch.{id}.stoplist` — a private channel,
     * rightly closed to strangers, so there is no version of "let every
     * customer in the city subscribe" that ends well. A phone finds out by
     * asking again. Sixty seconds matches the endpoint's own cache TTL, so a
     * poll that lands early costs one ETag round trip and no query.
     */
    const timer = setInterval(ask, MENU_POLL_MS);

    return () => {
      // The customer walked off this screen. Whatever the server eventually
      // says is about a screen that is gone.
      live = false;
      clearInterval(timer);
    };
  }, [lang, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}

/* ============================================================
   Which venues a guest may order from — GET /api/v1/public/branches
   ============================================================ */

/**
 * The branch list, and whether a restaurant published it.
 *
 * Same three states as the menu and for the same reason: a screen that is still
 * asking, a list, and a server that did not answer — which falls back to the
 * fixtures and says so (`live: false`).
 */
export type CustomerVenuesState =
  | { status: 'loading' }
  | { status: 'ready'; venues: CustomerVenues }
  | { status: 'failed'; venues: CustomerVenues; retryable: boolean };

/**
 * Where the food comes from, and what each venue charges to carry it.
 *
 * The fee is why this call exists. `BRANCHES` in the surfaces package prices
 * delivery at a flat 12 000 so'm — a number invented for a demo — while the
 * server derives it per venue from `branches.settings['delivery.fee_tiyin']`
 * and recomputes it when it prices the bill. A cart quoting one and a bill
 * charging the other is the drift `pricing.ts` warns about, arriving at the
 * exact moment a guest is asked to pay.
 *
 * **No poll.** The menu screen re-asks every minute because that is how a
 * stop-list reaches a guest; a branch's address, hours and delivery fee change
 * about as often as its lease. Asking once per language, and again when a
 * screen asks, is the whole of it.
 */
export function useCustomerVenues(lang: Lang) {
  const [state, setState] = useState<CustomerVenuesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;

    setState({ status: 'loading' });

    get<GuestBranchEnvelope>('/public/branches', {
      tenant: customerTenant(),
      locale: lang,
      // Anonymous, like the menu: a guest choosing where to collect from has
      // not signed in yet, and may never.
      bearer: null,
    })
      .then((payload) => {
        if (!live) return;

        const venues = customerVenuesFrom(payload);

        setState(
          venues === null
            ? { status: 'failed', venues: DEMO_VENUES, retryable: true }
            : { status: 'ready', venues },
        );
      })
      .catch((error: unknown) => {
        if (!live) return;

        setState({
          status: 'failed',
          venues: DEMO_VENUES,
          retryable: error instanceof Failure ? error.retryable : true,
        });
      });

    return () => {
      live = false;
    };
  }, [lang, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
