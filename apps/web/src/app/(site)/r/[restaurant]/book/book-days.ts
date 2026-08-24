/**
 * The rail of days a guest may book — computed on the server, handed to the
 * form as a prop.
 *
 * Its own module, and not `'use client'`: a function exported from a client
 * file reaches a server page as a client *reference*, not a function, and
 * `bookDays is not a function` was this page answering 500 in production
 * within the hour of it being written. Server code lives in server modules;
 * the form only needs the type.
 */

/** Five days forward, which is as far ahead as the design's rail goes. */
const DAYS = 5;

export type BookDay = { iso: string; dow: string; day: string; month: string };

/**
 * Today in Tashkent and the days after it, as the rail shows them. Called by
 * the server page — see the `days` prop for why not here.
 */
export function bookDays(locale: string, now: Date = new Date()): readonly BookDay[] {
  const today = new Date(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(now)}T12:00:00Z`,
  );

  return Array.from({ length: DAYS }, (_, index) => {
    const date = new Date(today);

    date.setUTCDate(date.getUTCDate() + index);

    return {
      iso: date.toISOString().slice(0, 10),
      dow: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(date),
      day: String(date.getUTCDate()),
      month: new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(date),
    };
  });
}
