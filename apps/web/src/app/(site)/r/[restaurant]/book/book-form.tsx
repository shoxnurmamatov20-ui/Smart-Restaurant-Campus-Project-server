'use client';

import { useEffect, useState } from 'react';

import type { BookDay } from './book-days';
import { flash } from '@restaurant/ui';

import { copyFor, fill, type GuestLocaleOf } from '../../../locale-bridge';
import { say, VENUE, type SiteLocale } from '../../../venue-data';
import type { BookVenue } from './book-server';

type Status = 'idle' | 'sending' | 'done' | 'duplicate' | 'refused' | 'unreachable';

/** The eight sittings the design offers — `dc.html:1106`. */
const SLOTS = ['12:00', '13:00', '14:00', '18:00', '19:00', '19:30', '20:00', '21:00'] as const;

/** One sitting the chooser can draw: what it says, what it sends, and whether it is free. */
type Slot = {
  /** `19:00` — the wall clock, in the venue's own frame. */
  label: string;
  /** `2026-08-22T19:00:00` — what `starts_at` is sent as. Never carries a zone. */
  value: string;
  available: boolean;
};

/** The booking a guest is holding, as `GET /public/reservations/{code}` answers. */
type Booking = {
  code: string;
  status: string;
  startsAt: string;
  guestsCount: number;
  confirmed: boolean;
  cancellable: boolean;
};

const rememberKey = (restaurant: string) => `srcp.booking.${restaurant}`;

/**
 * Four things only the guest knows: who, which number, how many, and when.
 *
 * Everything else the staff form asks for is deliberately absent — the table,
 * the status, the source, how long the table is held. Those are the
 * restaurant's to decide, and a public form that offered them would be a form
 * that lets somebody hold table 12 every Friday for a year. See
 * `PublicReservationRequest`.
 *
 * ---------------------------------------------------------------------------
 * Chips, not `<input type="date">` and `<input type="time">`
 *
 * `dc.html:548-565` gives the day five 60px cards and the sitting eight chips,
 * and it is not decoration. A native date picker on a phone is three taps into
 * a calendar that offers next March; a restaurant takes bookings for this week
 * and serves at known times. The picker also had no way to say a sitting was
 * gone, which is the one thing a booking form has to be able to say.
 *
 * **What "taken" means here, now that the venue answers.** The design greys
 * 19:00 as a fixture. This asks the diary instead —
 * `GET /public/booking-slots?branch_id&date&guests`, through this surface's own
 * Node handler — and greys what it says is gone. A venue that has configured no
 * windows answers an empty list, which is every restaurant on the platform
 * until somebody fills them in, and then the eight fixed chips above are what
 * the form draws, exactly as it always did. A clash on a slot the chooser did
 * offer still comes back from the booking endpoint as `tables.slot_unavailable`
 * and is printed under the button in the reader's own language.
 *
 * ---------------------------------------------------------------------------
 * The code, and the button that earns its keep
 *
 * `POST /public/reservations` answers with a ten-character code, and it is the
 * guest's whole credential for reading, confirming and — the commercially
 * valuable one — CANCELLING. A guest who cannot call a booking off from their
 * phone telephones a room that is busy serving dinner, which in practice means
 * nobody telephones: the table stays held for a party that is not coming and
 * the evening is short a cover somebody else wanted.
 *
 * So the code is printed the moment it exists, kept in this browser so a guest
 * who comes back finds it, and read from `?code=` as well — which is the link
 * the reminder message will carry.
 */
