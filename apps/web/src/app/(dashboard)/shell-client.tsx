'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { withLocale } from '@/lib/locale-path';
import { useLocalePath } from '@/lib/use-locale-path';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { flash } from '@restaurant/ui';

import { useTheme } from '@/components/providers/theme-provider';
import { LANGUAGE_OPTIONS, type Locale, type Messages } from '@/i18n';
import { rememberLocale } from '@/i18n/locale';
import { SESSION_ENDPOINT } from '@/lib/base-path';
import { post, type Lang } from '@/lib/console-post';
import { rememberRole } from '@/lib/role-cookie';
import { ROLE_LIST, type ModuleKey, type Role, type RoleId } from '@/lib/roles';

import { CommandPalette } from './command-palette';
import { NAV_ITEMS, type NavItem } from './nav';
import type { NotificationFeed } from './notifications-server';
import type { BranchChoice } from './shell-server';
import type { NotificationKey } from './shell-data';

/**
 * Everything in the shell that needs the browser.
 *
 * Kept in one client file on purpose: the layout stays a server component —
 * which is what lets it read the language cookie and render the console in the
 * right language on the first paint — and only the parts that genuinely depend
 * on the current route, the open menu or the stored theme cross the boundary.
 */

/* --------------------------------------------------------- primitives -- */

/**
 * A menu that closes when you click away or press Escape.
 *
 * Both are the same requirement seen from two sides: a menu that only closes
 * by its own trigger is a menu a keyboard user cannot leave, and one that
 * survives a click on the page underneath ends up stacked behind the next one.
 */
function useDismissable(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return ref;
}

/** The design's dropdown: a raised surface on a hairline, 44px below its trigger. */
function Menu({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div
      role="menu"
      style={{ width }}
      className="bg-surface-raised absolute top-11 right-0 z-70 max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border shadow-xl"
    >
      {children}
    </div>
  );
}

const MENU_ROW =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-[9px] text-left text-sm font-medium';

/* ------------------------------------------------------------ sidebar -- */

