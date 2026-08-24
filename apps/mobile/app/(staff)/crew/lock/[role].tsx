import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { copy, fill, LOCK } from '@restaurant/surfaces/crew/copy';
import {
  isCrewRole,
  LOCK_PUSHES,
  MONTHS,
  say,
  WEEKDAYS,
  type Lang,
  type Push,
} from '@restaurant/surfaces/crew/data';

import { useCrewSkin, type CrewSkin } from '@/crew/palette';
import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, sans, text } from '@/type';
import { PRESSED } from '@/ui/primitives';

/**
 * The handset, locked, with this role's notifications on it.
 *
 * The design's sharpest observation about this app is here: **the notification
 * type changes entirely with the role**. An owner is asked to approve eight
 * million so'm; a waiter is told three plates are going cold on the pass. Same
 * screen, nothing in common — and building one generic notification card would
 * have flattened both into "you have a new item".
 *
 * Dark in both appearances, because a lock screen is the phone rather than the
 * page. `crew/palette.ts` carries the two skins and says why they cannot be
 * tokens.
 *
 * **A card's buttons navigate; they do not answer.** There is no notification
 * service behind this and no session to act with, so each one goes to the tab
 * where the answer is actually given, and `LOCK.note` says so once at the foot
 * rather than lying four times on four cards.
 *
 * That foot is one line, because the design's is
 * (`Smart Restaurant Xodimlar ilovasi.dc.html` line 1109, `padding:8px 4px 0`).
 * It used to be two — `actionNote` repeated in longer words what `note` already
 * ends with — and a lock screen is glanced at, not read twice.
 *
 * Outside the role's own subtree on purpose: everything under `/crew/<role>/` is
 * wrapped in the app chrome, and a lock screen with a dock across it is not
 * locked.
 */
