'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale, useMessages } from 'next-intl';

import { useTheme } from '@/components/providers/theme-provider';
import { LANGUAGE_OPTIONS, type Locale, type Messages } from '@/i18n';
import { rememberLocale } from '@/i18n/locale';
import { rememberRole } from '@/lib/role-cookie';
import { ROLE_LIST, type ModuleKey, type RoleId } from '@/lib/roles';

import { NAV_ITEMS, type NavItem } from './nav';
import { BRANCHES, NOTIFICATIONS } from './shell-data';

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
  const pathname = usePathname();
  const nav = (useMessages() as Messages).console.nav;

  // Exact match only. `/finance` and `/finance/till` are two rows in the same
  // group, and a prefix match would light both up at once.
  const active = pathname === item.href;

  return (
    <Link
      href={item.href}
      data-navitem
      data-active={active ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      className="text-fg-muted flex h-10 items-center gap-3 rounded-md px-2.5 text-sm font-medium"
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
  const pathname = usePathname();
  const nav = (useMessages() as Messages).console.nav;

  const match =
    NAV_ITEMS.find((item) => item.href === pathname) ??
    NAV_ITEMS.find((item) => pathname.startsWith(`${item.href}/`));

  return (
    <h1 className="font-display tracking-snug truncate text-lg leading-[1.2] font-semibold">
      {nav[match?.key ?? 'dashboard']}
    </h1>
  );
}

/**
 * Search, with the shortcut the design advertises.
 *
 * ⌘K focuses the field rather than opening a palette: the design draws a field,
 * and a key that promises one thing and does another is worse than no key.
 */
export function Search() {
  const shell = (useMessages() as Messages).console.shell;
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
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

      {/* TODO(api): GET /api/v1/search?q= — orders, tables, menu, customers.
          Typing works; the result sheet lands with the endpoint. */}
      <input
        ref={input}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={shell.searchPlaceholder}
        aria-label={shell.searchLabel}
        className="bg-bg-subtle text-fg focus:bg-surface focus:border-brand-300 h-9 w-full rounded-md border border-transparent pr-12 pl-[34px] text-sm outline-none"
      />

      <kbd className="text-fg-subtle bg-surface text-2xs pointer-events-none absolute top-1/2 right-[9px] -translate-y-1/2 rounded-xs border px-[5px] py-0.5 font-sans font-medium">
        ⌘K
      </kbd>
    </div>
  );
}

/** What is waiting for a decision, oldest last. */
export function Notifications() {
  const m = (useMessages() as Messages).console;
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<readonly string[]>([]);
  const ref = useDismissable(open, () => setOpen(false));

  const unread = NOTIFICATIONS.filter((item) => !read.includes(item.key));

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
              onClick={() => setRead(NOTIFICATIONS.map((item) => item.key))}
              className="text-fg-brand text-xs font-semibold hover:underline"
            >
              {m.shell.markAllRead}
            </button>
          </div>

          <div data-scroll className="max-h-[400px]">
            {NOTIFICATIONS.map((item) => {
              const isUnread = !read.includes(item.key);
              const copy = m.notification[item.key];

              return (
                <div
                  key={item.key}
                  data-row
                  className={`border-divider flex gap-3 border-b px-4 py-[13px] ${
                    isUnread ? 'bg-bg-subtle' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className={`rounded-pill mt-1.5 size-2 flex-none ${
                      item.level === 'high' ? 'bg-danger-500' : 'bg-warning-500'
                    } ${isUnread ? '' : 'opacity-30'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm leading-[1.35] ${
                        isUnread ? 'font-semibold' : 'font-medium'
                      }`}
                    >
                      {copy.title}
                    </span>
                    <span className="text-fg-muted mt-[3px] block text-xs leading-[1.4]">
                      {copy.body}
                    </span>
                    <span data-num className="text-fg-subtle text-2xs mt-[5px] block">
                      {item.time} · {m.place[item.place]}
                    </span>
                  </span>
                </div>
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
 * Which venue the numbers are about.
 *
 * TODO(api): the list and the active branch come from
 * GET /api/v1/auth/context, which returns `branch` and `branch_pinned`; picking
 * one sets the X-Branch header for every later request. Until then this holds
 * the design's five and remembers the choice locally, so the control behaves
 * the way it will once it is wired.
 */
export function BranchSwitcher() {
  const m = (useMessages() as Messages).console;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(BRANCHES[0].id);
  const ref = useDismissable(open, () => setOpen(false));

  const current = BRANCHES.find((branch) => branch.id === active) ?? BRANCHES[0];

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        title={current.name}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="bg-surface text-fg hover:bg-bg-subtle flex h-9 items-center gap-2.5 rounded-md border pr-2.5 pl-3"
      >
        <span aria-hidden className="bg-success-500 rounded-pill size-[7px] flex-none" />
        <span data-branchlabel className="text-sm font-medium">
          {current.name}
        </span>
        <Chevron />
      </button>

      {open ? (
        <Menu width={272}>
          <div className="p-1.5">
            <div className="text-fg-subtle text-2xs tracking-caps px-2.5 pt-2 pb-1.5 font-semibold uppercase">
              {m.shell.branchHead}
            </div>

            {BRANCHES.map((branch) => {
              const selected = branch.id === active;

              return (
                <button
                  key={branch.id}
                  type="button"
                  data-row
                  onClick={() => {
                    setActive(branch.id);
                    setOpen(false);
                  }}
                  className={`${MENU_ROW} ${selected ? 'bg-brand-50 text-brand-700' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{branch.name}</span>
                    <span data-num className="text-fg-subtle text-2xs mt-px block">
                      {m.city[branch.city]} · {branch.seats} {m.shell.seats}
                    </span>
                  </span>
                  <span data-num className="text-fg-subtle flex-none text-xs font-semibold">
                    {branch.revenue}
                  </span>
                </button>
              );
            })}

            <div className="bg-divider mx-2.5 my-1.5 h-px" />

            <Link
              href="/settings/branches"
              data-row
              onClick={() => setOpen(false)}
              className={`${MENU_ROW} text-fg-brand`}
            >
              {m.shell.allBranches}
            </Link>
          </div>
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

  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));

  function choose(next: Locale) {
    rememberLocale(next);
    setOpen(false);
    // The console is server-rendered, so the new language has to come back from
    // the server; refreshing re-runs the layout with the cookie now set.
    router.refresh();
  }

  return (
    <div className="bg-surface flex h-9 flex-none items-center rounded-md border">
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
                await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
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
