import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { findTab, isCrewRole, say, type CrewRole, type Lang } from '@restaurant/surfaces/crew/data';
import { crewLang } from '../../../crew-session';
import {
  approvalQueue,
  crewMenu,
  crewPerson,
  crewPlace,
  crewToday,
  waiterCalls,
  deliveries,
  shelf,
  waiterFloor,
  crewChecklist,
  riderRound,
} from '../../../crew-server';
import { AlertsPanel } from '../../../panels/alerts';
import { ApprovalsPanel } from '../../../panels/approvals';
import { BranchesPanel } from '../../../panels/branches';
import { CallsPanel } from '../../../panels/calls';
import { MenuPanel } from '../../../panels/menu';
import { MorePanel } from '../../../panels/more';
import { CashPanel, DeliveriesPanel, RoutePanel } from '../../../panels/courier';
import { NotBuilt, type PendingReason } from '../../../panels/not-built';
import { CountPanel, ReceivingPanel, StockPanel } from '../../../panels/store';
import { TablesPanel } from '../../../panels/tables';
import { TodayPanel } from '../../../panels/today';

/**
 * One route for twenty screens: five roles, four tabs each.
 *
 * A file per tab would have meant five copies of `today`, two of `alerts` and a
 * layout import in each — and the moment one of them gained a heading the
 * others would not. The dispatch below is the only place that knows which panel
 * a slug means, so a tab that exists in the dock and nowhere here is a 404
 * rather than a blank screen: `findTab` is the same table the dock draws from,
 * so the two cannot disagree about what a role's tabs are.
 */
export const dynamic = 'force-dynamic';

/**
 * Why a tab is not built, in the words of the thing it is waiting on.
 *
 * The table is empty now and kept, which is the point: the storekeeper's and
 * the courier's six screens used to live in it, on the grounds that they needed
 * a camera, a barcode decoder and a location fix. That reasoning was wrong in
 * the same way twice — a scanner makes receiving faster and a map makes a route
 * nicer, and neither is what makes the screen possible. A storekeeper types the
 * quantity off the invoice and a courier reads a list of stops in order, which
 * is what both have always done. Withholding all six left two whole jobs with
 * no surface anywhere on the platform.
 *
 * Anything added here again should name a reason of that kind — a thing the
 * screen genuinely cannot do without — and not a nicety.
 */
const PENDING_REASON: Readonly<Record<string, PendingReason>> = {};

