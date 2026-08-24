import { merchantCopy } from './merchant-copy';
import {
  M_FUNNEL,
  M_PENALTIES,
  M_PERFORMANCE,
  M_STARS,
  type MerchantTone,
} from './merchant-panels-data';
import {
  PERFORMANCE_LIVE,
  PERFORMANCE_RATING,
  say,
  SETTINGS_EXTRA,
  type Lang,
  type Trilingual,
} from './merchant-data';
import type { MerchantPerformance, MerchantSettings } from './merchant-server';

/**
 * The merchant panel's two read-only views — `Do'kon paneli.dc.html:433-620`.
 *
 * Performance and settings. Neither has a control on it, so neither ships a
 * byte of JavaScript: they are server components, and the interactive four —
 * orders, catalogue, payouts, promotions — each own their own client board.
 *
 * Their headings come from the panel's header rather than from here. That is
 * the fix a wrong title made obvious: this file used to open each view with
 * whatever string was nearest, so the disputes screen was titled with its own
 * empty state ("Ochiq nizo yo‘q") while two disputes sat under it.
 */
const TONE_TEXT: Readonly<Record<MerchantTone, string>> = {
  brand: 'text-brand-600',
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger-600',
  neutral: 'text-fg',
};

const TONE_BAR: Readonly<Record<MerchantTone, string>> = {
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  neutral: 'bg-fg-disabled',
};

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-fg-subtle tracking-caps mt-6 mb-2.5 text-xs font-semibold uppercase">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------ performance */

/**
 * How the storefront is doing.
 *
 * Two halves, and they are drawn from different places on purpose.
 *
 * The four figures across the top and the rating beside them are LIVE — the
 * thirty-day window `GET /v1/marketplace/performance` answers. They used to be
 * the design's constants: 1 042 orders, a 96 000 average basket, 11.4M
 * impressions and 812 reviews, on a storefront that in a new restaurant nobody
 * has visited. A merchant reading that is budgeting against another business.
 *
 * The impression funnel, the star histogram and the top-dish list are NOT
 * drawn any more. Nothing on this platform counts an impression, a basket
 * abandonment or a per-dish sale on the marketplace, so there is no honest
 * version of them — including the sentence that named where the biggest loss
 * was, which was a diagnosis of a funnel that had never been measured. The note
 * where they stood says that plainly and comes back the day something counts.
 *
 * The penalty list stays: it is the platform's rules, which are true before a
 * single order is placed.
 */
