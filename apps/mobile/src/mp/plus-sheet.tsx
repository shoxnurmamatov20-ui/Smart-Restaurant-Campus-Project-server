import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@restaurant/surfaces/mp/copy';
import { PLUS_ROWS, say } from '@restaurant/surfaces/mp/data';

import { Button, PRESSED } from '../ui/primitives';
import { useLocale } from '../lib/locale';
import { som } from '../lib/money';
import { useShadows, useTheme } from '../lib/theme-context';
import { size } from '../theme';
import { sans, text } from '../type';
import { startPlus, stopPlus, type MpPlus } from './live';
import { fillDate, plusWord, shortDate } from './settings-copy';

/**
 * MyPOS Plus, as something a guest can actually start and stop.
 *
 * The row used to raise a toast with the arithmetic on it, because there was no
 * endpoint to buy one with and a control that looked like a purchase and did
 * nothing is worse than a sum. `POST /mp/plus/subscribe` and
 * `POST /mp/plus/cancel` exist now, so the button is a button.
 *
 * ---------------------------------------------------------------------------
 * What is still bought from somebody else, and what the sheet says about it
 *
 * The platform raises **one invoice at a time**. A standing order — the
 * provider charging month after month without being asked again — is a mandate
 * held by the acquirer, and it is not a column anybody here can add. So the
 * subscription is renewed by the guest each month, and `plusWord('manual')`
 * says exactly that, in three languages, above the button rather than in a
 * footnote. The alternative is a guest who believes their delivery is still
 * free in October and finds out at a checkout.
 *
 * TODO(integration): needs PAYME_KEY — see docs/GO-LIVE.md
 * That key is what turns the monthly invoice into a mandate. Everything else on
 * this sheet works without it.
 *
 * **Cancelling does not stop it today.** The server answers with the date the
 * month already paid for runs out, and the sheet prints it: somebody who
 * cancels on the second has twenty-nine days of free delivery left and must not
 * be told the benefit is gone.
 *
 * **The refusals are the server's own sentences.** `plus_already_active` and
 * `plus_not_active` are the two races a second phone creates, and
 * `plus_payment_unavailable` is the provider being down — three different
 * things for a person to do next, so none of them is flattened into "failed".
 */