export function NavLink({ item }: { item: NavItem }) {
  // `here` is the path without its language; `to()` puts it back on a href.
  const { here, to } = useLocalePath();
  const nav = (useMessages() as Messages).console.nav;

  // Exact match only. `/finance` and `/finance/till` are two rows in the same
  // group, and a prefix match would light both up at once.
  const active = here === item.href;

  return (
    <Link
      href={to(item.href)}
      data-navitem
      data-active={active ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      data-press
      className="text-fg-muted flex h-10 flex-none items-center gap-3 rounded-md px-2.5 text-sm font-medium"
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-none"
        aria-hidden
      >
        {item.icon}
      </svg>

      <span data-navlabel className="truncate">
        {nav[item.key]}
      </span>

      {item.badge ? (
        <span
          data-navlabel
          data-num
          className={
            item.badgeTone === 'warning'
              ? 'text-warning-700 text-2xs ml-auto flex items-center gap-[5px] font-semibold'
              : 'bg-bg-muted text-fg-muted rounded-pill text-2xs ml-auto px-[7px] py-0.5 font-semibold'
          }
        >
          {item.badgeTone === 'warning' ? (
            <span aria-hidden className="bg-warning-500 rounded-pill size-1.5" />
          ) : null}
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

/* ------------------------------------------------------------- top bar -- */

/**
 * The screen's name, read from the path against the nav.
 *
 * A layout cannot see its page's metadata, and writing the title twice is how
 * the tab and the header end up disagreeing.
 */
export function PageTitle() {
  // `here` is the path without its language; `to()` puts it back on a href.
  const { here, to } = useLocalePath();
  const nav = (useMessages() as Messages).console.nav;

  const match =
    NAV_ITEMS.find((item) => item.href === here) ??
    NAV_ITEMS.find((item) => here.startsWith(`${item.href}/`));

  return (
    <h1 className="font-display tracking-snug truncate text-lg leading-[1.2] font-semibold">
      {nav[match?.key ?? 'dashboard']}
    </h1>
  );
}

/**
 * Search, and the palette behind it.
 *
 * The field is a **button that looks like a field**, exactly as the design has
 * it — `readonly`, opens the palette on click or focus. The previous version
 * was a real input that ⌘K focused and that returned nothing, which taught a
 * reader that the shortcut was broken.
 */
export function Search({ role }: { role: Role }) {
  const messages = useMessages() as Messages;
  const shell = messages.console.shell;
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen(true);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div data-search className="relative max-w-[380px] flex-1">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-fg-subtle pointer-events-none absolute top-1/2 left-[11px] -translate-y-1/2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m16.5 16.5 4 4" />
      </svg>

      <input
        ref={input}
        readOnly
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        placeholder={shell.searchPlaceholder}
        aria-label={shell.searchLabel}
        className="bg-bg-subtle text-fg focus:bg-surface focus:border-brand-300 h-9 w-full cursor-text rounded-md border border-transparent pr-12 pl-[34px] text-sm outline-none"
      />

      <kbd className="text-fg-subtle bg-surface text-2xs pointer-events-none absolute top-1/2 right-[9px] -translate-y-1/2 rounded-xs border px-[5px] py-0.5 font-sans font-medium">
        ⌘K
      </kbd>

      {open ? (
        <CommandPalette
          role={role}
          onClose={() => {
            setOpen(false);
            input.current?.blur();
          }}
          labels={{
            placeholder: shell.cmdPlaceholder,
            modules: shell.cmdModules,
            none: shell.cmdNone,
            noneSub: shell.cmdNoneSub,
            goTo: shell.cmdGoTo,
            pending: shell.cmdPending,
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * What is waiting for a decision — three severities, and now the reader's own.
 *
 * `Smart Restaurant OS.dc.html:405-436`. Two things were wrong and they
 * compounded: the tray held four of the design's six rows, and it knew only two
 * severities, so the two quiet ones — a finished report, a missed shift — had
 * nowhere to sit and were simply absent. A tray in which every row is red or
 * amber is a tray somebody clears without reading, which is how the red one
 * that mattered gets cleared too.
 *
 * A row is a link, not a paragraph. Every one of these is about something a
 * reader then has to go and look at, and the design sends each to its own
 * module; a notification that names a cash variance and cannot take you to it
 * is a notification that has to be re-found by hand.
 *
 * The rows are the person's own now — `notificationFeed()` in the sibling
 * ./notifications-server.ts, read once by the layout — and the read state has
 * left the browser with them: `POST /api/notifications` forwards to the API, so
 * a bell cleared on a laptop is cleared on the phone. `feed.live` decides
 * whether anything is sent at all, because a console with no session draws the
 * design's sample tray, whose ids are catalogue keys rather than uuids.
 *
 * Words come from the row when it has them and from the catalogue when it does
 * not. The key names the KIND of thing and is what the console paints and
 * sorts; the sentence is what makes it worth reading, because "a cash variance"
 * and "minus thirty-two thousand on shift 41" are not the same notification and
 * no catalogue can hold the second.
 */
export function Notifications({ feed }: { feed: NotificationFeed }) {
  const m = (useMessages() as Messages).console;
  const lang = useLocale() as Lang;
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<readonly string[]>([]);
  const ref = useDismissable(open, () => setOpen(false));

  const unread = feed.items.filter((item) => !read.includes(item.id));

  /* The design's three: danger, warning, brand — and grey once it is read, so
     an opened tray still shows at a glance what is left. */
  const dot = (level: 'high' | 'mid' | 'low', isUnread: boolean) => {
    if (!isUnread) return 'bg-n-300';
    return level === 'high' ? 'bg-danger-500' : level === 'mid' ? 'bg-warning-500' : 'bg-brand-500';
  };

  /**
   * Grey the rows first, tell the server after.
   *
   * Waiting for the answer before the dot changes would put a quarter-second of
   * nothing on a control whose whole job is to be pressed and dismissed. When
   * the write fails the rows go back, which is the honest signal — they really
   * are still unread — and the line says so, because a tray that silently
   * refills on the next render reads as a bug in the bell.
   */
  const clear = async (ids: readonly string[], body: unknown) => {
    if (ids.length === 0) return;

    // Functional updates on both sides, so a second row pressed while the
    // first is still in flight does not overwrite it with the state this
    // render closed over.
    setRead((was) => [...was, ...ids]);

    if (!feed.live) return;

    const answer = await post('/api/notifications', body, lang);

    if (!answer.ok) {
      setRead((was) => was.filter((id) => !ids.includes(id)));
      flash.problem(answer.message ?? m.shell.notifFailed);
    }
  };

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        title={m.shell.notifications}
        aria-label={m.shell.notifications}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="bg-surface text-fg-muted hover:bg-bg-subtle hover:text-fg relative grid size-9 place-items-center rounded-md border"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
          <path d="M10.3 20a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        {unread.length > 0 ? (
          <span
            data-num
            className="bg-danger-500 border-surface rounded-pill text-3xs absolute -top-[5px] -right-[5px] grid h-[17px] min-w-[17px] place-items-center border-2 px-1 font-bold text-white"
          >
            {unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <Menu width={380}>
          <div className="border-divider flex items-center justify-between gap-3 border-b px-4 py-[13px]">
            <span className="text-sm font-semibold">{m.shell.notifications}</span>
            <button
              type="button"
              onClick={() =>
                void clear(
                  unread.map((item) => item.id),
                  { all: true },
                )
              }
              className="text-fg-brand text-xs font-semibold hover:underline"
            >
              {m.shell.markAllRead}
            </button>
          </div>

          <div data-scroll className="max-h-[400px]">
            {feed.items.map((item) => {
              const isUnread = !read.includes(item.id);
              /* `in` rather than an index-and-hope: a key the console has never
                 heard of is a row whose own sentence still draws, and reading
                 `.title` off undefined would take the whole shell down with it. */
              const copy =
                item.key in m.notification ? m.notification[item.key as NotificationKey] : null;
              const place = item.placeKey === null ? item.placeLabel : m.place[item.placeKey];

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  data-row
                  onClick={() => {
                    setOpen(false);
                    void clear(isUnread ? [item.id] : [], { id: item.id });
                  }}
                  className={`border-divider flex gap-3 border-b px-4 py-[13px] text-left ${
                    isUnread ? 'bg-brand-50' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className={`rounded-pill mt-1.5 size-2 flex-none ${dot(item.level, isUnread)}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm leading-[1.35] ${
                        isUnread ? 'font-semibold' : 'font-medium'
                      }`}
                    >
                      {item.title ?? copy?.title ?? item.key}
                    </span>
                    <span className="text-fg-muted mt-[3px] block text-xs leading-[1.4]">
                      {item.body ?? copy?.body ?? ''}
                    </span>
                    <span data-num className="text-fg-subtle text-2xs mt-[5px] block">
                      {item.time}
                      {place === null ? '' : ` · ${place}`}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="bg-bg-subtle px-4 py-[11px]">
            <span className="text-fg-subtle text-xs">{m.shell.notifFoot}</span>
          </div>
        </Menu>
      ) : null}
    </div>
  );
}

/**
 * Which venue the numbers are about — and, at last, a way to change it.
 *
 * This was a dropdown, then a label, and now it is a dropdown that works. The
 * middle step is worth recording because it is why the finished control is
 * shaped like this: picking a venue used to set React state and flash
 * "switched to Yunusobod", and then nothing — no cookie was written, `apiGet`
 * sent no `X-Branch`, and every figure on the page stayed whatever it had
 * been. An owner read one venue's takings under another venue's name, on every
 * screen in the console.
 *
 * What makes it real is three files rather than this one: `lib/branch-cookie.ts`
 * holds the choice, `lib/api-server.ts` sends it as `X-Branch` on every read,
 * and `lib/api-proxy.ts` sends it on every write — a write that arrived
 * unscoped would change the whole business while the screen showed one venue.
 *
 * ---------------------------------------------------------------------------
 * Three states, and only one of them is a control
 *
 *  - **A pinned person** (`branch_pinned` on `auth/context`) is scoped to
 *    their venue by the server whatever any header said. They get the label.
 *    Offering them the menu would be offering a choice the API answers with
 *    `branch.mismatch` — a 403 on every screen at once.
 *  - **One venue** is not a choice either. A control whose every option gives
 *    the same answer is worse than no control.
 *  - **Everybody else** gets the menu, including the row for the roll-up:
 *    "Barcha filiallar" is not an empty state, it is what an absent `X-Branch`
 *    means and it is what an owner comparing venues reads.
 *
 * ---------------------------------------------------------------------------
 * The server writes the cookie, and the router re-renders
 *
 * `POST /api/dashboard/branch` checks the slug against the restaurant's own
 * register before writing anything — a slug the API does not know would answer
 * 404 on every request in the console, from a cookie the reader cannot see.
 * Then `router.refresh()`, because every figure on the screen was rendered on
 * the server and none of it is in the browser to update.
 *
 * Not optimistic, unlike the intake switches. A switch can be put back; a
 * venue cannot be un-read, and half a second of the old numbers under the new
 * name is the exact confusion this control exists to end.
 */
export function BranchSwitcher({
  branches,
  activeSlug,
  canSwitch,
}: {
  branches: readonly BranchChoice[];
  activeSlug: string | null;
  canSwitch: boolean;
}) {
  const m = (useMessages() as Messages).console;
  const lang = useLocale() as Lang;
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));

  // No venues at all is a restaurant mid-setup, not a bug — and nothing to name.
  if (branches.length === 0) return null;

  const active = activeSlug === null ? undefined : branches.find((row) => row.slug === activeSlug);
  const only = branches.length === 1 ? branches[0] : undefined;
  const label = (active ?? only)?.name ?? m.shell.allVenues;

  const openable = canSwitch && branches.length > 1;

  async function choose(slug: string | null, name: string) {
    setOpen(false);

    if (slug === activeSlug) return;

    setBusy(true);

    const answer = await post<{ slug: string | null }>('/api/dashboard/branch', { slug }, lang);

    setBusy(false);

    if (!answer.ok) {
      /*
       * The demo console has no session, so the handler refuses and there is
       * nothing to switch. It keeps confirming, which is what
       * `session.live === false` on the shell already says about every figure
       * on the page.
       */
      if (answer.code === 'offline' || answer.code === 'not_signed_in') {
        flash(m.shell.branchSwitched.replace('{branch}', name));

        return;
      }

      flash.problem(answer.message ?? m.shell.branchFailed);

      return;
    }

    flash(m.shell.branchSwitched.replace('{branch}', name));
    // Every number on this page was rendered on the server against the old
    // venue. Nothing in the browser can update them; the server has to.
    router.refresh();
  }

  if (!openable) {
    return (
      <div className="flex-none">
        <span
          title={label}
          aria-label={`${m.shell.branchScope}: ${label}`}
          className="bg-surface text-fg flex h-9 items-center gap-2.5 rounded-md border px-3"
        >
          <span aria-hidden className="bg-success-500 rounded-pill size-[7px] flex-none" />
          <span data-branchlabel className="text-sm font-medium">
            {label}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        aria-expanded={open}
        aria-busy={busy}
        aria-label={`${m.shell.branchScope}: ${label}`}
        onClick={() => setOpen((value) => !value)}
        className="bg-surface text-fg hover:bg-bg-subtle flex h-9 items-center gap-2.5 rounded-md border px-3"
      >
        <span aria-hidden className="bg-success-500 rounded-pill size-[7px] flex-none" />
        <span data-branchlabel className="text-sm font-medium">
          {label}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-fg-subtle"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <Menu width={264}>
          <div className="p-1.5">
            {branches.map((branch) => (
              <button
                key={branch.slug}
                type="button"
                role="menuitem"
                onClick={() => void choose(branch.slug, branch.name)}
                className={`${MENU_ROW} hover:bg-bg-subtle ${
                  branch.slug === activeSlug ? 'bg-bg-subtle' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                {/*
                  The seat count, when the venue has one configured. Not a
                  fallback of zero: a branch nobody has sized is a branch with
                  no answer, and "0 o'rin" is a claim about the room.
                */}
                {branch.seats === null ? null : (
                  <span data-num className="text-fg-subtle text-2xs flex-none">
                    {branch.seats} {m.shell.seats}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/*
            The roll-up, under a rule rather than in the list, because it is not
            a venue. An absent `X-Branch` is every venue at once, and an owner
            comparing five branches reads exactly this row.
          */}
          <button
            type="button"
            role="menuitem"
            onClick={() => void choose(null, m.shell.allVenues)}
            className={`bg-bg-subtle hover:bg-bg-muted text-fg-brand w-full px-4 py-[11px] text-left text-xs font-semibold ${
              activeSlug === null ? 'underline' : ''
            }`}
          >
            {m.shell.allBranches}
          </button>
        </Menu>
      ) : null}
    </div>
  );
}

/**
 * Language and theme, in the one bordered group the design draws them in.
 *
 * The language writes a cookie and asks the router to re-render: the console is
 * server-rendered, so the switch has to reach the server or half the screen
 * would stay in the old language. The theme is client-only and needs no such
 * round trip.
 */
export function LanguageAndTheme() {
  const m = (useMessages() as Messages).console.shell;
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { here } = useLocalePath();

  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));

  function choose(next: Locale) {
    rememberLocale(next);
    setOpen(false);
    /*
     * The language's own URL, loaded as a document.
     *
     * `router.refresh()` was here and it was wrong twice over. It re-fetched
     * every server component and swapped them in place — on a phone that
     * measured 1327 ms of the old language sitting on screen — and it left the
     * address bar naming a language the page was no longer in, which is the
     * whole thing the move into the path was for.
     *
     * A client navigation cannot do this either: `<html lang>` is set by the
     * root layout from a request header, and root layouts do not re-render on
     * navigation. The document has to be the thing that changes.
     */
    const { search, hash } = window.location;

    window.location.assign(`${withLocale(here, next)}${search}${hash}`);
  }

  return (
    <div data-langtheme className="bg-surface flex h-9 flex-none items-center rounded-md border">
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-label={m.language}
          onClick={() => setOpen((value) => !value)}
          className="hover:bg-bg-subtle flex h-[34px] items-center gap-[7px] rounded-l-[9px] px-[11px]"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-fg-subtle"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3.2 9h17.6" />
            <path d="M3.2 15h17.6" />
            <path d="M12 3a15 15 0 0 1 0 18" />
            <path d="M12 3a15 15 0 0 0 0 18" />
          </svg>
          <span className="text-sm font-semibold tracking-wide">{locale.toUpperCase()}</span>
        </button>

        {open ? (
          <Menu width={190}>
            <div className="p-1.5">
              <div className="text-fg-subtle text-2xs tracking-caps px-2.5 pt-2 pb-1.5 font-semibold uppercase">
                {m.language}
              </div>

              {LANGUAGE_OPTIONS.map((option) => {
                const selected = option.code === locale;

                return (
                  <button
                    key={option.code}
                    type="button"
                    data-row
                    lang={option.code}
                    onClick={() => choose(option.code)}
                    className={`${MENU_ROW} ${selected ? 'bg-brand-50 text-brand-700' : ''}`}
                  >
                    <span className="text-fg-subtle text-2xs w-[26px] flex-none font-semibold tracking-wide">
                      {option.short}
                    </span>
                    <span className="flex-1">{option.label}</span>
                    {selected ? (
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Menu>
        ) : null}
      </div>

      <span aria-hidden className="bg-divider h-5 w-px flex-none" />

      <div className="flex items-center gap-0.5 px-[3px]">
        {(
          [
            ['light', m.light],
            ['dark', m.dark],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            data-seg
            data-active={resolvedTheme === mode ? 'true' : undefined}
            onClick={() => setTheme(mode)}
            title={label}
            aria-label={label}
            aria-pressed={resolvedTheme === mode}
            className="text-fg-subtle grid size-7 place-items-center rounded-[7px]"
          >
            {mode === 'light' ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Who is signed in.
 *
 * Name, initials and role arrive as props from the layout, which reads them off
 * the session. The menu does not decide who it is describing: while the console
 * knew only one role these came from the catalogue, which is what made every
 * account — a waiter's, a chef's — render as the owner's.
 *
 * The two links are filtered the same way the sidebar is. Offering *Sozlamalar*
 * to a waiter is offering a screen the middleware will turn them away from.
 */
export function AccountMenu({
  name,
  initials,
  roleId,
  nav,
}: {
  name: string;
  initials: string;
  roleId: RoleId;
  /** Which module rows this role holds, so the menu can drop what it lacks. */
  nav: readonly ModuleKey[];
}) {
  const messages = useMessages() as Messages;
  const m = messages.console.shell;
  const roleName = messages.console.roles[roleId].name;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="hover:bg-bg-muted flex h-[42px] items-center gap-2.5 rounded-md pr-2 pl-[5px]"
      >
        <span className="bg-brand-100 text-brand-700 rounded-pill grid size-8 flex-none place-items-center text-xs font-semibold">
          {initials}
        </span>
        <span data-rolelabel className="text-left">
          <span className="block text-sm leading-[1.15] font-semibold">{name}</span>
          <span className="text-fg-subtle text-2xs mt-px block">{roleName}</span>
        </span>
        <Chevron />
      </button>

      {open ? (
        <Menu width={260}>
          <div className="p-1.5">
            <div className="px-2.5 pt-2 pb-2">
              <div className="text-sm font-semibold">{name}</div>
              <div className="text-fg-subtle mt-px text-xs">{roleName}</div>
            </div>

            <div className="bg-divider mx-2.5 mb-1.5 h-px" />

            {nav.includes('staff') ? (
              <Link href="/staff" data-row onClick={() => setOpen(false)} className={MENU_ROW}>
                {m.profile}
              </Link>
            ) : null}
            {nav.includes('settings') ? (
              <Link href="/settings" data-row onClick={() => setOpen(false)} className={MENU_ROW}>
                {m.settings}
              </Link>
            ) : null}

            <div className="bg-divider mx-2.5 my-1.5 h-px" />

            {/* Revokes the token upstream and clears the httpOnly cookie, then
                lands on /login — which is now the design's own three-tab card
                rather than the scaffold form it used to be. A button, not a
                link: signing out is a request, and a link that quietly performs
                one is a link that a prefetch can fire. */}
            <button
              type="button"
              data-row
              onClick={async () => {
                setOpen(false);
                // Failure is already handled inside the handler: it clears the
                // cookie whether or not the API answered, so the worst case is
                // a token nobody holds. Either way this browser is signed out.
                await fetch(SESSION_ENDPOINT, { method: 'DELETE' }).catch(() => {});
                router.replace('/login');
                router.refresh();
              }}
              className={`${MENU_ROW} w-full text-left ${'text-danger-700'}`}
            >
              {m.signOut}
            </button>
          </div>
        </Menu>
      ) : null}
    </div>
  );
}

/**
 * Look at the console through another role's eyes.
 *
 * The design draws this in the top bar and then says plainly that it is a demo
 * affordance: in production the role comes from the session and this control is
 * not there. So it is not — the layout only renders it when a build sets
 * `NEXT_PUBLIC_DEMO_ROLES=1`, which is inlined at build time, so a production
 * bundle does not contain the branch at all.
 *
 * Writing the cookie is not enough on its own. The sidebar, the account block
 * and every dashboard are server-rendered from the session, so the choice has
 * to reach the server: `router.refresh()` re-runs the layout with the new
 * cookie set. A `useState` here would change the label and nothing else.
 *
 * The note under the heading says what this is, in the reader's language. A
 * privilege control that does not admit it is a demo is how a reviewer comes
 * away believing the client decides what a waiter may see.
 */
export function RoleSwitcher({ current }: { current: RoleId }) {
  const m = (useMessages() as Messages).console.roles;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));

  function choose(next: RoleId) {
    rememberRole(next);
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        title={m.switchLabel}
        aria-label={m.switchLabel}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="bg-surface text-fg-muted hover:bg-bg-subtle hover:text-fg grid size-9 place-items-center rounded-md border"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 8h13l-3-3" />
          <path d="M20 16H7l3 3" />
        </svg>
      </button>

      {open ? (
        <Menu width={286}>
          <div className="p-1.5">
            <div className="text-fg-subtle tracking-caps text-2xs px-2.5 pt-2 pb-1.5 font-semibold uppercase">
              {m.switchHead}
            </div>

            {ROLE_LIST.map((role) => {
              const selected = role.id === current;

              return (
                <button
                  key={role.id}
                  type="button"
                  data-row
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => choose(role.id)}
                  className={`${MENU_ROW} ${selected ? 'bg-brand-50 text-brand-700' : ''}`}
                >
                  <span
                    aria-hidden
                    className="bg-bg-muted text-fg-muted rounded-pill text-2xs grid size-7 flex-none place-items-center font-semibold"
                  >
                    {role.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m[role.id].name}</span>
                    <span className="text-fg-subtle text-2xs mt-px block truncate">
                      {role.person}
                    </span>
                  </span>
                </button>
              );
            })}

            <div className="bg-divider mx-2.5 my-1.5 h-px" />

            <p className="text-fg-subtle text-2xs px-2.5 pt-0.5 pb-1.5 leading-[1.45]">
              {m.switchNote}
            </p>
          </div>
        </Menu>
      ) : null}
    </div>
  );
}

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-fg-subtle flex-none"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
