'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { formatTiyinCompact } from '@restaurant/utils';

import type { Messages } from '@/i18n';
import type { IdleScreen as IdleData } from '@/lib/pos-session';

/**
 * What a till shows all day when nobody is signed in.
 *
 * It is the most-looked-at screen in the building and almost nobody signs in
 * from it — a guest at the door reads the venue's name off it, a waiter walking
 * past reads whether the room is filling up, and the manager glances at it to
 * see the till is alive at all. So it earns its dark full-bleed treatment: it
 * is furniture, not a form.
 *
 * Three things are deliberate.
 *
 * The clock ticks in the browser, once a second, and is the only thing here
 * that does. Everything else is a minute-old snapshot from the server, which
 * is exactly right for figures that change by ones — and a clock that ticks is
 * how a room knows a screen is not frozen.
 *
 * The figures are the server's or they are absent. A till showing "0 band ·
 * 0 savdo" during a busy lunch is worse than one showing nothing: it is a
 * confident lie, and somebody will act on it.
 *
 * And when the link drops the screen does not go blank or go stale silently.
 * It keeps the last figures, says the link is down, and keeps the clock
 * running — a black screen at the entrance reads as a broken restaurant.
 */

/** The three ways the design lets a venue set this screen up. */
type Mode = 'minimal' | 'status' | 'brand';

/**
 * Which blocks a mode allows.
 *
 * From the design file, and the reason each one is forced matters: `brand` is
 * the terminal at the entrance where a guest can see it, so the figures come
 * off — a guest must not read the day's turnover. `minimal` is a screen with
 * nothing to say. `status` is the one built for staff.
 */
const BLOCKS: Record<Mode, { stats: boolean; health: boolean }> = {
  minimal: { stats: false, health: false },
  status: { stats: true, health: true },
  brand: { stats: false, health: true },
};

/** The backgrounds the design draws, verbatim. */
const BACKGROUNDS: Record<string, string> = {
  night: 'linear-gradient(165deg,#141A28 0%,#0B0E16 58%,#0F1320 100%)',
  ink: 'linear-gradient(165deg,#1F2533 0%,#0F1320 100%)',
  warm: 'linear-gradient(165deg,#2A2119 0%,#14100C 100%)',
};