export function PlusSheet({
  open,
  plus,
  live,
  onClose,
  onChanged,
  announce,
}: {
  open: boolean;
  plus: MpPlus;
  /** False while the sample stands in — the buttons are hidden rather than lying. */
  live: boolean;
  onClose: () => void;
  /** The profile and the Plus card both refetch: points and the row note move. */
  onChanged: () => void;
  announce: (message: string, tone?: 'ok' | 'problem') => void;
}) {
  const c = useTheme();
  const sh = useShadows();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();

  const [busy, setBusy] = useState(false);
  /** A payment page the provider handed back, kept so a failed tap can retry. */
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  const until = shortDate(plus.until);
  const renews = shortDate(plus.renewsAt);
  const cancelled = plus.state === 'cancelled';

  const start = async () => {
    if (busy) return;
    setBusy(true);

    const done = await startPlus(lang);
    setBusy(false);

    if (!done.ok) {
      announce(done.message ?? t('placeFailed', lang), 'problem');

      return;
    }

    /*
     * An invoice means the first month is not free after all and the provider
     * wants paying before the benefit starts. Kept on screen rather than opened
     * on its own: a bank page that appears without warning is one people close.
     */
    if (done.data.invoice !== null) {
      setInvoiceUrl(done.data.invoice.url);
      announce(plusWord('invoice', lang));
      onChanged();

      return;
    }

    announce(t('plusOnFlash', lang));
    onChanged();
    onClose();
  };

  const stop = async () => {
    if (busy) return;
    setBusy(true);

    const done = await stopPlus(lang);
    setBusy(false);

    if (!done.ok) {
      announce(done.message ?? t('placeFailed', lang), 'problem');

      return;
    }

    announce(t('plusOffFlash', lang));
    onChanged();
    onClose();
  };

  const pay = async (url: string) => {
    // `openURL` rejects when nothing on the phone handles the scheme, which for
    // a provider link means a browser has been removed or the URL is malformed.
    // Either way the tap did nothing visible, and silence is the wrong answer.
    try {
      await Linking.openURL(url);
    } catch {
      announce(plusWord('invoiceFailed', lang), 'problem');
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/* `background:rgba(15,19,32,.5)` — that is `--n-900` at half, in both
          themes, and not the `--bg-inverse` pair the sheet used to take. */}
      <Pressable style={[s.scrim, { backgroundColor: c.n900 }]} onPress={onClose} />

      <View
        style={[
          s.sheet,
          {
            backgroundColor: c.surface,
            boxShadow: sh.xl,
            // `padding:…20px 20px 26px` plus the home indicator, which the
            // browser the design was drawn in does not have.
            paddingBottom: insets.bottom + 26,
          },
        ]}
      >
        <View style={[s.grip, { backgroundColor: c.borderStrong }]} />

        <Text style={[text.title, { color: c.fg }]}>{t('plusH', lang)}</Text>
        <Text style={[text.caption, { color: c.fgSubtle, marginTop: 4 }]}>
          {plus.active ? t('plusSideNoteOn', lang) : t('plusSideNote', lang)}
        </Text>

        <ScrollView style={s.body} contentContainerStyle={s.bodyInner}>
          {/* ------------------------------------------------ what it costs */}
          <View
            style={[
              s.price,
              { backgroundColor: c.brand50, borderColor: c.brand200, borderRadius: size.radiusLg },
            ]}
          >
            <Text style={[text.display, text.num, { color: c.brand700 }]}>
              {som(plus.monthly, lang)}
            </Text>
            <Text style={[text.caption, { color: c.brand700, marginTop: 4 }]}>
              {plusWord('manual', lang)}
            </Text>
          </View>

          {/* ------------------------------------------------- what it buys */}
          {PLUS_ROWS.map((row) => (
            <View key={say(row.label, 'en')} style={[s.row, { borderBottomColor: c.divider }]}>
              <Text style={[text.small, { color: c.fgMuted, flex: 1, minWidth: 0 }]}>
                {say(row.label, lang)}
              </Text>
              <Text style={[text.small, { color: c.fg, ...sans(600) }]}>
                {say(row.value, lang)}
              </Text>
            </View>
          ))}

          {/* ------------------------------------------- where it stands now */}
          {plus.active && until !== null ? (
            <Text style={[text.caption, s.state, { color: c.fgSubtle }]}>
              {cancelled
                ? `${plusWord('cancelled', lang)} · ${fillDate(plusWord('until', lang), until)}`
                : fillDate(plusWord('until', lang), until)}
            </Text>
          ) : null}

          {plus.active && !cancelled && renews !== null ? (
            <Text style={[text.caption, s.state, { color: c.fgSubtle }]}>
              {fillDate(plusWord('renews', lang), renews)}
            </Text>
          ) : null}

          {/* The arithmetic the row used to raise on its own. It is the honest
              argument for and against, and it belongs beside the button rather
              than instead of it. */}
          <Text style={[text.caption, s.math, { color: c.fgMuted }]}>
            {plus.active ? t('plusMathOn', lang) : t('plusMathOff', lang)}
          </Text>

          {invoiceUrl === null ? null : (
            <Button kind="secondary" style={s.action} onPress={() => void pay(invoiceUrl)}>
              {plusWord('pay', lang)}
            </Button>
          )}

          {/*
           * No control at all while the sample is showing. A start button over
           * fixture data would post a real subscribe against a session that
           * does not exist and answer with a refusal the guest cannot read.
           */}
          {live ? (
            <Button
              style={s.action}
              disabled={busy}
              onPress={() => void (plus.active && !cancelled ? stop() : start())}
            >
              {busy
                ? plusWord('working', lang)
                : plus.active && !cancelled
                  ? t('plusStop', lang)
                  : t('plusStart', lang)}
            </Button>
          ) : (
            <Text style={[text.caption, s.math, { color: c.warning700 }]}>
              {plusWord('signInFirst', lang)}
            </Text>
          )}
        </ScrollView>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={({ pressed }) => [
            s.close,
            { borderColor: c.border, borderRadius: size.radiusMd },
            pressed && PRESSED,
          ]}
        >
          <Text style={[text.body, { color: c.fg, ...sans(600) }]}>{t('close', lang)}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.5 },
  /*
   * The one sheet the design draws — `Xodimlar ilovasi.dc.html:1119`:
   * `border-radius:20px 20px 0 0;padding:20px 20px 26px;background:var(--surface);
   * box-shadow:var(--shadow-xl)`. The marketplace file has no sheet at all (its
   * Plus is a row, `MyPOS Marketplace - Ilova.dc.html:762`), so this shape is
   * the system's, and seven files in this app were each inventing their own.
   *
   * No border: a sheet is lifted off the wash by the shadow, and the 1px rule
   * that stood in for it drew a hard line across the top of every sheet.
   */
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  /* `width:34px;height:4px;border-radius:999px;margin:0 auto 16px` — `:1120`. */
  grip: {
    width: 34,
    height: 4,
    borderRadius: size.radiusPill,
    alignSelf: 'center',
    marginBottom: size.sp4,
  },
  body: { marginTop: size.sp4 },
  bodyInner: { paddingBottom: size.sp2 },
  price: { padding: 17, borderWidth: 1, marginBottom: size.sp4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: size.sp3,
    minHeight: 44,
    paddingVertical: size.sp2,
    borderBottomWidth: 1,
  },
  state: { marginTop: size.sp3, lineHeight: 17 },
  math: { marginTop: size.sp4, lineHeight: 17 },
  action: { marginTop: size.sp4, minHeight: 52 },
  close: {
    minHeight: 44,
    marginTop: size.sp4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
