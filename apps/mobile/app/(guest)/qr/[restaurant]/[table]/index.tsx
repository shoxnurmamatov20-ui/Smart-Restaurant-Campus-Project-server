import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fill } from '@restaurant/surfaces/guest/copy';
import { allDishes } from '@restaurant/surfaces/guest/menu-data';
import { TABLE_ORDER, WIFI_NETWORK } from '@restaurant/surfaces/guest/table-data';

import { CallWaiter } from '@/guest/call-waiter';
import { useGuestCopy } from '@/guest/copy';
import { Banknote, ChevronRight, MenuGrid } from '@/guest/icons';
import { useGuestMenu } from '@/guest/menu';
import { param, tableHref } from '@/guest/route';
import { useLocale, type Lang } from '@/lib/locale';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, sans, sansAt, text } from '@/type';
import { PRESSED } from '@/ui/primitives';

/**
 * What a guest sees one second after the code is read — `Mehmon.dc.html`, panel 01.
 *
 * The whole surface hangs off this route, and the route is the session: the
 * restaurant and the table are in the path because a sticker is printed once
 * and cannot carry state. No sign-in, nothing to install — the card says so,
 * because the first question a guest has is whether they are about to be asked
 * for an app.
 *
 * Three doors in the design; four here. The fourth is the status screen, which
 * the design reaches only through the menu's basket bar — a bar that does not
 * exist until something is in the basket, leaving the kitchen ladder (which is
 * live from the moment the waiter fires the order) with no way in. The web
 * build made the same call, and the two surfaces have to agree: a push
 * notification about an order lands on `/qr/{slug}/{table}/status` in both.
 *
 * The language chips are here rather than in a settings screen for the reason
 * the designer gives in `t.n1`: this is the one moment a guest is looking for
 * them, and afterwards they would have to be hunted for.
 */
export default function TableScreen() {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang, setLang } = useLocale();
  const { t } = useGuestCopy();

  const params = useLocalSearchParams<{ restaurant: string; table: string }>();
  const restaurant = param(params.restaurant);
  const table = param(params.table);

  const { state } = useGuestMenu(restaurant, lang);

  const name = state.status === 'ready' ? (state.menu.restaurant?.name ?? restaurant) : restaurant;
  const dishes = state.status === 'ready' ? allDishes(state.menu).length : 0;
  const here = tableHref({ restaurant, table });

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + size.sp8 }}
      showsVerticalScrollIndicator={false}
    >
      {/*
       * The dark band — 196px of the neutral ramp with the language chips on it.
       *
       * It is not decoration: it is the only thing on this surface that says a
       * restaurant has been *scanned* rather than a page opened, and it is what
       * lets the language switch be three quiet chips instead of a full row.
       *
       * Flat rather than the file's `n-800 → n-900` gradient. A gradient needs
       * `expo-linear-gradient`, which is a dependency this app does not carry,
       * and the two stops are one step apart on the same ramp — on a 390pt band
       * the difference is invisible where a wrong dependency is not.
       */}
      <View style={[s.band, { backgroundColor: c.n900, paddingTop: insets.top + size.sp3 }]}>
        <View style={s.langs}>
          {(['uz', 'ru', 'en'] as const).map((code) => (
            <LangChip key={code} code={code} on={code === lang} onPress={() => setLang(code)} />
          ))}
        </View>

        <View style={s.bandFoot}>
          {/* `font-size:26px` — `Mehmon.dc.html:88`. It was `text.display`, 30. */}
          <Text style={[s.brand, { color: c.n0 }]} numberOfLines={2}>
            {name.toUpperCase()}
          </Text>
          <Text style={[text.small, { color: c.n0, opacity: 0.72, marginTop: 3 }]}>
            {fill(t.scan.branch, { name })}
          </Text>
        </View>
      </View>

      <View style={s.body}>
        {/*
         * The table card — `dc.html:94-102`. The number is a card rather than a
         * heading because it is the thing a guest checks against the little
         * number on the table before they trust anything else on the screen.
         */}
        <View
          style={[
            s.table,
            { backgroundColor: c.brand50, borderColor: c.border, borderRadius: size.radiusLg },
          ]}
        >
          {/* `border-radius:12px` with the figure at `19px/800` — :95. */}
          <View style={[s.tableMark, { backgroundColor: c.brand500 }]}>
            <Text style={[s.tableFigure, { color: c.n0 }]} numberOfLines={1}>
              {table}
            </Text>
          </View>

          <View style={s.grow}>
            <Text style={[text.body, { color: c.fg, ...sans(600) }]}>
              {fill(t.scan.table, { table })}
            </Text>
            <Text style={[text.small, { color: c.fgMuted, marginTop: 1 }]}>
              {fill(t.scan.tableMeta, {
                waiter: TABLE_ORDER.waiter,
                guests: TABLE_ORDER.guests,
              })}
            </Text>
          </View>
        </View>

        <View style={s.doors}>
          <Door
            primary
            icon={<MenuGrid colour={c.n0} />}
            title={t.scan.openMenu}
            /* The count is the API's answer, so the line says which of the
               three things is true rather than guessing: still asking, could
               not reach the restaurant, or this many dishes — including none,
               which is a real answer and not a failure. */
            sub={
              state.status === 'loading'
                ? t.status.pending
                : state.status === 'failed'
                  ? t.common.offline
                  : fill(t.scan.openMenuSub, { count: dishes })
            }
            onPress={() => router.push(`${here}/menu`)}
          />

          <CallWaiter tenant={restaurant} table={table} />

          {/*
           * The order and the bill, drawn against fixtures.
           *
           * Nothing reports a table's open order and nothing takes a guest's
           * payment, so both screens say `Namoyish rejimi` on them — the line
           * the copy catalogue was written with, because the designer expected
           * exactly this state. Leaving them shut would read as a menu app;
           * opening them onto a screen that lied about a bill would be worse.
           */}
          <Door
            icon={<Banknote colour={c.brand600} />}
            title={t.status.title}
            sub={fill(t.status.readyBy, { time: TABLE_ORDER.readyBy })}
            onPress={() => router.push(`${here}/status`)}
          />

          <Door
            icon={<Banknote colour={c.brand600} />}
            title={t.scan.payBill}
            sub={t.scan.payBillSub}
            onPress={() => router.push(`${here}/bill`)}
          />
        </View>

        <View style={[s.foot, { borderColor: c.divider }]}>
          <Text style={[text.small, { color: c.fgSubtle }]}>{t.scan.noApp}</Text>

          {/*
           * The Wi-Fi line — `dc.html:133-136`. A green dot and a network name:
           * the second question every guest at a table actually has, and the one
           * a printed card on the table usually answers badly.
           */}
          <View style={s.wifi}>
            <View style={[s.dot, { backgroundColor: c.success500 }]} />
            <Text style={[text.caption, { color: c.fgSubtle }]}>
              {fill(t.scan.wifi, { network: WIFI_NETWORK })}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * One of the three language chips on the band.
 *
 * The design tints them with `rgba(255,255,255,.22)` and `.08`. This uses the
 * neutral ramp instead — `--n-600` and `--n-800` are what those two whites
 * resolve to over `--n-900`, and the ramp is identical in both themes, so the
 * chip reads the same on a dark phone as on a light one. A React Native
 * `opacity` would have been the literal translation and the wrong one: it
 * applies to a view's children too, and the label would have faded with the
 * tint it was supposed to sit on.
 */
