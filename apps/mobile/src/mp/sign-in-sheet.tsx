import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUTH, copy } from '@restaurant/surfaces/customer/copy';
import { t } from '@restaurant/surfaces/mp/copy';

import { requestCode, verifyCode } from './live';
import { Button, PRESSED } from '../ui/primitives';
import { useLocale } from '../lib/locale';
import { useTheme } from '../lib/theme-context';
import { size } from '../theme';
import { sans, text } from '../type';

/**
 * A phone number and an SMS code, as a sheet over the profile.
 *
 * **A sheet rather than a route, because the design has neither.** `MyPOS
 * Marketplace - Ilova.dc.html` draws six screens and none of them is a sign-in;
 * the profile screen simply opens on a person who is already known. That is a
 * gap in the handoff rather than a decision — `GET /mp/me`, the order history
 * and every write on the consumer surface need a `marketplace.consumers` token,
 * and no screen in the design ever obtains one. So this is the smallest thing
 * that closes it: no new segment for `routes.test.ts` to compare, no new tab,
 * and nothing drawn until somebody asks for it.
 *
 * **The words are the customer app's `AUTH` section**, not a fourth catalogue.
 * It is the same act in the same market — a number, a code, no password — and
 * `@restaurant/surfaces/mp/copy` has no auth keys precisely because the design
 * it was transcribed from has no auth screen. Two catalogues saying "Kod
 * yuborish" is two places for it to become "Kodni yuborish" in one of them.
 *
 * The refusals are the server's own sentences in the reader's language: "kod
 * noto'g'ri", "the code expired" and "too many attempts" are three different
 * things for a person to do next, and `live.ts` keeps them apart.
 */
type Step = 'phone' | 'code';

/** "90 123 45 67" — the grouping the design's own `setPhone` produces. */
const groupPhone = (digits: string): string =>
  [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(' ');

export function SignInSheet({
  open,
  onClose,
  onDone,
  announce,
}: {
  open: boolean;
  onClose: () => void;
  /** The profile is live from here on: the screen behind refetches. */
  onDone: (name: string | null) => void;
  announce: (message: string, tone?: 'ok' | 'problem') => void;
}) {
  const c = useTheme();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();

  const a = copy(AUTH, lang);

  const [step, setStep] = useState<Step>('phone');
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const phone = `+998${digits}`;

  const send = async () => {
    if (digits.length !== 9) {
      announce(a.incomplete, 'problem');

      return;
    }

    /* Stops the second tap rather than drawing a spinner: two presses are two
       paid SMS, and the server then refuses the third for a minute — for a
       message the guest did in fact receive. */
    if (busy) return;
    setBusy(true);

    const sent = await requestCode(phone, lang);
    setBusy(false);

    if (!sent.ok) {
      announce(sent.message ?? a.incomplete, 'problem');

      return;
    }

    setStep('code');
    setCode('');
    announce(`+998 ${groupPhone(digits)} · ${a.codeSent}`);
  };

  const submit = async (typed: string) => {
    if (busy) return;
    setBusy(true);

    const session = await verifyCode(phone, typed, lang);
    setBusy(false);

    if (!session.ok) {
      /* The field is cleared and the sheet stays put. Sending the guest back to
         the number would cost them another SMS, and the code they were typing is
         still good for the rest of its five minutes. */
      setCode('');
      announce(session.message ?? a.incomplete, 'problem');

      return;
    }

    onDone(session.data.name);
    announce(a.welcome);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[s.scrim, { backgroundColor: c.bgInverse }]} onPress={onClose} />

      <View
        style={[
          s.sheet,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
            paddingBottom: insets.bottom + size.sp4,
          },
        ]}
      >
        <View style={[s.grip, { backgroundColor: c.borderStrong }]} />

        <Text style={[text.title, { color: c.fg }]}>{a.heading}</Text>
        <Text style={[text.caption, { color: c.fgSubtle, marginTop: 4 }]}>{a.lede}</Text>

        {step === 'phone' ? (
          <>
            <Text style={[text.caps, s.label, { color: c.fgSubtle }]}>{a.phoneLabel}</Text>

            <View style={[s.field, { borderColor: c.border, borderRadius: size.radiusMd }]}>
              {/* The country code is drawn beside the field rather than typed
                  into it: every Uzbek mobile is +998 and nine digits, and asking
                  for the prefix produces it typed twice about as often as it
                  produces a correct number. */}
              <Text style={[text.body, text.num, { color: c.fgMuted }]}>+998</Text>
              <TextInput
                value={groupPhone(digits)}
                onChangeText={(next) => setDigits(next.replace(/\D/g, '').slice(0, 9))}
                keyboardType="phone-pad"
                autoFocus
                accessibilityLabel={a.phoneLabel}
                placeholder="90 123 45 67"
                placeholderTextColor={c.fgDisabled}
                style={[text.body, text.num, s.input, { color: c.fg }]}
              />
            </View>

            <Button onPress={() => void send()} style={s.action}>
              {a.send}
            </Button>
          </>
        ) : (
          <>
            <Text style={[text.caps, s.label, { color: c.fgSubtle }]}>{a.codeLabel}</Text>

            <View style={[s.field, { borderColor: c.border, borderRadius: size.radiusMd }]}>
              <TextInput
                value={code}
                onChangeText={(next) => {
                  const four = next.replace(/\D/g, '').slice(0, 4);

                  setCode(four);

                  // The fourth digit submits on its own. There is no confirm
                  // button in the design and there should not be: asking
                  // somebody to press "next" after the last digit of a
                  // four-digit code is asking them to confirm something they
                  // have finished saying.
                  if (four.length === 4) void submit(four);
                }}
                keyboardType="number-pad"
                autoFocus
                accessibilityLabel={a.codeLabel}
                placeholder="····"
                placeholderTextColor={c.fgDisabled}
                style={[text.display, text.num, s.input, s.code, { color: c.fg }]}
              />
            </View>

            <Pressable
              onPress={() => {
                setStep('phone');
                setCode('');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [s.link, pressed && s.pressed]}
            >
              <Text style={[text.small, { color: c.fgBrand, ...sans(600) }]}>{a.changeNumber}</Text>
            </Pressable>
          </>
        )}

        <Text style={[text.caption, s.terms, { color: c.fgSubtle }]}>{a.terms}</Text>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={({ pressed }) => [
            s.close,
            { borderColor: c.border, borderRadius: size.radiusMd },
            pressed && s.pressed,
          ]}
        >
          <Text style={[text.body, { color: c.fg, ...sans(600) }]}>{t('close', lang)}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.45 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: size.radiusXl,
    borderTopRightRadius: size.radiusXl,
    borderWidth: 1,
    paddingHorizontal: size.sp5,
    paddingTop: size.sp3,
  },
  grip: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: size.sp4 },
  label: { marginTop: size.sp5, marginBottom: 9 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: size.sp4,
    borderWidth: 1,
  },
  input: { flex: 1, minWidth: 0, paddingVertical: 12 },
  code: { letterSpacing: 8 },
  action: { marginTop: size.sp4, minHeight: 52 },
  link: { minHeight: 44, justifyContent: 'center' },
  terms: { marginTop: size.sp4, lineHeight: 17 },
  close: {
    minHeight: 44,
    marginTop: size.sp4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `[data-press]:active{transform:scale(.97)}` — the design's own
     press. It faded here, which reads as "disabled for a moment". */
  pressed: PRESSED,
});