const MONTHS: Record<string, readonly string[]> = {
  uz: [
    'yanvar',
    'fevral',
    'mart',
    'aprel',
    'may',
    'iyun',
    'iyul',
    'avgust',
    'sentabr',
    'oktabr',
    'noyabr',
    'dekabr',
  ],
  ru: [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};

const DAYS: Record<string, readonly string[]> = {
  uz: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** One callback per second, for as long as anything is watching. */
function subscribeToTheSecond(onTick: () => void): () => void {
  const timer = setInterval(onTick, 1_000);

  return () => clearInterval(timer);
}

/** Whole seconds since the epoch — stable between renders within one second. */
function currentSecond(): number {
  return Math.floor(Date.now() / 1_000);
}

export function IdleScreen({
  initial,
  mode = 'status',
  background = 'night',
}: {
  /** The server's snapshot, or null when it could not be read this render. */
  initial: IdleData | null;
  mode?: Mode;
  background?: keyof typeof BACKGROUNDS;
}) {
  const messages = useMessages() as Messages;
  const m = messages.console.pos;
  const locale = useLocale();

  const [data, setData] = useState<IdleData | null>(initial);
  const [linkUp, setLinkUp] = useState(initial !== null);

  /*
   * Wall time is an external system, so it is subscribed to rather than copied
   * into state.
   *
   * The server must not render a clock at all: a time rendered there and
   * corrected in the browser is a hydration mismatch by construction, since
   * the two are always some hundreds of milliseconds apart. `getServerSnapshot`
   * returns null and the first paint simply has no clock, for one frame.
   *
   * The snapshot is whole seconds, not `Date.now()`. React calls it on every
   * render and compares by identity: a value that changes every call is an
   * infinite render loop.
   */
  const second = useSyncExternalStore(subscribeToTheSecond, currentSecond, () => null);
  const now = second === null ? null : new Date(second * 1_000);

  /*
   * The figures refresh every minute, and the poll is also the link check.
   *
   * A minute is chosen from what the numbers are for: a room fills over
   * minutes, and a screen nobody interacts with does not deserve a socket. The
   * same request answers "is the server there", which is the only health signal
   * this screen can honestly show today — printers arrive with the print agent.
   */
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch('/api/pos/idle', { cache: 'no-store' });

        if (cancelled) return;

        if (!response.ok) {
          setLinkUp(false);

          return;
        }

        setData((await response.json()) as IdleData);
        setLinkUp(true);
      } catch {
        if (!cancelled) setLinkUp(false);
      }
    }

    const timer = setInterval(() => void poll(), 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const blocks = BLOCKS[mode];
  const big = mode === 'minimal';

  const clock =
    now === null
      ? ''
      : [now.getHours(), now.getMinutes(), now.getSeconds()]
          .map((part) => String(part).padStart(2, '0'))
          .join(':');

  const date =
    now === null
      ? ''
      : `${(DAYS[locale] ?? DAYS.uz)[now.getDay()]}, ${now.getDate()}-${(MONTHS[locale] ?? MONTHS.uz)[now.getMonth()]}`;

  const venue = data?.branch;
  const address = [venue?.name, venue?.address].filter(Boolean).join(' · ');

  const figures =
    data === null
      ? []
      : [
          { label: m.idleOccupied, value: String(data.stats.occupied_tables), accent: false },
          { label: m.idleFree, value: String(data.stats.free_tables), accent: false },
          { label: m.idleOnShift, value: String(data.stats.on_shift), accent: false },
          {
            label: m.idleSales,
            // Compact, because the tile is 112px and the day's takings are the
            // one figure here that runs to eight digits.
            value: formatTiyinCompact(data.stats.takings_tiyin, locale as 'uz' | 'ru' | 'en'),
            accent: true,
          },
        ];

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden text-white"
      style={{ background: BACKGROUNDS[background] ?? BACKGROUNDS.night }}
    >
      {/* The design's wash over the flat gradient — depth without a photograph. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(120% 90% at 50% 0%,rgba(46,116,234,.18) 0%,transparent 62%)',
        }}
      />

      {/* ---- clock, and the way back to the settings that shaped this screen ---- */}
      <div className="relative flex flex-none items-start justify-between p-[26px] sm:p-[30px]">
        <div>
          <div
            data-num
            className="font-display leading-none font-bold tracking-[-0.03em] tabular-nums"
            style={{ fontSize: big ? '104px' : '56px' }}
          >
            {clock}
          </div>
          <div className="mt-1.5 text-sm text-white/60">{date}</div>
        </div>

        <Link
          href="/settings/terminal"
          aria-label={m.idleSettings}
          title={m.idleSettings}
          className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/20 bg-white/5 text-white/70"
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>

      {/* ---- the venue, and the way in ---- */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[26px] px-[30px]">
        <div className="flex flex-col items-center gap-3.5">
          <span
            className="bg-brand-500 font-display flex items-center justify-center rounded-[18px] font-extrabold tracking-[-0.02em] text-white"
            style={{
              width: big ? 84 : 64,
              height: big ? 84 : 64,
              fontSize: big ? 30 : 23,
            }}
          >
            SR
          </span>

          <div className="text-center">
            <div
              className={`font-display font-bold tracking-tight ${big ? 'text-3xl' : 'text-2xl'}`}
            >
              {data?.restaurant.name ?? 'Smart Restaurant'}
            </div>
            {address !== '' ? <div className="mt-1 text-sm text-white/60">{address}</div> : null}
          </div>
        </div>

        <Link
          href="/pos/who"
          className="rounded-pill flex h-[60px] items-center justify-center gap-3 bg-white px-[54px] text-lg font-semibold text-[#0B0E16] shadow-[0_12px_28px_rgba(0,0,0,.28)]"
        >
          {m.idleEnter}
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12h13" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>

        {blocks.stats && figures.length > 0 ? (
          <div className="flex gap-px overflow-hidden rounded-[16px] border border-white/10 bg-white/10">
            {figures.map((figure) => (
              <div
                key={figure.label}
                className="min-w-[112px] bg-white/5 px-[22px] py-[13px] text-center"
              >
                <div
                  data-num
                  className={`font-display text-xl font-bold tabular-nums ${
                    figure.accent ? 'text-success-500' : 'text-white'
                  }`}
                >
                  {figure.value}
                </div>
                <div className="mt-[3px] text-[10px] font-semibold tracking-[0.07em] text-white/50 uppercase">
                  {figure.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ---- what this terminal is, and whether it can reach the server ---- */}
      {blocks.health ? (
        <div className="relative flex flex-none flex-wrap items-center justify-between gap-4 border-t border-white/10 px-[30px] py-3.5">
          <span
            className="text-2xs flex items-center gap-[7px] font-mono font-semibold text-white/60"
            title={linkUp ? m.idleLinkUp : m.idleLinkDown}
          >
            <span
              className={`h-[7px] w-[7px] flex-none rounded-full ${
                linkUp ? 'bg-success-500' : 'bg-danger-500'
              }`}
            />
            {m.idleLink}
          </span>

          <div className="text-2xs flex items-center gap-3.5 font-mono text-white/40">
            {data !== null ? (
              <span>
                {data.terminal.code}
                {venue?.name ? ` · ${venue.name}` : ''}
              </span>
            ) : null}
            {data?.terminal.app_version ? <span>v{data.terminal.app_version}</span> : null}
            <span>{m.idleHelp}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
