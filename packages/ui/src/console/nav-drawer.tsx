'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

/**
 * A console rail that becomes a drawer on a narrow screen.
 *
 * Three shells need exactly this — the restaurant console, the platform console
 * and the seller panel — and all three began the same way: the stylesheet hid
 * the rail below 820px and nothing took its place, so every screen behind it
 * was reachable only by typing a URL.
 *
 * It lives here rather than three times over because the parts that are easy to
 * get subtly wrong are the parts that would drift: closing on navigation,
 * closing on Escape, and a backdrop that is a sibling of the panel rather than
 * its parent.
 *
 * The open flag is a module store, not component state. The button is in the
 * top bar and the panel is in the sidebar, and the layout between them is a
 * server component: it cannot hand a client child a setter, and wrapping the
 * shell in a provider would turn the whole header into client code to carry one
 * boolean.
 *
 * `next/navigation` is deliberately not imported — this package does not depend
 * on Next — so the surface passes its own pathname as `closeOn`.
 */
let open = false;
const listeners = new Set<() => void>();

/*
 * Where the keyboard was when the drawer opened.
 *
 * A drawer that slides in over the page but leaves the caret behind it is a
 * drawer only a mouse can use: the next Tab goes to whatever the button was
 * next to, underneath the panel. Focus moves in on open and comes back to the
 * button on close, which is also what tells a screen reader the panel is now
 * the thing being read.
 */
let opener: HTMLElement | null = null;

function setOpen(next: boolean) {
  if (open === next) return;

  open = next;
  for (const listener of listeners) listener();

  if (typeof window === 'undefined') return;

  window.requestAnimationFrame(() => {
    if (next) {
      const panel = document.querySelector('[data-nav][data-open], [data-mrail][data-open]');
      panel?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
      return;
    }

    opener?.focus();
    opener = null;
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

const read = () => open;
/* Closed on the server, always — there is no viewport up there to be narrow. */
const readServer = () => false;

/** The hamburger, for the top bar. CSS hides it wherever the rail is visible. */
export function NavMenuButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      data-nav-open
      onClick={(event) => {
        opener = event.currentTarget;
        setOpen(true);
      }}
      aria-label={label}
      /* 44 square. It is drawn only below 820px, where the reader is holding
         the screen, so there is no width at which this is too big. */
      className="text-fg-muted hover:bg-bg-muted grid size-11 flex-none place-items-center rounded-md"
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

/**
 * Whether the drawer is open, with the behaviour that goes with it.
 *
 * Exported on its own because the two consoles share a rail of icons and the
 * seller panel does not: its rows are words, so the console's 76px collapse
 * would leave it a column of clipped text. That surface draws its own `<aside>`
 * under its own attribute and takes only the behaviour from here.
 *
 * `closeOn` is whatever changes when the reader goes somewhere — a pathname.
 */
export function useNavDrawer(closeOn: string): boolean {
  const shown = useSyncExternalStore(subscribe, read, readServer);

  /*
   * Navigating closes it — the whole point of having tapped a row. This is an
   * effect writing to an external store rather than to state, which is what an
   * effect is for.
   */
  useEffect(() => {
    setOpen(false);
  }, [closeOn]);

  useEffect(() => {
    if (!shown) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown]);

  return shown;
}

/** The sheet of dark behind an open drawer. Renders nothing when it is shut. */
export function NavBackdrop({ shown }: { shown: boolean }) {
  if (!shown) return null;

  return (
    <div
      data-nav-backdrop
      onClick={() => setOpen(false)}
      role="presentation"
      className="fixed inset-0 z-[90]"
      style={{ background: 'rgba(15,19,32,.45)' }}
    />
  );
}

/** The whole thing, for a rail that wears the consoles' `[data-nav]` rules. */
export function NavDrawer({
  children,
  closeOn,
  className = 'bg-surface flex flex-none flex-col overflow-hidden border-r',
}: {
  children: ReactNode;
  closeOn: string;
  className?: string;
}) {
  const shown = useNavDrawer(closeOn);

  return (
    <>
      <NavBackdrop shown={shown} />

      <aside data-nav data-open={shown ? 'true' : undefined} className={className}>
        {children}
      </aside>
    </>
  );
}