export function BookForm({
  restaurant,
  locale,
  venues,
  housePhone,
  days,
}: {
  restaurant: string;
  locale: GuestLocaleOf;
  /** Bookable venues with the row id `branch_id` is sent as — see `book-server.ts`. */
  venues: readonly BookVenue[];
  /**
   * The restaurant's own number for a party too large to book online, or null.
   *
   * It was `VENUE.phone` — the demo's — which is the worst place on this form
   * for a wrong number: this line is shown to the guest booking the twenty-cover
   * table the restaurant most wants.
   */
  housePhone: string | null;
  /**
   * The five days the rail offers, worded on the server. Worded there and not
   * here because `Intl.DateTimeFormat` does not agree with itself across
   * runtimes — Node's ICU wrote one short weekday, the browser's another, and
   * the first paint of this form was a hydration mismatch (#418) on every
   * visit. One clock, one ICU, serialised once.
   */
  days: readonly BookDay[];
}) {
  const t = copyFor(locale).site;

  /*
   * Today in Tashkent, and the five days after it.
   *
   * The venue's clock, not the reader's: a guest in Berlin booking at half past
   * midnight is booking for the restaurant's tomorrow, not their own.
   */
  const [branch, setBranch] = useState(venues[0]?.id ?? '');
  const [day, setDay] = useState(days[0]!.iso);
  const [time, setTime] = useState<string>('19:00');
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [detail, setDetail] = useState('');
  /**
   * What the diary answered, keyed by the question.
   *
   * The cache IS the state, rather than a ref beside one: the answer to
   * "Chilonzor, Friday, four covers" does not change while a guest is looking
   * at it, and holding the map means a day already asked about is not asked
   * about twice. That matters more here than it sounds — the whole public group
   * is throttled at five a minute (`throttle:5,1`), which the booking itself
   * has to fit inside.
   */
  const [windows, setWindows] = useState<Readonly<Record<string, readonly Slot[]>>>({});
  const [booking, setBooking] = useState<Booking | null>(null);
  const [managing, setManaging] = useState(false);

  const busy = status === 'sending';
  const sent = status === 'done' || status === 'duplicate';
  const picked = days.find((entry) => entry.iso === day) ?? days[0]!;
  const large = guests > VENUE.largeOrderFrom;
  const venue = venues.find((entry) => entry.id === branch) ?? venues[0];
  const branchName = venue?.name ?? '';

  /** Which question this render is asking the diary, or null on a fixture floor. */
  const slotKey = venue?.apiId == null ? null : `${venue.apiId}|${day}|${guests}`;
  const published = slotKey === null ? undefined : windows[slotKey];

  /*
   * The eight fixed chips when the venue has published no windows, and the
   * diary's own list when it has. Both send a wall clock with no zone — see
   * `submit`.
   */
  const slots: readonly Slot[] =
    published !== undefined && published.length > 0
      ? published
      : SLOTS.map((label) => ({ label, value: `${day}T${label}:00`, available: true }));

  /*
   * The sitting this form would actually book, derived rather than corrected.
   *
   * A guest picks 19:00 and then steps the party up to eight, and 19:00 is
   * gone. Writing the replacement back into state would be a render that fixes
   * itself — React's own advice against it is the lint rule that caught it —
   * and the guest's last explicit pick would be lost, so stepping the party
   * back down would not return them to the time they chose. This keeps the
   * pick, and offers the first free sitting whenever the pick is not available.
   */
  const chosen =
    slots.find((slot) => slot.label === time && slot.available) ??
    slots.find((slot) => slot.available) ??
    slots[0];
  const showing = chosen?.label ?? time;

  /**
   * The venue's own sittings for the day and the party — debounced and cached.
   *
   * Both are about the same five-a-minute throttle the booking endpoint shares
   * (`throttle:5,1` on the whole public group): a guest stepping 2 → 3 → 4 → 5
   * covers would otherwise spend the budget they need to actually book with. So
   * a burst of taps makes one request, and a question already answered is not
   * asked again.
   *
   * Nothing is written to state synchronously here — the answer lands in the
   * map when it arrives, and everything the screen draws is derived from that
   * above. A fixture render has no `slotKey` and simply never asks.
   */
  useEffect(() => {
    if (slotKey === null || windows[slotKey] !== undefined) return;

    const abort = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        branch_id: String(venue?.apiId ?? ''),
        date: day,
        guests: String(guests),
      });

      void fetch(`/r/${encodeURIComponent(restaurant)}/book/slots?${query.toString()}`, {
        signal: abort.signal,
      })
        .then((response) => (response.ok ? response.json() : { data: [] }))
        .then((body: { data?: { at?: string; available?: boolean }[] }) => {
          const mapped = (body.data ?? [])
            .filter(
              (slot): slot is { at: string; available?: boolean } => typeof slot.at === 'string',
            )
            .map((slot) => ({
              /*
               * The wall clock straight off the instant, never through a
               * `Date`.
               *
               * `2026-08-22T19:00:00+05:00` read by a browser in Berlin is
               * sixteen o'clock, and a guest there would be shown a sitting the
               * restaurant does not serve at. The characters carry the venue's
               * own frame, which is the frame `starts_at` is compared in.
               */
              label: slot.at.slice(11, 16),
              value: `${slot.at.slice(0, 16)}:00`,
              available: slot.available !== false,
            }));

          setWindows((current) => ({ ...current, [slotKey]: mapped }));
        })
        .catch(() => {
          /* Offline, or the read was abandoned. The fixed chips stand. */
        });
    }, 350);

    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [restaurant, slotKey, windows, venue?.apiId, day, guests]);

  /**
   * The booking this browser is already holding, refreshed from the diary.
   *
   * `?code=` first — that is the link a reminder message carries and it belongs
   * to whoever followed it — then whatever was written here when the booking
   * was made. Read in an effect rather than during render because
   * `localStorage` does not exist on the server, and a value read at hydration
   * that the server never saw is a mismatch React reports as a broken page.
   */
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('code');
    let held: string | null = fromLink;

    if (held === null) {
      try {
        held = window.localStorage.getItem(rememberKey(restaurant));
      } catch {
        held = null;
      }
    }

    if (held === null || held === '') return;

    const code = held.trim().toUpperCase();
    let alive = true;

    void fetch(
      `/r/${encodeURIComponent(restaurant)}/book/${encodeURIComponent(code)}?lang=${locale}`,
    )
      .then(async (response) => {
        if (!alive) return;

        if (!response.ok) {
          // Gone, or never this restaurant's. Forgetting is the right answer:
          // a card about a booking nobody can act on is worse than no card.
          forget(restaurant);

          return;
        }

        const body = (await response.json()) as { data?: ApiBooking };

        if (alive && body.data !== undefined) setBooking(bookingFrom(body.data));
      })
      .catch(() => {
        /* Offline. The card stays away rather than showing a stale status. */
      });

    return () => {
      alive = false;
    };
  }, [restaurant, locale]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (busy) return;

    setStatus('sending');
    setDetail('');

    try {
      const response = await fetch(
        `/r/${encodeURIComponent(restaurant)}/book/submit?lang=${locale}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guest_name: name,
            guest_phone: phone,
            guests_count: guests,
            /*
             * The wall-clock the guest picked, sent without a zone.
             *
             * `19:00` on a restaurant's own site means seven in the evening at
             * that restaurant. Stamping the browser's offset onto it would book
             * a guest in London a table at midnight, which is a real booking a
             * real manager would then ring about.
             */
            starts_at: chosen?.value ?? `${day}T${showing}:00`,
            /*
             * Which venue, as the number the diary files it under.
             *
             * `dc.html:536-548` puts a chooser at the top of this card and it
             * used to have nowhere to send the answer — so the branch rode in
             * `note`, in front of a manager, because a guest picking Sergeli
             * and being seated at Chilonzor is a family standing in the wrong
             * doorway. `PublicReservationRequest` takes `branch_id` now.
             *
             * Omitted rather than guessed when there is no id: that is a
             * fixture render, and a restaurant with one open venue has no
             * choice to make anyway. A chain with no id is answered
             * `tables.branch_required`, whose sentence is printed below.
             */
            ...(venue?.apiId == null ? {} : { branch_id: venue.apiId }),
            /* Only what the guest typed. The venue is a field now, not a note. */
            ...(note.trim() === '' ? {} : { note: note.trim().slice(0, 500) }),
          }),
        },
      );

      const body = (await response.json().catch(() => null)) as {
        data?: { duplicate?: boolean; code?: string } & Partial<ApiBooking>;
        error?: string;
        message?: string;
      } | null;

      if (response.ok) {
        setStatus(body?.data?.duplicate === true ? 'duplicate' : 'done');

        const code = body?.data?.code;

        if (typeof code === 'string' && code !== '') {
          remember(restaurant, code);
          setBooking(
            bookingFrom({
              code,
              status: body?.data?.status ?? 'pending',
              starts_at: body?.data?.starts_at ?? chosen?.value ?? `${day}T${showing}:00`,
              guests_count: body?.data?.guests_count ?? guests,
              confirmed: body?.data?.confirmed ?? false,
              // A booking that has just been made can always be called off.
              cancellable: true,
            }),
          );
        }

        flash(t.book.done);

        return;
      }

      setStatus('refused');
      setDetail(body?.message ?? '');
      flash.problem(body?.message ?? fill(t.book.taken, { time: showing }));

      /*
       * The one refusal this form can act on by itself: the sitting went while
       * the guest was typing. Dropping the cached answer makes the next render
       * ask the diary again and grey what is actually gone.
       */
      if (body?.error === 'tables.slot_unavailable') setWindows({});
    } catch {
      setStatus('unreachable');
      flash.problem(t.common.offline);
    }
  }

  /** Confirm or call off the booking this browser is holding. */
  async function manage(action: 'confirm' | 'cancel') {
    if (booking === null || managing) return;

    setManaging(true);

    try {
      const response = await fetch(
        `/r/${encodeURIComponent(restaurant)}/book/${encodeURIComponent(booking.code)}?lang=${locale}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );

      const body = (await response.json().catch(() => null)) as {
        data?: ApiBooking;
        message?: string;
      } | null;

      if (!response.ok) {
        flash.problem(body?.message ?? t.common.offline);

        return;
      }

      if (body?.data !== undefined) setBooking(bookingFrom(body.data));

      // A cancelled booking is not one to come back to, so this browser stops
      // holding the code — the card stays for this render so the guest sees
      // that it happened, and is gone the next time they open the page.
      if (action === 'cancel') forget(restaurant);

      flash(action === 'cancel' ? t.book.cancelled : t.book.confirmed);
    } catch {
      flash.problem(t.common.offline);
    } finally {
      setManaging(false);
    }
  }

  const card = (
    <BookingCard
      booking={booking}
      locale={locale}
      t={t}
      busy={managing}
      onConfirm={() => void manage('confirm')}
      onCancel={() => void manage('cancel')}
    />
  );

  if (sent) {
    return (
      <div className="border-acc-line bg-acc-soft mt-7 max-w-[46rem] rounded-lg border p-6">
        <p className="text-md font-semibold">{t.book.done}</p>
        <p className="text-fg-subtle mt-1.5 text-sm leading-normal">{t.book.ctaNote}</p>

        {/*
         * A second tap on a slow connection returned the first booking rather
         * than making another. Said out loud, because a guest who submitted
         * twice is watching for exactly this.
         */}
        {status === 'duplicate' ? (
          <p className="text-fg-muted mt-3 text-xs leading-normal">{t.book.taken.split('·')[0]}</p>
        ) : null}

        {card}
      </div>
    );
  }

  const summary = [
    { label: t.book.branch, value: branchName },
    { label: t.book.date, value: `${picked.day} ${picked.month}` },
    { label: t.book.time, value: showing },
    { label: t.book.guests, value: String(guests) },
  ];

  return (
    <>
      {card}

      <form
        onSubmit={submit}
        className="mt-6 grid items-start gap-7 lg:[grid-template-columns:minmax(0,1fr)_400px]"
      >
        <div className="border-border bg-surface rounded-lg border px-6.5 py-6">
          <Legend>{t.book.branch}</Legend>
          <div className="grid gap-2.5">
            {/* Only the branches that take bookings — `dc.html:1035`, and the
                filter is `book-server.ts`'s now, because it also needs the row
                id and the shop window does not publish one. */}
            {venues.map((option) => (
              <Option
                key={option.id}
                on={option.id === branch}
                onClick={() => setBranch(option.id)}
                title={option.name}
                sub={say(option.address, locale as SiteLocale)}
              />
            ))}
          </div>

          <Legend className="mt-5.5">{t.book.day}</Legend>
          <div className="flex flex-wrap gap-2">
            {days.map((entry) => (
              <button
                key={entry.iso}
                type="button"
                aria-pressed={entry.iso === day}
                onClick={() => setDay(entry.iso)}
                className={`h-15 rounded-md border px-4 text-center ${
                  entry.iso === day
                    ? 'border-acc bg-acc-soft text-acc-dark'
                    : 'border-border bg-surface text-fg-muted'
                }`}
              >
                <span className="text-2xs block font-semibold tracking-wide uppercase">
                  {entry.dow}
                </span>
                <span data-num className="font-display mt-0.5 block text-lg font-bold">
                  {entry.day}
                </span>
              </button>
            ))}
          </div>

          <Legend className="mt-5.5">{t.book.time}</Legend>
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <button
                key={slot.label}
                type="button"
                data-num
                aria-pressed={slot.label === showing}
                disabled={!slot.available}
                onClick={() => setTime(slot.label)}
                className={`h-10 rounded-md border px-3.5 text-sm font-semibold disabled:line-through disabled:opacity-45 ${
                  slot.label === showing
                    ? 'border-acc bg-acc-soft text-acc-dark'
                    : 'border-border bg-surface text-fg-muted'
                }`}
              >
                {slot.label}
              </button>
            ))}
          </div>

          {/* Every sitting the venue published for this day is spoken for. Said
              rather than drawn as eight struck-through chips a guest reads
              twice. */}
          {slots.length > 0 && slots.every((slot) => !slot.available) ? (
            <p className="text-fg-muted mt-2.5 text-[13px] leading-normal">{t.book.noSlots}</p>
          ) : null}

          <Legend className="mt-5.5">{t.book.guests}</Legend>
          <div className="flex items-center gap-3">
            <Step label="−" onClick={() => setGuests((n) => Math.max(1, n - 1))} />
            <span data-num className="font-display w-12 text-center text-xl font-bold">
              {guests}
            </span>
            {/* Twenty, which is `dc.html:1035`'s own ceiling and also the
                server's: `PublicReservationRequest` refuses `guests_count` above
                it. The stepper climbed to sixty, so a guest could reach a number
                the form would then be refused for. */}
            <Step label="+" onClick={() => setGuests((n) => Math.min(20, n + 1))} />
            <span className="text-fg-subtle ml-1.5 text-[13px]">{t.book.guestsNote}</span>
          </div>

          {/*
           * A big party gets a sentence, not a locked button.
           *
           * It used to cap the field at eight and disable submit above it, which
           * turns "we would rather talk to you" into "this website will not take
           * your booking". The restaurant wants the twenty-person table; it wants
           * a telephone call about it first.
           */}
          {large ? (
            <p className="text-fg-muted mt-2.5 text-[13px] leading-normal">
              {fill(t.book.guestsMany, { max: VENUE.largeOrderFrom })}
              {housePhone === null ? null : (
                <>
                  {' · '}
                  <a href={`tel:${housePhone.replace(/[^+\d]/g, '')}`} className="font-semibold">
                    {housePhone}
                  </a>
                </>
              )}
            </p>
          ) : null}

          <div className="mt-5.5 grid gap-3 sm:grid-cols-2">
            <Field label={t.book.name}>
              <input
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="border-border-strong bg-surface h-11 w-full rounded-md border px-3.5 text-sm"
              />
            </Field>

            <Field label={t.book.phone}>
              <input
                required
                type="tel"
                inputMode="tel"
                minLength={7}
                maxLength={32}
                data-num
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="border-border-strong bg-surface h-11 w-full rounded-md border px-3.5 text-sm"
              />
            </Field>
          </div>

          <div className="mt-3.5">
            <Field label={t.book.note}>
              {/* Two rows, per the design. A booking note is "terrace, and it is
                  her birthday" — a sentence, not a field. */}
              <textarea
                rows={2}
                maxLength={500}
                placeholder={t.book.notePlaceholder}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="border-border-strong bg-surface w-full resize-y rounded-md border px-3.5 py-2.5 text-sm"
              />
            </Field>
          </div>
        </div>

        {/* ------------------------------------------------------------ summary */}
        <div className="border-border bg-surface rounded-lg border p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-bold tracking-tight">{t.book.summary}</h2>

          <dl className="mt-4 grid gap-2.5">
            {summary.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-fg-muted text-sm">{row.label}</dt>
                <dd data-num className="flex-none text-right text-sm font-semibold">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <button
            type="submit"
            disabled={busy}
            className="bg-acc mt-5 grid h-12.5 w-full place-items-center rounded-md text-[15px] font-semibold text-white disabled:opacity-55"
          >
            {t.book.cta}
          </button>

          <p className="text-fg-subtle mt-2.5 text-xs leading-relaxed">{t.book.ctaNote}</p>

          {status === 'refused' || status === 'unreachable' ? (
            <p role="alert" className="text-danger-600 mt-2.5 text-sm leading-normal">
              {status === 'unreachable'
                ? t.common.offline
                : detail || fill(t.book.taken, { time: showing })}
            </p>
          ) : null}
        </div>
      </form>
    </>
  );
}

