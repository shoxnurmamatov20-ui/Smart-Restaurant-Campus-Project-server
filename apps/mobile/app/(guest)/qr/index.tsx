import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGuestCopy } from '@/guest/copy';
import { ChevronLeft } from '@/guest/icons';
import { tableFromCode, tableHref, useGuestBack } from '@/guest/route';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { text } from '@/type';
import { Button, PRESSED } from '@/ui/primitives';

/**
 * Reading the sticker on the table.
 *
 * **This screen is why the guest surface is worth shipping natively at all.**
 * In a browser the guest points their phone's own camera app at the code and
 * lands in Safari; there is no web screen for this and there cannot be. Here
 * the app reads the code itself, which means it can also say *"that is not a
 * table code"* instead of opening a blank page — the failure a camera app hands
 * back as a URL that 404s somewhere else.
 *
 * Three states before the camera ever appears, and the two refusals are drawn
 * as carefully as the success:
 *
 *   · **not asked yet** — a card that says what the camera is for and what
 *     happens to the picture, and a button that asks. An iOS permission prompt
 *     fires once per install; spending it the instant a screen mounts, with no
 *     sentence in front of it, is how an app gets a permanent "no".
 *   · **refused, askable** — the same card. `requestPermission()` still opens
 *     the system sheet on Android.
 *   · **refused, not askable** — the OS will not ask again, so the only honest
 *     control is one that opens Settings. A card repeating "please allow" with
 *     a button that does nothing is the state this screen exists to avoid.
 *
 * A read that is not a table URL is its own state rather than a toast: the
 * camera keeps firing frames, and a message that clears itself would be gone
 * before a guest holding a phone at arm's length has finished reading it.
 */
export default function ScanScreen() {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useGuestCopy();

  const [permission, requestPermission] = useCameraPermissions();
  const back = useGuestBack('/');
  const [wrongCode, setWrongCode] = useState(false);

  /*
   * A QR code fires a frame ten times a second while it is in view. Without a
   * latch the first read navigates and the next nine push the same screen on
   * top of it, so `back` walks through ten copies of one table.
   */
  const handled = useRef(false);

  const read = (data: string) => {
    if (handled.current) return;

    const found = tableFromCode(data);

    if (found === null) {
      handled.current = true;
      setWrongCode(true);

      return;
    }

    handled.current = true;
    // `replace`, not `push`: back from the table should leave the QR flow, not
    // return to a camera still pointed at the code that would open it again.
    router.replace(tableHref(found));
  };

  const again = () => {
    setWrongCode(false);
    handled.current = false;
  };

  if (permission === null) {
    // The permission is still being read off the OS. A blank frame for a few
    // frames beats a card that says "not allowed" and then contradicts itself.
    return <Waiting />;
  }

  if (!permission.granted) {
    return (
      <Refusal
        title={permission.canAskAgain ? t.scanner.allowTitle : t.scanner.deniedTitle}
        body={permission.canAskAgain ? t.scanner.allowBody : t.scanner.deniedBody}
        action={permission.canAskAgain ? t.scanner.allow : t.scanner.settings}
        onAction={() => {
          if (permission.canAskAgain) void requestPermission();
          else void Linking.openSettings();
        }}
        onBack={back}
      />
    );
  }

  if (wrongCode) {
    return (
      <Refusal
        title={t.scanner.wrongTitle}
        body={t.scanner.wrongBody}
        action={t.scanner.again}
        onAction={again}
        onBack={back}
      />
    );
  }

  return (
    <View style={[s.fill, { backgroundColor: c.n900 }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        // Only QR. A table sticker is a QR code, and a scanner that also reads
        // the barcode on a bottle of water would open a table called `4780…`.
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => read(data)}
      />

      {/*
       * The scrim, the frame and the words are three siblings rather than one
       * box with a hole in it: React Native has no `mask`, and four dimmed
       * bands around a clear square is what a viewfinder actually is.
       */}
      <View style={[s.scrim, { backgroundColor: c.n900 }]} pointerEvents="none" />

      <View style={s.centre} pointerEvents="none">
        <View style={[s.frame, { borderColor: c.n0, borderRadius: size.radiusXl }]} />
      </View>

      <Pressable
        onPress={back}
        accessibilityRole="button"
        accessibilityLabel={t.dish.back}
        style={({ pressed }) => [
          s.back,
          { top: insets.top + size.sp3, backgroundColor: c.n0, borderRadius: size.radiusMd },
          pressed && s.pressed,
        ]}
      >
        <ChevronLeft colour={c.n900} />
      </Pressable>

      <View style={[s.caption, { paddingBottom: insets.bottom + size.sp8 }]} pointerEvents="none">
        <Text style={[text.title, { color: c.n0, textAlign: 'center' }]}>{t.scanner.title}</Text>
        <Text style={[text.small, s.captionBody, { color: c.n0 }]}>{t.scanner.body}</Text>
      </View>
    </View>
  );
}

function Waiting() {
  const c = useTheme();

  return <View style={[s.fill, { backgroundColor: c.n900 }]} />;
}

/**
 * A refusal, said as a reason and a way out.
 *
 * One component for all three — no permission, no permission ever, wrong code —
 * because they are the same shape to the reader: what happened, why, and the
 * single control that changes it.
 */
function Refusal({
  title,
  body,
  action,
  onAction,
  onBack,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
  onBack: () => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useGuestCopy();

  return (
    <View style={[s.fill, { backgroundColor: c.bg, paddingTop: insets.top + size.sp3 }]}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t.dish.back}
        style={({ pressed }) => [s.backFlat, pressed && s.pressed]}
      >
        <ChevronLeft colour={c.fgMuted} />
      </Pressable>

      <View style={s.refusal}>
        <Text style={[text.display, { color: c.fg }]}>{title}</Text>
        <Text style={[text.body, { color: c.fgMuted, marginTop: size.sp3 }]}>{body}</Text>

        <Button onPress={onAction} style={{ marginTop: size.sp5, alignSelf: 'flex-start' }}>
          {action}
        </Button>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  // The dimming that makes the frame read as a frame. Low enough that a guest
  // can still see what the camera sees outside it and aim by furniture.
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.45 },
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: { width: 248, height: 248, borderWidth: 2, opacity: 0.9 },
  back: {
    position: 'absolute',
    left: size.sp5,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.92,
  },
  backFlat: {
    width: 44,
    height: 44,
    marginLeft: size.sp3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: size.sp6,
  },
  captionBody: { textAlign: 'center', marginTop: size.sp2, opacity: 0.78 },
  refusal: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: size.sp5,
    paddingBottom: size.sp10,
  },
  /* `[data-press]:active{transform:scale(.97)}` — the design's own
     press. It faded here, which reads as "disabled for a moment". */
  pressed: PRESSED,
});
