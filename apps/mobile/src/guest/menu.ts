import { useCallback, useEffect, useState } from 'react';
import {
  guestMenuFrom,
  type GuestMenu,
  type GuestMenuPayload,
} from '@restaurant/surfaces/guest/menu-data';

import { Failure, get } from '../lib/api';
import type { Lang } from '../lib/locale';

/**
 * The menu, from the one endpoint the platform publishes to the public.
 *
 * `GET /api/v1/public/menu`, no login, the restaurant named by `X-Tenant`. The
 * endpoint returns only sellable items of active sections — a draft dish, an
 * archived one, or one the kitchen has just 86'd is simply not in the payload —
 * so nothing here re-derives availability. If a dish is here it is on sale.
 *
 * **No bearer.** A guest is anonymous: there is no session on this surface and
 * sending the staff token that happens to be in the Keychain would ask the
 * public endpoint a signed-in question. `bearer: null` is that, said out loud.
 *
 * The state machine has three arms rather than two, because "the server said
 * something that was not a menu" and "this restaurant has nothing on sale" read
 * identically to a screen and mean opposite things to a guest.
 */
export type MenuState =
  | { status: 'loading' }
  | { status: 'ready'; menu: GuestMenu }
  | { status: 'failed'; retryable: boolean };

export function useGuestMenu(tenant: string, lang: Lang) {
  const [state, setState] = useState<MenuState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;

    setState({ status: 'loading' });

    get<GuestMenuPayload>('/public/menu?channel=dine_in', {
      tenant,
      locale: lang,
      bearer: null,
    })
      .then((payload) => {
        if (!live) return;

        const menu = guestMenuFrom(payload, tenant, lang);

        // A body that is not a menu is a broken server, not an empty kitchen —
        // and it is worth pressing again, because the next answer may parse.
        setState(menu === null ? { status: 'failed', retryable: true } : { status: 'ready', menu });
      })
      .catch((error: unknown) => {
        if (!live) return;

        setState({
          status: 'failed',
          retryable: error instanceof Failure ? error.retryable : true,
        });
      });

    return () => {
      // The guest walked off this screen. Whatever the server eventually says
      // is about a screen that is gone.
      live = false;
    };
  }, [tenant, lang, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
