import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '@restaurant/surfaces/mp/copy';
import { MP_POINTS, MP_PROFILE_ROWS, MP_PROFILE_STATS, say } from '@restaurant/surfaces/mp/data';

import { AddressSheet } from '@/mp/address-sheet';
import { basket, useBasket } from '@/mp/basket';
import {
  needsSignIn,
  NOTIFY_KEYS,
  sampleNote,
  saveLocale,
  useMpPlus,
  useMpProfile,
  type NotifyPrefs,
} from '@/mp/live';
import { NotifySheet } from '@/mp/notify-sheet';
import { PlusSheet } from '@/mp/plus-sheet';
import { notify } from '@/mp/settings-copy';
import { SignInSheet } from '@/mp/sign-in-sheet';
import { PRESSED } from '@/ui/primitives';
import { Chevron } from '@/ui/icons';
import { Notice, useNotice } from '@/ui/notice';
import { useLocale, type Lang } from '@/lib/locale';
import { groupDigits } from '@/lib/money';
import { useMpTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, sans, sansAt, text, tracking } from '@/type';

/**
 * MyPOS, screen 6 — who this is, what they have earned, and six settings.
 *
 * `Ilova.dc.html:394-434`. The points card leads because it is the only thing on
 * the screen that changes on its own.
 *
 * **Five of the six rows do real work.** Addresses opens the same sheet the
 * home header does, over the guest's own book from `GET /mp/me`; Language
 * changes the app's language and writes it to the account with `PATCH /mp/me`,
 * so the SMS about their next order arrives in it; Plus reads its state from
 * `GET /mp/plus` and can now be started and stopped from the sheet it opens;
 * Notifications writes four switches to `notification_prefs` on the same
 * account, against a handset registered at sign-in with
 * `POST /mp/push/tokens`. Only payment methods still says what it would do, and
 * the marker below names the single thing it is waiting for.
 *
 * **The tier rail and the four tiles are drawn only over the sample.** `GET
 * /mp/me` publishes a points *balance* and nothing else about a guest's
 * standing: no tier, no distance to the next one, no lifetime orders or spend.
 * Drawing 71% and "1 160 to gold" beside a real balance would be a number the
 * guest could act on that nothing computed. That is a handled gap rather than a
 * pending one — nothing computes them, so nothing claims them.
 *
 * TODO(integration): needs PAYME_KEY — see docs/GO-LIVE.md
 * Card-on-file is the acquirer's tokenisation service, and the whole of what
 * keeps this platform out of PCI scope is that the card number never reaches
 * it. `pay_rail` on an order names a rail (`click`, `payme`, cash) and
 * deliberately never an instrument, so this row has nothing to list until a
 * vault exists to list from.
 */
