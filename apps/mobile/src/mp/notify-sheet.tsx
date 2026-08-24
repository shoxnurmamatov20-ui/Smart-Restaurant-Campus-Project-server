import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@restaurant/surfaces/mp/copy';

import { useLocale } from '../lib/locale';
import { pushAllowed, pushSupported } from '../lib/push';
import { useTheme } from '../lib/theme-context';
import { size } from '../theme';
import { sans, text } from '../type';
import { NOTIFY_KEYS, saveNotify, type NotifyKey, type NotifyPrefs } from './live';
import { notify } from './settings-copy';
import { PRESSED } from '@/ui/primitives';

/**
 * Which messages a guest wants, as four switches that write to the account.
 *
 * The row used to raise a toast describing what it would do, and the note above
 * it said the honest reason: there was no preference store and no way to
 * register this phone as a place to deliver against, so a preference with
 * nothing to deliver against would have been a setting that changed nothing.
 * Both halves exist now — `PATCH /mp/me` takes `notification_prefs`, and
 * `POST /mp/push/tokens` registers the handset at sign-in — so the switches are
 * switches.
 *
 * ---------------------------------------------------------------------------
 * Three things this sheet refuses to do
 *
 * **It does not ask for the notification permission.** iOS raises that prompt
 * once per install and never again; spending it the moment a settings sheet
 * opens is how an app earns a permanent no. The prompt belongs to sign-in,
 * where the guest has just said they want to be told about their order.
 * `pushAllowed()` only reads.
 *
 * **It does not hide the OS's own answer.** Four switches all on while the
 * phone drops every message is a settings screen that lies, and the guest
 * blames the app for the silence. When the platform is blocking them the sheet
 * says so and offers the one control that changes it.
 *
 * That warning is for a phone that *could* receive notifications and will not.
 * A build that cannot — Expo Go, which dropped remote push in SDK 53 — gets no
 * banner at all: telling somebody their phone is blocking messages, beside a
 * button to open settings that contain no such switch, is worse than silence.
 * The shipped APK is never in that state.
 *
 * **It never sends half the object.** `notification_prefs` is one jsonb value,
 * so a patch of the single key that moved is a read-modify-write race against
 * the guest's other phone — and the losing half of that race is somebody being
 * texted about a promotion they switched off this morning. All four keys, every
 * time.
 *
 * Writes are serialised for the same reason: four quick taps must not become
 * four requests racing, with the oldest failure reverting the newest choice.
 */
export function NotifySheet({
  open,
  prefs,
  live,
  onClose,
  onSaved,
  announce,
}: {
  open: boolean;
  /** What the server last said. The sheet opens on this every time. */
  prefs: NotifyPrefs;
  /** False while the sample stands in: the switches are read-only. */
  live: boolean;
  onClose: () => void;
  onSaved: (saved: NotifyPrefs) => void;
  announce: (message: string, tone?: 'ok' | 'problem') => void;
}) {
  const c = useTheme();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();

  const [shown, setShown] = useState<NotifyPrefs>(prefs);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  /** The last value the server accepted — where a failed write puts things back. */
  const confirmed = useRef<NotifyPrefs>(prefs);
  /** The tail of the write chain, so two taps queue rather than race. */
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  /*
   * Reopened on whatever the server says now, not on what was left on screen
   * last time. A guest who changed this on another phone should see that,
   * and a sheet that remembered a failed toggle would show a lie.
   */
  useEffect(() => {
    if (!open) return;

    setShown(prefs);
    confirmed.current = prefs;
  }, [open, prefs]);

  /* The OS's switch, read once per opening. Cheap, and it can change while the
     app is backgrounded — somebody goes to Settings because of this sheet. */
  useEffect(() => {
    if (!open) return;

    let alive = true;

    void pushAllowed().then((granted) => {
      if (alive) setAllowed(granted);
    });

    return () => {
      alive = false;
    };
  }, [open]);

  const toggle = (key: NotifyKey, on: boolean) => {
    if (!live) {
      announce(notify('signInFirst', lang), 'problem');

      return;
    }

    const next: NotifyPrefs = { ...shown, [key]: on };

    // Moved on screen first. A switch that waits for a round trip before it
    // slides reads as broken on a slow connection, and the guest taps it again.
    setShown(next);

    chain.current = chain.current.then(async () => {
      const done = await saveNotify(next, lang);

      if (!done.ok) {
        setShown(confirmed.current);
        announce(done.message ?? notify('saveFailed', lang), 'problem');

        return;
      }

      confirmed.current = done.data.notify;
      setShown(done.data.notify);
      onSaved(done.data.notify);
      announce(notify('saved', lang));
    });
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

        <Text style={[text.title, { color: c.fg }]}>{t('row_notifications', lang)}</Text>
        <Text style={[text.caption, { color: c.fgSubtle, marginTop: 4 }]}>
          {notify('lede', lang)}
        </Text>

        <ScrollView style={s.list} contentContainerStyle={s.listInner}>
          {allowed === false && pushSupported() ? (
            <View
              style={[
                s.blocked,
                {
                  backgroundColor: c.warning50,
                  borderColor: c.warning500,
                  borderRadius: size.radiusMd,
                },
              ]}
            >
              <Text style={[text.caption, s.blockedLine, { color: c.warning700 }]}>
                {notify('blocked', lang)}
              </Text>

              <Pressable
                onPress={() => void Linking.openSettings()}
                accessibilityRole="button"
                style={({ pressed }) => [s.settings, pressed && s.pressed]}
              >
                <Text style={[text.small, { color: c.fgBrand, ...sans(600) }]}>
                  {notify('settings', lang)}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {NOTIFY_KEYS.map((key) => (
            <View key={key} style={[s.row, { borderBottomColor: c.divider }]}>
              <View style={s.rowMain}>
                <Text style={[text.small, { color: c.fg, ...sans(600) }]}>{notify(key, lang)}</Text>
                <Text style={[text.caption, { color: c.fgSubtle, marginTop: 2 }]}>
                  {notify(`${key}Note`, lang)}
                </Text>
              </View>

              <Switch
                value={shown[key]}
                onValueChange={(on) => toggle(key, on)}
                disabled={!live}
                accessibilityLabel={notify(key, lang)}
                trackColor={{ false: c.borderStrong, true: c.brand500 }}
                thumbColor={c.n0}
              />
            </View>
          ))}
        </ScrollView>

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
    maxHeight: '86%',
    borderTopLeftRadius: size.radiusXl,
    borderTopRightRadius: size.radiusXl,
    borderWidth: 1,
    paddingHorizontal: size.sp5,
    paddingTop: size.sp3,
  },
  grip: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: size.sp4 },
  list: { marginTop: size.sp4 },
  listInner: { paddingBottom: size.sp2 },
  blocked: {
    borderWidth: 1,
    padding: size.sp3,
    marginBottom: size.sp3,
  },
  blockedLine: { lineHeight: 17 },
  settings: { minHeight: 44, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: size.sp3,
    minHeight: 56,
    paddingVertical: size.sp2,
    borderBottomWidth: 1,
  },
  rowMain: { flex: 1, minWidth: 0 },
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
