'use client';

import { useSyncExternalStore } from 'react';

import { MONTHS, say, WEEKDAYS, type Lang } from '@restaurant/surfaces/crew/data';

const MINUTE = 60_000;

/**
 * The wall clock, subscribed to once a minute.
 *
 * Ticked on the minute rather than the second: this screen shows hours and
 * minutes, so a per-second timer would wake the phone sixty times for
 * fifty-nine repaints that change nothing — which on a courier's phone at 40%
 * battery is a real cost by the end of a shift.
 */
function subscribe(onTick: () => void) {
  const timer = setInterval(onTick, MINUTE);
  return () => clearInterval(timer);
}

/**
 * The clock, which is most of what a lock screen is.
 *
 * `useSyncExternalStore` rather than an effect that sets state, because the
 * clock genuinely is an external source: the server's clock runs in the
 * deployment's timezone and the reader's does not, so a server-rendered time
 * would hydrate to a different string than it painted. The server snapshot is
 * deliberately `null` — React then re-renders with the real time after
 * hydration, with no mismatch and no flicker between two wrong times on the one
 * element whose whole job is to be right at a glance.
 *
 * The date is assembled from the trilingual month and weekday tables rather
 * than from `Intl`: `uz-Latn-UZ` is not carried by every runtime, and the ones
 * that lack it answer in English without saying so.
 */
export function LockClock({ lang }: { lang: Lang }) {
  const minute = useSyncExternalStore<number | null>(
    subscribe,
    () => Math.floor(Date.now() / MINUTE),
    () => null,
  );

  const now = minute === null ? null : new Date(minute * MINUTE);

  const time =
    now === null
      ? ''
      : `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const weekday = now === null ? undefined : WEEKDAYS[now.getDay()];
  const month = now === null ? undefined : MONTHS[now.getMonth()];

  /*
   * The hyphen is Uzbek, and only Uzbek.
   *
   * `11-avgust` is how a date is written in Uzbek and the form was being used
   * in all three languages, producing «Вторник, 11-августа» and "Tuesday,
   * 11-August" — neither of which is a date anybody writes. Russian and English
   * separate the number from the month with a space.
   */
  const date =
    now === null || weekday === undefined || month === undefined
      ? ''
      : `${say(weekday, lang)}, ${now.getDate()}${lang === 'uz' ? '-' : ' '}${say(month, lang)}`;

  return (
    <div className="flex-none pt-8 pb-1 text-center">
      {/* A fixed height on both, so the header does not jump down the screen
          when the time arrives a moment after the cards. */}
      <p className="min-h-5 text-sm font-medium text-[var(--crew-lock-dim)]">{date}</p>
      <p
        data-num
        className="font-display min-h-16 text-[64px] leading-none font-bold tracking-[-0.03em] text-[var(--crew-lock-fg)]"
      >
        {time}
      </p>
    </div>
  );
}