function LangChip({ code, on, onPress }: { code: Lang; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [
        s.lang,
        /* `rgba(255,255,255,.22)` selected, `.08` idle — :83. Substituted for
           opaque neutrals on the theory that a translucent background would fade
           the label; it does not. `backgroundColor` in React Native composites
           behind its children, and only the `opacity` STYLE dims them. */
        {
          backgroundColor: on ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)',
          borderRadius: size.radiusPill,
        },
        pressed && s.pressed,
      ]}
    >
      <Text
        style={[
          s.langLine,
          { color: on ? '#fff' : 'rgba(255,255,255,.6)', ...sans(on ? 700 : 500) },
        ]}
      >
        {code.toUpperCase()}
      </Text>
    </Pressable>
  );
}

/**
 * One of the doors.
 *
 * 44pt is the floor and these are far above it: the design gives each a whole
 * card, because they are pressed by somebody holding a phone in one hand, at a
 * table, often in low light, often having just sat down.
 */
function Door({
  icon,
  title,
  sub,
  onPress,
  primary = false,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const c = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.door,
        {
          backgroundColor: primary ? c.n900 : c.surface,
          borderColor: primary ? c.n900 : c.border,
          borderRadius: size.radiusLg,
        },
        pressed && s.pressed,
      ]}
    >
      {icon}

      <View style={s.grow}>
        {/* `font-size:16px;font-weight:600` — :107. It was 15. */}
        <Text style={[s.doorTitle, { color: primary ? c.n0 : c.fg }]}>{title}</Text>
        <Text
          style={[
            text.small,
            { color: primary ? c.n0 : c.fgSubtle, opacity: primary ? 0.6 : 1, marginTop: 1 },
          ]}
        >
          {sub}
        </Text>
      </View>

      <ChevronRight colour={primary ? c.n0 : c.fgSubtle} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  /* `font-size:16px;font-weight:600` — :107. */
  doorTitle: { ...sansAt(600, 16, 1.4) },
  band: {
    minHeight: 196,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  langs: { flexDirection: 'row', gap: 6, alignSelf: 'flex-end' },
  lang: { paddingHorizontal: 9, height: 26, justifyContent: 'center' },
  /* `font-size:11px` — :83. It was 12. */
  langLine: { fontSize: 11, lineHeight: 14 },
  bandFoot: { marginTop: size.sp6 },
  brand: { ...display(800), fontSize: 26, lineHeight: 29, letterSpacing: -0.78 },
  body: { paddingHorizontal: 22, paddingTop: 22 },
  table: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: size.sp3,
    padding: 14,
    borderWidth: 1,
  },
  /* `border-radius:12px` — :95, which is not a step on the radius scale. */
  tableMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `font-size:19px;font-weight:800` — :95. */
  tableFigure: { ...display(800), fontSize: 19, lineHeight: 22, letterSpacing: -0.42 },
  grow: { flex: 1, minWidth: 0 },
  doors: { gap: 10, marginTop: size.sp5 },
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: size.sp4,
    borderWidth: 1,
    minHeight: 72,
  },
  foot: { marginTop: 22, paddingTop: 18, borderTopWidth: 1 },
  wifi: { flexDirection: 'row', alignItems: 'center', gap: size.sp2, marginTop: size.sp4 },
  dot: { width: 6, height: 6, borderRadius: size.radiusPill },
  /* `[data-press]:active{transform:scale(.97)}` — the design's own
     press. It faded here, which reads as "disabled for a moment". */
  pressed: PRESSED,
});
