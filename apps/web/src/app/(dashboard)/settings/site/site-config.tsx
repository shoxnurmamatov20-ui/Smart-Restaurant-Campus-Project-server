'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flash } from '@restaurant/ui';

import { post } from '@/lib/console-post';

import { pwaCopy, PWA_FACT_TONES, RESERVED_SUBDOMAINS } from './pwa-copy';

/**
 * The restaurant's site and its PWA, configured with the phone beside it.
 *
 * `specs/06-site-pwa.md`. None of it existed: no route rendered the config
 * column, nothing could pick an accent (so every venue rendered on the seed
 * blue), and the install flow was left entirely to whatever prompt the browser
 * decided to show — which §4.6 rules out by name.
 *
 * **Two columns, and the right one is the product.** A restaurant owner picking
 * a colour is not reading a form; they are looking at the phone to see what
 * their guests will see. Every control on the left repaints the right in the
 * same frame, which is why the accent lives in local state and drives a
 * `data-acc` attribute rather than being written and re-fetched.
 *
 * **Four stages, because "install" is four different pictures.** The site in a
 * browser, the prompt, the icon sitting among Telegram and Click on a home
 * screen, and the standalone app with no address bar. An owner asked to believe
 * a web page can feel like an app needs to be shown the home screen, and that
 * is the stage that sells it.
 *
 * **It saves.** §9's outputs — the address, the accent, the sections, the
 * languages and the hero paragraph — are all declared paths in the `site` group
 * of `config/settings.php`, and `PUT /api/v1/settings/site` writes them through
 * the proxy at `/api/settings/site`. The panel used to carry a note saying no
 * endpoint existed; it did, under a different name than the note guessed.
 *
 * Two sections never travel. `home` and `menu` are drawn as permanent rather
 * than as switches, and the server refuses to turn them off — a restaurant's
 * website without its menu is not a smaller website, it is a page that answers
 * the one question every visitor came with by saying nothing.
 */
type Stage = 'site' | 'install' | 'home' | 'app';

type AccentKey = 'a0' | 'a1' | 'a2' | 'a3';

/**
 * The stored `site` group, as this panel reads and writes it.
 *
 * A subset of the schema on purpose: the group also holds the booking rules,
 * the contact details and the PWA's icon, and those are edited elsewhere. What
 * is sent back is exactly what is listed here, so a save from this screen
 * cannot blank a field it never drew — the endpoint merges rather than replaces.
 */
export type SiteDraft = {
  subdomain: string;
  accent: AccentKey;
  sections: Record<string, boolean>;
  langs: Record<string, boolean>;
  blurb: string;
};