export function PerformancePanel({
  lang,
  perf = null,
}: {
  lang: Lang;
  /**
   * The live window, or null when the API did not answer.
   *
   * Null draws the design's four KPI cards behind a `data-demo` wrapper, which
   * is the same bargain every other board in this panel makes: a screen that
   *500s because one restaurant's API restarted helps nobody.
   */
  perf?: MerchantPerformance | null;
}) {
  const t = merchantCopy(lang);

  const fill = (phrase: Trilingual, n: number): string =>
    say(phrase, lang).replace('{n}', new Intl.NumberFormat('uz-UZ').format(n));

  /** Hundredths of a percent as the API sends them — 435 is "4.35%". */
  const percent = (bp: number): string => `${(bp / 100).toFixed(2)}%`;

  const cards =
    perf === null
      ? t.performance.map((kpi, index) => ({
          ...kpi,
          tone: M_PERFORMANCE[index]?.tone,
          width: M_PERFORMANCE[index]?.width,
        }))
      : [
          {
            label: say(PERFORMANCE_LIVE.orders, lang),
            value: new Intl.NumberFormat('uz-UZ').format(perf.orders),
            note: fill(PERFORMANCE_LIVE.ordersNote, perf.windowDays),
            tone: 'brand' as MerchantTone,
            /* No bar on a live card. The design's widths are a picture of the
               fixture's own figures and there is no target here to draw one
               against — a bar at an invented fraction is a chart that means
               nothing. */
            width: undefined,
          },
          {
            label: say(PERFORMANCE_LIVE.answer, lang),
            value: perf.acceptSeconds === null ? '—' : `${perf.acceptSeconds} s`,
            note: fill(PERFORMANCE_LIVE.answerNote, perf.acceptSecondsAllowed),
            tone:
              perf.acceptSeconds !== null && perf.acceptSeconds > perf.acceptSecondsAllowed
                ? ('danger' as MerchantTone)
                : ('success' as MerchantTone),
            width: undefined,
          },
          {
            label: say(PERFORMANCE_LIVE.rejected, lang),
            value: percent(perf.rejectRateBp),
            note: fill(PERFORMANCE_LIVE.shareNote, perf.windowDays),
            tone:
              perf.rejectRateBp > 300 ? ('danger' as MerchantTone) : ('neutral' as MerchantTone),
            width: undefined,
          },
          {
            label: say(PERFORMANCE_LIVE.cancelled, lang),
            value: percent(perf.cancelRateBp),
            note: fill(PERFORMANCE_LIVE.shareNote, perf.windowDays),
            tone:
              perf.cancelRateBp > 300 ? ('danger' as MerchantTone) : ('neutral' as MerchantTone),
            width: undefined,
          },
        ];

  return (
    <div data-demo={perf === null ? '' : undefined} className="contents">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((kpi) => (
          <div
            key={kpi.label}
            className="border-border bg-surface rounded-[14px] border px-4.5 py-4"
          >
            <p className="text-fg-subtle text-xs font-medium">{kpi.label}</p>
            <p
              data-num
              className="font-display mt-1.5 text-[30px] leading-[1.05] font-bold tracking-tight"
            >
              {kpi.value}
            </p>

            {kpi.width === undefined ? null : (
              <div data-rail className="bg-bg-muted mt-2.5 h-[3px] overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${TONE_BAR[kpi.tone ?? 'brand']}`}
                  style={{ width: kpi.width }}
                />
              </div>
            )}

            <p className={`mt-1.5 text-[11px] ${TONE_TEXT[kpi.tone ?? 'neutral']}`}>{kpi.note}</p>
          </div>
        ))}
      </div>

      {perf === null ? (
        <FixtureFunnel lang={lang} t={t} />
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/*
           * Where the funnel was. Nothing on this platform counts an
           * impression or a basket somebody walked away from, so there is no
           * honest version of that chart — and the sentence under it was a
           * diagnosis of a funnel that had never been measured.
           */}
          <section className="border-border bg-surface rounded-[14px] border px-6 py-5">
            <p className="font-display text-[15px] font-bold tracking-tight">
              {say(PERFORMANCE_LIVE.notMeasuredH, lang)}
            </p>
            <p className="text-fg-muted mt-2 text-[13px] leading-relaxed">
              {say(PERFORMANCE_LIVE.notMeasuredP, lang)}
            </p>
            {perf.orders === 0 ? (
              <p className="text-fg-subtle mt-3 text-[13px]">
                {say(PERFORMANCE_LIVE.noOrders, lang)}
              </p>
            ) : null}
          </section>

          {/* The rating and its count, both from the storefront row. */}
          <section className="border-border bg-surface rounded-[14px] border px-5 py-4.5">
            <p className="text-fg-subtle tracking-caps text-[11px] font-semibold uppercase">
              {t.text.perfRating}
            </p>

            <p className="mt-1.5 flex items-baseline gap-2.5">
              <span
                data-num
                className="font-display text-[34px] leading-none font-bold tracking-tight"
              >
                {perf.reviewsCount === 0 ? '—' : perf.rating.toFixed(1)}
              </span>
              <span data-num className="text-fg-subtle text-[13px]">
                {fill(PERFORMANCE_LIVE.reviews, perf.reviewsCount)}
              </span>
            </p>
          </section>
        </div>
      )}

      <Legend>{t.text.perfPenalty}</Legend>

      <ul className="border-border bg-surface overflow-hidden rounded-[14px] border">
        {t.penalties.map((rule, index) => (
          <li
            key={rule.head}
            className="border-divider flex items-start gap-3.5 border-b px-5 py-4 last:border-0"
          >
            <span
              aria-hidden
              className={`mt-1.5 size-[7px] flex-none rounded-full ${TONE_BAR[M_PENALTIES[index]?.tone ?? 'neutral']}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{rule.head}</span>
              <span className="text-fg-muted mt-0.5 block text-[13px] leading-normal">
                {rule.body}
              </span>
            </span>
            <span
              data-num
              className={`flex-none text-[13px] font-semibold ${TONE_TEXT[M_PENALTIES[index]?.tone ?? 'neutral']}`}
            >
              {rule.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The design's funnel, star histogram and top-dish list — fixture only.
 *
 * Reached when the API did not answer, inside the `data-demo` wrapper. It is
 * kept because it is the drawing this screen was built to, and losing it would
 * lose the record of what the panel is meant to become; it is NOT reached on a
 * live storefront, which is the defect this file used to have.
 */
function FixtureFunnel({ lang, t }: { lang: Lang; t: ReturnType<typeof merchantCopy> }) {
  void lang;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <section className="border-border bg-surface rounded-[14px] border px-6 py-5">
        <p className="font-display text-[15px] font-bold tracking-tight">{t.text.perfFunnelH}</p>
        <p className="text-fg-subtle mt-0.5 text-xs">{t.text.perfFunnelP}</p>

        <div className="mt-4.5 grid gap-3">
          {t.funnel.map((step, index) => (
            <div key={step.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium">{step.label}</span>
                <span className="flex items-baseline gap-2.5">
                  <span data-num className="text-[13px] font-semibold">
                    {step.value}
                  </span>
                  <span
                    data-num
                    className={`w-[52px] text-right text-xs font-semibold ${
                      index >= 2 ? 'text-danger-600' : 'text-fg-subtle'
                    }`}
                  >
                    {step.drop}
                  </span>
                </span>
              </div>

              <div className="bg-bg-muted h-2 overflow-hidden rounded">
                <div
                  className={`h-full rounded ${index === 2 ? 'bg-warning-500' : index === 3 ? 'bg-brand-500' : 'bg-brand-200'}`}
                  style={{ width: M_FUNNEL[index]?.width }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="border-warning-500/25 bg-warning-50 mt-4 flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3">
          <span aria-hidden className="bg-warning-500 mt-1.5 size-1.5 flex-none rounded-full" />
          <span className="text-warning-700 text-[13px] leading-relaxed font-medium">
            {t.text.perfFunnelWhy}
          </span>
        </div>
      </section>

      <div className="grid content-start gap-3">
        <section className="border-border bg-surface rounded-[14px] border px-5 py-4.5">
          <p className="text-fg-subtle tracking-caps text-[11px] font-semibold uppercase">
            {t.text.perfRating}
          </p>

          <p className="mt-1.5 flex items-baseline gap-2.5">
            <span
              data-num
              className="font-display text-[34px] leading-none font-bold tracking-tight"
            >
              {PERFORMANCE_RATING.value}
            </span>
            <span data-num className="text-fg-subtle text-[13px]">
              {t.text.perfReviews}
            </span>
          </p>

          <ul className="mt-3.5 grid gap-1.5">
            {t.stars.map((row, index) => (
              <li key={row.star} className="flex items-center gap-2.5">
                <span data-num className="text-fg-subtle w-2.5 flex-none text-xs">
                  {row.star}
                </span>
                <span className="bg-bg-muted h-1.5 flex-1 overflow-hidden rounded">
                  <span
                    className="block h-full rounded"
                    style={{ width: M_STARS[index]?.width, background: 'var(--rating-star)' }}
                  />
                </span>
                <span data-num className="text-fg-muted w-[34px] flex-none text-right text-xs">
                  {row.count}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-border bg-surface rounded-[14px] border px-5 py-4.5">
          <p className="text-fg-subtle tracking-caps mb-2.5 text-[11px] font-semibold uppercase">
            {t.text.perfTop}
          </p>

          <ul>
            {t.topDishes.map((dish) => (
              <li
                key={dish.name}
                className="border-divider flex items-baseline justify-between gap-3 border-b py-2 text-[13px] last:border-0"
              >
                <span className="min-w-0 truncate">{dish.name}</span>
                <span data-num className="flex-none font-semibold">
                  {dish.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- settings */

const VALUE_TONE = {
  warning: 'text-warning-700',
  success: 'text-success-700',
  subtle: 'text-fg-subtle',
  muted: 'text-fg-muted',
} as const;

export function StoreSettingsPanel({
  lang,
  settings = null,
}: {
  lang: Lang;
  /**
   * This seller's own configuration, or null when the API did not answer.
   *
   * The panel used to render `merchant-copy.ts` — the design's transcription —
   * as if every value on it were the merchant's: "4 dan 12 ta" photos, a 5 km
   * radius, a 9% commission, a contract numbered `MP-2026-0412`. The last two
   * decide what a restaurant is paid, and a merchant checking their own terms
   * was reading somebody else's.
   */
  settings?: MerchantSettings | null;
}) {
  const t = merchantCopy(lang);

  const money = (tiyin: number): string =>
    `${new Intl.NumberFormat('uz-UZ').format(Math.round(tiyin / 100))} so'm`;

  /**
   * The rows the platform can actually answer for, keyed `group:row`.
   *
   * Everything the design draws and nothing holds — photo counts, per-day
   * hours, the last-order lead, the courier type, the delivery radius, the
   * payout period, the contract number — is mapped to `null` and drawn as an
   * em dash. An unset value that looks configured is the defect; a dash is a
   * merchant's cue to go and set it.
   */
  const live: Readonly<Record<string, string | null>> =
    settings === null
      ? {}
      : {
          '0:0': settings.name,
          '0:1': settings.cuisine,
          '0:2': null,
          '0:3': null,
          '1:0': null,
          '1:1': null,
          '1:2': null,
          '1:3': null,
          '2:0': null,
          '2:1': null,
          '2:2': money(settings.deliveryFee),
          '2:3': null,
          '3:0': `${settings.commissionPercent}%`,
          '3:1': null,
          '3:2': null,
          '3:3': settings.status,
        };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {t.settingsGroups.map((group, groupIndex) => (
          <section
            key={group.head}
            className="border-border bg-surface rounded-[14px] border px-5 py-4.5"
          >
            <h2 className="font-display text-[15px] font-bold tracking-tight">{group.head}</h2>
            <p className="text-fg-subtle mt-0.5 text-xs leading-normal">{group.note}</p>

            <dl className="mt-3.5">
              {group.rows.map((row, rowIndex) => {
                const key = `${groupIndex}:${rowIndex}`;
                const extra = SETTINGS_EXTRA[key];
                /* The seller's own value, an em dash where the platform holds
                   none, and the design's transcription only when there is no
                   live answer at all. */
                const value = settings === null ? row.value : (live[key] ?? '—');

                return (
                  <div
                    key={row.label}
                    className="border-divider flex items-center gap-3 border-t py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <dt className="text-[13px] font-medium">{row.label}</dt>
                      {extra?.note === undefined ? null : (
                        <dd className="text-fg-subtle mt-0.5 text-xs leading-normal">
                          {say(extra.note, lang)}
                        </dd>
                      )}
                    </div>

                    <dd
                      data-num
                      className={`max-w-[170px] flex-none truncate text-right text-[13px] font-semibold ${
                        extra?.tone === undefined ? '' : VALUE_TONE[extra.tone]
                      }`}
                    >
                      {value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>

      {/*
       * Read-only, and it says so once at the foot rather than nine times.
       *
       * Every row here is a write against a marketplace module that does not
       * exist. Nine "edit" buttons that all refuse would be nine chances to
       * conclude the panel is broken; one sentence is the honest version.
       */}
      <p className="border-warning-500/30 bg-warning-50 text-warning-700 mt-4 rounded-md border px-4 py-3 text-sm leading-normal">
        {t.text.catSyncP}
      </p>
    </>
  );
}