/** What `GET /public/reservations/{code}` answers, and `POST …` answers back. */
type ApiBooking = {
  code: string;
  status: string;
  starts_at: string;
  guests_count: number;
  confirmed: boolean;
  cancellable: boolean;
};

const bookingFrom = (data: ApiBooking): Booking => ({
  code: data.code,
  status: data.status,
  startsAt: data.starts_at,
  guestsCount: Number(data.guests_count) || 0,
  confirmed: data.confirmed === true,
  cancellable: data.cancellable === true,
});

function remember(restaurant: string, code: string) {
  try {
    window.localStorage.setItem(rememberKey(restaurant), code);
  } catch {
    /* Private mode, or a full quota. The code is on the screen either way. */
  }
}

function forget(restaurant: string) {
  try {
    window.localStorage.removeItem(rememberKey(restaurant));
  } catch {
    /* Nothing was stored, which is the state this wanted anyway. */
  }
}

/**
 * The booking this browser is holding, and the two things a guest may do to it.
 *
 * Drawn above the form rather than instead of it: a guest with a table on
 * Friday may well be booking Saturday, and a page that hid the form to show a
 * receipt would make them go and find the code first.
 *
 * The cancel button is the one that matters. Confirming is offered only while
 * the booking is still `pending`, because that is what the reminder asks — "yes,
 * we are still coming" — and a button that re-confirms a confirmed table is a
 * button that does nothing visible.
 */
