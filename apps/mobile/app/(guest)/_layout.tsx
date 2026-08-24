import { Stack } from 'expo-router';

import { FlashHost } from '@/guest/flash';
import { useTheme } from '@/lib/theme-context';

/**
 * The QR guest surface — `Smart Restaurant Mehmon.dc.html`, six panels.
 *
 * A stack, not tabs, and that is the design's shape rather than a shortcut: a
 * guest is never on two of these screens at once. They scan, they read, they
 * order, they pay, they rate — a dock offering four destinations to somebody
 * halfway through paying is four ways to lose the thing they were doing.
 *
 * No sign-in and no session anywhere under here. The URL *is* the session:
 * `/qr/{restaurant}/{table}`, printed once on a sticker, carried in the path
 * because a sticker cannot hold state. Every request from these screens goes
 * out with `bearer: null`.
 *
 * No horizontal padding at this level either — the landing screen opens on a
 * full-bleed dark band, and a gutter here would inset it into a stripe.
 */
export default function GuestLayout() {
  const c = useTheme();

  return (
    <FlashHost>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: 'slide_from_right',
        }}
      />
    </FlashHost>
  );
}
