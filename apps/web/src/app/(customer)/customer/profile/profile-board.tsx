'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { flash } from '@restaurant/ui';

import { useCart } from '../../cart-store';
import { AUTH, copy, PROBLEM, PROFILE, SHARED } from '@restaurant/surfaces/customer/copy';
import type { TrackedOrderPayload } from '@restaurant/surfaces/customer/order';
import { ProblemSheet } from '../../problem-sheet';
import { CustomerDock } from '../../customer-dock';
import { AppearanceRow, LanguageRow } from './switchers';
import {
  ADDRESS_NOTE,
  GUEST,
  LOYALTY,
  ORDER_HISTORY,
  SAVED_ADDRESSES,
  say,
  type Lang,
  type PastOrder,
} from '@restaurant/surfaces/customer/data';
import { Money } from '../../money';
import {
  addAddress,
  listAddresses,
  myOrders,
  readProfile,
  removeAddress,
  signOut,
  type Address,
  type Profile,
} from '../../customer-client';

/**
 * Profile.
 *
 * Three figures, the addresses, the history, then settings — the design's own
 * order, which is also the order of how often a guest touches them.
 *
 * The identity is a phone number and nothing else. `START-HERE §4` makes
 * `people.phone_e164` the only identity key in the platform: a Telegram id or a
 * device id is an alias onto that number, never a second person. It is the
 * reason a guest who ordered through the bot last week sees those points here.
 *
 * ---------------------------------------------------------------------------
 * Live where there is a session, the fixture where there is not
 *
 * `GET /api/v1/public/me` answers with the real name, phone, balance and
 * addresses of whoever is signed in on this device. Nobody is, until they have
 * been through the sign-in screen — and until then this screen keeps drawing
 * the fixture guest rather than an empty shell, which is the same rule every
 * console screen follows (`apiGet` returns null, the screen falls back).
 *
 * The address book is the part that was drawn as a gap. `GAPS.md §4.2 Y3` is
 * still right that the design has no form and no map picker; what has changed
 * is that `POST /api/v1/public/addresses` exists, so the dashed control adds an
 * address instead of explaining where one would come from. The map is still
 * missing, and `lat`/`lng` are still nullable because of it.
 */
