'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The menu's toolbar and its sticky category rail — `dc.html:253-283`.
 *
 * The page had a flat wrap of anchor pills and no search at all. On a menu nine
 * headings long that is the difference between a reader finding the plov and a
 * reader scrolling past the salads twice.
 *
 * ---------------------------------------------------------------------------
 * It filters the DOM it is given, rather than owning a list
 *
 * The dish rows are server HTML — that is the reason this page is a server
 * component, and it is what a crawler and a reader with scripting off get. So
 * the island hides rows that do not match instead of re-rendering a list of its
 * own: the markup a crawler reads is unchanged, the first paint is the whole
 * menu, and the filter is an enhancement that simply is not there when the
 * script does not run.
 *
 * **One departure from the design, on purpose.** The design's rail *selects* a
 * category — pick one and the other eight vanish. Here it scrolls to the
 * heading and highlights whichever is in view. A prototype can hide four fifths
 * of a restaurant's menu on first paint; a page that is opened from a search
 * result cannot, because the reader arrived looking for a dish and has not
 * touched anything yet. The chips and the search box filter, which is where
 * that behaviour belongs.
 */
export function MenuBrowser({
  categories,
  labels,
  cheapUnderTiyin,
  children,
}: {
  categories: readonly { id: string; name: string; count: number }[];
  labels: {
    search: string;
    all: string;
    hit: string;
    available: string;
    cheap: string;
    found: string;
    empty: string;
    emptySub: string;
    emptyCta: string;
  };
  /** The chip's threshold, in tiyin, so the label and the test agree. */
  cheapUnderTiyin: number;
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<'all' | 'hit' | 'available' | 'cheap'>('all');
  const [found, setFound] = useState<number | null>(null);
  const [seen, setSeen] = useState<string | null>(null);

  /* Read by the effect below, which must not re-subscribe on every keystroke. */
  const state = useRef({ query, chip });

  const apply = (nextQuery: string, nextChip: typeof chip) => {
    const needle = nextQuery.trim().toLowerCase();
    let matched = 0;

    for (const row of document.querySelectorAll<HTMLElement>('[data-dish]')) {
      const hit =
        (needle === '' || (row.dataset.dish ?? '').includes(needle)) &&
        (nextChip === 'all' ||
          (nextChip === 'hit' && row.dataset.hit === '1') ||
          (nextChip === 'available' && row.dataset.soldout !== '1') ||
          (nextChip === 'cheap' && Number(row.dataset.price ?? 0) < cheapUnderTiyin));

      row.hidden = !hit;

      if (hit) matched += 1;
    }

    /* A heading over nothing reads as a category that failed to load. */
    for (const section of document.querySelectorAll<HTMLElement>('[data-category]')) {
      section.hidden =
        section.querySelectorAll<HTMLElement>('[data-dish]:not([hidden])').length === 0;
    }

    state.current = { query: nextQuery, chip: nextChip };
    setFound(needle === '' && nextChip === 'all' ? null : matched);
  };

  const clear = () => {
    setQuery('');
    setChip('all');
    apply('', 'all');
  };

  /*
   * Which heading the reader is actually looking at.
   *
   * `rootMargin` pins the trigger line just under the sticky header rather than
   * at the viewport's top edge, so a heading counts as "current" from the
   * moment it clears the bar — which is where a reader's eye already is.
   */
  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('[data-category]')];

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);

        if (visible.length > 0) setSeen(visible[0]!.target.id.replace(/^c-/, ''));
      },
      { rootMargin: '-88px 0px -70% 0px' },
    );

    for (const section of sections) observer.observe(section);

    return () => {
      observer.disconnect();

      /* Leave nothing hidden behind when the island goes away. */
      for (const row of document.querySelectorAll<HTMLElement>('[data-dish]')) row.hidden = false;
      for (const section of sections) section.hidden = false;
    };
  }, []);

  const CHIPS = [
    ['all', labels.all],
    ['hit', labels.hit],
    ['available', labels.available],
    ['cheap', labels.cheap],
  ] as const;

  return (
    <>
      <div className="mt-5.5 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[420px]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
            className="text-fg-subtle pointer-events-none absolute top-3.5 left-3.5"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>

          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              apply(event.target.value, chip);
            }}
            placeholder={labels.search}
            aria-label={labels.search}
            type="search"
            className="border-border-strong bg-surface h-11 w-full rounded-md border pr-3.5 pl-9.5 text-sm"
          />
        </div>

        {CHIPS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={chip === key}
            onClick={() => {
              setChip(key);
              apply(query, key);
            }}
            className={`h-9 flex-none rounded-full border px-3.5 text-[13px] font-semibold ${
              chip === key
                ? 'border-acc bg-acc-soft text-acc-dark'
                : 'border-border bg-surface text-fg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-8 lg:[grid-template-columns:206px_minmax(0,1fr)]">
        <nav aria-label={labels.all} className="sticky top-24 hidden gap-0.5 lg:grid">
          {categories.map((category) => (
            <a
              key={category.id}
              href={`#c-${category.id}`}
              aria-current={seen === category.id}
              className={`flex h-10 items-center justify-between gap-2.5 rounded-md px-3.5 text-sm font-medium ${
                seen === category.id ? 'bg-acc-soft text-acc-dark' : 'text-fg-muted'
              }`}
            >
              <span className="truncate">{category.name}</span>
              <span data-num className="text-fg-subtle flex-none text-xs">
                {category.count}
              </span>
            </a>
          ))}
        </nav>

        <div>
          {found === null ? null : (
            <p data-num role="status" className="text-fg-subtle mb-3 text-sm">
              {labels.found.replace('{count}', String(found))}
            </p>
          )}

          {found === 0 ? (
            <div className="border-border bg-surface rounded-lg border px-6 py-12 text-center">
              <p className="text-md font-semibold">{labels.empty}</p>
              <p className="text-fg-subtle mx-auto mt-1.5 max-w-[42ch] text-sm leading-normal">
                {labels.emptySub}
              </p>
              <button
                type="button"
                onClick={clear}
                className="border-border-strong mt-4 h-10 rounded-md border px-4 text-sm font-semibold"
              >
                {labels.emptyCta}
              </button>
            </div>
          ) : null}

          {children}
        </div>
      </div>
    </>
  );
}
