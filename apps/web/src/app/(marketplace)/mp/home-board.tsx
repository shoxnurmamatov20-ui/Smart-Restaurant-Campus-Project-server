'use client';

import { StoreBadges } from '@/components/store-badges';

import Link from 'next/link';
import { useRef, useState } from 'react';

import { flash } from '@restaurant/ui';

import { som } from '../../(guest)/guest-session';
import { useChosenAddress } from '../mp-address';
import { MpChrome } from '../mp-chrome';
import { PlusSheet } from '../mp-modals';
import { fill, t } from '@restaurant/surfaces/mp/copy';
import {
  CUISINES,
  FILTER_DOT,
  FILTERS,
  PHASES,
  PROMO_BANNERS,
  RAILS,
  say,
  STORES,
  VERTICALS,
  WHY_COUNT,
  type FilterKey,
  type Lang,
  type Store,
  type Trilingual,
} from '@restaurant/surfaces/mp/data';

/**
 * Screen 1 of 4 — discovery.
 *
 * The design's home is two columns: a fifteen-row vertical rail on the left,
 * and on the right everything a guest scrolls — cuisines, filters, two banners,
 * the grid, "near you", three rails, and the pair of cards explaining why the
 * platform exists and why fourteen of the fifteen verticals are not open yet.
 *
 * **The rail is the argument, not a menu.** Four verticals carry counts and
 * eleven say "Tez orada"; the card at the bottom of the page explains that a
 * pharmacy needs a licence and alcohol needs age checks. Shipping only the four
 * live rows would have left that paragraph talking about something invisible.
 *
 * **Search is real and it can fail.** A marketplace whose search box always
 * returns something is a marketplace that quietly drops the query; this one
 * counts the hits in the subtitle and draws the design's own empty panel when
 * there are none, with the button that gets the guest out of it.
 *
 * **A closed restaurant stays on the list, dimmed and labelled.** Hiding it
 * makes a guest who came for Shashlik Markazi think the platform does not have
 * it; showing it closed tells them to come back at five, which is the outcome
 * the marketplace wants. Tapping it says so rather than opening a menu that
 * cannot be ordered from.
 */
