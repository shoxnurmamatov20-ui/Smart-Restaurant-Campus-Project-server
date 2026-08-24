/**
 * The clock the venue wrote, not the one the reader's machine keeps.
 *
 * Every timestamp the API sends carries the venue's own offset —
 * `2026-08-27T18:00:00+05:00` — because that is what the fact is: eighteen
 * hundred, in that room. Reading it back through `new Date(iso).getHours()`
 * converts the instant into whatever zone the *reader* happens to be in, so an
 * 18:00–02:00 bar shift renders as 13:00–21:00 on a machine set to UTC.
 *
 * It went unnoticed for a simple reason: this box, the phones and the tablets
 * are all Asia/Tashkent, so the conversion was the identity. CI runs in UTC and
 * said so the first time it was allowed past its second step — an 18:00 shift
 * label and a write-off timed 13:20 instead of 08:20, both off by exactly the
 * five hours between the two zones.
 *
 * It is not only a display fault. A 02:00 finish converted back five hours lands
 * on the *previous date*, so a swap form offers Thursday for a shift that ends
 * Friday morning, and a waiter accepts the wrong one.
 *
 * **When not to use this.** A clock showing *now* — the till's idle screen, the
 * crew lock screen, the health strip — must read the device, because the person
 * looking at it is standing in front of the device. This is for a stamp that
 * came from the server and already says which hour it means.
 */

/** Year, month, day, hour, minute, as written. Seconds and offset are ignored. */
const WRITTEN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * A `Date` whose **UTC** fields are the stamp's written fields.
 *
 * Anchoring to UTC is what makes it readable back out the same way anywhere:
 * `getUTCHours()` and `Intl` with `timeZone: 'UTC'` both return what was
 * written, on a machine in Tashkent, in London or on Kiritimati.
 *
 * `null` for something with no recognisable date and time — a caller decides
 * whether that is an em dash, an empty label or a dropped row, and they do not
 * all decide the same thing.
 */
export function writtenAt(iso: string): Date | null {
  const parts = WRITTEN.exec(iso);

  if (parts === null) {
    // Not the shape the API sends. Parse it as an instant rather than refusing —
    // an older row or a hand-typed value is still better read than not read.
    const parsed = new Date(iso);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);

  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

/** `18:00` — the hour and minute as written, or `fallback` when there is none. */
export function writtenClock(iso: string | null | undefined, fallback = '—'): string {
  if (iso === null || iso === undefined || iso === '') return fallback;

  const at = writtenAt(iso);

  if (at === null) return fallback;

  return `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
}
