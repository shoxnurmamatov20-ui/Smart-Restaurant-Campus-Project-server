import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUTH, copy, PROFILE, SHARED } from '@restaurant/surfaces/customer/copy';
import {
  ADDRESS_NOTE,
  GUEST,
  LOYALTY,
  ORDER_HISTORY,
  SAVED_ADDRESSES,
  say,
} from '@restaurant/surfaces/customer/data';

import type { TrackedOrderPayload } from '@restaurant/surfaces/customer/order';

import {
  addAddress,
  listAddresses,
  myOrders,
  readProfile,
  removeAddress,
  signOut,
  type Address,
  type Profile,
} from '@/customer/account';
import { PRESSED } from '@/ui/primitives';
import { Chevron, Pin } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { ProblemSheet } from '@/customer/problem-sheet';
import { cart } from '@/lib/cart';
import { useLocale, type Lang } from '@/lib/locale';
import { groupDigits, som } from '@/lib/money';
import { useShadows, useTheme, useThemeChoice, type ThemeChoice } from '@/lib/theme-context';
import { raw, size } from '@/theme';
import { display, sans, sansAt, text, tracking } from '@/type';

/**
 * Profile — `Smart Restaurant Mijoz ilovasi.dc.html`, screen 9 (`at.profile`,
 * lines 600–674).
 *
 * Three figures, the addresses, the history, then settings: the design's own
 * order, which is also the order of how often a guest touches them.
 *
 * The identity is a phone number and nothing else. `START-HERE §4` makes
 * `people.phone_e164` the only identity key in the platform — a Telegram id or a
 * device id is an alias onto that number, never a second person. It is why a
 * guest who ordered through the bot last week sees those points here.
 *
 * ---------------------------------------------------------------------------
 * The half of this screen that was drawn as a settings app, and is not one
 *
 * The design gives this screen exactly two boxes: the avatar row and the
 * three-figure grid. Everything below them — every address, every past bill,
 * every settings line — is drawn *on the page*: `background:transparent`,
 * `border:0`, `border-bottom:1px solid var(--divider)`, no side padding, no
 * radius (lines 637–672). This screen had wrapped all of it in `<Card>`, so a
 * guest scrolled past four stacked panels where the design has one continuous
 * column of rules. That is the single biggest reason it read as a different
 * app, and it is why the rows below are hand-drawn rather than `Row`: the
 * primitive is the design's 52px *card* line, and this is not that line.
 *
 * ---------------------------------------------------------------------------
 * Live where there is a session, the fixture where there is not
 *
 * `GET /api/v1/public/me` answers with the real name, phone, balance and
 * addresses of whoever signed in on this phone. Nobody has, until they have
 * been through the sign-in screen — and until then this screen keeps drawing
 * the fixture guest rather than an empty shell.
 *
 * The address book is the part that was drawn as a gap. The design still has no
 * map picker and `lat`/`lng` are still nullable because of it; what has changed
 * is that `POST /api/v1/public/addresses` exists, so the dashed control opens
 * the smallest honest form — a name for the place and the street line — instead
 * of explaining where an address would come from.
 */
