import { formatTiyinAmount } from '@restaurant/utils';

import type { Lang } from '@restaurant/surfaces/crew/data';
import type { RiderDrop } from '@restaurant/surfaces/crew/live';
import { moreCopy } from '@restaurant/surfaces/crew/more-copy';
import {
  MORE_BRANCHES,
  MORE_CASH_FLOW,
  MORE_EXPIRY,
  MORE_PEOPLE,
  MORE_PNL,
  MORE_RISK,
  MORE_BOOKINGS,
  MORE_ROTA,
  MORE_SHIFT_KPIS,
  MORE_STATIONS,
  type CrewTone,
} from '@restaurant/surfaces/crew/more-data';
import { ClosingChecklist, EndShiftChecklist } from './crew-actions';

/**
 * The screens behind the More menu — `Xodimlar ilovasi.dc.html:498-1000`.
 *
 * Nine of the seventeen the design draws are here: the read-only ones, which
 * are the ones a phone is genuinely good at. The four that take input — waste,
 * reordering, the shift swap, the handback — are client islands in
 * `more-forms.tsx`, because they hold state and these do not.
 *
 * Every one of them was a `built: false` row in `MORE` until now: a manager
 * could read "Close the shift · five steps, cash count and Z report" and not
 * open it. A menu of names that go nowhere is worse than a shorter menu.
 *
 * ---------------------------------------------------------------------------
 * Fixtures, and the screens do not hide it
 *
 * None of these has an endpoint. `GET /api/v1/analytics/*` is not published for
 * a phone, there is no per-station timing route, and loss-prevention scoring
 * does not exist anywhere in the platform. What is drawn is the design's own
 * figures, and the note at the foot of each screen is the design's own note —
 * several of which already say what the number is and is not. The one thing
 * none of them does is offer a control that would send something.
 */
const TONE_TEXT: Readonly<Record<CrewTone, string>> = {
  brand: 'text-brand-600',
  success: 'text-success-600',
  warning: 'text-warning-600',
  danger: 'text-danger-600',
  neutral: 'text-fg',
};

const TONE_BAR: Readonly<Record<CrewTone, string>> = {
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  neutral: 'bg-fg-disabled',
};

const TONE_CHIP: Readonly<Record<CrewTone, string>> = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  neutral: 'bg-bg-muted text-fg-muted',
};

/** The line the design puts at the foot of nearly every one of these. */
export function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-fg-subtle text-2xs mt-3.5 leading-relaxed">{children}</p>;
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-fg-subtle text-2xs tracking-caps mt-5.5 mb-2.5 font-semibold uppercase">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------ owner · P&L */

