'use client';

import { useRouter } from 'next/navigation';
import { useMessages } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Messages } from '@/i18n';
import { MODULE_PATHS, type ModuleKey, type Role } from '@/lib/roles';

import { NAV_ITEMS } from './nav';

/**
 * ⌘K, and it opens something.
 *
 * The console advertised the shortcut on a `<kbd>` and used it to focus a
 * search box that had no results — a key that promises one thing and does
 * another, which the old comment beside it argued was better than nothing. It
 * was not: the design draws a palette (`cmdOpen`, `cmdGroups`), the field in
 * the top bar is `readonly` there and exists only to open it, and a reader who
 * presses ⌘K and gets a cursor learns the shortcut is broken.
 *
 * **What it searches is what this console can honestly answer for.** The
 * modules are here in the browser — names, paths, the role's own allowlist —
 * so jumping between them works today and works offline. Orders, tables,
 * dishes and people need `GET /api/v1/search?q=`, which does not exist; the
 * palette says so under its own empty state rather than silently returning
 * nothing and reading as broken.
 *
 * Rows a role does not hold never appear. The sidebar filter is presentation,
 * but a palette that offered a waiter a jump to Finance would be a palette
 * teaching them the console is inconsistent — the route guard would bounce them
 * straight back.
 */
export function CommandPalette({
  onClose,
  role,
  labels,
}: {
  onClose: () => void;
  role: Role;
  labels: {
    placeholder: string;
    modules: string;
    none: string;
    noneSub: string;
    goTo: string;
    pending: string;
  };
}) {
  const router = useRouter();
  const nav = (useMessages() as Messages).console.nav as Record<string, string>;

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const field = useRef<HTMLInputElement>(null);

  /*
   * Remounted on every open rather than reset in an effect.
   *
   * The shell renders `<CommandPalette open={…}>` and returns null when closed,
   * so state does not survive a close — which is what a palette should do: one
   * that remembers last night's query is one more thing to clear before it is
   * useful. Doing the same with a `setState` in an effect would be a render
   * that writes state, which React may run twice.
   */

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return NAV_ITEMS.filter((item) => role.nav.includes(item.key))
      .map((item) => ({
        key: item.key,
        label: nav[item.key] ?? item.key,
        href: MODULE_PATHS[item.key as ModuleKey],
      }))
      .filter((row) => needle === '' || row.label.toLowerCase().includes(needle));
  }, [query, role, nav]);

  /* Focus only — the state is fresh because the component is fresh. */
  useEffect(() => {
    field.current?.focus();
  }, []);

  /*
   * A ref, so the key handler is bound once. Re-binding on every keystroke is
   * how a keypress lands in the gap between remove and add.
   */
  const latest = useRef({ rows, cursor, onClose, router });

  useEffect(() => {
    latest.current = { rows, cursor, onClose, router };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = latest.current;

      if (event.key === 'Escape') {
        event.preventDefault();
        state.onClose();

        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursor((n) => Math.min(state.rows.length - 1, n + 1));

        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor((n) => Math.max(0, n - 1));

        return;
      }

      if (event.key === 'Enter') {
        const row = state.rows[state.cursor];
        if (row === undefined) return;

        event.preventDefault();
        state.onClose();
        state.router.push(row.href);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      data-fade
      className="fixed inset-0 z-[240] flex items-start justify-center px-6 pt-[12vh]"
      style={{ background: 'rgba(15,19,32,.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.placeholder}
        onClick={(event) => event.stopPropagation()}
        data-sheet
        className="bg-surface-raised w-full max-w-[560px] overflow-hidden rounded-xl border shadow-xl"
      >
        <div className="border-divider flex items-center gap-3 border-b px-5 py-3.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-fg-subtle flex-none"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4 4" />
          </svg>

          <input
            ref={field}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            className="min-w-0 flex-1 bg-transparent text-lg outline-none"
          />

          <kbd className="text-fg-subtle bg-surface text-2xs rounded-xs border px-[5px] py-0.5 font-sans font-medium">
            ESC
          </kbd>
        </div>

        <div data-scroll className="max-h-[52vh] overflow-y-auto p-2">
          {rows.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-semibold">{labels.none}</p>
              <p className="text-fg-subtle mt-1.5 text-xs leading-normal">{labels.noneSub}</p>
            </div>
          ) : (
            <>
              <div className="text-2xs tracking-caps text-fg-subtle px-3 pt-1.5 pb-1 font-semibold uppercase">
                {labels.modules}
              </div>

              <ul>
                {rows.map((row, index) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => {
                        onClose();
                        router.push(row.href);
                      }}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm ${
                        index === cursor ? 'bg-bg-muted' : ''
                      }`}
                    >
                      <span className="text-fg-subtle w-4 flex-none" aria-hidden>
                        →
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
                      <span className="text-fg-subtle flex-none text-xs">{labels.goTo}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* What it cannot answer for, said once at the foot. */}
          <p className="text-fg-subtle border-divider mt-2 border-t px-3 py-2.5 text-xs leading-normal">
            {labels.pending}
          </p>
        </div>
      </div>
    </div>
  );
}
