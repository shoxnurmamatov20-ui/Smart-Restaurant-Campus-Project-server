import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@restaurant/surfaces/mp/copy';

import { useBasket } from './basket';
import { Glyph, type GlyphName } from './icons';
import { useLocale, type Lang } from '../lib/locale';
import { useMpTheme } from '../lib/theme-context';
import { size } from '../theme';
import { sans, text } from '../type';
import { PRESSED } from '../ui/primitives';

/**
 * MyPOS's bottom dock — five destinations, in the web build's order.
 *
 * The list is `mp-chrome.tsx`'s `TABS`, key for key and position for position,
 * because that is the file the web header and the web dock are both built from:
 * a destination added to one tree and missing from the other is the failure mode
 * of a product drawn twice, and this is the third drawing of it.
 *
 * **The design's second tab is search; the web's fifth is tracking, and tracking
 * wins.** `Ilova.dc.html:588` lists home · search · cart · orders · profile, and
 * its search tab does nothing but raise a toast — the design file's own note
 * says so. The web build spends that slot on `/mp/track`, which is where a push
 * notification about a delivery lands. A tab that cannot be deep-linked to is a
 * tab a notification cannot open. This moves every tab after the first, so it
 * is the one thing in this file that is deliberately not the design.
 *
 * A custom bar rather than the navigator's own, for three reasons the default
 * cannot answer: the design draws an icon *and* a word in every tab, the cart
 * carries a count badge, and the store screen — which is not a tab — has to
 * light the home tab while it is open, exactly as the design's `tabFor` map
 * does.
 */
export const DOCK_HEIGHT = 62;

const TABS = [
  { key: 'home', href: '/mp', glyph: 'home' },
  { key: 'cart', href: '/mp/cart', glyph: 'bag' },
  { key: 'track', href: '/mp/track', glyph: 'pin' },
  { key: 'orders', href: '/mp/orders', glyph: 'list' },
  { key: 'profile', href: '/mp/profile', glyph: 'user' },
] as const satisfies readonly { key: string; href: string; glyph: GlyphName }[];

/**
 * The word the dock draws, where it is not the word the catalogue holds.
 *
 * `Ilova.dc.html:597` writes tab one as `P("Bosh", "Главная", "Home")`. The
 * shared catalogue's `home` is "Bosh sahifa" — the web header's phrase, which
 * the dock was borrowing: eleven characters at 10px in a fifth of a phone,
 * against the four the design draws. Russian and English already match, so this
 * map holds the one key that differs rather than a second copy of five labels.
 *
 * Visible only. `accessibilityLabel` keeps the full name, because "Bosh" spoken
 * alone is an adjective, not a destination.
 */
const DOCK_WORD: Partial<Record<(typeof TABS)[number]['key'], Record<Lang, string>>> = {
  home: { uz: 'Bosh', ru: 'Главная', en: 'Home' },
};

export function MpDock() {
  /*
   * The marketplace's palette, not the restaurant's. `--brand` is #2E74EA in
   * light and lightens to #3B82F6 in dark (Ilova:32, 43); the restaurant's
   * `brand500` is #2E74EA in *both*, and the lit tab was reading `brand600`
   * (#1C5AD1) besides — a tab a shade darker than its own neighbours, and on a
   * dark ground a lit tab that was dimmer than the design's.
   */
  const c = useMpTheme();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { count } = useBasket();

  /*
   * A store is not a tab, and the design lights `home` while one is open — a
   * dock with nothing lit reads as "you are nowhere", which is the one thing a
   * guest three taps into a menu is not.
   */
  const here = pathname.startsWith('/mp/store') ? '/mp' : pathname;

  return (
    <View
      style={[
        s.dock,
        {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          // The home indicator owns the bottom 34px of a modern iPhone, and only
          // the inset knows how tall it is on this device. A dock that guesses
          // puts its five labels underneath it.
          height: DOCK_HEIGHT + insets.bottom,
          // `padding-bottom:2px` on the 62px bar (Ilova:437), on top of the
          // inset — the design lifts the row of words off the bottom edge, and
          // the box is border-box in both places, so the bar does not grow.
          paddingBottom: insets.bottom + 2,
        },
      ]}
    >
      {TABS.map((tab) => {
        const on = tab.href === '/mp' ? here === '/mp' : here.startsWith(tab.href);
        const name = t(tab.key, lang);
        const label = DOCK_WORD[tab.key]?.[lang] ?? name;

        return (
          <Pressable
            key={tab.key}
            onPress={() => router.navigate(tab.href)}
            accessibilityRole="tab"
            accessibilityLabel={name}
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [s.tab, pressed && PRESSED]}
          >
            <Glyph name={tab.glyph} colour={on ? c.brand : c.fgSubtle} />
            <Text style={[s.label, { color: on ? c.brand : c.fgSubtle }]}>{label}</Text>

            {tab.key === 'cart' && count > 0 ? (
              <View style={[s.badge, { backgroundColor: c.bad, borderRadius: size.radiusPill }]}>
                {/* `color:#fff` (Ilova:443), written flat because it is flat in
                    the design: the pill is #F04438 in both themes, so the digit
                    on it is white in both. `c.n0` is the marketplace's *page*
                    white and turns to #0B0E16 on dark — a near-black number on
                    a red pill. */}
                <Text style={[s.count, text.num, { color: '#fff' }]}>{count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  // `border-top:1px solid var(--border)` (Ilova:437). It was a hairline, which
  // is a third of a point at 3× — the design draws a rule, not a suggestion.
  dock: { flexDirection: 'row', borderTopWidth: 1 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  // `font-size:10px;font-weight:600;letter-spacing:.01em;text-align:center`
  // (Ilova:441). `text.tab` is exactly that step. This used to spread
  // `text.caps` and then undo it by hand — 10px at 600 is what both have in
  // common, but `caps` also shouts and tracks at .08em.
  label: { ...text.tab, letterSpacing: 0.1, textAlign: 'center' },
  badge: {
    position: 'absolute',
    // `top:4px;right:22px` (Ilova:443). `right` was `'24%'` — a share of the
    // tab, so the badge slid toward the middle of the tab as the screen grew
    // and stopped sitting on the bag's corner anywhere but one phone width.
    top: 4,
    right: 22,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `font-size:9px;font-weight:700` (Ilova:443), no tracking and no uppercase.
  // The digit was `text.caps`: 10px at 600 with .08em, which puts a two-figure
  // count wider than the 16px pill it sits in.
  count: { ...sans(700), fontSize: 9, lineHeight: 11 },
});