export function SiteConfig({
  labels,
  restaurantName,
  lang,
  monogram,
  saved = null,
  suggestion = null,
  offline = '',
}: {
  labels: Record<string, string>;
  /** The console's own language, for the explainer copy below the preview. */
  lang: 'uz' | 'ru' | 'en';
  restaurantName: string;
  /** Two letters for the home-screen icon. */
  monogram: string;
  /** What the restaurant has already saved, or `null` for the demo console. */
  saved?: Partial<SiteDraft> | null;
  /** The tenant's slug — the obvious first address for a site with none. */
  suggestion?: string | null;
  /** Shown when a save never reached the API — `console.shell.offline`. */
  offline?: string;
}) {
  const router = useRouter();

  const [subdomain, setSubdomain] = useState(saved?.subdomain ?? suggestion ?? 'osh-xona');
  const [accent, setAccent] = useState<AccentKey>(saved?.accent ?? 'a0');
  const [stage, setStage] = useState<Stage>('site');
  const [sections, setSections] = useState<Record<string, boolean>>({
    home: true,
    menu: true,
    about: true,
    branches: true,
    booking: true,
    gallery: false,
    reviews: false,
    contact: true,
    ...saved?.sections,
  });
  const [langs, setLangs] = useState<Record<string, boolean>>({
    uz: true,
    ru: true,
    en: false,
    ...saved?.langs,
  });
  const [blurb, setBlurb] = useState(
    saved?.blurb ??
      "Qazili Toshkent oshi, cho'g'da pishirilgan kabob va kuniga uch marta yopiladigan tandir non.",
  );

  const [saving, setSaving] = useState(false);
  /* Set when the server refused the address. Local rules cannot answer this —
     whether SOMEBODY ELSE holds a name is a question only the platform can be
     asked — so the chip above learns it from the save. */
  const [refused, setRefused] = useState<string | null>(null);

  const ACCENTS: readonly { key: AccentKey; name: string; hex: string }[] = [
    { key: 'a0', name: labels.accentBlue, hex: '#2E74EA' },
    { key: 'a1', name: labels.accentTerracotta, hex: '#C2410C' },
    { key: 'a2', name: labels.accentGreen, hex: '#0F766E' },
    { key: 'a3', name: labels.accentCharcoal, hex: '#1F2533' },
  ];

  /** Locked rows: a restaurant site without a home page or a menu is not one. */
  const LOCKED = new Set(['home', 'menu']);

  const SECTION_KEYS = [
    'home',
    'menu',
    'about',
    'branches',
    'booking',
    'gallery',
    'reviews',
    'contact',
  ] as const;

  const themeColor = ACCENTS.find((entry) => entry.key === accent)!.hex;

  /* The design's own explainer text, in the reader's language. */
  const pwa = pwaCopy(lang);

  /* Tone to class, so a figure is never given a hand-picked colour. */
  const FACT_TONE: Readonly<Record<string, string>> = {
    success: 'text-success-600',
    brand: 'text-brand-600',
    warning: 'text-warning-600',
    neutral: 'text-fg',
  };

  /*
   * Whether the address can be had.
   *
   * Three digits is the floor because a two-letter subdomain is almost always
   * a typo, and a restaurant that publishes one cannot change it afterwards
   * without breaking every printed QR code — which is exactly what the note
   * under this field says.
   */
  const state: 'free' | 'taken' | 'short' =
    subdomain.length < 3
      ? 'short'
      : RESERVED_SUBDOMAINS.includes(subdomain) || refused === subdomain
        ? 'taken'
        : 'free';

  /**
   * Publish the five decisions.
   *
   * `sections.home` and `sections.menu` are left out rather than sent as `true`:
   * the endpoint refuses to switch them off, and sending a value it will only
   * ever accept unchanged is asking a question with one legal answer.
   *
   * A 422 here is almost always the address — every other field is narrowed to
   * the schema's own rule before it leaves the browser, and the one rule that
   * cannot be checked here is uniqueness across the platform. So the chip is
   * moved to `taken` and the field says so, which is the answer the reader
   * needs; the toast carries whatever else the API said.
   */
  const save = async (): Promise<void> => {
    setSaving(true);

    const answer = await post('/api/settings/site', {
      subdomain,
      accent,
      sections: Object.fromEntries(
        SECTION_KEYS.filter((key) => !LOCKED.has(key)).map((key) => [key, sections[key] === true]),
      ),
      langs,
      blurb,
    });

    setSaving(false);

    if (answer.ok) {
      setRefused(null);
      // The panel is now showing what is stored, and the public site is
      // rendered from the same document — so the route cache has to let go of
      // it. Nothing here re-reads: the fields are already the saved values.
      router.refresh();
      flash(labels.published);
      return;
    }

    if (answer.code === 'request.validation_failed') setRefused(subdomain);

    flash.problem(answer.message ?? offline);
  };

  /*
   * The manifest, generated rather than edited.
   *
   * This is the point the design wants made and it is made by showing the
   * output, not by describing it: a restaurant writes a name, picks a colour
   * and ticks two boxes, and the thing a phone needs to install their site
   * falls out. Nobody types JSON.
   */
  const manifest = JSON.stringify(
    {
      name: restaurantName,
      short_name: restaurantName.split(' ')[0],
      start_url: '/?src=pwa',
      display: 'standalone',
      theme_color: themeColor,
      background_color: '#FFFFFF',
      lang: Object.entries(langs).find(([, on]) => on)?.[0] ?? 'uz',
      icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    },
    null,
    2,
  );

  const STAGES: readonly { key: Stage; label: string }[] = [
    { key: 'site', label: labels.stageSite },
    { key: 'install', label: labels.stageInstall },
    { key: 'home', label: labels.stageHome },
    { key: 'app', label: labels.stageApp },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* =============================================== the configuration */}
      <div className="flex flex-col gap-5">
        <Card title={labels.addressTitle} note={labels.addressNote}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="border-border bg-bg-subtle flex h-11 flex-1 items-center rounded-md border px-3">
              <input
                value={subdomain}
                onChange={(event) =>
                  setSubdomain(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }
                aria-label={labels.addressTitle}
                data-num
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
              />
              <span className="text-fg-subtle flex-none text-sm">.smartrestaurant.uz</span>
            </span>

            {/*
             * Three states, not one chip — `specs/06 §6`.
             *
             * The panel showed "published" whatever was typed, including
             * `www`, which would collide with the platform's own host. The
             * check here is local and says so: it refuses what it can know is
             * taken and calls the rest *available*, which is a hope rather than
             * a reservation until `GET /restaurants/subdomain/{name}` exists.
             */}
            <span
              className={`rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold ${
                state === 'taken'
                  ? 'bg-danger-50 text-danger-700'
                  : state === 'short'
                    ? 'bg-warning-50 text-warning-700'
                    : 'bg-success-50 text-success-700'
              }`}
            >
              {state === 'taken'
                ? labels.addressTaken
                : state === 'short'
                  ? labels.addressShort
                  : labels.addressFree}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {['osh-xona', 'oshxona-tashkent', 'osh-xona-uz'].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setSubdomain(suggestion)}
                className="border-border bg-surface hover:bg-bg-muted rounded-pill border px-3 py-1 text-xs font-medium"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </Card>

        <Card title={labels.accentTitle} note={labels.accentNote}>
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setAccent(entry.key)}
                aria-pressed={accent === entry.key}
                className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm font-medium ${
                  accent === entry.key ? 'border-fg' : 'border-border'
                }`}
              >
                <span
                  className="size-5 flex-none rounded-full"
                  style={{ background: entry.hex }}
                  aria-hidden
                />
                {entry.name}
              </button>
            ))}
          </div>
        </Card>

        <Card title={labels.sectionsTitle} note={labels.sectionsNote}>
          <ul className="divide-divider divide-y">
            {SECTION_KEYS.map((key) => {
              const locked = LOCKED.has(key);
              const on = sections[key] === true;

              return (
                <li key={key} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{labels[`section_${key}`]}</span>
                    <span className="text-fg-subtle block text-xs">
                      {labels[`sectionNote_${key}`]}
                    </span>
                  </span>

                  {/*
                   * A locked row says "permanent" rather than showing a switch
                   * that refuses to move. A control whose only possible outcome
                   * is a restaurant with no menu online should not look like a
                   * control.
                   */}
                  {locked ? (
                    <span className="bg-brand-50 text-brand-700 rounded-pill text-2xs flex-none px-2.5 py-1 font-semibold">
                      {labels.permanent}
                    </span>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={labels[`section_${key}`]}
                      onClick={() => setSections((now) => ({ ...now, [key]: !on }))}
                      className={`flex h-6 w-11 flex-none items-center rounded-full px-0.5 ${
                        on ? 'bg-brand-500 justify-end' : 'bg-border-strong justify-start'
                      }`}
                    >
                      <span className="size-5 rounded-full bg-white" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title={labels.copyTitle}>
          <textarea
            value={blurb}
            onChange={(event) => setBlurb(event.target.value.slice(0, 160))}
            rows={3}
            className="bg-bg-subtle border-border w-full rounded-md border px-3.5 py-2.5 text-sm leading-normal"
          />
          <p data-num className="text-fg-subtle mt-1.5 text-right text-xs">
            {blurb.length} / 160
          </p>
        </Card>

        <Card title={labels.langsTitle} note={labels.langsNote}>
          <div className="flex gap-2">
            {(['uz', 'ru', 'en'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLangs((now) => ({ ...now, [code]: !now[code] }))}
                aria-pressed={langs[code] === true}
                className={`h-10 rounded-md border px-4 text-sm font-semibold uppercase ${
                  langs[code] ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-border'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </Card>

        <Card title={labels.manifestTitle} note={labels.manifestNote}>
          <pre
            data-scroll
            className="bg-bg-subtle text-fg-muted overflow-x-auto rounded-md p-3.5 font-mono text-xs leading-relaxed"
          >
            {manifest}
          </pre>
        </Card>

        {/* ------------------------------------------------ why a PWA */}
        {/*
         * Three blocks the panel was missing — `specs/06 §4.7`.
         *
         * The figures, then the comparison, then the limits — and the limits
         * are why the first two are worth reading. This panel is shown to the
         * person who has to answer for the decision six months later, and a
         * page that lists what a PWA can do and never lists what it cannot is
         * a sales page rather than a product screen. iOS not showing its own
         * install banner is the single most consequential fact on it.
         */}
        <Card title={labels.pwaTitle} note={labels.pwaNote}>
          <div className="bg-divider border-border grid gap-px overflow-hidden rounded-md border sm:grid-cols-2">
            {pwa.pwaFacts.map((fact, index) => (
              <div key={fact.label} className="bg-surface px-5 py-4">
                <p
                  data-num
                  className={`font-display text-[22px] font-bold tracking-tight ${
                    FACT_TONE[PWA_FACT_TONES[index] ?? 'neutral']
                  }`}
                >
                  {fact.value}
                </p>
                <p className="mt-1 text-xs font-semibold">{fact.label}</p>
                <p className="text-fg-subtle mt-0.5 text-[11px] leading-normal">{fact.note}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title={labels.pwaCompare}>
          <div className="bg-divider border-border grid gap-px overflow-hidden rounded-md border">
            <div className="bg-bg-subtle text-fg-subtle tracking-caps grid grid-cols-[1.5fr_1fr_1fr] text-[11px] font-semibold uppercase">
              <span className="px-3.5 py-2.5">{labels.pwaCompareCol0}</span>
              <span className="text-acc px-3.5 py-2.5 font-bold">{labels.pwaCompareCol1}</span>
              <span className="px-3.5 py-2.5">{labels.pwaCompareCol2}</span>
            </div>

            {pwa.compare.map((row) => (
              <div key={row.label} className="bg-surface grid grid-cols-[1.5fr_1fr_1fr] text-xs">
                <span className="text-fg-muted px-3.5 py-2.5">{row.label}</span>
                <span className="px-3.5 py-2.5 font-semibold">{row.pwa}</span>
                <span className="text-fg-subtle px-3.5 py-2.5">{row.native}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title={labels.pwaLimits}>
          <ul className="grid gap-3">
            {pwa.limits.map((limit) => (
              <li key={limit.head} className="flex items-start gap-3">
                <span aria-hidden className="bg-warning-500 mt-1.5 size-2 flex-none rounded-full" />
                <span>
                  <span className="block text-sm font-semibold">{limit.head}</span>
                  <span className="text-fg-muted mt-0.5 block text-xs leading-relaxed">
                    {limit.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/*
         * One button for the whole column.
         *
         * Not one per card: the five decisions are read together — an accent is
         * chosen while looking at the phone beside it, and the address is worth
         * nothing without the sections it serves — and five save buttons is
         * five chances to leave four of them unpressed.
         */}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving || state !== 'free'}
            onClick={() => void save()}
            className="bg-brand-500 hover:bg-brand-600 h-10 rounded-md px-5 text-sm font-semibold text-white disabled:opacity-55"
          >
            {labels.save}
          </button>
        </div>
      </div>

      {/* ====================================================== the preview */}
      <aside className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
        <div data-seg-group className="bg-bg-muted flex gap-1 rounded-lg p-1">
          {STAGES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              data-seg
              data-active={stage === entry.key ? 'true' : undefined}
              onClick={() => setStage(entry.key)}
              className="flex-1 text-xs"
            >
              {entry.label}
            </button>
          ))}
        </div>

        {/*
         * `data-acc` on the frame, so every accent-driven token inside it
         * repaints at once. That is what makes the swatch feel like a decision
         * rather than a form field.
         */}
        <div
          data-acc={accent}
          className="bg-surface mx-auto w-full max-w-[340px] overflow-hidden rounded-[28px] border-[10px] border-neutral-900 shadow-xl"
          style={{ aspectRatio: '9 / 17' }}
        >
          <Preview
            stage={stage}
            labels={labels}
            subdomain={subdomain}
            restaurantName={restaurantName}
            monogram={monogram}
            blurb={blurb}
          />
        </div>

        <p className="text-fg-subtle text-center text-xs leading-normal">
          {labels[`stageNote_${stage}`]}
        </p>
      </aside>
    </div>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface rounded-lg border p-5">
      <h3 className="text-md font-semibold">{title}</h3>
      {note ? <p className="text-fg-subtle mt-1 text-xs leading-normal">{note}</p> : null}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** The four pictures. Each is the same phone showing a different truth. */
function Preview({
  stage,
  labels,
  subdomain,
  restaurantName,
  monogram,
  blurb,
}: {
  stage: Stage;
  labels: Record<string, string>;
  subdomain: string;
  restaurantName: string;
  monogram: string;
  blurb: string;
}) {
  if (stage === 'home') {
    /*
     * The icon among real apps. The design names Telegram, Click and Camera —
     * the point being that the restaurant's monogram sits in that row looking
     * like everything else, which is the whole promise of a PWA.
     */
    const NEIGHBOURS = [
      { label: 'Telegram', tint: '#229ED9' },
      { label: 'Click', tint: '#00A3E0' },
      { label: labels.camera, tint: '#4B5563' },
    ];

    return (
      <div className="flex h-full flex-col justify-end bg-gradient-to-b from-sky-200 to-indigo-300 p-4 dark:from-slate-700 dark:to-slate-900">
        <div className="grid grid-cols-4 gap-3">
          <span className="flex flex-col items-center gap-1">
            <span
              className="grid size-12 place-items-center rounded-[13px] text-sm font-bold text-white"
              style={{ background: 'var(--acc)' }}
            >
              {monogram}
            </span>
            <span className="w-full truncate text-center text-[9px] font-medium text-white">
              {restaurantName}
            </span>
          </span>

          {NEIGHBOURS.map((app) => (
            <span key={app.label} className="flex flex-col items-center gap-1">
              <span
                className="size-12 rounded-[13px]"
                style={{ background: app.tint }}
                aria-hidden
              />
              <span className="w-full truncate text-center text-[9px] font-medium text-white">
                {app.label}
              </span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* The address bar is the difference between "site" and "app". */}
      {stage !== 'app' ? (
        <div className="bg-bg-muted text-fg-subtle flex h-8 flex-none items-center justify-center text-[10px]">
          {subdomain}.smartrestaurant.uz
        </div>
      ) : (
        <div className="h-8 flex-none" style={{ background: 'var(--acc)' }} />
      )}

      <div className="min-h-0 flex-1 overflow-hidden p-3.5">
        <div className="text-sm font-bold">{restaurantName}</div>
        <p className="text-fg-subtle mt-1 line-clamp-3 text-[10px] leading-normal">{blurb}</p>

        <div
          className="mt-3 grid h-16 place-items-center rounded-md text-[11px] font-semibold text-white"
          style={{ background: 'var(--acc)' }}
        >
          {labels.previewOrder}
        </div>

        <div className="mt-2.5 flex flex-col gap-1.5">
          {[0, 1, 2].map((row) => (
            <div key={row} className="bg-bg-muted h-7 rounded-md" aria-hidden />
          ))}
        </div>
      </div>

      {/* The standalone dock, which only the app stage has. */}
      {stage === 'app' ? (
        <div className="border-divider flex h-11 flex-none items-center justify-around border-t">
          {[0, 1, 2, 3].map((slot) => (
            <span
              key={slot}
              className="size-5 rounded-full"
              style={{ background: slot === 0 ? 'var(--acc)' : 'var(--border-strong)' }}
              aria-hidden
            />
          ))}
        </div>
      ) : null}

      {/*
       * The install prompt, drawn in-page.
       *
       * §4.6 rules out delegating to whatever the browser decides to show, and
       * the reason is that on iOS it shows nothing at all — Safari has no
       * `beforeinstallprompt`, so a restaurant relying on it is invisible to
       * more than half its guests. The banner is the product's own.
       */}
      {stage === 'install' ? (
        <div className="border-divider bg-surface flex-none border-t p-3">
          <div className="flex items-center gap-2.5">
            <span
              className="grid size-9 flex-none place-items-center rounded-[9px] text-[11px] font-bold text-white"
              style={{ background: 'var(--acc)' }}
            >
              {monogram}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold">{restaurantName}</span>
              <span className="text-fg-subtle block text-[9px]">{labels.installSub}</span>
            </span>
            {/* A picture of a button, not a button. This whole block is the
                install banner as the guest's phone will draw it; a control here
                would be the console offering to install the restaurant's app
                onto the manager's desktop. */}
            <span
              className="rounded-md px-3 py-1.5 text-[10px] font-semibold text-white"
              style={{ background: 'var(--acc)' }}
            >
              {labels.install}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
