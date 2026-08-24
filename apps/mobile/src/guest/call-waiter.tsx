import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fill } from '@restaurant/surfaces/guest/copy';
import { TABLE_ORDER } from '@restaurant/surfaces/guest/table-data';

import { PRESSED } from '../ui/primitives';
import { useGuestCopy } from './copy';
import { useFlash } from './flash';
import { Bell } from './icons';
import { callWaiter } from './table';
import { useLocale } from '../lib/locale';
import { useTheme } from '../lib/theme-context';
import { size } from '../theme';
import { sans, sansAt, text } from '../type';

/**
 * "Call the waiter" — `Mehmon.dc.html:112-118` on the landing screen and `:381`
 * on the status screen, which is why it is one component with two shapes.
 *
 * It presses, and it says what it did. The web build spent a long time drawing
 * this card disabled, on the reasoning that a control which tells nobody leaves
 * a guest waiting for somebody who was never called — right about the channel,
 * wrong about the screen. A dead card at the top of the first thing a guest
 * sees reads as a broken app, and this is the second most-pressed control on
 * the surface.
 *
 * It **latches**: a guest who taps three times has not called three waiters and
 * must not be told they have. So does the server — `POST /public/tables/{token}
 * /call` answers 200 with `already_open` rather than raising a second row — so
 * the two agree even after the app is closed and reopened.
 *
 * Given a table, it calls one: the row is written and
 * `tables.guest.called` goes out on `branch.{id}.floor`, which is the handset
 * in a waiter's apron. Without one — the marketing demo of this card — it
 * latches and says so, which is what it has always done.
 *
 * A failure does NOT unlatch, and that is deliberate on a phone more than
 * anywhere: reverting the card after a dropped request invites a second tap,
 * and the first may well have landed. Saying "done" and being wrong is cheaper
 * here than saying "failed" and being wrong.
 */
export function CallWaiter({
  variant = 'door',
  tenant,
  table,
}: {
  variant?: 'door' | 'button';
  /** The restaurant's slug, from the QR URL. Omit for the demo card. */
  tenant?: string;
  /** The table's `qr_token`, from the QR URL. Omit for the demo card. */
  table?: string;
}) {
  const c = useTheme();
  const flash = useFlash();
  const { lang } = useLocale();
  const { t } = useGuestCopy();
  const [called, setCalled] = useState(false);

  const call = () => {
    if (called) return;

    // Latched before the request, not after: a second tap arrives while the
    // first is still in flight, which is exactly what an impatient guest on
    // café Wi-Fi does.
    setCalled(true);
    flash(
      `${t.common.waiterCalled} · ${fill(t.common.waiterOnWay, { waiter: TABLE_ORDER.waiter })}`,
    );

    if (tenant === undefined || table === undefined) return;

    void callWaiter(tenant, table, { lang }).catch(() => {
      // Silent — see the note above on why a failure does not unlatch.
    });
  };

  if (variant === 'button') {
    return (
      <Pressable
        onPress={call}
        accessibilityRole="button"
        accessibilityState={{ disabled: called }}
        style={({ pressed }) => [
          s.button,
          { backgroundColor: c.surface, borderColor: c.border },
          pressed && PRESSED,
          called && s.called,
        ]}
      >
        <Text style={[text.body, { color: c.fg, ...sans(600) }]}>
          {called ? t.common.waiterCalled : t.scan.callWaiter}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={call}
      accessibilityRole="button"
      accessibilityState={{ disabled: called }}
      style={({ pressed }) => [
        s.door,
        {
          backgroundColor: called ? c.success50 : c.surface,
          borderColor: called ? c.success500 : c.border,
          borderRadius: size.radiusLg,
        },
        pressed && PRESSED,
      ]}
    >
      <Bell colour={called ? c.success600 : c.brand600} />

      <View style={s.doorMain}>
        <Text style={[s.doorTitle, { color: c.fg }]}>
          {called ? t.common.waiterCalled : t.scan.callWaiter}
        </Text>
        <Text style={[text.small, { color: called ? c.success700 : c.fgSubtle, marginTop: 1 }]}>
          {called ? t.common.demoPayment : t.scan.callWaiterSub}
        </Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  /* `gap:13px;padding:16px;border:1px solid var(--border)` — `:112`. A whole
     point, never the platform hairline: that is a third of one on a 3x phone,
     and the design draws no sub-pixel rule anywhere. */
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: size.sp4,
    borderWidth: 1,
    minHeight: 72,
  },
  doorMain: { flex: 1, minWidth: 0 },
  /* `font-size:16px;font-weight:600` — `:115`. It was `text.body`, 15, which is
     what the other doors on this screen were before they were corrected. */
  doorTitle: sansAt(600, 16, 1.4),
  /* `height:46px;border:1px solid var(--border);border-radius:13px` — `:381`.
     The radius was `--radius-md`, 10: the footer button and the one beside it
     (`status.tsx` draws the second at 13) were two different shapes. */
  button: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 13,
  },
  called: { opacity: 0.6 },
});
