import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { copy, fill, STORE_COPY, SUB_NOTES } from '@restaurant/surfaces/crew/copy';
import {
  findTab,
  isCrewRole,
  MORE,
  say,
  type CrewRole,
  type Lang,
} from '@restaurant/surfaces/crew/data';
import { crewLang } from '../../../../crew-session';
import { moreCopy } from '@restaurant/surfaces/crew/more-copy';
import {
  BranchDetailScreen,
  ClosingScreen,
  ControlScreen,
  EndShiftScreen,
  ExpiryScreen,
  FinanceScreen,
  BookingsScreen,
  KitchenSpeedScreen,
  MyDayScreen,
  MyShiftScreen,
  PeopleScreen,
  RotaScreen,
} from '../../../../panels/more-screens';
import {
  HandbackScreen,
  PurchaseScreen,
  SwapScreen,
  WasteScreen,
} from '../../../../panels/more-forms';
import { ScanScreen } from '../../../../panels/store';
import {
  crewChecklist,
  crewSuppliers,
  deliveries,
  pricedShelf,
  riderRound,
  swapOptions,
} from '../../../../crew-server';

/**
 * One route for the seventeen screens the More menu names.
 *
 * The same argument the tab route makes: a file each would have meant seventeen
 * copies of the back link and the heading, and the moment one gained a subtitle
 * the others would not. The dispatch below is the only place that knows which
 * panel a slug means, and `MORE` — the table the menu itself draws from — is
 * what decides whether the slug exists at all. A row in the menu with no case
 * here is a 404 rather than a blank page, and a case here with no row is
 * unreachable; `more-fidelity.test.ts` checks neither happens.
 *
 * **Which role may open which screen.** `MORE[role]` is per role, so a waiter
 * asking for `/crew/waiter/more/control` gets a 404 rather than the owner's
 * loss-prevention scores. That is a *drawing* boundary, not a security one —
 * the real one is the server's permission check on whatever a screen would
 * fetch, and none of these fetches anything yet.
 */
export const dynamic = 'force-dynamic';

/** Which screens this route can draw, and which role's menu may reach them. */
const SCREENS = [
  'finance',
  'people',
  'control',
  'closing',
  'rota',
  'kitchen',
  'waste',
  'expiry',
  'porder',
  'swap',
  'handback',
  'endshift',
  'myshift',
  'bookings',
  'myday',
  'branch',
  'scan',
] as const;

type Screen = (typeof SCREENS)[number];

const isScreen = (value: string): value is Screen => (SCREENS as readonly string[]).includes(value);