export function FinanceScreen({ lang }: { lang: Lang }) {
  const t = moreCopy(lang);

  return (
    <section>
      <div className="border-border overflow-hidden rounded-lg border">
        {t.pnl.map((row, index) => {
          const shape = MORE_PNL[index];

          return (
            <div
              key={row.label}
              className={`border-divider flex items-baseline justify-between gap-3 border-b px-4 py-3.5 last:border-0 ${
                shape?.strong ? 'bg-bg-subtle' : ''
              }`}
            >
              <span
                className={`text-sm ${shape?.strong ? 'font-semibold' : ''} ${TONE_TEXT[shape?.tone ?? 'neutral']}`}
              >
                {row.label}
              </span>
              <span
                data-num
                className={`font-display tracking-snug ${shape?.strong ? 'text-md font-bold' : 'text-sm'} ${TONE_TEXT[shape?.tone ?? 'neutral']}`}
              >
                {row.value}
              </span>
            </div>
          );
        })}
      </div>

      <Note>{t.text.pnlNote}</Note>

      <Legend>{t.text.cashFlowLbl}</Legend>

      {/*
       * Six bars and six month labels. Heights are the design's percentages,
       * not derived from the P&L above — the two are different periods and
       * making one drive the other would be inventing a series.
       */}
      <div className="flex h-24 items-end gap-1.5 px-0.5">
        {t.cashFlow.map((month, index) => (
          <div key={month} className="flex flex-1 flex-col items-center gap-1.5">
            {/*
             * The last bar is the brand, the other five are `--brand-200` —
             * `Xodimlar ilovasi`, where the series is built as
             * `i === a.length - 1 ? "var(--brand-500)" : "var(--brand-200)"`.
             * All six were drawn at full strength, which reads as six equal
             * months rather than as a trend arriving at this one.
             */}
            <div
              aria-hidden
              className={`w-full rounded-t-[3px] ${
                index === t.cashFlow.length - 1 ? 'bg-brand-500' : 'bg-brand-200'
              }`}
              style={{ height: MORE_CASH_FLOW[index]?.height }}
            />
            <span className="text-fg-subtle text-[9px]">{month}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- owner · people */

export function PeopleScreen({ lang }: { lang: Lang }) {
  const t = moreCopy(lang);

  return (
    <section>
      <ul>
        {t.people.map((person, index) => (
          <li
            key={person.name}
            className="border-divider flex items-center gap-3 border-b py-3 last:border-0"
          >
            <span
              className={`grid size-8 flex-none place-items-center rounded-full text-[11px] font-bold ${
                MORE_PEOPLE[index]?.top
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-bg-muted text-fg-muted'
              }`}
            >
              {person.initials}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{person.name}</span>
              <span className="text-fg-subtle text-2xs mt-px block">{person.role}</span>
            </span>

            <span className="flex-none text-right">
              <span data-num className="block text-sm font-semibold">
                {person.sales}
              </span>
              <span data-num className="text-fg-subtle text-2xs mt-px block">
                {person.meta}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------- owner · control */

export function ControlScreen({ lang }: { lang: Lang }) {
  const t = moreCopy(lang);

  return (
    <section>
      <Legend>{t.text.riskLbl}</Legend>

      <ul>
        {t.risk.map((row, index) => {
          const shape = MORE_RISK[index];

          return (
            <li key={row.name} className="border-divider border-b py-3 last:border-0">
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="text-sm font-semibold">{row.name}</span>
                <span
                  data-num
                  className={`text-xs font-bold ${TONE_TEXT[shape?.tone ?? 'neutral']}`}
                >
                  {row.score}
                </span>
              </div>

              {/*
               * A bar with its number beside it, not a bar alone: "78" is a
               * score somebody will be asked about, and a length nobody can
               * read off is not evidence.
               */}
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Number(row.score)}
                aria-label={row.name}
                className="bg-bg-muted mt-2 h-1 overflow-hidden rounded-full"
              >
                <div
                  className={`h-full rounded-full ${TONE_BAR[shape?.tone ?? 'neutral']}`}
                  style={{ width: shape?.width }}
                />
              </div>

              <p className="text-fg-subtle text-2xs mt-1.5">{row.meta}</p>
            </li>
          );
        })}
      </ul>

      <Note>{t.text.riskNote}</Note>
    </section>
  );
}

/* ------------------------------------------------------- manager · close */

export function ClosingScreen({
  lang,
  ticked,
  live,
}: {
  lang: Lang;
  /** Today's ticks from `GET /staff/checklists/today` — see `ClosingChecklist`. */
  ticked?: readonly string[];
  live?: boolean;
}) {
  const t = moreCopy(lang);

  return (
    <section>
      {/*
       * The list and its buttons are a client island — `crew-actions.tsx`.
       *
       * Three of the five steps are things a manager ticks off, and this screen
       * used to draw all five inert with a permanently dead button underneath.
       * Only the interactive part crosses into the browser; the note below it,
       * which is most of the words on the screen, still renders on the server.
       */}
      <ClosingChecklist lang={lang} ticked={ticked} live={live} />

      <Note>{t.text.closeNote}</Note>
    </section>
  );
}

/* -------------------------------------------------------- manager · rota */

export function RotaScreen({ lang }: { lang: Lang }) {
  const t = moreCopy(lang);

  return (
    <section>
      <ul>
        {t.rota.map((row, index) => {
          const tone = MORE_ROTA[index]?.tone ?? 'neutral';

          return (
            <li
              key={row.name}
              className="border-divider flex items-center gap-3 border-b py-3 last:border-0"
            >
              <span aria-hidden className={`size-2 flex-none rounded-full ${TONE_BAR[tone]}`} />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{row.name}</span>
                <span className="text-fg-subtle text-2xs mt-px block">{row.shift}</span>
              </span>

              <span
                className={`flex-none rounded-full px-2.5 py-1 text-[10px] font-bold ${TONE_CHIP[tone]}`}
              >
                {row.state}
              </span>
            </li>
          );
        })}
      </ul>

      <Note>{t.text.rotaNote}</Note>
    </section>
  );
}

/* ----------------------------------------------------- manager · kitchen */

export function KitchenSpeedScreen({ lang }: { lang: Lang }) {
  const t = moreCopy(lang);

  return (
    <section>
      <ul>
        {t.stations.map((station, index) => {
          const shape = MORE_STATIONS[index];

          return (
            <li key={station.name} className="border-divider border-b py-3.5 last:border-0">
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="text-sm font-semibold">{station.name}</span>
                <span
                  data-num
                  className={`font-display text-lg font-bold ${TONE_TEXT[shape?.tone ?? 'neutral']}`}
                >
                  {station.average}
                </span>
              </div>

              <div className="bg-bg-muted mt-2 h-1 overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${TONE_BAR[shape?.tone ?? 'neutral']}`}
                  style={{ width: shape?.width }}
                />
              </div>

              <div className="text-fg-subtle text-2xs mt-1.5 flex justify-between">
                <span>{station.load}</span>
                <span data-num>{station.target}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <Note>{t.text.stationNote}</Note>
    </section>
  );
}

/* --------------------------------------------------- storekeeper · expiry */

export function ExpiryScreen({ lang }: { lang: Lang }) {
  const t = moreCopy(lang);

  return (
    <section>
      <ul>
        {t.expiry.map((row, index) => (
          <li
            key={`${row.name}-${row.batch}`}
            className="border-divider flex items-center gap-3 border-b py-3 last:border-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{row.name}</span>
              <span data-num className="text-fg-subtle text-2xs mt-px block">
                {row.batch}
              </span>
            </span>

            <span
              className={`flex-none rounded-full px-2.5 py-1 text-[10px] font-bold ${TONE_CHIP[MORE_EXPIRY[index]?.tone ?? 'neutral']}`}
            >
              {row.when}
            </span>
          </li>
        ))}
      </ul>

      <Note>{t.text.expiryNote}</Note>
    </section>
  );
}

/* -------------------------------------------------------- owner · branch */

export function BranchDetailScreen({ lang, index }: { lang: Lang; index: number }) {
  const t = moreCopy(lang);
  const branch = t.branches[index];
  const shape = MORE_BRANCHES[index];

  if (branch === undefined || shape === undefined) return null;

  const rows = [
    [t.text.brOrders, branch.orders],
    [t.text.brMargin, branch.margin],
    [t.text.brStaff, branch.staff],
  ] as const;

  return (
    <section>
      <p className="text-fg-subtle text-2xs">{branch.city}</p>

      <p className="mt-1 flex items-baseline gap-2.5">
        <span data-num className="font-display text-3xl font-bold tracking-tight">
          {branch.revenue}
        </span>
        <span data-num className={`text-sm font-semibold ${TONE_TEXT[shape.tone]}`}>
          {shape.up ? '↑' : '↓'} {branch.delta}
        </span>
      </p>

      <p className="text-fg-subtle text-2xs mt-1">{t.text.bdRev}</p>

      {/* Attainment against target, which is the only figure on this card that
          says whether the number above it is good. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shape.attainment}
        aria-label={branch.target}
        className="bg-bg-muted mt-3.5 h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={`h-full rounded-full ${TONE_BAR[shape.tone]}`}
          style={{ width: `${Math.min(100, shape.attainment)}%` }}
        />
      </div>

      <p data-num className="text-fg-subtle text-2xs mt-1.5">
        {branch.target}
      </p>

      <dl className="border-border mt-5 overflow-hidden rounded-lg border">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="border-divider flex items-baseline justify-between gap-3 border-b px-4 py-3 last:border-0"
          >
            <dt className="text-fg-muted text-sm">{label}</dt>
            <dd data-num className="text-sm font-semibold">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <Note>{t.text.bdHours}</Note>
    </section>
  );
}

/** `formatTiyinAmount` re-exported so the form screens share one formatter. */
export { formatTiyinAmount as money };

/* ------------------------------------------------------- waiter · my shift */

export function MyShiftScreen({ lang }: { lang: Lang }) {
  const t = moreCopy(lang);

  return (
    <section>
      {/*
       * The dark hero the design puts at the top of both personal screens.
       *
       * It is the number the shift is judged by and the only one on the screen
       * that a waiter checks before they check anything else — so it gets the
       * whole width and the app's inverse surface rather than a card among
       * cards. The plan sits under it in the same line, because a figure with
       * no target beside it is a number nobody can act on.
       */}
      <div className="mb-3.5 rounded-[20px] bg-[var(--crew-hero-bg)] px-5 py-5 text-[var(--crew-hero-fg)]">
        <p className="text-xs opacity-70">{t.text.shiftSales}</p>
        <p data-num className="font-display mt-1 text-4xl leading-none font-bold tracking-tight">
          {t.shift.sales}
        </p>
        <p data-num className="mt-1.5 text-[11px] opacity-70">
          {t.shift.salesNote}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {t.shift.kpis.map((kpi, index) => (
          <div key={kpi.label} className="border-border rounded-lg border px-4 py-3.5">
            <p className="text-fg-subtle text-2xs">{kpi.label}</p>
            <p data-num className="font-display mt-1 text-xl font-bold">
              {kpi.value}
            </p>
            <p className={`mt-0.5 text-[10px] font-semibold ${TONE_TEXT[shiftTone(index)]}`}>
              {kpi.note}
            </p>
          </div>
        ))}
      </div>

      <Legend>{t.text.shiftTop}</Legend>

      <ul>
        {t.shift.top.map((dish) => (
          <li
            key={dish.name}
            className="border-divider flex items-baseline justify-between gap-3 border-b py-2.5 last:border-0"
          >
            <span className="min-w-0 truncate text-sm">{dish.name}</span>
            <span data-num className="flex-none text-sm font-semibold">
              {dish.quantity}
            </span>
          </li>
        ))}
      </ul>

      <Note>{t.text.shiftNote}</Note>
    </section>
  );
}

/* ------------------------------------------------------ waiter · bookings */

export function BookingsScreen({ lang }: { lang: Lang }) {
  const t = moreCopy(lang);

  return (
    <section>
      <ul className="grid gap-2.5">
        {t.bookings.map((booking, index) => {
          const shape = MORE_BOOKINGS[index];

          return (
            <li
              key={`${booking.name}-${booking.time}`}
              className={`border-border rounded-lg border border-l-[3px] px-4 py-3.5 ${
                shape?.tone === 'warning' ? 'border-l-warning-500' : 'border-l-brand-500'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="text-sm font-semibold">{booking.name}</span>
                <span data-num className="font-display text-md flex-none font-bold">
                  {booking.time}
                </span>
              </div>

              <p data-num className="text-fg-muted mt-1 text-xs">
                {booking.meta}
              </p>

              {/* The note only when there is one. An empty line under every
                  card makes the two that matter impossible to spot. */}
              {shape?.hasNote ? (
                <p className="text-fg-subtle mt-1.5 text-xs leading-normal">{booking.note}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Note>{t.text.bookNote}</Note>
    </section>
  );
}

/* -------------------------------------------------------- courier · my day */

export function MyDayScreen({ lang }: { lang: Lang }) {
  const t = moreCopy(lang);

  return (
    <section>
      <div className="mb-3.5 rounded-[20px] bg-[var(--crew-hero-bg)] px-5 py-5 text-[var(--crew-hero-fg)]">
        <p className="text-xs opacity-70">{t.text.dayEarn}</p>
        <p data-num className="font-display mt-1 text-4xl leading-none font-bold tracking-tight">
          {t.day.earned}
        </p>
        <p data-num className="mt-1.5 text-[11px] opacity-70">
          {t.day.earnedNote}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {t.day.kpis.map((kpi) => (
          <div key={kpi.label} className="border-border rounded-lg border px-4 py-3.5">
            <p className="text-fg-subtle text-2xs">{kpi.label}</p>
            <p data-num className="font-display mt-1 text-xl font-bold">
              {kpi.value}
            </p>
            <p className="text-fg-subtle mt-0.5 text-[10px]">{kpi.note}</p>
          </div>
        ))}
      </div>

      <Legend>{t.text.dayLog}</Legend>

      <ul>
        {t.day.log.map((stop) => (
          <li
            key={stop.address}
            className="border-divider flex items-center gap-3 border-b py-3 last:border-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{stop.address}</span>
              <span data-num className="text-fg-subtle text-2xs mt-px block">
                {stop.meta}
              </span>
            </span>
            <span data-num className="flex-none text-sm font-semibold">
              {stop.amount}
            </span>
          </li>
        ))}
      </ul>

      <Note>{t.text.dayNote}</Note>
    </section>
  );
}

/** Which KPI deltas are drawn as good news — the design colours one of four. */
function shiftTone(index: number): CrewTone {
  return MORE_SHIFT_KPIS[index]?.tone ?? 'neutral';
}

/* ------------------------------------------------- courier · end of shift */

export function EndShiftScreen({
  lang,
  drops,
  declaredTiyin,
  live,
}: {
  lang: Lang;
  /** This rider's own open round — `riderRound()`. */
  drops?: readonly RiderDrop[];
  /** What they declared carrying today — `crewChecklist()`. */
  declaredTiyin?: number | null;
  live?: boolean;
}) {
  const t = moreCopy(lang);

  return (
    <section>
      {/*
       * Live, and it refuses out loud. The design's button names the single
       * thing still in the way rather than sitting dim and silent — a courier
       * standing at the back door should not have to work out which of four
       * lines the greyed-out control meant.
       */}
      <EndShiftChecklist lang={lang} drops={drops} declaredTiyin={declaredTiyin} live={live} />

      <Note>{t.text.endNote}</Note>
    </section>
  );
}
