import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copy, DOCK } from '@restaurant/surfaces/customer/copy';

import { useCart } from '@/lib/cart';
import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme-context';
import { size } from '@/theme';
import { sansAt } from '@/type';
import { CartIcon, ClockIcon, DishIcon, PersonIcon } from '@/ui/icons';

/**
 * The customer app's four tabs — `Smart Restaurant Mijoz ilovasi.dc.html`.
 *
 * The same four the web dock draws, in the same order and from the same copy
 * table: menu, cart, order, profile. `customer/sign-in`, `customer/pay` and
 * `customer/loyalty` are pushed over the tabs rather than being tabs of their
 * own, exactly as the web build routes them — a person paying is in the middle
 * of one thing and should not be offered four others.
 *
 * `paddingBottom` from the inset, not a constant. This is the same defect the
 * web docks carried until today: a bar pinned to the bottom of an iPhone puts
 * its labels under the home indicator, and only the inset knows how tall that
 * is on this particular device.
 *
 * ---------------------------------------------------------------------------
 * It draws icons, and it said it did not
 *
 * `tabBarIconStyle: {display:'none'}` sat under a comment claiming "the file
 * draws no icons in this bar". It draws four — a 21px stroked pot, cart, clock
 * and person at `stroke-width:1.75` — and a dock of bare words is the one piece
 * of chrome a person navigates by shape rather than by reading. The rest of the
 * bar was off with it: 52pt tall against the design's 64, 12px labels against
 * 10, `--fg-muted` on the inactive tabs against `--fg-subtle`, and no basket
 * count anywhere, so the number of things waiting to be paid for was invisible
 * from every screen except the basket itself.
 */
export default function CustomerTabs() {
  const c = useTheme();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();
  const t = copy(DOCK, lang);
  const basket = useCart();

  /* `{{cartHas}}` — the badge is drawn only when something is in it. */
  const waiting = basket.lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        /* `[data-tab][data-on]{color:var(--brand-600)}` over `--fg-subtle`. */
        tabBarActiveTintColor: c.brand600,
        tabBarInactiveTintColor: c.fgSubtle,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          /* `border-top:1px solid var(--border)`, not a hairline. */
          borderTopWidth: 1,
          /* `height:64px` with `padding-bottom:4px`, plus whatever the home
             indicator needs under it. */
          height: 64 + insets.bottom,
          paddingTop: 0,
          paddingBottom: insets.bottom + 4,
        },
        /* `font-size:var(--text-3xs)` (10px) at 600 — it was 12. */
        tabBarLabelStyle: sansAt(600, 10, 1.25),
        /* `gap:4px` between the mark and its word. */
        tabBarIconStyle: { marginBottom: -2 },
        tabBarBadgeStyle: {
          backgroundColor: c.danger500,
          color: c.n0,
          ...sansAt(700, 10, 1.2),
          minWidth: 17,
          height: 17,
          lineHeight: 17,
        },
        sceneStyle: { backgroundColor: c.bg, paddingHorizontal: size.sp5 },
      }}
    >
      {/*
       * The first slot is `index`, the home screen, and it is labelled "Menyu".
       *
       * That is the web dock's own wiring — `customer-dock.tsx` points slot one
       * at `/customer`, not at `/customer/menu` — and the reason is that home is
       * where the branch, the delivery mode and the promo live. The full dish
       * list is a screen you push from it, the way "Barchasi" and the category
       * rail push it. Four slots, four labels, unchanged.
       */}
      <Tabs.Screen
        name="index"
        options={{
          title: t.menu,
          tabBarIcon: ({ color }) => <DishIcon colour={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t.cart,
          tabBarIcon: ({ color }) => <CartIcon colour={color} />,
          tabBarBadge: waiting === 0 ? undefined : waiting,
        }}
      />
      <Tabs.Screen
        name="order"
        options={{
          title: t.order,
          tabBarIcon: ({ color }) => <ClockIcon colour={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.profile,
          tabBarIcon: ({ color }) => <PersonIcon colour={color} />,
        }}
      />

      {/*
       * Everything else under `/customer` is pushed over the tabs, and in
       * expo-router that has to be said: a route file in this folder becomes a
       * tab of its own unless its `href` is null. Without these four lines the
       * bar grows to eight items, three of them labelled by their filename.
       *
       * `sign-in` hides the bar as well as its own slot. `pay` does not: the
       * design's `showTabs` is `screen !== "auth"`, and it draws the dock over
       * the payment screen. Somebody who reaches the card form and changes their
       * mind about a dish needs the way back that every other screen has.
       */}
      <Tabs.Screen name="menu" options={{ href: null }} />
      <Tabs.Screen name="loyalty" options={{ href: null }} />
      <Tabs.Screen name="pay" options={{ href: null }} />
      <Tabs.Screen name="sign-in" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}
