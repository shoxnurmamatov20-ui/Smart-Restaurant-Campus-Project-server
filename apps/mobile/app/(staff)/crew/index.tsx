import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy, fill, FLASH, PIN } from '@restaurant/surfaces/crew/copy';

import { Button, PRESSED } from '@/ui/primitives';
import { useFlash } from '@/crew/flash';
import {
  deviceLine,
  enrolment,
  currentRole,
  isCompleteCode,
  pairDevice,
  signInWithPin,
  tidyCode,
  type PinOutcome,
} from '@/crew/session';
import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, sans, text } from '@/type';

/**
 * The only door into the staff app.
 *
 * Two credentials, in the order the platform insists on: the handset is enrolled
 * once by a manager reading eight characters aloud, and then a person types four
 * digits. `src/crew/session.ts` carries the reasoning; this screen is the two
 * states that order produces, and it shows exactly one of them at a time.
 *
 * **Neither the demo PIN list nor the role cards are here.** The design draws
 * both — five working PINs printed under the keypad (1111 owner, 2222 manager,
 * and so on) and, above it, a 2×2 grid of cards that signs you in as whoever the
 * card names, on one tap. Shipping a list of working credentials on a sign-in
 * screen is not a design decision, it is a security incident with a stylesheet;
 * a card that opens somebody else's shift without asking for the four digits is
 * the same refusal wearing a nicer border. The role comes from the PIN, and the
 * PIN comes from a person.
 *
 * The cost is that this screen is visibly emptier than
 * `Smart Restaurant Xodimlar ilovasi.dc.html` lines 1044–1080 draw it: brand,
 * cells, keypad, and nothing between them or under them. That space is the
 * decision rather than an unfinished screen — do not fill it back in.
 *
 * Three wrong tries and a manager has to be found. That count is what does the
 * work a four-digit secret cannot: this is typed on a screen a whole dining room
 * can see, and the lockout is the only thing between that and somebody else's
 * discount authority. The server keeps its own, stricter count — it spans the
 * till too — and when that one speaks it is shown rather than folded into these
 * three.
 */

/** How many wrong tries before a manager has to be found. */
const MAX_ATTEMPTS = 3;

type Stage = 'checking' | 'keypad' | 'enrol';

