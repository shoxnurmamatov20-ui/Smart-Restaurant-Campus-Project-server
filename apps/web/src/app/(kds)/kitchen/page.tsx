import { getTranslations } from 'next-intl/server';

import { moduleMetadata } from '../../(dashboard)/module-page';
import { KdsBoard } from './kds-board';
import { COLUMNS, STATIONS, type TicketState } from './kds-data';
import { getBoard } from './kds-server';
import { realtimeConfig } from '@/lib/realtime-server';
import { getSession } from '@/lib/session';

export const generateMetadata = () => moduleMetadata('kitchen');

/**
 * The kitchen display.
 *
 * Built to the design's KDS: five columns, one per state, tickets moving left
 * to right, and a 48px button on each so it can be hit with the back of a hand.
 * The station filter and the stop list sit above, because both are things a
 * chef reaches for mid-service without leaving the board.
 *
 * Everything here is sized for a wall screen read from two metres: 17px dish
 * names, a 20px timer, a whole ticket's border turning red at ten minutes. The
 * design draws this surface in dark and it stays dark whatever the console's
 * theme — a bright screen over a hot line is a screen nobody looks at.
 *
 * Its own surface since `(kds)/layout.tsx` — it used to render inside the
 * back-office shell, which cost a wall screen a third of its width to a sidebar
 * nobody in a kitchen touches.
 *
 * The shell renders on the server; the board inside it does not. That split is
 * the point of this screen: the chrome — the station tabs, the stop-list button,
 * the figures across the top — is text and needs a translator, while the columns
 * have to move on their own the moment a waiter sends an order. So the server
 * draws the board once, and ./kds-board.tsx takes it over from there.
 *
 * TODO — Phase 1 · kitchen, once the rest of the module is built:
 *   - Recall, and who bumped what
 *   - Ready per line rather than per docket, which needs a line-level status the
 *     ticket's jsonb does not carry yet
 *   - Per-station routing from the recipe card
 *   - Cook times measured rather than assumed
 */
export default async function KitchenPage() {
  const [nav, t, pos, session] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.kitchen'),
    /* The keyboard list is the till's catalogue because `?` is one sheet across
       every surface — the design draws it with a group per screen, not a sheet
       per screen. */
    getTranslations('console.pos'),
    /* The venue this board is over. The subtitle used to be a catalogue
       sentence naming the demo branch and one station, on every kitchen in
       every restaurant. */
    getSession(),
  ]);

  // The API when there is a session, the fixtures when there is not. No
  // station filter here: this is the pass, where the chef watches all five.
  const board = await getBoard();

  /*
   * Every word the board draws, resolved here.
   *
   * next-intl's translator is a server object and cannot cross into a client
   * component, so the strings go instead of the function. Five columns, five
   * buttons and three labels is a small object built once per render — and the
   * alternative, a `NextIntlClientProvider` around a wall screen, would ship the
   * whole console catalogue to a tablet that shows one screen for eight hours.
   */
  const labels = {
    columns: Object.fromEntries(COLUMNS.map((column) => [column.state, t(column.state)])) as Record<
      TicketState,
      string
    >,
    actions: Object.fromEntries(COLUMNS.map((column) => [column.action, t(column.action)])),
    empty: t('empty'),
    ageInKitchen: t('ageInKitchen'),
    ageSinceReady: t('ageSinceReady'),
    late: t('late'),
    seat: t('seat'),
    notes: {
      noteNoOnion: t('noteNoOnion'),
      noteExtraSauce: t('noteExtraSauce'),
      noteNoChilli: t('noteNoChilli'),
      noteCutEight: t('noteCutEight'),
    },
    stations: STATIONS.map((tab) => t(tab.label)),
    stationsByCode: Object.fromEntries(
      STATIONS.filter((tab) => tab.code !== null).map((tab) => [tab.code, t(tab.label)]),
    ),
    /* The strip across the top, now drawn by the board — the figures are
       counted from the tickets it holds and change with the station tab. */
    title: nav('kitchen'),
    placeName: session.placeName,
    openTickets: t('openTickets'),
    avgCook: t('avgCook'),
    longestWait: t('longestWait'),
    liveLabel: t('live'),
    stopList: t('stopList'),
    stopTitle: t('stopTitle'),
    stopSub: t('stopSub'),
    stopClose: t('stopClose'),
    stopOff: t('stopOff'),
    stopOn: t('stopOn'),
    stopFailed: t('stopFailed'),
    stopEmpty: t('stopEmpty'),

    /*
     * The five keys this board answers to, and the sheet that lists them.
     *
     * All five were bound and none of them was discoverable: `?` opened the
     * shortcuts sheet on the till and did nothing here, so a chef could only
     * learn that `1–9` picks a ticket by being told. `FOUNDATIONS §6` puts `?`
     * on every surface for exactly that reason.
     */
    shortcuts: pos('shortcuts'),
    close: pos('cancel'),
    shortcutGroups: [
      {
        title: pos('scKds'),
        rows: [
          { what: pos('scSelect'), keys: '1 – 9' },
          { what: pos('scMove'), keys: '← →' },
          { what: pos('scAdvance'), keys: '↵' },
          { what: pos('scStation'), keys: 'Tab' },
          { what: pos('scStop'), keys: 'S' },
        ],
      },
      {
        title: pos('scGlobal'),
        rows: [
          { what: pos('scHelp'), keys: '?' },
          { what: pos('scClose'), keys: 'Esc' },
        ],
      },
    ],
  };

  return (
    /*
     * A fixed frame, not a long page.
     *
     * The negative margins that used to be here were the board fighting the
     * console's padding. `(kds)/layout.tsx` owns the surface now — dark,
     * full-bleed, `h-dvh` — so the header and the station tabs stay put and
     * only the columns scroll. On a wall that is the whole difference: a busy
     * service used to push the tabs off the top of the screen.
     */
    <div className="flex min-h-0 flex-1 flex-col">
      <KdsBoard
        initial={board.tickets}
        initialStops={board.stops}
        branchId={board.branchId}
        realtimeConfig={realtimeConfig()}
        labels={labels}
      />
    </div>
  );
}
