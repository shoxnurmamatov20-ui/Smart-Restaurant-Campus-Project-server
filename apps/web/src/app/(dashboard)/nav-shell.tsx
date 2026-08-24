'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

/**
 * The sidebar's two missing behaviours: a collapse control and a way back.
 *
 * **Collapse.** The design puts a control beside Settings at the foot of the
 * rail and the console had none — the rail narrowed at 1200px and there was no
 * way to narrow it on purpose. A manager working on a 1440px screen with a
 * wide table open wants the 76px rail, and the browser cannot know that.
 * Remembered in `localStorage`, because a preference that resets on every
 * navigation is not a preference.
 *
 * **The drawer.** Below 820px the stylesheet hid the sidebar and nothing
 * replaced it: the whole console became unreachable except by typing a URL.
 * That is the more serious of the two. The same rail slides in over the page,
 * closes on Escape, on the backdrop, and — the one that actually matters — on
 * navigating, because a drawer that stays open over the screen you just asked
 * for is a drawer nobody uses twice.
 */
const KEY = 'srcp.nav.collapsed';

/*
 * The collapse preference, read through the same subscription shape.
 *
 * `useSyncExternalStore` rather than a mount effect: it gives React a server
 * snapshot (`false` — there is no viewport up there) and a client snapshot, so
 * the first paint matches without a render that writes its own state. It also
 * gets cross-tab sync for nothing, which is the right behaviour — a console
 * open twice should not disagree with itself about the rail.
 */
let collapsedSnapshot: boolean | null = null;
const collapsedListeners = new Set<() => void>();

function readCollapsed(): boolean {
  if (collapsedSnapshot === null) {
    try {
      collapsedSnapshot = window.localStorage.getItem(KEY) === '1';
    } catch {
      collapsedSnapshot = false;
    }
  }

  return collapsedSnapshot;
}

const readCollapsedServer = () => false;

function subscribeCollapsed(listener: () => void): () => void {
  collapsedListeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;

    collapsedSnapshot = event.newValue === '1';
    listener();
  };

  window.addEventListener('storage', onStorage);

  return () => {
    collapsedListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function setCollapsedPreference(next: boolean) {
  collapsedSnapshot = next;

  try {
    window.localStorage.setItem(KEY, next ? '1' : '0');
  } catch {
    /* Private mode. The rail still collapses for this visit. */
  }

  for (const listener of collapsedListeners) listener();
}

/*
 * The drawer's open state, in a module store.
 *
 * The button lives in the top bar and the drawer lives in the sidebar, and the
 * layout between them is a server component — it cannot hand a client one a
 * setter, and wrapping the whole shell in a provider to carry one boolean would
 * turn the header and the rail into client components for it. A three-line
 * store is the smaller cost, and it is the same pattern the POS queue and the
 * guest basket use.
 */
let drawerOpen = false;
const drawerListeners = new Set<() => void>();

function setDrawer(next: boolean) {
  if (drawerOpen === next) return;

  drawerOpen = next;
  for (const listener of drawerListeners) listener();
}

function subscribeDrawer(listener: () => void): () => void {
  drawerListeners.add(listener);

  return () => {
    drawerListeners.delete(listener);
  };
}

const readDrawer = () => drawerOpen;
/* Closed on the server, always — there is no viewport to be narrow. */
const readDrawerServer = () => false;

/** The hamburger, for the top bar. Hidden by CSS wherever the rail is visible. */
export function NavMenuButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      data-nav-open
      onClick={() => setDrawer(true)}
      aria-label={label}
      className="text-fg-muted hover:bg-bg-muted grid size-9 flex-none place-items-center rounded-md"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </svg>
    </button>
  );
}

export function NavShell({
  children,
  labels,
}: {
  children: ReactNode;
  labels: { collapse: string; expand: string };
}) {
  const pathname = usePathname();

  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, readCollapsedServer);
  const open = useSyncExternalStore(subscribeDrawer, readDrawer, readDrawerServer);

  /*
   * Navigating closes the drawer — the whole point of having tapped a row.
   *
   * `setDrawer` writes a module variable rather than component state, so this
   * is an effect updating an external system — which is exactly what an effect
   * is for.
   */
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(false);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = () => setCollapsedPreference(!collapsed);

  return (
    <>
      {open ? (
        <div
          data-nav-backdrop
          onClick={() => setDrawer(false)}
          role="presentation"
          className="fixed inset-0 z-[90]"
          style={{ background: 'rgba(15,19,32,.45)' }}
        />
      ) : null}

      <aside
        data-nav
        data-collapsed={collapsed ? 'true' : undefined}
        data-open={open ? 'true' : undefined}
        className="bg-surface flex flex-none flex-col overflow-hidden border-r"
      >
        {children}

        <div className="border-divider flex-none border-t px-3 py-2">
          <button
            type="button"
            data-press
            onClick={toggle}
            aria-label={collapsed ? labels.expand : labels.collapse}
            title={collapsed ? labels.expand : labels.collapse}
            className="text-fg-subtle hover:bg-bg-muted flex h-10 w-full items-center gap-3 rounded-md px-2.5 text-sm font-medium"
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
              style={{ transform: collapsed ? 'rotate(180deg)' : undefined }}
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span data-navlabel className="truncate">
              {collapsed ? labels.expand : labels.collapse}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