function BookingCard({
  booking,
  locale,
  t,
  busy,
  onConfirm,
  onCancel,
}: {
  booking: Booking | null;
  locale: GuestLocaleOf;
  t: ReturnType<typeof copyFor>['site'];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (booking === null) return null;

  const when = new Date(booking.startsAt);
  const stamp = Number.isNaN(when.getTime())
    ? booking.startsAt
    : new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(when);

  return (
    <section className="border-border bg-surface mt-6 max-w-[46rem] rounded-lg border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-md font-bold tracking-tight">{t.book.manage}</h2>
        <span className="text-fg-subtle text-xs">
          {booking.status === 'cancelled'
            ? t.book.cancelled
            : booking.confirmed
              ? t.book.confirmed
              : t.book.pending}
        </span>
      </div>

      <dl className="mt-3.5 grid gap-2">
        <Line label={t.book.code} value={booking.code} />
        <Line label={t.book.time} value={stamp} />
        <Line label={t.book.guests} value={String(booking.guestsCount)} />
      </dl>

      <p className="text-fg-subtle mt-3 text-xs leading-relaxed">{t.book.codeNote}</p>

      {booking.cancellable ? (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {booking.confirmed ? null : (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="bg-acc h-11 rounded-md px-5 text-sm font-semibold text-white disabled:opacity-55"
            >
              {t.book.confirm}
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="border-border-strong h-11 rounded-md border px-5 text-sm font-semibold disabled:opacity-55"
          >
            {t.book.cancel}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd data-num className="flex-none text-right text-sm font-semibold">
        {value}
      </dd>
    </div>
  );
}

function Legend({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`mb-2.5 text-[13px] font-semibold ${className}`}>{children}</p>;
}

/** A radio row with the design's filled dot rather than a native control. */
function Option({
  on,
  onClick,
  title,
  sub,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex items-center gap-3.5 rounded-md border px-4 py-3.5 text-left ${
        on ? 'border-acc bg-acc-soft' : 'border-border bg-surface'
      }`}
    >
      <span
        aria-hidden
        className={`grid size-[19px] flex-none place-items-center rounded-full border-[1.5px] text-[11px] font-bold text-white ${
          on ? 'border-acc bg-acc' : 'border-border-strong'
        }`}
      >
        {on ? '✓' : ''}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display block text-[15px] font-bold tracking-tight">{title}</span>
        <span className="text-fg-subtle mt-0.5 block text-[13px]">{sub}</span>
      </span>
    </button>
  );
}

function Step({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="border-border-strong bg-surface grid size-11 place-items-center rounded-md border text-[17px] font-semibold"
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
    </label>
  );
}
