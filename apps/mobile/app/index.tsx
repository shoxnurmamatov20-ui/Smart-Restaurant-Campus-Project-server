import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme-context';
import { SURFACES } from '@/surfaces';
import { size } from '@/theme';
import { sans, text } from '@/type';
import { PRESSED } from '@/ui/primitives';

/**
 * Which product this phone opens.
 *
 * Four tiles, no chrome. A person who came for the marketplace should be in it
 * two taps after the icon, so there is nothing here to read first — the card's
 * name and one line, and the tile is the whole target.
 */
export default function Entry() {
  const c = useTheme();
  const { lang, setLang } = useLocale();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[
        s.page,
        { paddingTop: insets.top + size.sp8, paddingBottom: insets.bottom + size.sp8 },
      ]}
    >
      <View style={s.head}>
        <Text style={[text.display, { color: c.fg }]}>Smart Restaurant</Text>

        <View style={[s.langs, { backgroundColor: c.bgMuted, borderRadius: size.radiusSm }]}>
          {(['uz', 'ru', 'en'] as const).map((code) => {
            const on = code === lang;

            return (
              <Pressable
                key={code}
                onPress={() => setLang(code)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[
                  s.lang,
                  { borderRadius: size.radiusSm - 2 },
                  on && { backgroundColor: c.surface },
                ]}
              >
                <Text style={[text.caption, { color: on ? c.fg : c.fgMuted }]}>
                  {code.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={s.grid}>
        {SURFACES.map((surface) => (
          <Link key={surface.id} href={surface.href} asChild>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                s.tile,
                {
                  backgroundColor: c.surface,
                  borderColor: c.border,
                  borderRadius: size.radiusLg,
                },
                pressed && s.pressed,
              ]}
            >
              <View style={[s.mark, { backgroundColor: c.brand50, borderRadius: size.radiusMd }]}>
                <Text style={[text.caption, { color: c.brand700, ...sans(700) }]}>
                  {surface.mark}
                </Text>
              </View>
              <Text style={[text.body, { color: c.fg, ...sans(600), marginTop: size.sp3 }]}>
                {surface.name[lang]}
              </Text>
              <Text style={[text.caption, { color: c.fgMuted, marginTop: 2 }]}>
                {surface.description[lang]}
              </Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: size.sp5 },
  head: { gap: size.sp5, marginBottom: size.sp6 },
  langs: { flexDirection: 'row', padding: 3, alignSelf: 'flex-start', gap: 2 },
  lang: { height: 30, paddingHorizontal: 12, justifyContent: 'center' },
  grid: { gap: size.sp3 },
  tile: { padding: size.sp4, borderWidth: 1, minHeight: 44 },
  mark: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  /* `[data-press]:active{transform:scale(.97)}` — the design's own
     press. It faded here, which reads as "disabled for a moment". */
  pressed: PRESSED,
});
