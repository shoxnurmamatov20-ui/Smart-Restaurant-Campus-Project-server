import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUTH, copy } from '@restaurant/surfaces/customer/copy';

import { requestCode, verifyCode } from '@/customer/account';

import { Notice, useNotice } from '@/ui/notice';
import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { display, sans, sansAt, text } from '@/type';

/**
 * Sign in — `Smart Restaurant Mijoz ilovasi.dc.html`, screen 1.
 *
 * **A phone number and an SMS code, never a password.** That is the design's
 * choice and the right one for this market: a guest ordering plov at eight in
 * the evening will not invent, remember or reset a password, and a password on a
 * food-ordering account is a password reused from somewhere that matters more.
 *
 * The country code is drawn beside the field rather than typed into it. Every
 * Uzbek mobile is `+998` and nine digits; asking for the prefix produces `+998`
 * typed twice about as often as it produces a correct number.
 *
 * **Four cells and the design's own twelve-key pad.** Both are drawn:
 * `grid-template-columns:repeat(3,1fr);gap:9px` with 54pt keys in Inter Tight,
 * exactly as the file has it. The pad used to be left out on the argument that
 * a phone already has a keyboard — which is true and is not the point: the
 * design puts the keys where the thumb already is, and a system keyboard covers
 * the four cells a guest is checking their typing against.
 *
 * The hidden field stays behind them, for the one thing the pad cannot do:
 * `autoComplete="sms-otp"` lets Android fill the code from the message without
 * anybody typing at all.
 *
 * The fourth digit submits on its own. There is no confirm button in the design
 * and there should not be: asking somebody to press "next" after the last digit
 * of a four-digit code is asking them to confirm something they have finished
 * saying.
 *
 * ---------------------------------------------------------------------------
 * Both halves are real now
 *
 * This screen used to advance on any four digits and hand over to a fixture
 * identity — everybody who typed any number reached the same demo guest. It now
 * asks `POST /api/v1/public/auth/otp` for a code and exchanges it at
 * `.../verify` for a ninety-day token, which `src/customer/account.ts` writes
 * to the Keychain before this screen navigates.
 *
 * The refusals are the server's own sentences, in the reader's language. "Kod
 * noto'g'ri", "the code has expired" and "too many attempts, wait fifteen
 * minutes" are three different things for a person to do next.
 */
type Step = 'phone' | 'code';

/**
 * The twelve keys, in the design's order — 1-9, then C · 0 · backspace.
 *
 * `{{keys}}` in the design file is a flat list of twelve rendered into a
 * three-column grid; these are the same twelve as the rows that grid produces.
 */
const KEYPAD: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['C', '0', '⌫'],
];

/** "90 123 45 67" — the grouping the design's own `setPhone` produces. */
function groupPhone(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(' ');
}