export function ProfileBoard({ lang, signedIn = false }: { lang: Lang; signedIn?: boolean }) {
  const t = copy(PROFILE, lang);
  const s = copy(SHARED, lang);
  const cart = useCart();

  const [reporting, setReporting] = useState(false);

  /** The signed-in guest, or null for "nobody on this device yet". */
  const [me, setMe] = useState<Profile | null>(null);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [adding, setAdding] = useState(false);
  /**
   * The guest's own orders, newest first — or null for "not signed in".
   *
   * The figure above this list has been live since the profile was wired:
   * `orders_count` off `GET /public/me`. The list under it was three invented
   * rows, so the screen said "11 orders" and then showed three that never
   * happened. `GET /public/orders` is the list behind the figure.
   */
  const [history, setHistory] = useState<readonly TrackedOrderPayload[] | null>(null);

  useEffect(() => {
    if (!signedIn) return;

    let live = true;

    void readProfile(lang).then(async (answer) => {
      if (!live || !answer.ok) return;

      setMe(answer.data);
      setAddresses(answer.data.addresses ?? []);

      const mine = await myOrders(lang);

      if (live && mine.ok) setHistory(mine.data);
    });

    // A screen the reader left before the answer came back must not write to
    // it: the fixture is what stays on screen, and React would warn about the
    // rest.
    return () => {
      live = false;
    };
  }, [lang, signedIn]);

  const refreshAddresses = async () => {
    const answer = await listAddresses(lang);

    if (answer.ok) setAddresses(answer.data);
  };

  /*
   * Nobody on this device, decided on the server from the session cookie.
   *
   * The distinction the screen was missing. `me === null` meant two different
   * things — "the answer has not come back yet" and "there is no session" — and
   * the fixture guest stood in for both. For the second one that is a stranger
   * reading an invented name, phone, eleven orders and a home address as if
   * they were their own account.
   */
  const anonymous = !signedIn;

  const name = me?.name ?? GUEST.name;
  const initials = (me?.name ?? GUEST.name)
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <main className="flex-1 pb-6">
        <header
          className="px-[var(--phone-gutter)] pt-4"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
        >
          {/*
           * Two headers, and which one is drawn is not cosmetic.
           *
           * Signed in, the design's: the avatar, the name, the number. Signed
           * out, an invitation — because the alternative, and what was here,
           * was a stranger's phone showing an invented person's name and number
           * over invented figures.
           */}
          {anonymous ? (
            <div>
              <h1 className="font-display text-xl font-semibold">{AUTH.heading[lang]}</h1>
              <p className="text-fg-subtle mt-1 text-sm leading-normal">{AUTH.lede[lang]}</p>
              <Link
                href="/customer/sign-in"
                className="bg-acc mt-3 flex h-11 items-center justify-center rounded-md text-sm font-semibold text-white"
              >
                {AUTH.send[lang]}
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="bg-acc grid h-14 w-14 flex-none place-items-center rounded-full text-lg font-bold text-white">
                {me === null ? GUEST.initials : initials}
              </span>

              <span className="min-w-0">
                <span className="font-display block truncate text-xl font-semibold">{name}</span>
                <span data-num className="text-fg-subtle block text-sm">
                  {me?.phone ?? GUEST.phone}
                </span>
              </span>
            </div>
          )}
        </header>

        {/* ------------------------------------------------------- figures */}
        {/* Three figures about a person. With nobody signed in there is no
            person, and zeroes would be a claim about an account too. */}
        {anonymous ? null : (
          <dl className="border-divider mx-[var(--phone-gutter)] mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border">
            <Figure label={t.orders}>
              <span data-num className="text-lg font-semibold">
                {me?.orders_count ?? GUEST.orders}
              </span>
            </Figure>

            <Figure label={t.spent}>
              <span data-num className="text-lg font-semibold">
                {((me?.total_spent ?? GUEST.spent) / 100 / 1_000_000).toFixed(1)} {t.millions}
              </span>
            </Figure>

            <Figure label={t.points}>
              <span data-num className="text-acc text-lg font-semibold">
                {(me?.points ?? LOYALTY.points)
                  .toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU')
                  .replace(/[,\s]/g, ' ')}
              </span>
            </Figure>
          </dl>
        )}

        {/* ----------------------------------------------------- addresses */}
        {/* An address book and an order history belong to a session. Signed
            out they are the demo guest's, which is the leak this screen was. */}
        {anonymous ? null : (
          <Section title={t.addresses}>
            <ul className="flex flex-col gap-2">
              {addresses === null
                ? SAVED_ADDRESSES.map((address) => (
                    <li
                      key={address.id}
                      className="border-border bg-surface rounded-md border px-3.5 py-3"
                    >
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {say(address.label, lang)}
                        {address.primary ? (
                          <span className="bg-acc-soft text-acc rounded-pill text-2xs px-1.5 py-0.5 font-bold">
                            {t.primary}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-fg-subtle mt-0.5 text-xs leading-normal">
                        {say(address.line, lang)}
                      </p>
                      {address.primary ? (
                        <p className="text-fg-muted mt-0.5 text-xs">{say(ADDRESS_NOTE, lang)}</p>
                      ) : null}
                    </li>
                  ))
                : addresses.map((address) => (
                    <li
                      key={address.id}
                      className="border-border bg-surface flex items-start gap-2 rounded-md border px-3.5 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          {address.label}
                          {address.is_default ? (
                            <span className="bg-acc-soft text-acc rounded-pill text-2xs px-1.5 py-0.5 font-bold">
                              {t.primary}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-fg-subtle mt-0.5 block text-xs leading-normal">
                          {address.full_line}
                        </span>
                        {address.note === null ? null : (
                          <span className="text-fg-muted mt-0.5 block text-xs">{address.note}</span>
                        )}
                      </span>

                      {/*
                       * A cap of ten lives on the server, so there has to be a way
                       * down from it. `×` rather than a bin glyph: the design has
                       * no icon for this and `FOUNDATIONS §8` rules out inventing
                       * one out of emoji.
                       */}
                      <button
                        type="button"
                        aria-label={t.removeAddress}
                        onClick={async () => {
                          const gone = await removeAddress(lang, address.id);

                          if (gone.ok) {
                            await refreshAddresses();
                            flash(`${address.label} · ${s.remove}`);
                          } else {
                            flash.problem(gone.message ?? s.remove);
                          }
                        }}
                        className="text-fg-subtle h-[var(--tap-min)] w-[var(--tap-min)] flex-none text-base"
                      >
                        ×
                      </button>
                    </li>
                  ))}
            </ul>

            {/*
             * `GAPS.md §4.2 Y3` — the design has no address form and no map
             * picker, and this used to answer by saying where the address would
             * come from. `POST /api/v1/public/addresses` exists now, so a
             * signed-in guest gets the smallest honest form instead: a name for
             * the place and the street line. Somebody with no session still gets
             * the old sentence, because there is nowhere to save an address to.
             */}
            <button
              type="button"
              onClick={() => (me === null ? flash(t.addAddressNote) : setAdding(true))}
              className="border-border-strong bg-bg-subtle text-fg-muted mt-2 flex h-[var(--tap-min)] w-full items-center justify-center gap-2 rounded-md border border-dashed text-sm font-semibold"
            >
              + {t.addAddress}
            </button>
          </Section>
        )}

        {/* ------------------------------------------------------- history */}
        {anonymous ? null : (
          <Section title={t.history}>
            {/*
             * Every row opens the order — `h.open` in the design, and the chevron
             * on the right is what promises it. They had been inert list items
             * with a price on the end, so the one place a customer goes to find
             * "what did I order last Tuesday" was a picture of the answer.
             */}
            {/*
             * The guest's own orders when the token bought them, the design's
             * three when it did not — and the label says which. A signed-out
             * profile drawing invented history under a real "11 orders" tile was
             * the drift this closes.
             */}
            {history === null ? (
              <p className="text-fg-subtle mb-2 text-xs leading-normal">{t.sampleHistory}</p>
            ) : null}

            <ul className="flex flex-col">
              {(history ?? ORDER_HISTORY).map((order) => (
                <li key={order.number} className="border-divider border-b last:border-0">
                  <Link
                    href={`/customer/order?n=${encodeURIComponent(order.number)}`}
                    className="flex min-h-[var(--tap-min)] items-center gap-3 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span data-num className="text-sm font-semibold">
                          №{order.number}
                        </span>
                        <span className="text-fg-subtle text-xs">{dateOf(order, lang)}</span>
                      </span>
                      <span className="text-fg-subtle mt-0.5 block truncate text-xs">
                        {summaryOf(order, lang)}
                      </span>
                    </span>

                    <Money tiyin={order.total} lang={lang} />

                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className="text-fg-subtle flex-none"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ------------------------------------------------------ settings */}
        {/* Settings stay: language, theme and the terms are the same for a
            reader who has not signed in, and the loyalty row explains itself. */}
        <Section title={t.settings}>
          <ul className="border-border bg-surface divide-divider divide-y overflow-hidden rounded-md border">
            <RowLink href="/customer/loyalty" label={t.points} value={s.open} />
            <LanguageRow label={t.language} current={lang} />
            <AppearanceRow
              label={t.appearance}
              light={t.light}
              dark={t.dark}
              system={t.systemTheme}
            />
            {/*
             * Two rows the design draws are not here, and their absence is the
             * fix: they answered a press with "namoyish rejimi" — a settings
             * screen admitting it is a demonstration, to a paying customer of a
             * real restaurant.
             *
             * **Notifications.** `PATCH /api/v1/public/me` takes a name and a
             * locale and nothing else; there is no preference column for a
             * restaurant's own customer, and `POST /v1/public/push/tokens` is
             * registration rather than a switch. The marketplace consumer has
             * the four-switch sheet because `marketplace.consumers` carries
             * `notification_prefs`; this table does not.
             *
             * **Payment methods.** No card vault exists on this platform and
             * one is not a screen — it is a contract with Payme or Click and a
             * PCI boundary. A row offering to store a card is the worst kind of
             * control to draw before there is somewhere to store it.
             */}
            <RowAction label={t.help} onPress={() => setReporting(true)} />
            {/*
             * The way back to the sign-in screen, which the app had no route to
             * at all — it opened on the home screen with a fixture identity and
             * the whole `AUTH` catalogue went unread.
             */}
            {/*
             * Signing in, or signing out of the phone you are holding.
             *
             * The design draws neither — it opens on a guest who is simply
             * there — but `DELETE /api/v1/public/me/session` exists and a phone
             * is a shared and stealable object. A ninety-day token with nobody's
             * way to end it is the wrong default on a device that gets handed
             * to a child to play a game on.
             */}
            {anonymous || me === null ? (
              <RowLink href="/customer/sign-in" label={AUTH.phoneLabel[lang]} value={s.open} />
            ) : (
              <RowAction
                label={t.signOut}
                onPress={() => {
                  void signOut(lang).then(() => {
                    setMe(null);
                    setAddresses(null);
                    setHistory(null);
                    flash(t.signedOut);
                  });
                }}
              />
            )}
          </ul>

          {/*
           * `GAPS.md §4.1 K3`. This used to be the whole of the answer: a
           * paragraph explaining that a guest cannot report a problem from the
           * app. The Help row above now opens the route the Telegram bot has
           * had all along, and the sentence stays because it is still true
           * about the *refund* — the money is a manager's decision at the till,
           * and promising otherwise here would be worse than saying so.
           */}
          <p className="text-fg-subtle mt-2 text-xs leading-normal">{t.reportProblem}</p>
        </Section>
      </main>

      <AddressSheet
        lang={lang}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={async () => {
          setAdding(false);
          await refreshAddresses();
        }}
      />

      <ProblemSheet
        lang={lang}
        about={t.help}
        open={reporting}
        onClose={() => setReporting(false)}
      />

      <CustomerDock lang={lang} cartCount={cart.count} />
    </>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface flex flex-col items-center gap-0.5 px-2 py-3">
      <dd>{children}</dd>
      <dt className="text-fg-subtle text-2xs text-center">{label}</dt>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 px-[var(--phone-gutter)]">
      <h2 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** A settings row that does something — the design's `settingsRows`. */
/**
 * When an order was placed, as a person reads a date.
 *
 * The fixtures carry a trilingual phrase ("Kecha, 19:42"); a live order carries
 * `placed_at`, an ISO instant. Both end up as one string here rather than two
 * shapes in the list, and the live one is formatted in the reader's own locale
 * because a date is the one field where a device's own conventions win.
 */
function dateOf(order: PastOrder | TrackedOrderPayload, lang: Lang): string {
  if ('date' in order) return say(order.date, lang);

  const iso = order.placed_at;

  if (iso == null) return '';

  const moment = new Date(iso);

  if (Number.isNaN(moment.getTime())) return '';

  return moment.toLocaleString(lang === 'uz' ? 'uz-UZ' : lang === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * What was in it, in one line.
 *
 * Built from the lines' own snapshot titles rather than from the catalogue: a
 * dish the restaurant withdrew last month still has to be named on the order it
 * was part of, and `order_items.title` is the only thing that can.
 */
function summaryOf(order: PastOrder | TrackedOrderPayload, lang: Lang): string {
  if ('summary' in order) return say(order.summary, lang);

  return (order.lines ?? [])
    .map((line): string => `${line.quantity}× ${line.title ?? ''}`.trim())
    .filter((part: string) => part !== '' && !part.endsWith('×'))
    .join(', ');
}

function RowAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPress}
        className="flex min-h-[var(--tap-min)] w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
      >
        <span className="text-sm">{label}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="text-fg-subtle flex-none"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
    </li>
  );
}

function RowLink({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-[var(--tap-min)] items-center justify-between gap-3 px-3.5 py-3"
      >
        <span className="text-sm">{label}</span>
        <span className="text-fg-subtle truncate text-xs">{value} →</span>
      </Link>
    </li>
  );
}

/**
 * Two fields and a save button — the whole address form.
 *
 * Drawn as a sheet because that is the one modal idiom this app already has
 * (`ProblemSheet`), so a guest meets no new shape. Two fields because that is
 * what a courier actually needs from a person typing one-handed: a name for the
 * place and the street line. The entrance, floor and flat have columns of their
 * own on the server and are read off the line for now; the map picker
 * `t.addAddressNote` promises is still missing, which is why `lat`/`lng` are
 * nullable.
 */
function AddressSheet({
  lang,
  open,
  onClose,
  onSaved,
}: {
  lang: Lang;
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = copy(PROFILE, lang);
  const p = copy(PROBLEM, lang);

  const [label, setLabel] = useState('');
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const save = async () => {
    if (busy) return;
    setBusy(true);

    const saved = await addAddress(lang, { label: label.trim(), line: line.trim() });
    setBusy(false);

    if (!saved.ok) {
      // The server's own sentence — it knows whether this is "the line is too
      // short" or "you have reached the address limit", and those are different
      // things to do next.
      flash.problem(saved.message ?? t.addAddress);

      return;
    }

    setLabel('');
    setLine('');
    flash(`${saved.data.label} · ${t.addresses}`);
    await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        data-scrim
        aria-label={p.cancel}
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: 'rgba(15,19,32,.42)' }}
      />

      <div
        data-sheet
        role="dialog"
        aria-modal="true"
        aria-label={t.addAddress}
        className="bg-surface relative w-full max-w-[var(--phone-measure)] rounded-t-2xl px-[var(--phone-gutter)] pt-5"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <h2 className="font-display text-lg font-semibold tracking-tight">{t.addAddress}</h2>

        <input
          value={label}
          maxLength={40}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t.addressLabel}
          aria-label={t.addressLabel}
          className="border-border bg-bg-subtle mt-3 h-12 w-full rounded-md border px-3.5 text-base"
        />

        <textarea
          value={line}
          maxLength={255}
          rows={2}
          onChange={(event) => setLine(event.target.value)}
          placeholder={t.addressLine}
          aria-label={t.addressLine}
          className="border-border bg-bg-subtle mt-2 w-full resize-none rounded-md border px-3.5 py-3 text-base"
        />

        <p className="text-fg-subtle mt-2 text-xs leading-normal">{t.addAddressNote}</p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border-border h-[var(--tap-lg)] flex-1 rounded-md border text-sm font-semibold"
          >
            {p.cancel}
          </button>

          <button
            type="button"
            onClick={() => void save()}
            className="bg-acc h-[var(--tap-lg)] flex-1 rounded-md text-sm font-semibold text-white"
          >
            {t.saveAddress}
          </button>
        </div>
      </div>
    </div>
  );
}