/** The label the header prints, taken from the row that links here. */
function labelFor(role: CrewRole, screen: string, lang: Lang): string | null {
  const row = MORE[role].find((entry) => entry.id === screen);

  return row === undefined ? null : say(row.label, lang);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string; screen: string }>;
}) {
  const { role, screen } = await params;
  const lang = crewLang((await headers()).get('accept-language'));

  return {
    title: isCrewRole(role) ? (labelFor(role, screen, lang) ?? undefined) : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function CrewMoreScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string; screen: string }>;
  searchParams: Promise<{ i?: string }>;
}) {
  const { role, screen } = await params;
  const { i } = await searchParams;

  if (!isCrewRole(role) || !isScreen(screen)) notFound();

  const lang = crewLang((await headers()).get('accept-language'));

  /*
   * Two screens are not named in a More row, and both are reached by tapping
   * something on a tab: a branch card on the owner's list, and the scanner
   * button on the storekeeper's receiving screen. Their headings come from
   * where they were opened rather than from a menu row that does not exist.
   */
  const branchIndex = Number.parseInt(i ?? '0', 10);
  const t = moreCopy(lang);
  const store = copy(STORE_COPY, lang);

  /*
   * The scanner belongs to whoever has a receiving tab, which is the
   * storekeeper and nobody else. Asked for by any other role it is a 404 —
   * the same drawing boundary `MORE[role]` draws for the rest of this route,
   * and the same disclaimer applies: the real one is the server's permission
   * check on whatever a screen fetches, and none of these fetches anything.
   */
  if (screen === 'scan' && findTab(role, 'receiving') === undefined) notFound();

  const heading =
    screen === 'branch'
      ? (t.branches[branchIndex]?.name ?? null)
      : screen === 'scan'
        ? store.scanTitle
        : labelFor(role, screen, lang);

  if (heading === null) notFound();

  /*
   * `notes[screen]` is what enforces the set: `screen` is the `Screen` union,
   * so a slug added to `SCREENS` with no sentence in `SUB_NOTES` does not
   * compile. A screen that opens with a bare figure and no period beside it is
   * one a reader argues with — "this month" and "this week" are not
   * interchangeable on a profit and loss.
   */
  const notes = copy(SUB_NOTES, lang);

  const subNote =
    screen === 'branch'
      ? fill(notes.branch, { city: t.branches[branchIndex]?.city ?? '' })
      : notes[screen];

  /*
   * One read per screen, and only for the screens that write.
   *
   * Twelve of the seventeen are figures and prose; fetching for all of them
   * would make opening "kitchen speed" pay for a supplier list. Each of these
   * four is the id the matching form was missing — see `more-forms.tsx`.
   */
  const shelf = screen === 'waste' || screen === 'porder' ? await pricedShelf(lang) : undefined;
  const vendors = screen === 'porder' ? await crewSuppliers() : undefined;
  const swap = screen === 'swap' ? await swapOptions(lang) : undefined;
  const round = screen === 'handback' || screen === 'endshift' ? await riderRound() : undefined;
  const vans = screen === 'scan' ? await deliveries() : undefined;

  /*
   * What this person already ticked off today.
   *
   * Two screens, one read: the manager's closing run-through and the courier's
   * end-of-shift conditions both live in `staff.actions`, and the courier's
   * second line — "cash handed in" — is the same declaration the cash tab
   * writes. Reading them from two places is how the two screens on one phone
   * came to disagree.
   */
  const ticks = screen === 'closing' || screen === 'endshift' ? await crewChecklist() : undefined;

  return (
    <div className="px-[var(--crew-gutter)] pb-6">
      <header className="flex items-center gap-2.5 pt-1 pb-4">
        {/*
         * Back to the menu the row was on, not `history.back()`.
         *
         * A staff app is opened from a home screen and from a notification, so
         * the previous page is often not this app at all. Naming the
         * destination is also what lets the control be a link rather than a
         * button — it works with no JavaScript and it can be opened in a new
         * tab, which is what a manager comparing two branches does.
         */}
        <Link
          href={
            screen === 'branch'
              ? `/crew/${role}/branches`
              : screen === 'scan'
                ? `/crew/${role}/receiving`
                : `/crew/${role}/more`
          }
          aria-label={t.text.back}
          className="border-border bg-surface grid size-9 flex-none place-items-center rounded-md border"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 12H6" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </Link>

        <div className="min-w-0">
          <h1 className="font-display tracking-snug min-w-0 truncate text-lg font-semibold">
            {heading}
          </h1>
          {/* The design gives every sub-screen a line under its title saying
              what the reader is looking at — the period a figure covers, the
              order a list is in, what to pick first. It was missing from all
              sixteen, which left a manager to guess whether a P&L was the month
              or the week. */}
          <p className="text-fg-subtle mt-0.5 text-xs leading-normal">{subNote}</p>
        </div>
      </header>

      {screen === 'finance' ? <FinanceScreen lang={lang} /> : null}
      {screen === 'people' ? <PeopleScreen lang={lang} /> : null}
      {screen === 'control' ? <ControlScreen lang={lang} /> : null}
      {screen === 'closing' ? (
        <ClosingScreen lang={lang} ticked={ticks?.ticked} live={ticks?.live} />
      ) : null}
      {screen === 'rota' ? <RotaScreen lang={lang} /> : null}
      {screen === 'kitchen' ? <KitchenSpeedScreen lang={lang} /> : null}
      {screen === 'expiry' ? <ExpiryScreen lang={lang} /> : null}
      {screen === 'waste' ? (
        <WasteScreen lang={lang} rows={shelf?.rows} live={shelf?.live} />
      ) : null}
      {screen === 'porder' ? (
        <PurchaseScreen
          lang={lang}
          rows={shelf?.rows}
          suppliers={vendors?.rows}
          /* Both halves or neither: a sheet with rows and no supplier to
             address them to cannot post, and one with a supplier and no rows
             has nothing to say. */
          live={(shelf?.live ?? false) && (vendors?.live ?? false)}
        />
      ) : null}
      {screen === 'swap' ? (
        <SwapScreen lang={lang} options={swap} live={swap !== undefined} />
      ) : null}
      {screen === 'handback' ? (
        <HandbackScreen lang={lang} drops={round?.drops} live={round?.live} />
      ) : null}
      {screen === 'endshift' ? (
        <EndShiftScreen
          lang={lang}
          drops={round?.drops}
          declaredTiyin={ticks?.declaredTiyin}
          /* Both reads or neither: the conditions are counted from the round
             and the cash line from the journal, and a screen that had one of
             the two would tick a line nobody did. */
          live={(round?.live ?? false) && (ticks?.live ?? false)}
        />
      ) : null}
      {screen === 'myshift' ? <MyShiftScreen lang={lang} /> : null}
      {screen === 'bookings' ? <BookingsScreen lang={lang} /> : null}
      {screen === 'myday' ? <MyDayScreen lang={lang} /> : null}
      {screen === 'branch' ? <BranchDetailScreen lang={lang} index={branchIndex} /> : null}
      {screen === 'scan' ? <ScanScreen lang={lang} rows={vans?.rows} live={vans?.live} /> : null}
    </div>
  );
}