export default function MarketplaceProfile() {
  /* MyPOS is the second product in this binary and its own palette (`:30-43`):
     `--brand-dark` is #1C5AD1 in light and #2E74EA in dark, which the
     restaurant's `brand700` is neither of. */
  const c = useMpTheme();
  const { lang, setLang } = useLocale();
  const { note, say: flash } = useNotice();
  const { address, store: basketStore } = useBasket();

  const profile = useMpProfile(lang);
  const plus = useMpPlus(lang);

  const [sheet, setSheet] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [plusSheet, setPlusSheet] = useState(false);
  const [notifySheet, setNotifySheet] = useState(false);

  /*
   * The preferences the notifications sheet has written since the profile was
   * last fetched.
   *
   * Held here rather than refetching the whole profile on every switch: a
   * `PATCH /mp/me` already answers with the saved value, and a second `GET`
   * behind it would refetch the address book and the points balance to learn
   * something the first response carried.
   */
  const [savedNotify, setSavedNotify] = useState<NotifyPrefs | null>(null);
  const notifyPrefs = savedNotify ?? profile.data.notify;

  const book = profile.data.addresses;
  const preferred = book.find((entry) => entry.isDefault) ?? book[0];

  /* The book's own default, taken only when nothing has been chosen — a screen
     that adopted it on every load would undo a pick made on the cart. */
  useEffect(() => {
    if (preferred !== undefined) basket.suggestAddress(preferred);
  }, [preferred]);

  const name = profile.data.name ?? t('profileName', lang);
  const phone = profile.data.phone === '' ? t('profilePhone', lang) : profile.data.phone;

  return (
    <View style={s.fill}>
      <FlatList
        data={MP_PROFILE_ROWS}
        keyExtractor={(row) => row}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            {profile.live ? null : (
              /* The one banner on this surface that is usually not an outage:
                 a profile with no session is a profile nobody has claimed, and
                 the tap opens the sheet rather than retrying a call that will
                 fail the same way. */
              <Pressable
                onPress={() => (needsSignIn(profile.problem) ? setSignIn(true) : profile.reload())}
                accessibilityRole="button"
                style={s.demo}
              >
                <Text style={[text.caption, { color: c.warnFg }]}>
                  {sampleNote(profile.problem, lang)}
                </Text>
              </Pressable>
            )}

            <View style={s.person}>
              <View style={[s.avatar, { backgroundColor: c.brandSoft }]}>
                <Text style={[s.initials, { color: c.brandDark }]}>{initialsOf(name)}</Text>
              </View>

              <View style={s.personMain}>
                <Text style={[s.name, { color: c.fg }]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[text.small, text.num, { color: c.fgSubtle, marginTop: 2 }]}>
                  {phone}
                </Text>
              </View>
            </View>

            {/* --------------------------------------------------- points */}
            <View style={[s.points, { backgroundColor: c.brandSoft, borderColor: c.brandLine }]}>
              <View style={s.pointsTop}>
                <Text style={[text.caption, { color: c.brandDark, ...sans(600) }]}>
                  {t('pointsLbl', lang)}
                </Text>
                {profile.live ? null : (
                  <Text style={[s.tier, { color: c.brandDark }]}>{t('tier', lang)}</Text>
                )}
              </View>

              <Text style={[s.balance, text.num, { color: c.brandDark, marginTop: 3 }]}>
                {groupDigits(profile.data.points)}
              </Text>

              {profile.live ? null : (
                <>
                  <View
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: MP_POINTS.attainment }}
                    style={s.trackRail}
                  >
                    <View
                      style={[
                        s.trackFill,
                        { backgroundColor: c.brand, width: `${MP_POINTS.attainment}%` },
                      ]}
                    />
                  </View>

                  <Text style={[s.tierNote, { color: c.brandDark, marginTop: 6 }]}>
                    {t('tierNote', lang)}
                  </Text>
                </>
              )}
            </View>

            {/* ---------------------------------------------------- stats */}
            {profile.live ? null : (
              <View style={s.stats}>
                {MP_PROFILE_STATS.map((stat) => (
                  <View
                    key={stat.key}
                    style={[s.stat, { borderColor: c.border, backgroundColor: c.surface }]}
                  >
                    <Text style={[s.statLbl, { color: c.fgSubtle }]} numberOfLines={1}>
                      {t(`stat_${stat.key}` as 'stat_orders', lang)}
                    </Text>
                    <Text style={[s.statVal, text.num, { color: c.fg }]}>
                      {say(stat.value, lang)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <SettingRow
            row={item}
            lang={lang}
            /* The design opens the group with `margin-top:20px` and sets the
               rows themselves `gap:1px` (`:423`). The screen had only the 1px,
               so on a live account — where the four sample tiles above are not
               drawn — the first row sat against the points card. */
            first={index === 0}
            /* Three rows carry a live note: Plus says whether it is on,
               addresses names the one this basket is going to, and
               notifications counts the switches that are actually on — a row
               that always read "order status, offers" would say the same thing
               to somebody who had turned both off. */
            note={
              item === 'plus'
                ? plus.data.active
                  ? t('plusSideNoteOn', lang)
                  : t('rowNote_plus', lang)
                : item === 'addresses'
                  ? (address?.address ?? t('rowNote_addresses', lang))
                  : item === 'notifications' && profile.live
                    ? notifyNote(notifyPrefs, lang)
                    : t(`rowNote_${item}` as 'rowNote_help', lang)
            }
            onPress={() => {
              if (item === 'addresses') {
                setSheet(true);

                return;
              }

              if (item === 'plus') {
                setPlusSheet(true);

                return;
              }

              if (item === 'notifications') {
                setNotifySheet(true);

                return;
              }

              if (item === 'language') {
                const order: readonly Lang[] = ['uz', 'ru', 'en'];
                const next = order[(order.indexOf(lang) + 1) % order.length] ?? 'uz';

                setLang(next);
                flash(t('rowNote_language', next));

                /* Written to the account too, when there is one. The app's own
                   language is a device setting; the account's is what an SMS
                   about the next order is composed in, and a guest who switched
                   to Russian here should not be texted in Uzbek. */
                if (profile.live) void saveLocale(next);

                return;
              }

              flash(
                `${t(`row_${item}` as 'row_help', lang)} · ${t(`rowNote_${item}` as 'rowNote_help', lang)}`,
              );
            }}
          />
        )}
      />

      <AddressSheet
        open={sheet}
        addresses={book}
        selected={address?.key ?? null}
        /* Whichever shop the basket belongs to, when one does. Opened from the
           profile with an empty basket there is no boundary to measure, and the
           sheet says nothing about reach rather than inventing one. */
        zones={basketStore?.zones ?? []}
        onPick={(picked) => {
          basket.setAddress(picked);
          flash(`${t('addrTitle', lang)} · ${picked.label}`);
        }}
        onClose={() => setSheet(false)}
      />

      <PlusSheet
        open={plusSheet}
        plus={plus.data}
        live={profile.live}
        onClose={() => setPlusSheet(false)}
        onChanged={() => {
          /* Both: `GET /mp/plus` carries the subscription, and `GET /mp/me`
             carries the `plus` flag the points card and the row note read. */
          plus.reload();
          profile.reload();
        }}
        announce={flash}
      />

      <NotifySheet
        open={notifySheet}
        prefs={notifyPrefs}
        live={profile.live}
        onClose={() => setNotifySheet(false)}
        onSaved={setSavedNotify}
        announce={flash}
      />

      <SignInSheet
        open={signIn}
        onClose={() => setSignIn(false)}
        onDone={() => {
          setSignIn(false);
          /* The preferences belong to whoever just signed in, so anything this
             screen remembered about the last person is dropped. */
          setSavedNotify(null);
          profile.reload();
          plus.reload();
        }}
        announce={flash}
      />

      <Notice note={note} bottom={size.sp4} />
    </View>
  );
}

function SettingRow({
  row,
  lang,
  note,
  first,
  onPress,
}: {
  row: string;
  lang: Lang;
  note: string;
  first: boolean;
  onPress: () => void;
}) {
  const c = useMpTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.row,
        { marginTop: first ? 20 : 1 },
        /* The row carries both `data-row` and `data-press` (`:425`), so the
           design gives it `background:var(--sunken)` on hover (`:59`) and
           `scale(.97)` on active (`:55`). A finger has no hover, so the ground
           arrives on press together with the scale; it used to be the
           restaurant palette's `bgMuted` and no scale at all. */
        pressed && { backgroundColor: c.sunken },
        pressed && PRESSED,
      ]}
    >
      <View style={s.rowMain}>
        <Text style={[s.rowLbl, { color: c.fg }]} numberOfLines={1}>
          {t(`row_${row}` as 'row_help', lang)}
        </Text>
        <Text style={[s.rowNote, { color: c.fgSubtle }]} numberOfLines={1}>
          {note}
        </Text>
      </View>

      <Chevron size={16} colour={c.fgSubtle} />
    </Pressable>
  );
}

