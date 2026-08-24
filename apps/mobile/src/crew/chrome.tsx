import { useRouter } from 'expo-router';
import { Fragment, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { copy, fill, SHARED } from '@restaurant/surfaces/crew/copy';
import { badgeCount, IDENTITY, say, tabsFor } from '@restaurant/surfaces/crew/data';
import type { CrewRole, Lang, Trilingual } from '@restaurant/surfaces/crew/data';

import { useLocale } from '../lib/locale';
import { useTheme } from '../lib/theme-context';
import { raw, size } from '../theme';
import { display, sans, sansAt, text, tracking } from '../type';
import { PRESSED } from '../ui/primitives';
import { Avatar } from './bits';
import { BackIcon, TabIcon } from './icons';
import { useQueueDepth } from './queue';

/**
 * The chrome every staff screen sits inside: a header that names the person and
 * a dock whose four slots the role decides.
 *
 * **The role switcher is not here, and that is deliberate.** The design draws a
 * five-way segmented control under the header — Owner · Manager · Store · Waiter
 * · Courier (`Xodimlar:134-139`) — and it is the prototype's way of showing five
 * products in one file, not a control anybody should ship. A button that
 * reassigns which workspace you are in is either a lie (it changes the drawing
 * and not the permissions) or a privilege escalation (it does not). The role
 * comes from the PIN and from nothing else; `crew/guard.ts` says the same thing
 * at the route.
 *
 * The demo PIN list under the keypad is refused on the same grounds — see
 * `app/(staff)/crew/index.tsx`.
 */

/**
 * How tall the dock is, so a scroll region can keep its last row reachable.
 *
 * It is the design's own arithmetic and not a measurement of ours:
 * `padding:30px 14px 16px` around a `50px` disc (`Xodimlar:1010-1012`) is
 * 30 + 50 + 16. The number was right while the dock also drew a word under each
 * disc, which is the coincidence that hid the extra element for as long as it
 * did.
 */
export const DOCK_HEIGHT = 96;

/**
 * The design's dock elevation, written inline on every one of the four discs
 * (`Xodimlar:1012`), and what the active one swaps to (`Xodimlar:60`).
 *
 * Literals rather than `useShadows()`: these two are not `--shadow-xs…xl`, and
 * the second is brand-tinted — a blue glow under the selected disc, which is
 * most of what makes the dock read as floating over the wash rather than
 * printed on it. Kept in dark as well as light, because the design writes them
 * as inline values that its `[data-theme="dark"]` block never reaches.
 */
const DISC_SHADOW = '0 6px 16px -4px rgba(16,24,40,.16),0 2px 5px -2px rgba(16,24,40,.09)';
const DISC_SHADOW_ON = '0 8px 20px -5px rgba(46,116,234,.5),0 2px 6px -2px rgba(46,116,234,.3)';

/**
 * What the strip says, and why it is not word for word the design's sentence.
 *
 * The design branches on the queue depth (`Xodimlar:1376`): with entries
 * waiting it reads "Tarmoq yo'q · N amal navbatda", and with none "Tarmoq yo'q ·
 * ishlashda davom eting, hammasi saqlanadi". Both halves of that are claims
 * this app cannot make. There is no reachability source on the handset — NetInfo
 * is not a dependency and the list is closed — so "no network" would be a guess
 * dressed as a fact; and `crew/queue.ts` says in its own comment that the queue
 * lives in memory and does not survive the app being killed, so "everything is
 * saved" is not merely unproven but wrong. `CLAUDE.md` §10: a surface does not
 * make a claim it cannot back.
 *
 * What is provable is the count, and the count is the half a waiter acts on. So
 * the strip keeps the design's shape — a clause, a middot, the number — and
 * replaces the clause with the one this phone can stand behind.
 */
const UNSENT: Trilingual = {
  uz: 'Yuborilmagan · {n} amal navbatda',
  ru: 'Не отправлено · {n} действий в очереди',
  en: 'Not sent · {n} actions queued',
};

/**
 * The struck-wifi mark, path for path from `Xodimlar:120`: 14×14 on a 24 grid,
 * stroke 2, round caps. Not added to `@/ui/icons` — it is drawn in exactly one
 * place, and that file is a shared set rather than a bin.
 */
function WifiOff({ color }: { color: string }) {
  return (
    <Svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    >
      <Path d="M2 3l20 18" />
      <Path d="M5 12.5a10 10 0 0 1 4-2.4" />
      <Path d="M12 16.8h.01" />
      <Path d="M15.5 13.2a6 6 0 0 0-2-1.1" />
    </Svg>
  );
}

/**
 * The warning strip the design puts between the status bar and the header
 * (`Xodimlar:118-121`).
 *
 * It was missing outright: the app has had an offline queue since the crew
 * screens were built and never told anybody it was holding one, so the count
 * lived only behind the More tab. A waiter who marks four tables in a basement
 * dining room learns nothing until they go looking.
 *
 * Shown on queue depth rather than on a network flag, for the reason `UNSENT`
 * gives. Depth zero draws nothing at all, which is the honest empty state: this
 * phone owes the server nothing.
 */
function OfflineStrip({ lang }: { lang: Lang }) {
  const c = useTheme();
  const depth = useQueueDepth();

  if (depth === 0) return null;

  return (
    <View style={[s.strip, { backgroundColor: c.warning50 }]}>
      <WifiOff color={c.warning600} />
      <Text style={[text.label, s.stripLine, { color: c.warning700 }]} numberOfLines={1}>
        {fill(say(UNSENT, lang), { n: depth })}
      </Text>
    </View>
  );
}

export function CrewHeader({ role, lang }: { role: CrewRole; lang: Lang }) {
  const c = useTheme();
  const router = useRouter();
  const shared = copy(SHARED, lang);
  const who = IDENTITY[role];

  return (
    <>
      <OfflineStrip lang={lang} />

      <View style={[s.header, { borderBottomColor: c.divider }]}>
        <View style={s.headerMain}>
          {/*
           * `--text-lg` in the display face at 700, `--tracking-snug`,
           * `line-height:1.15` (`Xodimlar:117`) — 17px on a 20px line. It was
           * drawn with `text.title`, which is 20px on 25, so the one line that
           * names the person was a section heading: three points too large, and
           * wide enough that a two-word name reached the avatar and clipped.
           */}
          <Text style={[s.who, { color: c.fg }]} numberOfLines={1}>
            {who.name}
          </Text>

          {/* `--text-2xs`, not `--text-xs`: 11px (`Xodimlar:118`). `text.caption`
              is 12 at weight 500, and the design sets neither — the scope line
              inherits the body's 400. */}
          <Text style={[s.scope, { color: c.fgSubtle }]} numberOfLines={1}>
            {say(who.scope, lang)}
          </Text>
        </View>

        {/*
         * The avatar is the design's own route into the account menu, and it is
         * the only header control.
         *
         * The 44pt target is a hit slop and not a 44pt box. It used to be a box,
         * which quietly made the header six points taller than the design's
         * 8 + 38 + 12 — the disc is what is drawn, the target around it is what
         * is pressed, and `ui/primitives` states the rule for the whole app.
         *
         * `replace`, like the dock. More is a tab, and pushing one onto the stack
         * would leave a back gesture that undoes a tab change — which is not what
         * a dock means, and which builds a history nobody asked for over a shift.
         */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shared.account}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={() => router.replace(`/crew/${role}/more`)}
          style={({ pressed }) => pressed && PRESSED}
        >
          <Avatar initials={who.initials} big />
        </Pressable>
      </View>
    </>
  );
}

/**
 * Four slots, and the role decides what is in them.
 *
 * Floating over the content the way the design draws it: on a 390px screen the
 * last row of a two-up grid is worth more than a horizontal rule. The wash
 * behind it is the design's own `linear-gradient(0deg,var(--surface) 30%,
 * transparent)`, drawn with `react-native-svg` rather than pulled in as a
 * gradient package — the dependency list is closed and this is one rectangle.
 *
 * **Icon-only, and the words are only spoken.** The design's slots are bare
 * 50×50 discs whose label lives in `title`/`aria-label` and is never drawn
 * (`Xodimlar:1012, 1016, 1026, 1031`). This bar drew a 10px caption under every
 * disc, which is an element the design does not have — and the element that made
 * the whole dock taller than the 96px the design's own padding adds up to.
 *
 * **The search pill sits between the second and third slot** — `Xodimlar:1021`,
 * and it is the only slot here that is not a tab. It was left out for a long
 * time on the grounds that the design's handler is a toast reading "order,
 * table, guest, item" and no endpoint answers all four; a box that cannot search
 * is worse than none, because people type into it and conclude the app is
 * broken. Two of those four now answer a partial word — `filter[search]` on the
 * menu, and one added to `tables` for this — so the pill leads to a screen that
 * searches those two and names its own reach under the field. The other two wait
 * for an endpoint rather than for a decision.
 *
 * The discs stay at the design's fixed 50px and the pill takes the rest with
 * `flex:1`. They were once all `flex:1`, which stretched four circles into four
 * different circles depending on the role.
 */
export function CrewDock({ role, tab, lang }: { role: CrewRole; tab: string; lang: Lang }) {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shared = copy(SHARED, lang);
  const tabs = tabsFor(role);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={shared.mainMenu}
      /*
       * `pointer-events:none` on the bar, `auto` on each disc — the design says
       * both (`Xodimlar:1010, 1012`). The bar is 96pt of absolutely positioned
       * gradient sitting on top of the page, and without this the 30pt of
       * padding above the discs swallows every tap aimed at the last row of
       * whatever is underneath it.
       */
      pointerEvents="box-none"
      style={[s.dock, { paddingBottom: insets.bottom + 16 }]}
    >
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="crewDock" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={c.surface} stopOpacity="1" />
            {/* The design's own stop: solid surface to 30%, then out. It was
                0.34, which is a number the design does not contain. */}
            <Stop offset="0.3" stopColor={c.surface} stopOpacity="1" />
            <Stop offset="1" stopColor={c.surface} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#crewDock)" />
      </Svg>

      {tabs.map((slot, index) => {
        const on = slot.slug === tab;
        const count = slot.badge === undefined ? 0 : badgeCount(role, slot.badge);

        return (
          <Fragment key={slot.slug}>
            {/* After the second slot, which is where the design draws it. A dock
                with fewer than three slots never reaches this and keeps its
                shape rather than growing a pill in the wrong place. */}
            {index === 2 ? <SearchPill role={role} lang={lang} /> : null}

            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={say(slot.label, lang)}
              onPress={() => router.replace(`/crew/${role}/${slot.slug}`)}
              style={({ pressed }) => pressed && PRESSED}
            >
              <View
                style={[
                  s.disc,
                  {
                    backgroundColor: on ? c.brand500 : c.surface,
                    borderColor: on ? c.brand500 : c.border,
                    boxShadow: on ? DISC_SHADOW_ON : DISC_SHADOW,
                  },
                ]}
              >
                <TabIcon icon={slot.icon} color={on ? c.n0 : c.fgMuted} />

                {/*
                 * Hidden at zero rather than drawn as `0`. A badge that is always
                 * there teaches a reader to stop looking at it, and this one is how
                 * a manager finds out a waiter is waiting on a discount.
                 *
                 * The ring follows the disc: `[data-mfdock][data-active="true"]
                 * [data-num]{border-color:var(--brand-500)}` (`Xodimlar:61`). It
                 * was `--surface` in both states, so on the selected disc the
                 * badge wore a white halo against blue.
                 */}
                {count > 0 ? (
                  <View
                    style={[
                      s.badge,
                      { backgroundColor: c.danger500, borderColor: on ? c.brand500 : c.surface },
                    ]}
                  >
                    <Text style={[s.badgeLine, { color: c.n0 }]}>{count}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

/**
 * The dock's search pill — `Xodimlar:1021`.
 *
 * `flex:1` with `min-width:0`, so it takes whatever the four fixed discs leave
 * and shrinks rather than pushing the last one off a 320px screen. The label
 * truncates; the magnifier never does, which is the right order — the icon is
 * what makes the control recognisable at a glance.
 *
 * `router.push` rather than `replace`, unlike the tabs beside it. Search is a
 * detour: back should return to the screen somebody left, not to the role's
 * first tab.
 */
function SearchPill({ role, lang }: { role: CrewRole; lang: Lang }) {
  const c = useTheme();
  const router = useRouter();
  const shared = copy(SHARED, lang);

  /*
   * Whether there is room for the word.
   *
   * At 320pt the four discs leave the pill about 56pt, and `numberOfLines={1}`
   * would render "Q…" — one glyph and an ellipsis, which is worse than no word.
   * Under 96pt the magnifier stands alone; `accessibilityLabel` keeps the name
   * for the reader who cannot see it. Measured rather than taken from the
   * window width, because the dock's own padding and gaps are what decide it.
   */
  const [roomy, setRoomy] = useState(true);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shared.search}
      onPress={() => router.push(`/crew/${role}/search`)}
      onLayout={(event) => setRoomy(event.nativeEvent.layout.width >= 96)}
      style={({ pressed }) => [s.pill, pressed && PRESSED]}
    >
      <View
        style={[
          s.pillBox,
          { backgroundColor: c.surface, borderColor: c.border, boxShadow: DISC_SHADOW },
        ]}
      >
        <Svg width={19} height={19} viewBox="0 0 22 22" fill="none">
          <Circle
            cx={10.8}
            cy={10.8}
            r={6.6}
            stroke={c.fgMuted}
            strokeWidth={1.95}
            strokeLinecap="round"
          />
          <Path d="m15.7 15.7 4 4" stroke={c.fgMuted} strokeWidth={1.95} strokeLinecap="round" />
        </Svg>

        {roomy ? (
          <Text style={[s.pillLine, { color: c.fgSubtle }]} numberOfLines={1}>
            {shared.search}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * The header a sub-screen carries instead of the dock.
 *
 * Back, a title, and the one sentence that says what the reader is looking at —
 * `SUB_NOTES` in the design, sixteen of them, and none decorative: "this month ·
 * 5 branches · ex-VAT" is the difference between a P&L somebody trusts and one
 * they argue with.
 *
 * The three lines are `Xodimlar:490-495`, and all three were off. Back is
 * `--brand-600` at `--text-sm`/600 with `gap:7` — it was drawn in `--fg-subtle`,
 * which is the colour of a note rather than of the one control on the screen.
 * The title is `--text-2xl` with `--tracking-tight`, the same 24px page heading
 * `text.screenTitle` carries; `text.title` is the 20px *section* heading, so
 * every sub-screen opened one step quieter than the design. The note is
 * `--text-sm` at `line-height:1.5` in `--fg-muted`, not 12px in `--fg-subtle`.
 */
export function SubHeader({ title, note }: { title: string; note?: string }) {
  const c = useTheme();
  const router = useRouter();
  const { lang } = useLocale();
  const shared = copy(SHARED, lang);

  return (
    <View style={s.sub}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shared.back}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => router.back()}
        style={({ pressed }) => [s.back, pressed && PRESSED]}
      >
        <BackIcon color={c.brand600} size={17} />
        <Text style={[s.backLine, { color: c.brand600 }]}>{shared.back}</Text>
      </Pressable>

      <Text style={[text.screenTitle, { color: c.fg }]}>{title}</Text>

      {note === undefined ? null : <Text style={[s.subNote, { color: c.fgMuted }]}>{note}</Text>}
    </View>
  );
}

/** The page a sub-screen scrolls inside — one padding rule, not sixteen. */
export function SubScreen({ children }: { children: ReactNode }) {
  const c = useTheme();

  return <View style={[s.screen, { backgroundColor: c.bg }]}>{children}</View>;
}

const s = StyleSheet.create({
  /* `padding:7px 18px` over `--warning-50`, under a 1px rule the design writes
     as a literal rather than as a token (`Xodimlar:119`). */
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(247,144,9,.26)',
  },
  stripLine: { flex: 1, minWidth: 0 },
  /* `padding:8px 18px 12px;border-bottom:1px solid var(--divider)`. The rule is
     1px: the design never draws a sub-pixel one, and RN's sub-pixel constant is
     0.33 on a 3× phone — a divider you have to look for. */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: size.sp3,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerMain: { flex: 1, minWidth: 0 },
  /* Written out rather than through `displayAt()`: that helper's fourth
     parameter is typed from its own default, so it takes `--tracking-tight` and
     refuses `--tracking-snug` — which is the one this line is set in. */
  who: {
    ...display(700),
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: tracking(raw.trackingSnug, 17),
  },
  scope: { ...sansAt(400, 11, 1.45), marginTop: 2 },
  /* `padding:30px 14px 16px;gap:9px;align-items:center`. The gap was 6 and the
     bottom 14 — both invented, and the gap is what set the discs' spacing. */
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 9,
    paddingHorizontal: 14,
    paddingTop: 30,
  },
  /* `flex:1;min-width:0` — the design's own, and the reason the discs beside it
     are fixed: the pill is what absorbs a narrow screen. */
  pill: { flex: 1, minWidth: 0 },
  pillBox: {
    height: 50,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 18,
  },
  /* `--text-sm`/500, the same step the dock's own labels would carry if it drew
     any — the pill is the one slot in the bar that speaks. */
  pillLine: { ...sansAt(500, size.textSm, 1.2), flex: 1, minWidth: 0 },
  disc: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `min-width:19px;height:19px;padding:0 5px;border-radius:999px;
     border:2.5px solid` (`Xodimlar:1021`). */
  badge: {
    position: 'absolute',
    top: -1,
    right: -1,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    borderRadius: size.radiusPill,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `font-size:10px;font-weight:700;line-height:1`, and `data-num="1"` — the
     figure carries tabular numerals, which is what keeps a badge from changing
     width between 11 and 17. It was `text.caps`: uppercase, tracked and set on
     a 13pt line inside a 19pt disc. */
  badgeLine: { ...sans(700), fontSize: size.text3xs, lineHeight: size.text3xs, ...text.num },
  /* The design's sub-screen sits in the body's own `padding:16px 18px`
     (`Xodimlar:143`); the note closes the block with `margin-bottom:18px`. */
  sub: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  backLine: sansAt(600, size.textSm, 1.45),
  subNote: { ...sansAt(400, size.textSm, 1.5), marginTop: 6 },
  screen: { flex: 1 },
});