export default function LockScreen() {
  const { role } = useLocalSearchParams<{ role: string }>();
  const { lang } = useLocale();
  const skin = useCrewSkin();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const t = copy(LOCK, lang);
  const now = useClock();

  // A path that names no role this app has is a 404, not a bounce: a guard that
  // redirected here would turn every typo into a silent trip to somebody's
  // dashboard.
  const pushes = isCrewRole(role) ? LOCK_PUSHES[role] : [];

  return (
    <View style={s.fill}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="crewLock" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={skin.lockTop} />
            <Stop offset="1" stopColor={skin.lockBottom} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#crewLock)" />
      </Svg>

      <FlatList
        data={pushes}
        keyExtractor={(push) => push.id}
        contentContainerStyle={[
          s.page,
          { paddingTop: insets.top + 30, paddingBottom: insets.bottom + size.sp6 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={s.clock}>
            <Text style={[text.small, { color: skin.lockDim }]}>{dateLine(now, lang, t.date)}</Text>
            <Text style={[text.num, s.time, { color: skin.lockFg }]}>{clockLine(now)}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <PushCard
            push={item}
            lang={lang}
            skin={skin}
            onAct={(tab) => router.replace(`/crew/${String(role)}/${tab}`)}
          />
        )}
        ListFooterComponent={
          <View style={s.foot}>
            <Text style={[s.footLine, { color: skin.lockDim }]}>{t.note}</Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/crew')}
              style={({ pressed }) => [
                s.unlock,
                { backgroundColor: skin.lockCard, borderColor: skin.lockBorder },
                pressed && s.pressed,
              ]}
            >
              <Text style={[text.small, s.unlockLine, { color: skin.lockFg }]}>{t.unlock}</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

/**
 * The colour a push's kind line is written in.
 *
 * The design gives each tone its own (lines 1234–1284): every card was drawn in
 * `lockFg` instead, so an approval request and a till variance looked identical
 * until somebody read them — on a screen made to be glanced at. Literals rather
 * than `useTheme()` for the same reason `crew/palette.ts` gives: the card is
 * dark in both appearances, so these do not change with the reader's theme, and
 * the blue is a lighter step than `--brand-500` because 2E74EA on this ground is
 * barely there.
 */
const KIND_FG = {
  brand: '#7FB0FF',
  success: '#12B76A',
  warning: '#F79009',
  danger: '#F04438',
} as const;

function PushCard({
  push,
  lang,
  skin,
  onAct,
}: {
  push: Push;
  lang: Lang;
  skin: CrewSkin;
  onAct: (tab: string) => void;
}) {
  const c = useTheme();

  /*
   * The 22px mark is the design's one-character icon square. Its tint is the
   * push's own tone, so an approval request and a stock warning are told apart
   * before either is read.
   *
   * The 500 step of each ramp rather than the 600: these sit on a near-black
   * card, and the darker step the light theme uses for a figure on paper
   * disappears against it. Both appearances define 500, so the card keeps its
   * meaning in either.
   */
  const tint = {
    brand: c.brand500,
    success: c.success500,
    warning: c.warning500,
    danger: c.danger500,
  }[push.tone];

  return (
    <View style={[s.card, { backgroundColor: skin.lockCard, borderColor: skin.lockBorder }]}>
      <View style={s.cardHead}>
        <View style={[s.mark, { backgroundColor: tint }]}>
          <Text style={[text.caps, s.markLine, { color: c.n0 }]}>{push.mark}</Text>
        </View>

        <Text style={[s.kind, { color: KIND_FG[push.tone] }]} numberOfLines={1}>
          {say(push.kind, lang)}
        </Text>

        <Text style={[s.ago, text.num, { color: skin.lockDim }]}>{say(push.ago, lang)}</Text>
      </View>

      <Text style={[text.small, s.title, { color: skin.lockFg }]}>{say(push.title, lang)}</Text>
      <Text style={[text.caption, s.body, { color: skin.lockDim }]}>{say(push.body, lang)}</Text>

      {push.actions === undefined ? null : (
        <View style={s.actions}>
          {push.actions.map((action) => {
            /*
             * The first action is the brand button — `--brand-500` with white on
             * it and no border at all (design lines 1296–1298). It was drawn
             * inverted, a white pill with near-black text, which on a phone is
             * the shape of the button that *dismisses* a notification: the two
             * buttons swapped meanings without either word changing.
             *
             * Height comes from line 1103: 36px, with the four points each way
             * up to the 44pt floor taken as hitSlop. A card this size cannot
             * carry two 44pt buttons and still look like a notification.
             */
            const lead = action.primary === true;

            return (
              <Pressable
                key={say(action.label, lang)}
                accessibilityRole="button"
                onPress={() => onAct(action.tab)}
                hitSlop={{ top: 4, bottom: 4 }}
                style={({ pressed }) => [
                  s.action,
                  lead
                    ? { backgroundColor: c.brand500, borderWidth: 0 }
                    : { backgroundColor: 'transparent', borderColor: skin.lockBorder },
                  pressed && s.pressed,
                ]}
              >
                <Text style={[text.label, { color: lead ? c.n0 : skin.lockFg }]}>
                  {say(action.label, lang)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * The real clock, ticking once a minute.
 *
 * The design prints 11:24 because a prototype has to print something. A lock
 * screen showing a time that is not the time is the one thing on this screen
 * nobody would forgive, so the phone's own clock wins over the fixture — and it
 * re-reads on the minute rather than the second, because nothing here shows one.
 */
function useClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);

    return () => clearInterval(timer);
  }, []);

  return now;
}

const clockLine = (now: Date): string =>
  `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

const dateLine = (now: Date, lang: Lang, template: string): string => {
  const weekday = WEEKDAYS[now.getDay()];
  const month = MONTHS[now.getMonth()];

  return fill(template, {
    weekday: weekday === undefined ? '' : say(weekday, lang),
    day: now.getDate(),
    month: month === undefined ? '' : say(month, lang),
  });
};

const s = StyleSheet.create({
  fill: { flex: 1 },
  page: { paddingHorizontal: 16 },
  clock: { alignItems: 'center', paddingBottom: 22 },
  /* `Xodimlar ilovasi.dc.html`: font-family:var(--font-display);font-size:64px;
     font-weight:700;letter-spacing:-.03em;line-height:1;margin-top:2px. */
  time: { fontSize: 64, lineHeight: 64, ...display(700), letterSpacing: -1.92, marginTop: 2 },
  /* Line 1092: border-radius:16px;padding:13px 14px, and gap:9px between
     cards, which a list draws as the trailing margin. */
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 9,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  markLine: { ...sans(700), letterSpacing: 0, textTransform: 'none' },
  /* Line 1095: font-size:var(--text-2xs);font-weight:700;letter-spacing:
     var(--tracking-caps);text-transform:uppercase — 11px, not the 10px of
     `text.caps`. */
  kind: {
    flex: 1,
    minWidth: 0,
    ...sans(700),
    fontSize: size.text2xs,
    lineHeight: 14,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  /** Line 1096: the same 11px step, at the body weight. */
  ago: { ...sans(400), fontSize: size.text2xs, lineHeight: 16 },
  title: { ...sans(600), marginTop: 8, lineHeight: 17 },
  body: { marginTop: 3, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 7, marginTop: 11 },
  action: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Line 1109: padding:8px 4px 0;font-size:var(--text-2xs);line-height:1.5. */
  foot: { paddingTop: 8, paddingHorizontal: 4 },
  footLine: { ...sans(400), fontSize: size.text2xs, lineHeight: 17 },
  unlock: {
    minHeight: 50,
    marginTop: size.sp4,
    borderRadius: size.radiusMd,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockLine: { ...sans(600) },
  /* `[data-press]:active{transform:scale(.97)}` — the design's own
     press. It faded here, which reads as "disabled for a moment". */
  pressed: PRESSED,
});
