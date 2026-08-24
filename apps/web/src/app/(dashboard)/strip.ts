import type { Pulse } from './shell-server';

/** What `t()` looks like to this file — `next-intl`'s, with ICU arguments. */
type Translate = (key: string, values?: Record<string, string | number>) => string;

export type Strip = {
  service: string;
  tables: string;
  kitchen: string;
  stock: string;
  /** Whether the stock chip is a warning (something is short) or a calm note. */
  stockShort: boolean;
  kitchenBusy: boolean;
};

/**
 * The status strip's four sentences, from the four facts.
 *
 * The strip sits over every console screen, and for a week it said "shift
 * open · 11:24 · 14 of 32 tables seated · 7 tickets in the kitchen" to every
 * restaurant from the catalogue — to one that had never opened a till. With
 * no pulse (the fixture console, no session) the catalogue's sentence stays,
 * because it is captioning the catalogue's data. With a pulse, each chip
 * says what is true, including nothing: a kitchen with no dockets says so,
 * rather than hiding the chip and leaving the reader to wonder whether the
 * kitchen is quiet or the screen is broken.
 */
export function stripFrom(pulse: Pulse | null, t: Translate, locale: string, now: Date): Strip {
  if (pulse === null) {
    return {
      service: t('serviceOpen'),
      tables: t('tablesSeated'),
      kitchen: t('kitchenLoad'),
      stock: t('lowStock'),
      stockShort: true,
      kitchenBusy: true,
    };
  }

  const total = pulse.floor.occupied + pulse.floor.free;
  const openedAt = pulse.shift_open_since === null ? null : new Date(pulse.shift_open_since);

  return {
    service:
      openedAt === null || Number.isNaN(openedAt.getTime())
        ? t('serviceClosed')
        : t('serviceOpenAt', { time: clockOf(openedAt, locale, now) }),
    tables:
      total === 0 ? t('tablesNone') : t('tablesSeatedOf', { taken: pulse.floor.occupied, total }),
    kitchen:
      pulse.kitchen.open === 0
        ? t('kitchenIdle')
        : t('kitchenLoadOf', {
            count: pulse.kitchen.open,
            minutes: pulse.kitchen.oldest_minutes ?? 0,
          }),
    stock:
      pulse.stock.low + pulse.stock.out === 0
        ? t('stockFine')
        : t('lowStockOf', { count: pulse.stock.low + pulse.stock.out }),
    stockShort: pulse.stock.low + pulse.stock.out > 0,
    kitchenBusy: pulse.kitchen.open > 0,
  };
}

/**
 * "11:24" in the reader's language — or, for a till opened before today
 * (a shift somebody forgot to close), the day as well, so "open since
 * Tuesday 23:10" reads as the problem it is rather than as this morning.
 */
function clockOf(at: Date, locale: string, now: Date): string {
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();

  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(sameDay ? {} : { weekday: 'short' }),
    hour12: false,
  }).format(at);
}