export default function CrewDoor() {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang } = useLocale();
  const flash = useFlash();

  const t = copy(PIN, lang);
  const f = copy(FLASH, lang);

  const [stage, setStage] = useState<Stage>('checking');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [outcome, setOutcome] = useState<PinOutcome | null>(null);

  const [code, setCode] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairFailed, setPairFailed] = useState(false);
  /* Which branch and handset this is, from its own enrolment. Null until the
     server answers, and null for good on a phone nobody has enrolled. */
  const [terminal, setTerminal] = useState<string | null>(null);

  const lockedOut = attempts >= MAX_ATTEMPTS;

  /*
   * Which of the three states this handset is in, asked once on the way in.
   *
   * A phone that is already signed in must not show a keypad — the app is
   * reopened dozens of times a shift and asking again each time is how people
   * end up writing the PIN on the case.
   */
  useEffect(() => {
    let live = true;

    void (async () => {
      const role = await currentRole();

      if (!live) return;

      if (role !== null) {
        router.replace(`/crew/${role}`);

        return;
      }

      const phone = await enrolment();

      if (!live) return;

      setStage(phone === null ? 'enrol' : 'keypad');

      // Asked after the stage is set, so the keypad is not held back by a
      // header line: a slow answer must never delay the four cells.
      if (phone !== null) {
        const line = await deviceLine();

        if (live) setTerminal(line);
      }
    })();

    return () => {
      live = false;
    };
  }, [router]);

  async function submit(digits: string) {
    setBusy(true);

    const answer = await signInWithPin(digits, lang);

    setOutcome(answer);
    setPin('');
    setBusy(false);

    if (answer.kind === 'ok') {
      /*
       * Named, not merely admitted.
       *
       * The design opens a shift with "Shift started · Jasur Toshev", and the
       * name is the point on a handset two people share: the failure this app
       * has to prevent is a second person picking the phone up and recording an
       * hour of work against the first one.
       */
      flash(f.shiftStarted + answer.name);
      router.replace(`/crew/${answer.role}`);

      return;
    }

    // Only a mismatched PIN advances the counter. An unenrolled handset is a
    // problem with the phone, and costing somebody an attempt for it would lock
    // them out of a shift over something only a manager can fix.
    if (answer.kind === 'rejected') setAttempts((count) => count + 1);
    if (answer.kind === 'not_enrolled') setStage('enrol');
  }

  function press(key: string) {
    if (busy || lockedOut) return;

    if (key === 'clear') {
      setPin('');
      setOutcome(null);

      return;
    }

    if (key === 'back') {
      setPin((current) => current.slice(0, -1));
      setOutcome(null);

      return;
    }

    const next = (pin + key).slice(0, 4);

    setPin(next);
    setOutcome(null);

    // Four digits is the whole entry, so there is no submit button to reach for:
    // a waiter typing one-handed while carrying plates should not have to find a
    // fifth target after the fourth.
    if (next.length === 4) void submit(next);
  }

  async function enrol() {
    if (pairing) return;

    setPairing(true);
    setPairFailed(false);

    const answer = await pairDevice(code);

    setPairing(false);

    if (answer.kind === 'paired') {
      // The phone is enrolled; the person still has to type their PIN. The
      // counter is untouched — enrolling is not an attempt at anything.
      setCode('');
      setOutcome(null);
      setStage('keypad');

      return;
    }

    setPairFailed(true);
  }

  const message = messageFor({ outcome, lockedOut, busy, t });

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[
        s.page,
        { paddingTop: insets.top + size.sp6, paddingBottom: insets.bottom + size.sp6 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.brand}>
        <View style={[s.mark, { backgroundColor: c.brand500, borderRadius: 13 }]}>
          <Text style={[s.markLine, { color: c.n0 }]}>SR</Text>
        </View>

        <Text style={[text.title, s.heading, { color: c.fg }]}>{t.heading}</Text>
        {/*
         * This handset's own enrolment, not a fixture. The line exists so a
         * person can check they are in the right back office before typing,
         * and it used to name the demo's branch on every installed copy.
         */}
        <Text style={[text.caption, { color: c.fgSubtle, marginTop: 4 }]}>
          {terminal ?? t.terminalUnknown}
        </Text>
      </View>

      {stage === 'enrol' ? (
        <View
          style={[
            s.enrol,
            { backgroundColor: c.danger50, borderColor: c.danger500, borderRadius: size.radiusMd },
          ]}
        >
          <Text style={[text.small, s.enrolTitle, { color: c.danger700 }]}>
            {t.notEnrolledTitle}
          </Text>
          <Text style={[text.caption, s.enrolBody, { color: c.fgMuted }]}>{t.notEnrolledBody}</Text>

          <Text style={[text.caps, { color: c.fgSubtle, marginTop: size.sp3 }]}>
            {t.enrolLabel}
          </Text>

          <TextInput
            value={code}
            onChangeText={(value) => {
              // Upper-cased and stripped as it is typed: the alphabet has no I,
              // O, 0 or 1 precisely because the code is read out loud, and a
              // field that accepted them would collect the mishearing.
              setCode(tidyCode(value));
              setPairFailed(false);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel={t.enrolLabel}
            style={[
              s.codeField,
              text.body,
              text.num,
              {
                backgroundColor: c.surface,
                borderColor: c.border,
                color: c.fg,
                borderRadius: size.radiusMd,
              },
            ]}
          />

          <Button
            style={s.enrolCta}
            disabled={pairing || !isCompleteCode(code)}
            onPress={() => void enrol()}
          >
            {pairing ? t.enrolWorking : t.enrolSubmit}
          </Button>

          {pairFailed ? (
            <Text style={[text.caption, s.enrolFailed, { color: c.danger700 }]}>
              {t.enrolFailed}
            </Text>
          ) : null}
        </View>
      ) : (
        <View>
          {/*
           * The four cells are one field, not four. A screen reader announcing
           * "edit text, blank" four times says nothing useful; one group with a
           * name and a live count says what has been typed so far.
           */}
          <View
            accessibilityRole="text"
            accessibilityLabel={t.fieldLabel}
            accessibilityValue={{ text: `${pin.length}/4` }}
            style={s.cells}
          >
            {[0, 1, 2, 3].map((index) => {
              const filled = pin.length > index;
              const wrong = outcome !== null && outcome.kind !== 'ok';
              const alarm = wrong || lockedOut;

              return (
                <View
                  key={index}
                  style={[
                    s.cell,
                    {
                      /* The cell waiting for the next digit takes a brand edge
                         — design line 1199, and the only caret four separate
                         boxes can have. */
                      borderColor: alarm
                        ? c.danger500
                        : pin.length === index
                          ? c.brand500
                          : c.borderStrong,
                      backgroundColor: alarm ? c.danger50 : c.bgSubtle,
                    },
                  ]}
                >
                  <Text style={[s.cellLine, { color: wrong ? c.danger700 : c.fg }]}>
                    {filled ? '•' : ''}
                  </Text>
                </View>
              );
            })}
          </View>

          {/*
           * A fixed slot for the message, so the keypad does not jump down the
           * screen when a failure appears. On a phone that shift is enough to
           * put a thumb on 8 instead of 5.
           */}
          <View style={s.messageSlot}>
            {message === null ? null : (
              <Text style={[text.label, s.message, { color: c.danger700 }]}>{message}</Text>
            )}
          </View>

          <View style={s.pad}>
            {KEYS.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key === 'clear' ? t.clear : key === 'back' ? t.backspace : key}
                disabled={busy || lockedOut}
                onPress={() => press(key)}
                style={({ pressed }) => [
                  s.key,
                  {
                    borderColor: /^\d$/.test(key) ? c.border : 'transparent',
                    backgroundColor: /^\d$/.test(key) ? c.surface : 'transparent',
                    borderRadius: size.radiusLg,
                  },
                  pressed && s.pressed,
                  (busy || lockedOut) && s.disabled,
                ]}
              >
                <Text style={[s.keyLine, { color: /^\d$/.test(key) ? c.fg : c.fgMuted }]}>
                  {key === 'clear' ? 'C' : key === 'back' ? '⌫' : key}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

/**
 * 64pt keys.
 *
 * Over the 44pt floor by twenty, and deliberately larger than the design's 58px
 * web frame: this is the one place in the app where a mis-tap costs an attempt,
 * and the person pressing it is standing up with something in the other hand.
 */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

/** Which sentence a refusal gets. Five states, five different next actions. */
function messageFor({
  outcome,
  lockedOut,
  busy,
  t,
}: {
  outcome: PinOutcome | null;
  lockedOut: boolean;
  busy: boolean;
  t: Record<string, string>;
}): string | null {
  if (lockedOut) return t.lockedOut ?? null;
  if (busy) return t.submitting ?? null;
  if (outcome === null || outcome.kind === 'ok') return null;

  switch (outcome.kind) {
    case 'locked':
      return fill(t.lockedServer ?? '', { minutes: outcome.minutes });
    case 'no_surface':
      return t.noSurface ?? null;
    case 'not_enrolled':
      return t.notEnrolledTitle ?? null;
    case 'unreachable':
      return t.unreachable ?? null;
    default:
      return t.rejected ?? null;
  }
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 26 },
  brand: { alignItems: 'center' },
  mark: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  /* `Xodimlar ilovasi.dc.html` line 1039: font-family:var(--font-display);
     font-size:16px;font-weight:800;letter-spacing:-.02em. */
  markLine: { ...display(800), fontSize: 16, letterSpacing: -0.32 },
  heading: { marginTop: 14 },
  cells: { flexDirection: 'row', justifyContent: 'center', gap: 13, marginTop: 24 },
  cell: {
    width: 46,
    height: 56,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Line 1059: font-family:var(--font-display);font-size:24px;font-weight:700.
     The dot is set at the size a typed digit would be, not at the 20px of a
     section heading. */
  cellLine: { ...display(700), fontSize: 24, lineHeight: 28 },
  /* Line 1062: height:20px;margin-top:9px — a fixed slot, and small enough that
     the keypad below it stays where the thumb left it. */
  messageSlot: { height: 20, marginTop: 9, justifyContent: 'center', paddingHorizontal: 4 },
  message: { textAlign: 'center' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 6 },
  key: {
    width: '30%',
    flexGrow: 1,
    height: 64,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Line 1066: font-size:21px;font-weight:600 in the display face. */
  keyLine: { ...display(600), fontSize: 21, lineHeight: 25 },
  /* `[data-press]:active{transform:scale(.97)}` — the design's own
     press. It faded here, which reads as "disabled for a moment". */
  pressed: PRESSED,
  disabled: { opacity: 0.45 },
  enrol: { marginTop: 24, padding: 14, borderWidth: 1 },
  enrolTitle: { ...sans(600), lineHeight: 19 },
  enrolBody: { marginTop: 6, lineHeight: 17 },
  codeField: {
    height: 48,
    marginTop: 6,
    paddingHorizontal: 12,
    textAlign: 'center',
    letterSpacing: 4,
    borderWidth: 1,
  },
  enrolCta: { marginTop: 10 },
  enrolFailed: { marginTop: 8, lineHeight: 17 },
});