export default function ProfileScreen() {
  const c = useTheme();
  const { lang, setLang } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { note, say: announce } = useNotice();

  const t = copy(PROFILE, lang);
  const s = copy(SHARED, lang);

  /*
   * Which of the two the phone is painting right now — the same answer
   * `ThemeProvider` resolves the palette from, so the segment below can show
   * which pill is on without a second source of truth.
   */
  const { choice: themeChoice, setChoice: setThemeChoice } = useThemeChoice();

  const [reporting, setReporting] = useState(false);

  /** The signed-in guest, or null for "nobody on this phone yet". */
  const [me, setMe] = useState<Profile | null>(null);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  /** This guest's own orders, or null while nobody is signed in. */
  const [history, setHistory] = useState<TrackedOrderPayload[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [line, setLine] = useState('');

  useEffect(() => {
    let live = true;

    void (async () => {
      const profile = await readProfile(lang);

      if (!live || profile === null) return;

      setMe(profile);
      setAddresses(profile.addresses ?? []);

      /*
       * The list behind the figure.
       *
       * `orders_count` above is already live, so the screen was saying "38
       * orders" and then listing three invented ones — the kind of half-truth
       * that is worse than either half on its own. `GET /public/orders` is
       * signed in only and answers this guest's own bills, newest first.
       */
      const mine = await myOrders(lang);

      if (live && mine.ok) setHistory(mine.data);
    })();

    // A screen the guest left before the answer came back must not be written
    // to: the fixture is what stays on it.
    return () => {
      live = false;
    };
  }, [lang]);

  /** Ask again for this guest's own bills, after a refusal or a stale screen. */
  const refreshHistory = async () => {
    const mine = await myOrders(lang);

    if (mine.ok) setHistory(mine.data);
    else announce(mine.message ?? t.historyUnreachable, 'problem');
  };

  const refreshAddresses = async () => {
    const rows = await listAddresses(lang);

    if (rows !== null) setAddresses(rows);
  };

  const saveAddress = async () => {
    const saved = await addAddress(lang, { label: label.trim(), line: line.trim() });

    if (!saved.ok) {
      // The server knows whether this is "the line is too short" or "you have
      // reached the address limit", and says which in the reader's language.
      announce(saved.message ?? t.addAddress, 'problem');

      return;
    }

    setLabel('');
    setLine('');
    setAdding(false);
    announce(`${saved.data.label} · ${t.addresses}`);
    await refreshAddresses();
  };

  /**
   * Sign out, and leave nothing of this guest on the screen behind.
   *
   * The three pieces of state go with the token: a profile, an address book and
   * an order history left standing would be the previous person's, drawn under
   * the next person's sign-in prompt.
   */
  const leave = async () => {
    await signOut(lang);

    setMe(null);
    setAddresses(null);
    setHistory(null);
    announce(t.signedOut);
    router.push('/customer/sign-in');
  };

  return (
    <View style={st.fill}>
      {/* `padding:6px 20px 24px` (line 601). The 20 is the tab layout's
          `sceneStyle`; the top gets the status bar too, because the design's
          drawing sits inside a phone frame and this screen does not. */}
      <ScrollView
        contentContainerStyle={[st.page, { paddingTop: insets.top + 6 }]}
        showsVerticalScrollIndicator={false}
      >
        {/*
         * The avatar is the pale brand chip, not a solid disc.
         *
         * `background:var(--brand-100);color:var(--brand-700)` (line 603) — the
         * same chip the home header draws. It was `--brand-500` under white,
         * which is the *button* treatment: a filled blue circle at the top of
         * the screen reads as something to press.
         */}
        <View style={st.head}>
          <View style={[st.avatar, { backgroundColor: c.brand100 }]}>
            <Text style={[st.initials, { color: c.brand700 }]}>
              {initialsOf(me?.name ?? GUEST.name)}
            </Text>
          </View>

          <View style={st.headMain}>
            <Text style={[text.title, { color: c.fg }]} numberOfLines={1}>
              {me?.name ?? GUEST.name}
            </Text>
            <Text style={[st.phone, text.num, { color: c.fgMuted }]}>
              {me?.phone ?? GUEST.phone}
            </Text>
          </View>
        </View>

        {/* -------------------------------------------------------- figures */}
        {/*
         * `gap:1px;background:var(--divider)` over three `--surface` cells is
         * how the design draws the two rules (line 610). The cells carry the
         * surface, the container carries the line — so the rules are 1px, not
         * `hairlineWidth`, which is a third of that on a @3x phone.
         */}
        <View style={[st.figures, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Stat label={t.orders} value={groupDigits(me?.orders_count ?? GUEST.orders)} />
          <View style={[st.gridLine, { backgroundColor: c.divider }]} />
          {/*
           * A lifetime total is abbreviated where a bill never is. Three figures
           * share one row on a 390pt screen and "3 600 000 so'm" is eleven
           * characters that push the other two out of shape — the design writes
           * `3.6 mln` for exactly that reason.
           */}
          <Stat
            label={t.spent}
            value={`${((me?.total_spent ?? GUEST.spent) / 100 / 1_000_000).toFixed(1)} ${t.millions}`}
          />
          <View style={[st.gridLine, { backgroundColor: c.divider }]} />
          {/* All three figures are `var(--fg)` (line 613). The points used to be
              tinted `--accent-600`, which made one of three equal columns look
              like a link. */}
          <Stat label={t.points} value={groupDigits(me?.points ?? LOYALTY.points)} />
        </View>

        {/* ------------------------------------------------------ addresses */}
        <Text style={[st.legend, st.legendAddr, { color: c.fgSubtle }]}>{t.addresses}</Text>

        {addresses === null
          ? SAVED_ADDRESSES.map((address) => (
              <AddressRow key={address.id} primary={address.primary}>
                <View style={st.addressHead}>
                  <Text style={[st.addressLabel, { color: c.fg }]}>{say(address.label, lang)}</Text>
                  {address.primary ? <MainChip>{t.primary}</MainChip> : null}
                </View>

                <Text style={[st.addressLine, { color: c.fgMuted }]}>
                  {say(address.line, lang)}
                </Text>

                {address.primary ? (
                  <Text style={[st.addressLine, { color: c.fgSubtle }]}>
                    {say(ADDRESS_NOTE, lang)}
                  </Text>
                ) : null}
              </AddressRow>
            ))
          : addresses.map((address) => (
              <AddressRow key={address.id} primary={address.is_default}>
                <View style={st.addressHead}>
                  <Text style={[st.addressLabel, { color: c.fg }]}>{address.label}</Text>
                  {address.is_default ? <MainChip>{t.primary}</MainChip> : null}

                  {/* The server caps the book at ten, so there has to be a way
                      down from it. */}
                  <Pressable
                    onPress={async () => {
                      const gone = await removeAddress(lang, address.id);

                      if (gone.ok) {
                        await refreshAddresses();
                        announce(`${address.label} · ${s.remove}`);
                      } else {
                        announce(gone.message ?? s.remove, 'problem');
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t.removeAddress}
                    hitSlop={8}
                    style={st.removeAt}
                  >
                    <Text style={[st.addressLabel, { color: c.fgSubtle }]}>×</Text>
                  </Pressable>
                </View>

                <Text style={[st.addressLine, { color: c.fgMuted }]}>{address.full_line}</Text>
              </AddressRow>
            ))}

        {/*
         * The design has no address form and no map picker, and this control
         * used to answer by saying where the address would come from.
         * `POST /api/v1/public/addresses` exists now, so a signed-in guest gets
         * the smallest honest form instead: a name for the place and the street
         * line. Somebody with no session still gets the old sentence, because
         * there is nowhere to save an address to.
         */}
        {adding ? (
          <View style={[st.form, { backgroundColor: c.surface, borderColor: c.border }]}>
            <TextInput
              value={label}
              onChangeText={setLabel}
              maxLength={40}
              placeholder={t.addressLabel}
              placeholderTextColor={c.fgSubtle}
              accessibilityLabel={t.addressLabel}
              style={[text.small, st.input, { color: c.fg, borderColor: c.border }]}
            />

            <TextInput
              value={line}
              onChangeText={setLine}
              maxLength={255}
              multiline
              placeholder={t.addressLine}
              placeholderTextColor={c.fgSubtle}
              accessibilityLabel={t.addressLine}
              style={[text.small, st.input, { color: c.fg, borderColor: c.border }]}
            />

            <Text style={[st.addressLine, { color: c.fgSubtle, marginTop: 6 }]}>
              {t.addAddressNote}
            </Text>

            <Pressable
              onPress={() => void saveAddress()}
              accessibilityRole="button"
              style={({ pressed }) => [
                st.add,
                st.addSolid,
                { backgroundColor: c.brand500, borderColor: c.brand500 },
                pressed && PRESSED,
              ]}
            >
              <Text style={[st.addLabel, { color: c.n0 }]}>{t.saveAddress}</Text>
            </Pressable>
          </View>
        ) : (
          /* `height:44px;border:1px dashed var(--border-strong);border-radius:
             var(--radius-md);background:var(--bg-subtle)` and the label alone —
             the design draws no `+` in front of it (line 634). */
          <Pressable
            onPress={() => (me === null ? announce(t.addAddressNote) : setAdding(true))}
            accessibilityRole="button"
            style={({ pressed }) => [
              st.add,
              { backgroundColor: c.bgSubtle, borderColor: c.borderStrong },
              pressed && PRESSED,
            ]}
          >
            <Text style={[st.addLabel, { color: c.fgMuted }]}>{t.addAddress}</Text>
          </Pressable>
        )}

        {/* -------------------------------------------------------- history */}
        <Text style={[st.legend, st.legendTight, { color: c.fgSubtle }]}>{t.history}</Text>

        {/*
         * This guest's own bills when somebody is signed in, the design's three
         * rows when nobody is — labelled, because a history is a claim about
         * what a person did and three invented dinners under a live order count
         * is the worst kind of half-truth.
         */}
        {history === null ? (
          <>
            {ORDER_HISTORY.map((order) => (
              <HistoryRow
                key={order.number}
                number={order.number}
                when={say(order.date, lang)}
                summary={say(order.summary, lang)}
                total={som(order.total, lang)}
                onPress={() => router.push('/customer/order')}
              />
            ))}

            {/* Two different reasons for the same three rows, and two different
                things to do about them: nobody is signed in, or the list did
                not arrive. The control does whichever applies. */}
            <Pressable
              onPress={() => {
                if (me === null) router.push('/customer/sign-in');
                else void refreshHistory();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [st.hint, pressed && PRESSED]}
            >
              <Text style={[st.meta, { color: c.fgSubtle }]}>
                {me === null ? t.sampleHistory : t.historyUnreachable}
              </Text>
            </Pressable>
          </>
        ) : history.length === 0 ? (
          <View style={[st.historyRow, { borderBottomColor: c.divider }]}>
            <Text style={[st.rowLabel, { color: c.fgMuted }]}>{t.historyEmpty}</Text>
          </View>
        ) : (
          history.map((order) => (
            <HistoryRow
              key={order.number}
              number={order.number}
              when={dayOf(order.placed_at ?? null)}
              summary={summaryOf(order, order.channel === 'delivery' ? s.delivery : s.pickup)}
              total={som(order.total, lang)}
              onPress={() => {
                /*
                 * The tracking screen reads one order — the one this install
                 * placed — from the store, so opening a past bill is telling
                 * the store which one to show. The phone comes from the
                 * profile because the endpoint is guarded by its last four
                 * digits, exactly as it is straight after a checkout.
                 */
                if (me !== null) cart.markPlaced(order.number, me.phone);

                router.push('/customer/order');
              }}
            />
          ))
        )}

        {/* ------------------------------------------------------- settings */}
        <Text style={[st.legend, st.legendTight, { color: c.fgSubtle }]}>{t.settings}</Text>

        {/* The language switch is not a setting on a phone in a trilingual
            market; it is the second thing a guest looks for. It writes through
            `useLocale`, which stores the choice beside the session. */}
        <View style={[st.settingRow, { borderBottomColor: c.divider }]}>
          <Text style={[st.rowLabel, { color: c.fg }]}>{t.language}</Text>

          {/* `O'z / Ру / En`, each in its own script (lines 655–657) — not the
              uppercased ISO codes. A Russian reader looking for their language
              is looking for Cyrillic, and "RU" is not it. */}
          <Segment
            options={[
              { key: 'uz', label: "O'z" },
              { key: 'ru', label: 'Ру' },
              { key: 'en', label: 'En' },
            ]}
            value={lang}
            onPick={(code: Lang) => setLang(code)}
          />
        </View>

        {/*
         * Appearance is a choice, and the design draws it as one.
         *
         * Line 660 is the language row again with `{{t.light}}` / `{{t.dark}}`
         * in it. This screen printed a read-only "Tizim" instead, under a
         * comment arguing that a phone's own setting is the right default — it
         * is, and it still is the default; what it is not is an answer to a
         * guest who wants the menu dark at the table and the phone light.
         *
         * `useThemeChoice()` is that override, now written down: it calls
         * RN's `Appearance.setColorScheme()` — which `ThemeProvider` resolves
         * from, so one tap repaints all four surfaces — and stores the choice
         * beside the language, so the next cold start opens the way it was
         * left. It used to be forgotten every launch.
         *
         * Three segments and not the design's two. The file draws Kun and Tun
         * only, and with two there is no way back to the phone's own setting
         * once either is tapped — a one-way door on a screen whose whole job is
         * preferences. The web build of this same screen has carried three for
         * the same reason, and the third word is already in the catalogue.
         */}
        <View style={[st.settingRow, { borderBottomColor: c.divider }]}>
          <Text style={[st.rowLabel, { color: c.fg }]}>{t.appearance}</Text>

          <Segment
            options={[
              { key: 'light', label: t.light },
              { key: 'dark', label: t.dark },
              { key: 'system', label: t.systemTheme },
            ]}
            value={themeChoice}
            onPick={(pick: ThemeChoice) => setThemeChoice(pick)}
          />
        </View>

        {/*
         * `settingsRows` is three (line 1136): notifications, payment methods,
         * help. There was a fourth — "Ball · Ochish" — prepended above the
         * language row; the design reaches loyalty from the home strip, and a
         * points balance is already the third figure at the top of this screen.
         */}
        <SettingLink
          label={t.notifications}
          onPress={() => announce(`${t.notifications} · ${t.demoMode}`)}
        />
        <SettingLink
          label={t.paymentMethods}
          onPress={() => announce(`${t.paymentMethods} · ${t.demoMode}`)}
        />
        {/* Help is where a guest looks for "something went wrong", so it is
            the honest place to open the one route that exists. */}
        <SettingLink label={t.help} onPress={() => setReporting(true)} />

        {/*
         * The way out of an account, which the design never drew.
         *
         * A phone is shared — a family's one handset, a courier's, a friend's
         * — and the token in the Keychain is good for ninety days. A surface
         * somebody can sign in to and not out of is a surface that hands the
         * next person their addresses, their points and their history.
         * `DELETE /api/v1/public/me/session` revokes it at the server too, so
         * a stolen phone does not keep a live token.
         */}
        {me === null ? (
          <SettingLink
            label={AUTH.phoneLabel[lang]}
            onPress={() => router.push('/customer/sign-in')}
          />
        ) : (
          <SettingLink label={t.signOut} note={me.phone} onPress={() => void leave()} />
        )}

        {/* The refund half of `GAPS.md §4.1 K3` is still true: the money is a
            manager's decision at the till, and promising otherwise here would be
            worse than saying so. */}
        <Text style={[st.meta, { color: c.fgSubtle, marginTop: size.sp3 }]}>{t.reportProblem}</Text>
      </ScrollView>

      <ProblemSheet
        about={t.help}
        open={reporting}
        onClose={() => setReporting(false)}
        onSent={announce}
      />

      <Notice note={note} />
    </View>
  );
}

/** One cell of the three-figure grid — `padding:14px 12px;text-align:center`. */
function Stat({ label, value }: { label: string; value: string }) {
  const c = useTheme();

  return (
    <View style={[st.stat, { backgroundColor: c.surface }]}>
      <Text style={[st.statValue, text.num, { color: c.fg }]}>{value}</Text>
      <Text style={[st.statLabel, { color: c.fgSubtle }]}>{label}</Text>
    </View>
  );
}

/**
 * A saved address — line 621.
 *
 * `align-items:flex-start;gap:12px` around a 17px map pin, and the outline says
 * which one the courier goes to: `--brand-200` on the default address,
 * `--border` on the rest. Both were `--border` and there was no pin at all, so
 * a column of addresses had nothing in it a thumb could aim at and nothing
 * saying which one was in force.
 */
function AddressRow({ primary, children }: { primary: boolean; children: ReactNode }) {
  const c = useTheme();

  return (
    <View
      style={[
        st.address,
        { backgroundColor: c.surface, borderColor: primary ? c.brand200 : c.border },
      ]}
    >
      <View style={st.pin}>
        <Pin size={17} colour={primary ? c.brand600 : c.fgSubtle} />
      </View>

      <View style={st.addressMain}>{children}</View>
    </View>
  );
}

/**
 * The "Asosiy" chip — `font-size:var(--text-3xs);font-weight:700;padding:2px 7px`
 * on `--brand-50` in `--brand-700` (line 627).
 *
 * Drawn here rather than with `Pill`, which is the platform's 11px chip at
 * `9px/3px`: beside a 13px label that box is nearly as tall as the line it
 * annotates, and the design's is a third smaller.
 */
function MainChip({ children }: { children: ReactNode }) {
  const c = useTheme();

  return (
    <Text style={[st.mainChip, { backgroundColor: c.brand50, color: c.brand700 }]}>{children}</Text>
  );
}

/**
 * One past bill — line 638.
 *
 * `padding:13px 0;background:transparent;border:0;border-bottom:1px solid
 * var(--divider)`, and the rule is on every row including the last: the design
 * closes the block with a line before the next legend.
 */
function HistoryRow({
  number,
  when,
  summary,
  total,
  onPress,
}: {
  number: string;
  when: string;
  summary: string;
  total: string;
  onPress: () => void;
}) {
  const c = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [st.historyRow, { borderBottomColor: c.divider }, pressed && PRESSED]}
    >
      <View style={st.historyMain}>
        <View style={st.historyHead}>
          <Text style={[st.rowLabel, st.strong, text.num, { color: c.fg }]}>#{number}</Text>
          <Text style={[st.meta, text.num, { color: c.fgSubtle }]}>{when}</Text>
        </View>
        <Text style={[st.summary, text.num, { color: c.fgMuted }]} numberOfLines={1}>
          {summary}
        </Text>
      </View>

      <Text style={[st.rowLabel, st.strong, text.num, { color: c.fg }]}>{total}</Text>
      <Chevron size={16} />
    </Pressable>
  );
}

/** A settings line — line 668: a label, a 16px chevron, a rule under it. */
function SettingLink({
  label,
  note,
  onPress,
}: {
  label: string;
  note?: string;
  onPress: () => void;
}) {
  const c = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [st.settingRow, { borderBottomColor: c.divider }, pressed && PRESSED]}
    >
      <View style={st.settingMain}>
        <Text style={[st.rowLabel, { color: c.fg }]} numberOfLines={1}>
          {label}
        </Text>
        {note === undefined ? null : (
          <Text style={[st.meta, text.num, { color: c.fgSubtle }]} numberOfLines={1}>
            {note}
          </Text>
        )}
      </View>

      <Chevron size={16} />
    </Pressable>
  );
}

/**
 * The design's segmented picker — `padding:3px;gap:2px;border-radius:9px` over
 * `--bg-muted`, each pill `height:28px;padding:0 12px;border-radius:7px` at
 * `--text-2xs` 600 (lines 654–657).
 *
 * `[data-seg][data-on="true"]` (line 62) is `background:var(--surface);
 * color:var(--fg);box-shadow:var(--shadow-xs)` — the lift is what separates the
 * chosen pill from the trough it sits in, and without it the control read as
 * three flat words.
 */
function Segment<T extends string>({
  options,
  value,
  onPick,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onPick: (key: T) => void;
}) {
  const c = useTheme();
  const sh = useShadows();

  return (
    <View style={[st.picker, { backgroundColor: c.bgMuted }]}>
      {options.map((option) => {
        const on = option.key === value;

        return (
          <Pressable
            key={option.key}
            onPress={() => onPick(option.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [
              st.pick,
              on && { backgroundColor: c.surface, boxShadow: sh.xs },
              pressed && PRESSED,
            ]}
          >
            <Text style={[st.pickLabel, { color: on ? c.fg : c.fgMuted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The day a bill was placed — `09.08.2026`.
 *
 * Digits rather than "9-avgust", which is what the design writes and what the
 * fixture rows print. Naming a month means twelve words in three languages,
 * and those are catalogue rows nobody has written; a numeric date is read the
 * same way in all three and is never wrong about which month it means.
 */
function dayOf(iso: string | null): string {
  if (iso === null) return '';

  const moment = new Date(iso);

  if (Number.isNaN(moment.getTime())) return '';

  return [
    String(moment.getDate()).padStart(2, '0'),
    String(moment.getMonth() + 1).padStart(2, '0'),
    moment.getFullYear(),
  ].join('.');
}

/**
 * What was in a past order, in one line — "Osh, lavash · yetkazib berish".
 *
 * The titles as the bill froze them rather than as the menu reads today: a
 * receipt that changes when a dish is renamed is a receipt nobody can check.
 * Three names is what fits on one row of a 390pt screen; the rest is a count.
 */
function summaryOf(order: TrackedOrderPayload, channel: string): string {
  const titles = (order.lines ?? [])
    .filter((line) => line.status !== 'cancelled')
    .map((line) => line.title ?? '')
    .filter((title) => title !== '');

  const named = titles.slice(0, 3).join(', ');
  const rest = titles.length > 3 ? ` +${titles.length - 3}` : '';

  return [`${named}${rest}`, channel].filter((part) => part !== '').join(' · ');
}

/** Two letters from a name, the way the design draws an avatar with no photo. */
function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  page: { paddingBottom: 24 },

  /* `gap:14px`, and the avatar is 56×56 (line 602). */
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: size.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Inter Tight at `--text-lg` (17px) 700 — it was the 15px body face. */
  initials: { ...display(700), fontSize: 17, lineHeight: 20 },
  headMain: { flex: 1, minWidth: 0 },
  /* `--text-sm` in `--fg-muted` at `margin-top:2px`. `--fg-subtle` is the tone
     the design keeps for captions under a heading, not for the identity line. */
  phone: { ...sansAt(400, size.textSm, 1.25), marginTop: 2 },

  /* `border-radius:var(--radius-lg);margin-top:20px` — it was the 10px radius
     at 16, which is the platform's small card, not the design's grid. */
  figures: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 20,
    borderWidth: 1,
    borderRadius: size.radiusLg,
    overflow: 'hidden',
  },
  stat: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12 },
  /* Inter Tight at `--text-xl` (20px) 700, with no tracking: the design sets
     `--tracking-snug` on the name above and deliberately not here. */
  statValue: { ...display(700), fontSize: size.textXl, lineHeight: 24 },
  statLabel: { ...sansAt(400, size.text2xs, 1.25), marginTop: 3, textAlign: 'center' },
  gridLine: { width: 1 },

  /* `--text-2xs` 600 uppercase at `--tracking-caps` — `text.caps` is the 10px
     step and this legend is 11 (lines 619, 636, 651). The bottom margin differs
     by block: 10 over the addresses, 4 over the two lists. */
  legend: {
    ...sansAt(600, size.text2xs, 1.25),
    letterSpacing: tracking(raw.trackingCaps, size.text2xs),
    textTransform: 'uppercase',
    marginTop: 22,
  },
  legendAddr: { marginBottom: 10 },
  legendTight: { marginBottom: 4 },

  address: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: size.radiusLg,
    marginBottom: 9,
  },
  pin: { marginTop: 2 },
  addressMain: { flex: 1, minWidth: 0 },
  addressHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  /* The design draws no way to delete an address, so this one goes where a
     destructive affordance belongs: the far edge, away from the label. */
  removeAt: { marginLeft: 'auto' },
  addressLabel: sansAt(600, size.textSm, 1.25),
  /* `font-size:var(--text-xs);line-height:1.45;margin-top:3px` in `--fg-muted`. */
  addressLine: { ...sansAt(400, size.textXs, 1.45), marginTop: 3 },
  mainChip: {
    ...sans(700),
    fontSize: size.text3xs,
    lineHeight: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: size.radiusPill,
    overflow: 'hidden',
  },

  add: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: size.radiusMd,
  },
  /* The form's own button. Solid rather than dashed: dashed is the platform's
     shorthand for "nothing here yet", and this one saves what was typed. */
  addSolid: { borderStyle: 'solid', marginTop: size.sp2 },
  addLabel: sansAt(600, size.textSm, 1.25),
  form: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: size.radiusLg,
    marginBottom: 9,
  },
  /* The two fields of the address form. Solid rather than dashed, same reason
     as the button above. */
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: size.radiusMd,
    paddingHorizontal: size.sp3,
    paddingVertical: size.sp2,
    marginTop: size.sp2,
  },

  hint: { minHeight: 44, justifyContent: 'center' },
  /* `padding:13px 0` with no side padding and no card around it. */
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  historyMain: { flex: 1, minWidth: 0 },
  historyHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  summary: { ...sansAt(400, size.textXs, 1.25), marginTop: 3 },

  /* `padding:14px 0` with the same rule under it — the language row, the
     appearance row and the three links are all this one shape. */
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  settingMain: { flex: 1, minWidth: 0 },
  /* `--text-sm` at 500 — the row label, which was the 15px body preset. */
  rowLabel: sansAt(500, size.textSm, 1.25),
  strong: sans(600),
  meta: sansAt(400, size.textXs, 1.25),

  picker: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 9 },
  pick: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickLabel: sansAt(600, size.text2xs, 1.2),
});