/**
 * What the notifications row says underneath it.
 *
 * The switches that are on, named, and "hammasi o'chirilgan" when none are.
 * The design's static note — "order status, offers" — describes the default and
 * nothing else, so a guest who turned both of those off would still read that
 * they were getting them.
 */
function notifyNote(prefs: NotifyPrefs, lang: Lang): string {
  const on = NOTIFY_KEYS.filter((key) => prefs[key]);

  if (on.length === 0) return notify('allOff', lang);

  return on.map((key) => notify(key, lang)).join(' · ');
}

/** `Dilnoza Ahmedova` → `DA`. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .filter((letter) => /\p{L}/u.test(letter))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/*
 * The numbers below are the drawing's own, not the rounded scale.
 *
 * `Ilova.dc.html:394-434` writes this screen in literals — `padding:6px 18px
 * 20px`, `17px 18px`, `14px 15px`, `14px 12px` — and the screen was rounding
 * every one of them to the nearest `size.sp*` step. Nothing was far out on its
 * own; together they moved the card, the tiles and all six rows.
 */
const s = StyleSheet.create({
  fill: { flex: 1 },
  /* `padding:6px 18px 20px` (`:395`) — was 20/12/24. */
  list: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 20 },
  demo: { paddingBottom: size.sp3, minHeight: 44 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* The monogram is Inter Tight 19px at 800 (`:397`). `text.title` is 20 at
     700 and carries `--tracking-snug`, which this span does not set. */
  initials: { ...display(800), fontSize: 19 },
  personMain: { flex: 1, minWidth: 0 },
  /* `font-size:19px;font-weight:700;letter-spacing:-.02em` (`:399`) — its own
     tracking, and 1.45 is the document's line-height (`:20`). */
  name: {
    ...display(700),
    fontSize: 19,
    lineHeight: 28,
    letterSpacing: tracking('-0.02em', 19),
  },
  /* `border-radius:16px;padding:17px 18px;margin-top:18px` and a 1px rule
     (`:404`). The 1px is literal: the design draws no sub-pixel border, and
     `hairlineWidth` is a third of one on a 3x screen. */
  points: {
    marginTop: 18,
    paddingVertical: 17,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  pointsTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  /* 11px at 700 with `.06em` (`:407`) — `text.caps` is 10px at 600 with `.08em`,
     a different chip. */
  tier: {
    ...sansAt(700, 11, 1.45),
    letterSpacing: tracking('0.06em', 11),
    textTransform: 'uppercase',
  },
  /* The balance is `font-size:33px;line-height:1` (`:409`); `text.display` is
     30px on a 34px line, so the one figure the screen exists to show was the
     smallest thing off. */
  balance: {
    ...display(700),
    fontSize: 33,
    lineHeight: 33,
    letterSpacing: tracking('-0.026em', 33),
  },
  tierNote: sansAt(400, 11, 1.45),
  /* `rgba(46,116,234,.22)` (`:410`), written into the drawing rather than taken
     from a token — so it stays 22% brand over the soft card in both themes.
     `brand100` is opaque and reads as a second card inside the first. */
  trackRail: {
    height: 4,
    borderRadius: 2,
    marginTop: 13,
    overflow: 'hidden',
    backgroundColor: 'rgba(46,116,234,0.22)',
  },
  trackFill: { height: 4, borderRadius: 2 },
  /* `gap:10px;margin-top:14px` (`:414`). No bottom margin: the 20 below the
     tiles belongs to the rows group, which needs it whether the tiles are
     drawn or not. */
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  /* `padding:14px 15px` (`:416`) — the two are not the same number. */
  stat: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: size.radiusLg,
    borderWidth: 1,
  },
  statLbl: sansAt(400, 11, 1.45),
  /* Inter Tight 19px at 700, `margin-top:4px` (`:418`), and again no tracking:
     `text.title` was drawing it at 20 with `--tracking-snug`. */
  statVal: { ...display(700), fontSize: 19, marginTop: 4 },
  /* `padding:14px 12px` (`:425`) — the vertical was 12. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: size.radiusMd,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowLbl: sansAt(600, 14, 1.45),
  rowNote: { ...sansAt(400, 11, 1.45), marginTop: 2 },
});