export default function SignInScreen() {
  const c = useTheme();
  const { lang } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { note, say: announce } = useNotice();

  const t = copy(AUTH, lang);

  const [step, setStep] = useState<Step>('phone');
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const codeField = useRef<TextInput>(null);
  const complete = digits.length === 9;

  // The cells are not focusable themselves, so the field behind them has to be
  // asked for the keyboard the moment the step changes — otherwise a guest taps
  // four boxes that never respond.
  useEffect(() => {
    if (step === 'code') codeField.current?.focus();
  }, [step]);

  const send = async () => {
    if (!complete) {
      announce(t.incomplete, 'problem');

      return;
    }

    /* Stops the second tap rather than drawing a spinner: two presses are two
       paid SMS, and the server then refuses the third for a minute — for a
       message the guest did in fact receive. */
    if (busy) return;
    setBusy(true);

    const sent = await requestCode(`+998${digits}`, lang);
    setBusy(false);

    if (!sent.ok) {
      announce(sent.message ?? t.incomplete, 'problem');

      return;
    }

    setStep('code');
    setCode('');
    announce(`+998 ${groupPhone(digits)} · ${t.codeSent}`);
  };

  const enter = (next: string) => {
    const four = next.replace(/\D/g, '').slice(0, 4);

    setCode(four);

    if (four.length === 4) void submit(four);
  };

  const submit = async (typed: string) => {
    if (busy) return;
    setBusy(true);

    const session = await verifyCode(`+998${digits}`, typed, lang);
    setBusy(false);

    if (!session.ok) {
      /* The cells are cleared and the screen stays put. Sending the guest back
         to the phone step would cost them another SMS, and the code they were
         typing is still good for the rest of its five minutes. */
      setCode('');
      announce(session.message ?? t.incomplete, 'problem');

      return;
    }

    const first = (session.data.name ?? '').split(' ')[0] ?? '';

    router.replace('/customer');
    announce(first === '' ? t.welcome : `${t.welcome}, ${first}`);
  };

  return (
    <View style={st.fill}>
      <ScrollView
        contentContainerStyle={[
          st.page,
          /* `padding:34px 24px 30px` — the design's own page box. */
          { paddingTop: insets.top + 34, paddingBottom: insets.bottom + 30 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Two letters, not a logo file: there is no per-tenant branding in this
            system yet and a placeholder image would have to be removed later. */}
        {/* `52×52;border-radius:15px`, the glyph at `--text-xl` weight 800
            with `letter-spacing:-.03em` — the design's own mark. */}
        <View style={[st.mark, { backgroundColor: c.brand500 }]}>
          <Text style={st.markLine}>SR</Text>
        </View>

        {/* `margin:26px 0 0;line-height:1.15` and `margin:10px 0 0` at
            `--text-md`, line-height 1.5 — it was 24/12 at 13px. */}
        <Text style={[st.heading, { color: c.fg }]}>{t.heading}</Text>
        <Text style={[st.lede, { color: c.fgMuted }]}>{t.lede}</Text>

        {step === 'phone' ? (
          <>
            <Text style={[text.small, st.label, { color: c.fg }]}>{t.phoneLabel}</Text>

            <View
              style={[
                st.field,
                {
                  backgroundColor: c.surface,
                  borderColor: c.borderStrong,
                  borderRadius: size.radiusMd,
                },
              ]}
            >
              {/* Both halves are `--text-lg` (17px) at 600 — :124. */}
              <Text style={[st.fieldLine, text.num, { color: c.fgSubtle }]}>+998</Text>
              <View style={[st.hair, { backgroundColor: c.divider }]} />
              <TextInput
                value={groupPhone(digits)}
                onChangeText={(next) => setDigits(next.replace(/\D/g, '').slice(0, 9))}
                keyboardType="number-pad"
                textContentType="telephoneNumber"
                accessibilityLabel={t.phoneLabel}
                placeholder="90 123 45 67"
                placeholderTextColor={c.fgSubtle}
                style={[st.input, st.fieldLine, text.num, { color: c.fg }]}
              />
            </View>

            {/*
             * Grey until the number is whole, and never `disabled`: a disabled
             * control cannot explain itself, and pressing this is how a guest who
             * typed eight digits finds out they typed eight digits.
             */}
            <Pressable
              onPress={() => void send()}
              accessibilityRole="button"
              style={({ pressed }) => [
                st.send,
                {
                  backgroundColor: complete ? c.brand500 : c.n300,
                  borderRadius: size.radiusMd,
                },
                pressed && st.pressed,
              ]}
            >
              <Text style={[st.sendLine, { color: c.n0 }]}>{t.send}</Text>
            </Pressable>

            {/* `margin:16px 0 0;font-size:--text-xs;line-height:1.55`. */}
            <Text style={[st.terms, { color: c.fgSubtle }]}>{t.terms}</Text>
          </>
        ) : (
          <>
            <Text style={[text.small, st.label, { color: c.fg }]}>{t.codeLabel}</Text>

            <Pressable
              onPress={() => codeField.current?.focus()}
              accessibilityRole="button"
              accessibilityLabel={t.codeLabel}
              style={st.cells}
            >
              {[0, 1, 2, 3].map((index) => (
                <View
                  key={index}
                  style={[
                    st.cell,
                    {
                      backgroundColor: c.bgSubtle,
                      borderColor: code.length === index ? c.brand500 : c.borderStrong,
                      borderRadius: size.radiusMd,
                    },
                  ]}
                >
                  <Text style={[st.cellLine, text.num, { color: c.fg }]}>{code[index] ?? ''}</Text>
                </View>
              ))}
            </Pressable>

            {/* Off-screen rather than `display: none`: a hidden input cannot take
                focus on either platform, and this one has to. */}
            <TextInput
              ref={codeField}
              value={code}
              onChangeText={enter}
              keyboardType="number-pad"
              maxLength={4}
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              accessibilityLabel={t.codeLabel}
              style={st.hidden}
            />

            {/*
             * The design's twelve keys — `grid-template-columns:repeat(3,1fr);
             * gap:9px;margin-top:20px`, each `height:54px` with a 1px border at
             * `--radius-md`, the glyph in Inter Tight at `--text-xl` weight 600.
             *
             * Drawn as three rows of four rather than a grid, because React
             * Native has no `grid` and four `flexDirection:'row'` blocks with
             * the same gap produce the same picture.
             */}
            <View style={st.pad}>
              {KEYPAD.map((row, index) => (
                <View key={index} style={st.padRow}>
                  {row.map((key) => (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={key === '⌫' ? t.codeLabel : key}
                      onPress={() =>
                        enter(key === '⌫' ? code.slice(0, -1) : key === 'C' ? '' : code + key)
                      }
                      style={({ pressed }) => [
                        st.key,
                        {
                          backgroundColor: c.surface,
                          borderColor: c.border,
                          borderRadius: size.radiusMd,
                        },
                        pressed && st.pressed,
                      ]}
                    >
                      <Text style={[st.keyLine, { color: c.fg }]}>{key}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>

            <View style={st.resend}>
              {/* The countdown is drawn, not run. A timer that resets on every
                  render would say 00:42 forever, which is worse than a static
                  line that reads as what it is. */}
              <Text style={[text.caption, text.num, st.resendNote, { color: c.fgSubtle }]}>
                {t.resend}
              </Text>

              <Pressable
                onPress={() => {
                  setStep('phone');
                  setCode('');
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  st.change,
                  { borderColor: c.border, borderRadius: size.radiusMd },
                  pressed && st.pressed,
                ]}
              >
                <Text style={[text.caption, { color: c.fgMuted, ...sans(600) }]}>
                  {t.changeNumber}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <Notice note={note} bottom={insets.bottom + 12} />
    </View>
  );
}

/*
 * Every number is the design's own — `Smart Restaurant Mijoz ilovasi.dc.html`,
 * the `at.auth` block. The screen was built on a spacing scale that has no 26,
 * no 30 and no 15, so each of those became the nearest step and the whole page
 * sat at a different rhythm from the drawing.
 */
const st = StyleSheet.create({
  fill: { flex: 1 },
  /* `padding:34px 24px 30px`; the tab scene already lays down 20 of the 24. */
  page: { paddingHorizontal: size.sp1 },
  /* `52×52;border-radius:15px` — 15, which is not a step on any scale. */
  mark: { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  /* `--text-xl` at weight 800, `letter-spacing:-.03em`, in the display face. */
  markLine: { ...display(800), fontSize: 20, lineHeight: 20, letterSpacing: -0.6, color: '#fff' },
  /* `margin:26px 0 0;font-size:--text-3xl;line-height:1.15`. */
  heading: { ...display(700), fontSize: 30, lineHeight: 35, letterSpacing: -0.66, marginTop: 26 },
  /* `margin:10px 0 0;font-size:--text-md;line-height:1.5`. */
  lede: { ...sansAt(400, 15, 1.5), marginTop: 10 },
  /* `margin-bottom:8px` on the phone step, 10 on the code step; the block above
     each is `margin-top:30px`. */
  label: { marginTop: 30, marginBottom: 8, ...sans(600) },
  /* `height:52px;padding:0 15px;border:1px solid var(--border-strong)`. */
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 15,
    borderWidth: 1,
  },
  /* Both halves of the field are `--text-lg` at 600, `letter-spacing:.02em`. */
  fieldLine: { ...sansAt(600, 17, 1.2), letterSpacing: 0.34 },
  /* `width:1px;height:22px` — a real pixel, not a hairline. */
  hair: { width: 1, height: 22 },
  input: { flex: 1, minWidth: 0, padding: 0 },
  /* `height:52px;margin-top:16px`, and no border on a primary. */
  send: { height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  sendLine: { ...sansAt(600, 15, 1.2) },
  /* `display:flex;gap:11px` — it was 10. */
  cells: { flexDirection: 'row', gap: 11 },
  /* `height:62px;border:1px solid` — the border was 1.5. */
  cell: { flex: 1, height: 62, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  /* `font-family:var(--font-display);font-size:--text-2xl;font-weight:700`. */
  cellLine: { ...display(700), fontSize: 24, lineHeight: 30 },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  /* `grid-template-columns:repeat(3,1fr);gap:9px;margin-top:20px`. */
  pad: { marginTop: 20, gap: 9 },
  padRow: { flexDirection: 'row', gap: 9 },
  /* `height:54px;border:1px solid var(--border)`. */
  key: { flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  /* `font-family:var(--font-display);font-size:--text-xl;font-weight:600`. */
  keyLine: { ...display(600), fontSize: 20, lineHeight: 24 },
  /* `margin-top:16px` and the pair pushed apart. */
  resend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  resendNote: { flex: 1, minWidth: 0 },
  /* `height:30px;padding:0 12px;border:1px solid var(--border)`. The 44pt reach
     comes from a hit slop rather than from a taller box, so the row keeps the
     design's height. */
  change: {
    height: 30,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  /* `margin:16px 0 0;font-size:--text-xs;line-height:1.55`. */
  terms: { ...sansAt(400, 12, 1.55), marginTop: 16 },
  /* `[data-press]:active{transform:scale(.97)}`. */
  pressed: { transform: [{ scale: 0.97 }] },
});