export function MpHomeBoard({
  lang,
  basket,
  apkHref,
  stores = STORES,
}: {
  lang: Lang;
  basket: string;
  /** The published APK, read by `page.tsx` on the server; null until one exists. */
  apkHref: string | null;
  /**
   * The live directory, read by `page.tsx` through `mp-server.ts`.
   *
   * Defaulted to the fixture rather than required, and that is what keeps this
   * board honest about what it is: the marketplace has to render for somebody
   * whose connection dropped between the shop window and the basket, and a
   * component that threw without data would take the whole page with it.
   *
   * The rails below still read `RAILS` — a curated row is an editorial choice
   * the API does not make yet, so it is looked up against whatever list arrived
   * and quietly drops an id the platform no longer has.
   */
  stores?: readonly Store[];
}) {
  const address = useChosenAddress();
  const money = (tiyin: number) => som(tiyin, lang);

  const [query, setQuery] = useState('');
  const [vertical, setVertical] = useState('food');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReadonlySet<FilterKey>>(new Set());
  const [plus, setPlus] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);

  const searching = query.trim() !== '';

  const matches = (store: Store): boolean => {
    if (cuisine !== null && store.cuisine !== cuisine) return false;
    if (filters.has('offers') && store.offer === undefined) return false;
    if (filters.has('freeDelivery') && store.deliveryFee > 0) return false;
    if (filters.has('under30') && store.minutesTo > 30) return false;
    if (filters.has('rated') && store.rating < 4.5) return false;
    if (filters.has('openNow') && !store.open) return false;

    return true;
  };

  /*
   * Searched over the list that actually arrived, not the fixture.
   *
   * `searchStores` closes over `STORES`, so calling it here would answer the
   * sample directory on a live page — the kind of bug that looks like a search
   * that works until somebody searches for a restaurant that joined this week.
   * The three fields it looks at are the ones that matter and are repeated
   * here: a name, what the shop sells, and the words on its badge.
   */
  const needle = query.trim().toLowerCase();
  const flatten = (text: Trilingual | undefined): string =>
    text === undefined ? '' : Object.values(text).join(' ').toLowerCase();

  const found = stores
    .filter(
      (store) =>
        needle === '' ||
        store.name.toLowerCase().includes(needle) ||
        flatten(store.kind).includes(needle) ||
        flatten(store.offer).includes(needle),
    )
    .filter(matches);

  /*
   * Nine circles, the way the design's rail wraps — the ninth repeats the first.
   *
   * Empty when the directory is empty, and the section below is not drawn at
   * all. It used to fall back to `NEARBY`, which put fixture shops under a
   * heading reading "near you" on a live marketplace that has none.
   */
  const nearby = stores.length === 0 ? [] : [...stores, ...stores.slice(0, 1)];

  const byId = new Map(stores.map((store) => [store.id, store]));

  /* "Saralash: mashhur" is the sixth chip and the only one that reorders
     rather than removes. Popular is by rating count, which is the one measure
     of popularity this fixture actually carries. */
  const shown = filters.has('sort')
    ? [...found].sort((left, right) => right.reviews - left.reviews)
    : found;

  /** A live marketplace nobody has joined yet, as opposed to a filtered-out one. */
  const emptyDirectory = stores.length === 0;

  const showFilter = (key: FilterKey) => {
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <MpChrome lang={lang} basket={basket} search={{ value: query, onChange: setQuery }} />

      <div className="mx-auto grid max-w-[1560px] gap-0 px-4 sm:px-7 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* ------------------------------------------------- the fifteen */}
        <aside className="border-border hidden py-5.5 pr-5 lg:block lg:border-r">
          <div className="sticky top-[132px]">
            <p className="text-fg-subtle tracking-caps px-3 pb-2.5 text-[11px] font-semibold uppercase">
              {t('catsLbl', lang)}
            </p>

            <div className="grid gap-px">
              {VERTICALS.map((entry) => {
                const on = vertical === entry.key;

                return (
                  <button
                    key={entry.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      if (!entry.live) {
                        flash(fill(t('verticalSoon', lang), { name: say(entry.label, lang) }));
                        return;
                      }

                      setVertical(entry.key);
                      setCuisine(null);
                      setFilters(new Set());
                      flash(
                        fill(t('verticalLive', lang), {
                          name: say(entry.label, lang),
                          n: entry.count,
                        }),
                      );
                    }}
                    className={`relative flex h-[42px] min-w-0 items-center gap-3 rounded-r-[10px] pr-2.5 pl-3.5 text-left text-sm font-medium ${
                      on ? 'bg-brand-50 text-fg font-semibold' : 'text-fg-muted'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`absolute top-[7px] bottom-[7px] left-0 w-[3px] rounded-r-[3px] ${
                        on ? 'bg-brand-500' : ''
                      }`}
                    />

                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className={`flex-none ${on ? 'text-brand-600 opacity-100' : 'opacity-70'}`}
                    >
                      <path d={entry.path} />
                    </svg>

                    <span className="min-w-0 flex-1 truncate">{say(entry.label, lang)}</span>

                    {entry.live ? (
                      <span data-num className="text-fg-subtle flex-none text-[11px] font-semibold">
                        {entry.count}
                      </span>
                    ) : (
                      <span className="text-fg-disabled flex-none text-[10px] font-semibold">
                        {t('soon', lang)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="bg-divider mx-3 my-3.5 h-px" />

            <button
              type="button"
              onClick={() => {
                showFilter('offers');
                flash(t('offersFlash', lang));
              }}
              className="text-fg-muted flex h-[42px] w-full items-center gap-3 rounded-r-[10px] pr-3 pl-3.5 text-left text-sm font-medium"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--danger-500)"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="flex-none"
              >
                <path d="M20.6 12.2 12.8 20a1.6 1.6 0 0 1-2.3 0L3.4 12.9a1.6 1.6 0 0 1-.4-1.2l.5-6.4a1.6 1.6 0 0 1 1.5-1.5l6.4-.5a1.6 1.6 0 0 1 1.2.4l7.1 7.1a1.6 1.6 0 0 1 0 2.3zM8.5 8.5h.01" />
              </svg>
              {t('offers', lang)}
            </button>

            {/* The subscription card, and its line changes when it is on —
                a card that reads "Free delivery · 39 000 a month" to somebody
                already paying is an advert for what they already bought. */}
            <div className="border-border bg-surface mt-5.5 rounded-[14px] border px-4 py-3.5">
              <p className="text-[13px] font-semibold">{t('plusH', lang)}</p>
              <p className="text-fg-muted mt-1 text-xs leading-normal">
                {plus ? t('plusSideNoteOn', lang) : t('plusSideNote', lang)}
              </p>
              <button
                type="button"
                onClick={() => setPlusOpen(true)}
                className="border-border-strong bg-surface mt-3 h-[34px] w-full rounded-[9px] border text-xs font-semibold"
              >
                {t('plusCta', lang)}
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 py-5.5 pb-24 lg:pl-7">
          {/* The header's search field is desktop-only — the design hides it
              below 860px (`[data-topsearch]`) — so the phone gets its own,
              bound to the same state rather than a second query. */}
          <div className="relative mb-4 sm:hidden">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search', lang)}
              aria-label={t('search', lang)}
              className="rounded-pill border-border bg-surface h-11 w-full border px-4 text-sm"
            />
          </div>

          {/* The rail becomes a chip strip below the breakpoint — the design's
              `data-vstrip`, which is the same fifteen in the space a phone has. */}
          <div data-mp-rail className="border-divider mb-1 border-b pb-4 lg:hidden">
            {VERTICALS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() =>
                  entry.live
                    ? (setVertical(entry.key),
                      flash(
                        fill(t('verticalLive', lang), {
                          name: say(entry.label, lang),
                          n: entry.count,
                        }),
                      ))
                    : flash(fill(t('verticalSoon', lang), { name: say(entry.label, lang) }))
                }
                className={`rounded-pill bg-surface flex h-[34px] flex-none items-center gap-1.5 border px-3.5 text-[13px] font-medium ${
                  entry.live ? '' : 'text-fg-disabled'
                } ${vertical === entry.key ? 'border-brand-500' : ''}`}
              >
                {say(entry.label, lang)}
                {entry.live ? (
                  <span data-num className="text-fg-subtle text-[11px] font-semibold">
                    {entry.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* ------------------------------------------------------ cuisines */}
          <div data-mp-rail className="pt-4 pb-1">
            {CUISINES.map((entry) => {
              const on = cuisine === entry.key;

              return (
                /*
                 * The design's chip: a 66px ring holding a 15px/700 monogram,
                 * with the label under it at 12px/500 in muted ink. Selected
                 * fills the circle with brand and turns the monogram white;
                 * unselected is the 50 step behind the 600 step on a 200 ring.
                 * `Sayt.dc.html:189-196` for the box, `:1091-1096` for the three
                 * colour pairs.
                 */
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setCuisine(on ? null : entry.key)}
                  aria-pressed={on}
                  className="flex w-[76px] flex-none flex-col items-center gap-2"
                >
                  <span
                    className="grid size-[66px] place-items-center rounded-full border"
                    style={{
                      background: on ? 'var(--brand-500)' : 'var(--brand-50)',
                      borderColor: on ? 'var(--brand-500)' : 'var(--brand-200)',
                      color: on ? '#fff' : 'var(--brand-600)',
                    }}
                    aria-hidden
                  >
                    <span className="text-[15px] font-bold tracking-[.01em]">{entry.short}</span>
                  </span>
                  <span className="text-fg-muted w-full text-center text-xs leading-[1.25] font-medium">
                    {say(entry.label, lang)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ------------------------------------------------------- filters */}
          <div data-mp-rail className="border-divider mt-5 border-b pb-5">
            {FILTERS.map((key) => {
              const on = filters.has(key);
              const dot = FILTER_DOT[key];

              return (
                <button
                  key={key}
                  type="button"
                  data-tap
                  onClick={() => showFilter(key)}
                  aria-pressed={on}
                  className={`rounded-pill flex flex-none items-center gap-1.5 border px-3.5 text-sm font-medium ${
                    on ? 'border-fg bg-fg text-surface' : 'bg-surface'
                  }`}
                >
                  {dot === undefined ? null : (
                    <span
                      aria-hidden
                      className="size-1.5 flex-none rounded-full"
                      style={{ background: on ? 'currentColor' : dot }}
                    />
                  )}
                  {t(`filter_${key}` as 'filter_offers', lang)}
                </button>
              );
            })}
          </div>

          {/* -------------------------------------------------------- banners */}
          <div className="mt-5.5 grid gap-4 xl:grid-cols-2">
            {PROMO_BANNERS.map((banner) => (
              <div
                key={banner.key}
                className="border-border bg-surface flex min-h-[186px] flex-col rounded-2xl border px-5.5 py-5"
              >
                <p
                  className={`tracking-caps text-[11px] font-bold uppercase ${
                    banner.tone === 'danger' ? 'text-danger-600' : 'text-brand-600'
                  }`}
                >
                  {t(`promoTag_${banner.key}` as 'promoTag_offer', lang)}
                </p>

                <p className="font-display mt-2 text-xl leading-tight font-bold tracking-tight text-pretty">
                  {t(`promoH_${banner.key}` as 'promoH_offer', lang)}
                </p>

                <p className="text-fg-muted mt-1.5 text-[13px] leading-normal">
                  {t(`promoP_${banner.key}` as 'promoP_offer', lang)}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    if (banner.key === 'plus') {
                      setPlusOpen(true);
                      return;
                    }

                    showFilter('offers');
                    flash(t('promoFlash_offer', lang));
                  }}
                  className="rounded-pill border-border-strong bg-surface mt-auto self-start border px-4 pt-2 pb-2 text-[13px] font-semibold"
                >
                  {t(`promoCta_${banner.key}` as 'promoCta_offer', lang)}
                </button>
              </div>
            ))}
          </div>

          {/* --------------------------------------------------------- grid */}
          <div className="mt-8.5 flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-[23px] font-bold tracking-tight">
                {t(searching ? 'gridSearch' : 'gridHome', lang)}
              </h2>
              <p className="text-fg-muted mt-1 text-[13px]">
                {searching
                  ? fill(t('gridSubSearch', lang), { n: shown.length, q: query.trim() })
                  : t('gridSubHome', lang)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCuisine(null);
                setFilters(new Set());
                flash(t('seeAllFlash', lang));
              }}
              className="rounded-pill border-border bg-surface h-[34px] flex-none border px-3.5 text-[13px] font-semibold"
            >
              {t('seeAll', lang)}
            </button>
          </div>

          {shown.length === 0 ? (
            <div className="border-border bg-surface mt-4.5 rounded-2xl border px-6 py-11 text-center">
              <p className="text-[17px] font-bold tracking-tight">
                {t(emptyDirectory ? 'emptyDirH' : searching ? 'noHitsH' : 'none', lang)}
              </p>
              <p className="text-fg-muted mx-auto mt-2 max-w-[420px] text-sm leading-relaxed">
                {t(emptyDirectory ? 'emptyDirP' : searching ? 'noHitsP' : 'noneSub', lang)}
              </p>
              {/* No reset button when there is nothing to reset to: clearing a
                  filter on an empty directory changes nothing, and a control
                  that cannot help is a control that misleads. */}
              {emptyDirectory ? null : (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setCuisine(null);
                    setFilters(new Set());
                    flash(t('seeAllFlash', lang));
                  }}
                  className="bg-brand-500 mt-4.5 h-10 rounded-[11px] px-4.5 text-sm font-semibold text-white"
                >
                  {t(searching ? 'clearQ' : 'backHome', lang)}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4.5 grid gap-4.5 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((store) => (
                <StoreCard key={store.id} store={store} lang={lang} money={money} />
              ))}
            </div>
          )}

          {/* ------------------------------------------------------- nearby */}
          <section hidden={nearby.length === 0} className="border-divider mt-9.5 border-t pt-6.5">
            <h2 className="font-display text-[23px] font-bold tracking-tight">
              {t('nearH', lang)}
            </h2>
            <p className="text-fg-muted mt-1 text-[13px]">
              {address === null ? t('nearPick', lang) : fill(t('nearP', lang), { address })}
            </p>

            <div data-mp-rail className="mt-4.5 pb-2">
              {nearby.map((store, index) => (
                <Link
                  key={`${store.id}-${index}`}
                  href={`/mp/store/${store.id}`}
                  className="flex w-[92px] flex-none flex-col items-center gap-2.5"
                >
                  <span
                    className="font-display grid size-[74px] place-items-center rounded-full border text-xl font-extrabold tracking-tight text-white"
                    style={{ background: store.tint }}
                    aria-hidden
                  >
                    {store.initials}
                  </span>
                  <span className="text-fg-muted w-full truncate text-center text-xs font-medium">
                    {store.name}
                  </span>
                  <span data-num className="text-fg-subtle -mt-1 text-[11px]">
                    {fill(t('window', lang), { from: store.minutesFrom, to: store.minutesTo })}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* -------------------------------------------------------- rails */}
          {/* Not drawn on an empty directory: three curated headings with no
              cards under them read as a broken page rather than a new one. */}
          {emptyDirectory
            ? null
            : RAILS.map((rail) => (
                <Rail
                  key={rail.key}
                  lang={lang}
                  title={t(`rail_${rail.key}` as 'rail_offers', lang)}
                  sub={t(`railSub_${rail.key}` as 'railSub_offers', lang)}
                  onSeeAll={() => {
                    setQuery('');
                    setCuisine(null);
                    setFilters(new Set());
                    flash(t('seeAllFlash', lang));
                  }}
                >
                  {rail.storeIds.map((id) => {
                    const store = byId.get(id);
                    if (store === undefined) return null;

                    return (
                      <span key={id} className="block w-[262px] flex-none">
                        <StoreCard store={store} lang={lang} money={money} />
                      </span>
                    );
                  })}
                </Rail>
              ))}

          {/* ------------------------------------------------- why, and when */}
          <div className="mt-9.5 grid gap-4 lg:grid-cols-2">
            <section className="border-border bg-surface rounded-2xl border px-6 py-5.5">
              <h3 className="font-display text-[17px] font-bold tracking-tight">
                {t('whyH', lang)}
              </h3>

              <div className="mt-4 grid gap-3.5">
                {Array.from({ length: WHY_COUNT }, (_, index) => index + 1).map((n) => (
                  <div key={n} className="flex gap-3">
                    <span
                      data-num
                      className="bg-bg-muted text-fg-muted grid size-[22px] flex-none place-items-center rounded-[7px] text-[11px] font-bold"
                    >
                      {n}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{t(`why${n}H` as 'why1H', lang)}</p>
                      <p className="text-fg-muted mt-0.5 text-[13px] leading-normal text-pretty">
                        {t(`why${n}P` as 'why1P', lang)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="border-border bg-surface rounded-2xl border px-6 py-5.5">
              <h3 className="font-display text-[17px] font-bold tracking-tight">
                {t('archH', lang)}
              </h3>
              <p className="text-fg-muted mt-1.5 text-[13px] leading-relaxed text-pretty">
                {t('archP', lang)}
              </p>

              <div className="border-border mt-4 overflow-hidden rounded-xl border">
                {PHASES.map((phase) => (
                  <div
                    key={phase.key}
                    className="border-divider bg-surface flex items-center gap-3 border-b px-3.5 py-3 last:border-0"
                  >
                    <span
                      aria-hidden
                      className="size-[7px] flex-none rounded-full"
                      style={{
                        background:
                          phase.tone === 'success'
                            ? 'var(--success-500)'
                            : phase.tone === 'warning'
                              ? 'var(--warning-500)'
                              : 'var(--border-strong)',
                      }}
                    />
                    <span className="min-w-0 flex-1 text-[13px] font-semibold">
                      {t(`phase_${phase.key}` as 'phase_live', lang)}
                    </span>
                    <span className="text-fg-subtle flex-none text-right text-xs">
                      {t(`phaseNote_${phase.key}` as 'phaseNote_live', lang)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* The two badges, under the last section. A marketplace is the
                one surface that competes with apps that *are* in the stores,
                so the shape people know is the shape drawn — with the note
                under each saying where the press really goes. */}
            <section className="border-border mt-10 border-t pt-8">
              <p className="text-fg-subtle mb-3 text-[11px] font-semibold tracking-[.06em] uppercase">
                {t('appHeading', lang)}
              </p>
              <StoreBadges
                copy={{
                  appleOver: t('appAppleOver', lang),
                  apple: 'App Store',
                  appleNote: t('appAppleNote', lang),
                  googleOver: t('appGoogleOver', lang),
                  google: 'Google Play',
                  googleNote: t('appGoogleNote', lang),
                  googleNone: t('appGoogleNone', lang),
                }}
                apkHref={apkHref}
              />
            </section>
          </div>
        </main>
      </div>

      {plusOpen ? (
        <PlusSheet
          lang={lang}
          active={plus}
          onToggle={setPlus}
          onClose={() => setPlusOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * A rail with its own scroll buttons.
 *
 * The arrows nudge by 560px, which is the design's own step — two cards and a
 * gap. They are here rather than at the board's top level because each rail has
 * to move only itself, and one shared ref would scroll whichever rail rendered
 * last.
 */
function Rail({
  lang,
  title,
  sub,
  onSeeAll,
  children,
}: {
  lang: Lang;
  title: string;
  sub: string;
  onSeeAll: () => void;
  children: React.ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);

  const nudge = (direction: 1 | -1) => {
    track.current?.scrollBy({ left: direction * 560, behavior: 'smooth' });
  };

  return (
    <section className="border-divider mt-9.5 border-t pt-6.5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-[23px] font-bold tracking-tight">{title}</h2>
          <p className="text-fg-muted mt-1 text-[13px]">{sub}</p>
        </div>

        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={onSeeAll}
            className="rounded-pill border-border bg-surface h-[34px] border px-3.5 text-[13px] font-semibold"
          >
            {t('seeAll', lang)}
          </button>

          {([-1, 1] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              onClick={() => nudge(direction)}
              aria-label={t(direction === -1 ? 'prev' : 'next', lang)}
              title={t(direction === -1 ? 'prev' : 'next', lang)}
              className="border-border bg-surface text-fg-muted grid size-[34px] place-items-center rounded-full border"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d={direction === -1 ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div ref={track} data-mp-rail className="mt-4.5 scroll-smooth pb-1.5">
        {children}
      </div>
    </section>
  );
}

/** The badge fills the design names for its three kinds of offer. */
const OFFER_TONE: Record<'brand' | 'warning' | 'danger', string> = {
  brand: 'var(--brand-500)',
  warning: 'var(--warning-500)',
  danger: 'var(--danger-500)',
};

function StoreCard({
  store,
  lang,
  money,
}: {
  store: Store;
  lang: Lang;
  money: (tiyin: number) => string;
}) {
  const face = (
    <>
      <span className="relative block h-[152px]" style={{ background: store.tint }}>
        {/* Three tones, because the design gives the badge three jobs: brand
            for a platform offer, amber for a price change the guest should
            notice, red for a discount. One colour for all three made a price
            rise look like a sale. `Sayt.dc.html:248-250`. */}
        {store.offer !== undefined ? (
          <span
            className="absolute top-3 left-3 flex h-6 items-center rounded-[7px] px-2.5 text-[11px] font-bold tracking-[.01em] text-white"
            style={{ background: OFFER_TONE[store.offerTone ?? 'brand'] }}
          >
            {say(store.offer, lang)}
          </span>
        ) : null}

        {!store.open ? (
          <span className="absolute inset-0 grid place-items-center bg-[rgba(15,19,32,.62)] text-[13px] font-semibold text-white">
            {t('closedAt', lang)}
          </span>
        ) : null}
      </span>

      <span className="block px-4 pt-3.5 pb-4">
        <span className="flex items-baseline justify-between gap-2.5">
          <span className="font-display min-w-0 truncate text-base font-bold tracking-tight">
            {store.name}
          </span>
          <span className="flex flex-none items-center gap-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--rating-star)" aria-hidden>
              <path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.3l-5.8 3.1 1.1-6.4L2.6 9.4l6.5-.9L12 2.6Z" />
            </svg>
            <span data-num className="text-[13px] font-bold">
              {store.rating}
            </span>
            <span data-num className="text-fg-subtle text-xs">
              {fill(t('reviews', lang), { n: store.reviews })}
            </span>
          </span>
        </span>

        <span className="text-fg-subtle mt-1 block truncate text-xs">{say(store.kind, lang)}</span>

        <span className="text-fg-muted mt-2.5 flex items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap">
          <span data-num>
            {fill(t('window', lang), { from: store.minutesFrom, to: store.minutesTo })}
          </span>
          <span className="text-border-strong" aria-hidden>
            ·
          </span>
          <span data-num className={store.deliveryFee === 0 ? 'text-brand-600 font-semibold' : ''}>
            {store.deliveryFee === 0 ? t('freeDelivery', lang) : money(store.deliveryFee)}
          </span>
        </span>
      </span>
    </>
  );

  if (!store.open) {
    return (
      <button
        type="button"
        onClick={() => flash.problem(fill(t('closedFlash', lang), { name: store.name }))}
        className="bg-surface block w-full overflow-hidden rounded-2xl border text-left opacity-60 shadow-sm"
      >
        {face}
      </button>
    );
  }

  return (
    <Link
      href={`/mp/store/${store.id}`}
      className="bg-surface block overflow-hidden rounded-2xl border shadow-sm"
    >
      {face}
    </Link>
  );
}
