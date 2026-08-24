import { getTranslations } from 'next-intl/server';

import {
  fetchCashLadder,
  fetchIdleScreen,
  fetchPosFloor,
  fetchPosMenu,
  fetchShiftSession,
  holdsTheDrawer,
  pairedTerminal,
  shiftToken,
  tillCountSkipped,
} from '@/lib/pos-session';
import { realtimeConfig } from '@/lib/realtime-server';

import './pos.css';
import { IdleScreen } from './idle-screen';
import { OpenTill } from './open-till';
import { PairPanel } from './pair-panel';
import { OrderScreen } from './order-screen';
import { fetchBillRates } from './rates-server';

export async function generateMetadata() {
  const t = await getTranslations('console.pos');
  return { title: t('title') };
}

/**
 * The till, on a tablet.
 *
 * Its own surface, as the design draws it: no sidebar, no status strip, a 64px
 * bar and then the work. A waiter opens this holding it in one hand, and every
 * target on it is at least 44px for that reason.
 *
 * Two steps in one component: pick a table (or start a takeaway), then the
 * three-column order screen behind it — categories, dishes, ticket. They are
 * one component rather than two routes because a waiter moves between them
 * forty times a shift and a navigation on each is a navigation that can fail
 * with a table waiting.
 *
 * The floor tiles are the same objects the Tables screen draws, down to the
 * glyph: a host and a waiter looking at the same room should see the same thing.
 */
export default async function PosPage() {
  /*
   * One route, three states, and which one shows is decided by what this
   * tablet is holding rather than by where it navigated from.
   *
   *   no device token   → the pairing panel. Not a till yet.
   *   device, no shift  → the idle screen. A till with nobody at it.
   *   device and shift  → the work.
   *
   * Deciding it from the cookies rather than from the navigation is what makes
   * the back button, a reload and a tablet woken from sleep all land on the
   * same screen — and the last of those is the normal case, because this
   * device is left on a counter for eight hours.
   *
   * The order of the two gates matters. Reaching the work without a device
   * token would mean a waiter taking an order the API cannot accept; reaching
   * it without a shift would mean an order attributed to nobody, which is the
   * thing every void and every discount is later traced through.
   */
  const terminal = await pairedTerminal();

  if (terminal === null) {
    return <PairPanel />;
  }

  const shift = (await shiftToken()) === null ? null : await fetchShiftSession();

  /*
   * A cookie is not a session. The API closes an idle one after fifteen
   * minutes, and the cookie outlives that by hours — so "we hold a token" and
   * "somebody is signed in" are different questions, and only the second one
   * decides what to draw. Asking gets the truthful answer and sends a
   * timed-out tablet back to the idle screen, where the next person can put
   * their PIN in.
   */
  if (shift === null) {
    /*
     * `idle` being null does NOT mean unpaired — it means the API could not be
     * read this render. The screen handles that itself: last figures, red link
     * light, clock still running. Only a missing cookie sends anyone back to
     * pairing.
     */
    return <IdleScreen initial={await fetchIdleScreen()} />;
  }

  /*
   * The drawer, before the work, and only for whoever holds it.
   *
   * A cashier with no open cash shift cannot take cash: the API refuses the
   * tender, which is the check that matters and is in the right place. Putting
   * the count in front of them here means they meet it at the start of their
   * shift with the drawer open in front of them, rather than mid-service with a
   * guest waiting and a refusal they have to interpret.
   *
   * A waiter never sees it — they hold no drawer — and the screen itself offers
   * a way past for the card-only case.
   */
  if (shift.cash_shift_id === null && holdsTheDrawer(shift) && !(await tillCountSkipped())) {
    /*
     * The notes come from the server, not from the screen.
     *
     * The ladder is configuration — this platform is multi-country — and it is
     * also what the API validates the posted count against, so a screen holding
     * its own copy can offer a row the server then refuses. It shipped holding
     * six of Uzbekistan's eight notes, which is worse than a refusal: the
     * missing rows simply could not be counted and the float came out short.
     *
     * Read here rather than in the client so the count screen paints once, with
     * its rows already on it, and so a till whose API is unreachable still opens
     * on the built-in list.
     */
    return <OpenTill ladder={await fetchCashLadder()} />;
  }

  /*
   * The board and the floor, both live.
   *
   * Read in parallel because they are independent and a waiter is standing
   * there: two sequential four-second timeouts is eight seconds of a blank
   * screen in the worst case, and the worst case is a basement dining room.
   *
   * Either can come back null — an API mid-restart, a network that dropped —
   * and the screen says so rather than drawing an empty menu that looks like a
   * restaurant with nothing to sell.
   */
  const [sections, tables, rates] = await Promise.all([
    fetchPosMenu(),
    fetchPosFloor(),
    /*
     * The two rates the totals block may print beside a figure.
     *
     * Third in the same parallel read rather than a fourth round trip: a waiter
     * is standing there, and this is a settings call whose answer changes twice
     * a year. `null` is the normal answer for a cashier — they do not hold
     * `settings.view` — and the labels then omit the rate, which is what they
     * have always done.
     */
    fetchBillRates(),
  ]);

  return (
    <OrderScreen
      sections={sections ?? []}
      rates={rates}
      tables={tables ?? []}
      // The real names, from the API. The header used to be two fixture
      // strings, so a waiter called Malika read "Jasur Toshev" above her own
      // order — on the screen every void is attributed through.
      who={shift.user?.name ?? null}
      /* Zero when the session does not say — the safe end of the ladder: every
         discount then opens an approval rather than applying silently. */
      discountCeiling={shift.user?.discount_ceiling ?? 0}
      terminal={
        shift.terminal
          ? [shift.terminal.branch?.name, shift.terminal.code].filter(Boolean).join(' · ')
          : null
      }
      /*
       * The room, for the channel the kitchen answers on.
       *
       * From the terminal rather than from the person: a till is bolted to one
       * counter, and a waiter who also covers the terrace is still standing at
       * this one. `branch` when the API loaded it, `branch_id` when it did not —
       * the same value either way, and null only for a till with no branch, which
       * would be a mispaired device.
       */
      branchId={shift.terminal?.branch?.id ?? shift.terminal?.branch_id ?? null}
      realtimeConfig={realtimeConfig()}
    />
  );
}