/*
 * The browser tab is named in the reader's own language, not the authoring one.
 *
 * Worth the second `headers()` read: this app is installed to a home screen and
 * lives in a task switcher next to four other things, and a Russian-reading
 * waiter picking it out of that row should see «Мои столы» rather than a word
 * they have to decode.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string; tab: string }>;
}) {
  const { role, tab } = await params;
  const lang = crewLang((await headers()).get('accept-language'));
  const found = isCrewRole(role) ? findTab(role, tab) : undefined;

  return {
    title: found === undefined ? undefined : say(found.label, lang),
    robots: { index: false, follow: false },
  };
}

export default async function CrewTabPage({
  params,
}: {
  params: Promise<{ role: string; tab: string }>;
}) {
  const { role, tab } = await params;
  if (!isCrewRole(role)) notFound();

  const found = findTab(role, tab);
  if (found === undefined) notFound();

  const lang = crewLang((await headers()).get('accept-language'));

  if (!found.built) return <NotBuilt lang={lang} reason={PENDING_REASON[tab] ?? 'generic'} />;

  /*
   * Fetched here and handed down, because the panels are client components.
   *
   * A zone filter and a masked total are per-keystroke state, so the panels
   * cannot be server components — and `next/headers` cannot exist in a browser
   * bundle. Six tabs read the API today; the rest are fixtures and say so on
   * screen rather than in a comment.
   *
   * One `await` per tab rather than fetching everything: a waiter opening
   * "tables" should not pay for the approvals a manager has waiting.
   */
  if (tab === 'tables') {
    const person = await crewPerson();

    /*
     * No session means no floor to fetch. The panel falls back to fixtures and
     * labels them — which is also what a person browsing `/crew/waiter` with no
     * PIN typed will see, and the honest thing to show them.
     */
    const floor = person === null ? null : await waiterFloor(person.id, lang);

    return (
      <TablesPanel
        lang={lang}
        role={role}
        tables={floor?.tables}
        zones={floor?.zones}
        live={floor?.live ?? false}
      />
    );
  }

  if (tab === 'approvals') {
    const queue = await approvalQueue();

    return <ApprovalsPanel lang={lang} items={queue.items} live={queue.live} />;
  }

  /*
   * The storekeeper's three tabs, and the reason they are up here with the
   * other two rather than in the switch below.
   *
   * All three need a real id before their buttons mean anything:
   * `receive_confirm` is keyed on `purchase_order_id` and `count_submit` on
   * `ingredient_id`, so a screen holding the design's word ids had nothing to
   * send however many times it was pressed. The count sheet and the stock list
   * are one read, deliberately — two would be two lists that can disagree about
   * what this restaurant stocks.
   */
  if (tab === 'receiving') {
    const vans = await deliveries();

    // `role` only so the scanner link can be built — `/crew/<role>/more/scan`
    // lives outside this tab's own subtree.
    return <ReceivingPanel lang={lang} role={role} rows={vans.rows} live={vans.live} />;
  }

  if (tab === 'count' || tab === 'stock') {
    const rows = await shelf(lang);

    return tab === 'count' ? (
      <CountPanel lang={lang} rows={rows.rows} live={rows.live} />
    ) : (
      <StockPanel lang={lang} rows={rows.rows} />
    );
  }

  if (tab === 'menu') {
    const card = await crewMenu(lang);

    return <MenuPanel lang={lang} dishes={card.rows} live={card.live} />;
  }

  if (tab === 'calls') {
    const queue = await waiterCalls(lang);

    return <CallsPanel lang={lang} calls={queue.calls} live={queue.live} />;
  }

  /*
   * The courier's pocket — the one tab whose figure a cashier reconciles
   * against.
   *
   * Two reads because the answer is two facts read together: what is still out
   * (`deliveries/mine`) and whether this person has already declared today
   * (`staff.actions`). Drawn from one of them alone, the button either offers a
   * second declaration or hides the first.
   */
  if (tab === 'cash') {
    const [round, ticks] = await Promise.all([riderRound(), crewChecklist()]);

    return (
      <CashPanel
        lang={lang}
        drops={round.drops}
        declaredTiyin={ticks.declaredTiyin}
        live={round.live}
      />
    );
  }

  if (tab === 'today') {
    /* Only the two roles whose dock carries this tab reach it — `findTab` has
       already refused the other three. */
    const who = role === 'owner' ? 'owner' : 'manager';
    const today = await crewToday(who, lang, await crewPlace());

    return <TodayPanel lang={lang} role={who} board={today.board} live={today.live} />;
  }

  return <Panel role={role} tab={tab} lang={lang} />;
}

function Panel({ role, tab, lang }: { role: CrewRole; tab: string; lang: Lang }) {
  switch (tab) {
    case 'today':
      /* Reached only when the read above did not run — the fixture board, and
         the panel labels it as one. */
      return <TodayPanel lang={lang} role={role === 'owner' ? 'owner' : 'manager'} />;
    case 'branches':
      return <BranchesPanel lang={lang} role={role} />;
    case 'approvals':
      return <ApprovalsPanel lang={lang} />;
    case 'alerts':
      return <AlertsPanel lang={lang} />;
    case 'tables':
      return <TablesPanel lang={lang} role={role} />;
    case 'calls':
      return <CallsPanel lang={lang} />;
    case 'menu':
      return <MenuPanel lang={lang} />;
    case 'more':
      return <MorePanel lang={lang} role={role} />;
    /*
     * The four below are reached only when the read above did not run — a
     * defensive default rather than a second route. Each falls back to its own
     * fixture and says so on screen.
     */
    case 'receiving':
      return <ReceivingPanel lang={lang} role={role} />;
    case 'count':
      return <CountPanel lang={lang} />;
    case 'stock':
      return <StockPanel lang={lang} />;
    case 'deliveries':
      return <DeliveriesPanel lang={lang} />;
    case 'route':
      return <RoutePanel lang={lang} />;
    case 'cash':
      return <CashPanel lang={lang} />;
    default:
      return <NotBuilt lang={lang} />;
  }
}
