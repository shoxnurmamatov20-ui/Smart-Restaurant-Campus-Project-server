import { useFonts } from 'expo-font';
import { Stack, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FONTS } from '@/fonts.assets';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { LocaleProvider } from '@/lib/locale';
import { onNotificationTap } from '@/lib/push';

/**
 * The root of the native app: one stack, four surfaces under it.
 *
 * Each surface is a route group with its own layout — tabs for the customer
 * and the marketplace, a role-scoped stack for the crew, a table-scoped stack
 * for the guest. The paths are the web build's, segment for segment, so
 * `srcp://mp/track` from a push lands on the same screen `/mp/track` does in a
 * browser. That is the whole reason the two route trees look alike.
 *
 * Telegram is not here. Its mini app runs inside Telegram's own WebView, and a
 * native copy of it would be a copy of something the person already has.
 *
 * ---------------------------------------------------------------------------
 * Nothing renders before the typefaces do
 *
 * The design is set in Inter and Inter Tight, and until they were bundled the
 * whole app drew in the platform default — a different typeface at a different
 * width on every screen. `useFonts` reads them out of the bundle, which is
 * fast and local, and this holds the first frame until it has: a screen that
 * paints in Roboto and then reflows into Inter is the same wrong screen, shown
 * twice.
 *
 * The hold is a filled `View` rather than `null` so the app opens on the
 * theme's own background instead of a white flash on a dark phone.
 */
function Root() {
  const c = useTheme();
  const router = useRouter();
  const [fontsReady] = useFonts(FONTS);

  // A tapped notification opens the path it carries — the same path the web
  // build would, so `/crew/waiter/queue` from a push lands on the queue.
  useEffect(() => onNotificationTap((url) => router.push(url as Href)), [router]);

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <LocaleProvider>
            <Root />
          </LocaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
