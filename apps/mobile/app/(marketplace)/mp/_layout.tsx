import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MpDock } from '@/mp/dock';
import { useTheme } from '@/lib/theme-context';

/**
 * MyPOS's five tabs — `MyPOS Marketplace - Ilova.dc.html`.
 *
 * The routes are the web build's, segment for segment: `/mp`, `/mp/cart`,
 * `/mp/track`, `/mp/orders`, `/mp/profile` and `/mp/store/{id}`. That is not
 * tidiness — `srcp://mp/track` from a delivery push has to land on the screen a
 * browser would open at `/mp/track`, and the two trees are only interchangeable
 * while every segment matches. The `(marketplace)` group adds no segment of its
 * own — it groups the surface, and `mp/` is what the URL is made of, so this
 * layout lives beside the screens rather than beside the group.
 *
 * The bar itself is `MpDock` rather than the navigator's: the design draws an
 * icon and a word in each tab, the cart wears a count badge, and the store
 * screen — a route, not a tab — has to light the home tab while it is open.
 *
 * `paddingTop` from the inset, once, here. Every screen in this group is
 * full-bleed under a hidden header, so without it the first line of each sits
 * under the clock. The bottom inset is the dock's own problem and it owns it.
 */
export default function MarketplaceLayout() {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      tabBar={() => <MpDock />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.bg, paddingTop: insets.top },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="cart" />
      <Tabs.Screen name="track" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="profile" />
      {/*
       * A store is reached from the home screen and from a basket, never from
       * the bar. In expo-router a route file in this folder becomes a tab of its
       * own unless its `href` is null, so without this line the dock would grow
       * a sixth item labelled by its filename.
       */}
      <Tabs.Screen name="store/[store]" options={{ href: null }} />
    </Tabs>
  );
}
