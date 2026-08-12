'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useTheme } from '@/components/providers/theme-provider';
import { LANGUAGE_OPTIONS, type Locale } from '@/i18n';
import { rememberLocale } from '@/i18n/locale';

import { PAGE_TITLE_KEYS, type AdminNavItem } from './nav';

/**
 * The parts of the platform shell that need to know where the user is.
 *
 * Kept to the minimum: a link that can mark itself current, the top bar's
 * title, and the language and theme controls. Everything else in the shell is
 * static markup and stays on the server.
 */

/** `/tenants` stays lit while a restaurant's own page is open. */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ item, label }: { item: AdminNavItem; label: string }) {
  const pathname = usePathname();
  const active = isCurrent(pathname, item.href);

  return (
    <Link
      href={item.href}
      data-navitem
      data-active={active}
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
        {label}
      </span>

      {item.badge ? (
        <span
          data-navlabel
          data-num
          className={`rounded-pill text-2xs ml-auto px-[7px] py-0.5 font-semibold ${item.badge.tone}`}
        >
          {item.badge.text}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The top bar's heading.
 *
 * Derived from the route rather than passed down: the longest matching prefix
 * wins, so `/settings/email` keeps the settings title while `/tenants/smart`
 * keeps the restaurants one.
 */
export function PageTitle() {
  const pathname = usePathname();
  const nav = useTranslations('platform.nav');

  const match = Object.keys(PAGE_TITLE_KEYS)
    .filter((href) => isCurrent(pathname, href))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <h1 className="font-display tracking-snug text-lg font-semibold whitespace-nowrap">
      {match ? nav(PAGE_TITLE_KEYS[match]!) : 'Platforma'}
    </h1>
  );
}

/**
 * Close on an outside click or Escape.
 *
 * `mousedown` rather than `click`, so pressing outside dismisses immediately
 * rather than after the button releases — the same feel as the design's own
 * menus.
 */
function useDismissable(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
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

const SEG = 'grid size-7 place-items-center rounded-[7px] text-fg-subtle';

/**
 * Language and theme, in one bordered box, as the design draws them.
 *
 * The language is a cookie the server reads, so switching it has to come back
 * from the server — `router.refresh()` re-runs the layout with the new cookie
 * set. A client-side swap would leave every server-rendered page behind.
 *
 * Theme is two segments rather than one toggle: a single toggle makes the user
 * read the icon to work out which way it goes.
 */
export function LanguageAndTheme() {
  const t = useTranslations('platform.shell');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));

  function choose(next: Locale) {
    rememberLocale(next);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="bg-surface flex h-9 flex-none items-center rounded-md border">
      <div ref={ref} className="relative flex-none">
        <button
          type="button"
          aria-expanded={open}
          aria-label={t('language')}
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
          <div className="bg-surface-raised absolute top-11 right-0 z-60 w-[190px] rounded-lg border p-1.5 shadow-xl">
            <div className="text-fg-subtle text-2xs tracking-caps px-2.5 pt-2 pb-1.5 font-semibold uppercase">
              {t('language')}
            </div>

            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.code}
                type="button"
                data-row
                onClick={() => choose(option.code)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 ${
                  option.code === locale ? 'bg-brand-50 text-brand-700' : ''
                }`}
              >
                <span className="text-fg-subtle text-2xs w-[26px] font-semibold tracking-wide">
                  {option.short}
                </span>
                <span className="flex-1 text-left text-sm font-medium">{option.label}</span>
                {option.code === locale ? (
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
            ))}
          </div>
        ) : null}
      </div>

      <span aria-hidden className="bg-divider h-5 w-px flex-none" />

      <div className="flex flex-none items-center gap-0.5 px-[3px]">
        <button
          type="button"
          data-seg
          data-active={resolvedTheme === 'light'}
          onClick={() => setTheme('light')}
          title={t('light')}
          aria-label={t('light')}
          aria-pressed={resolvedTheme === 'light'}
          className={SEG}
        >
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
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
          </svg>
        </button>

        <button
          type="button"
          data-seg
          data-active={resolvedTheme === 'dark'}
          onClick={() => setTheme('dark')}
          title={t('dark')}
          aria-label={t('dark')}
          aria-pressed={resolvedTheme === 'dark'}
          className={SEG}
        >
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
        </button>
      </div>
    </div>
  );
}
