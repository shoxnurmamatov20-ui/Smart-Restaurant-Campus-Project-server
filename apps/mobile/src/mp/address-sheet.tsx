import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@restaurant/surfaces/mp/copy';

import { Check } from '../ui/icons';
import { useLocale, type Lang } from '../lib/locale';
import { som } from '../lib/money';
import { useTheme } from '../lib/theme-context';
import { size } from '../theme';
import { sans, text } from '../type';
import { reachOf, type AddressReach, type DeliveryZone, type MpAddress } from './live';
import { PRESSED } from '@/ui/primitives';

/**
 * Where it is going — `Sayt.dc.html:724-756`, as a sheet rather than a dropdown.
 *
 * The rows are the guest's own address book — `GET /mp/me` carries it, and the
 * sample book stands in with the same three rows while nobody is signed in. The
 * third of those is outside the delivery zone, and that row is the entire reason
 * this is a sheet: it has to be able to say *no*, say why, and stay visible
 * while it does. A picker that quietly lists only reachable addresses teaches a
 * guest to trust it and then fails at checkout, which is the one moment an order
 * is abandoned.
 *
 * The undeliverable row is disabled rather than hidden. A guest whose parents'
 * address has vanished from their own address book concludes the app lost it.
 *
 * ---------------------------------------------------------------------------
 * The refusal is measured now, and there are three answers rather than two
 *
 * This used to read a boolean off the fixture, and a live address always
 * carried `true` — so the sheet drew a disabled row that no arithmetic had ever
 * produced, and the real refusal arrived at checkout. It is measured here now:
 * `GET /mp/stores/{store}` publishes the storefront's circles, every saved
 * address carries `latitude`/`longitude` as decimal degrees, and
 * `@restaurant/surfaces/mp/geo` turns the two into an answer — the same module
 * the web checkout uses, so the phone cannot say yes to an address the browser
 * then refuses.
 *
 * **Three states, and the third is the one worth having.**
 *
 *   · **inside a circle** — enabled, and the row prints the fee that circle
 *     charges rather than a remembered one. Where two circles overlap the
 *     nearer wins, which is what stops an inner cheap ring being billed at the
 *     outer ring's price.
 *   · **outside every circle** — disabled, in the danger colour, saying so and
 *     naming collection as the way round it.
 *   · **no coordinates on the address** — *enabled*, with a muted caveat. This
 *     is not a refusal and must never be drawn as one: an address saved before
 *     the map existed is one the courier has been to a dozen times, and nobody
 *     knowing where it is is not the same as knowing it is too far. Greying it
 *     out would lose an order that would have been fine.
 *
 * A fourth case is simply silence. Before a guest has opened a shop there is no
 * boundary to measure against, so the sheet says nothing about reach at all and
 * prints the row's own note — the state the home screen's header opens in.
 *
 * TODO(integration): needs MAP_API_KEY — see docs/GO-LIVE.md
 * That key buys the *other* half: geocoding an address the guest types, and a
 * basemap to place a pin on. Until then coordinates arrive only on addresses
 * something else has already located, which is why `unmapped` is a state this
 * sheet draws rather than an edge case it can assume away.
 *
 * `PUT /mp/me/addresses` can rewrite the book, and the app's design draws no
 * editor to rewrite it from — that second gap is a screen rather than an
 * endpoint, and it is not this one.
 */
export function AddressSheet({
  open,
  addresses,
  selected,
  zones = [],
  onPick,
  onClose,
}: {
  open: boolean;
  addresses: readonly MpAddress[];
  selected: string | null;
  /**
   * The chosen storefront's delivery circles.
   *
   * Defaulted to empty rather than required, because two of the three callers
   * genuinely have none: the home header opens before any shop is chosen. Empty
   * means "nobody has asked yet", which the sheet draws as silence — never as a
   * refusal.
   */
  zones?: readonly DeliveryZone[];
  onPick: (address: MpAddress) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/* The scrim dismisses. On a phone the outside of a sheet is the button
          every person tries first, and a sheet that ignores it feels stuck. */}
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

        <Text style={[text.title, { color: c.fg }]}>{t('addrTitle', lang)}</Text>
        <Text style={[text.caption, { color: c.fgSubtle, marginTop: 4 }]}>
          {t('addrSub', lang)}
        </Text>

        <ScrollView style={s.list} contentContainerStyle={s.listInner}>
          {addresses.map((entry) => {
            const on = entry.key === selected;
            const reach = reachOf(zones, entry);

            // Only a measured refusal closes a row. `unmapped` and `unasked`
            // both mean nobody knows, and nobody knowing is not a no.
            const refused = reach.state === 'outside';
            const line = reachLine(reach, entry, lang);

            return (
              <Pressable
                key={entry.key}
                disabled={refused}
                onPress={() => {
                  onPick(entry);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: refused }}
                accessibilityHint={line.words === '' ? undefined : line.words}
                style={({ pressed }) => [
                  s.row,
                  {
                    borderColor: on ? c.brand500 : c.border,
                    backgroundColor: on ? c.brand50 : c.surface,
                    borderRadius: size.radiusMd,
                  },
                  pressed && s.pressed,
                  refused && s.off,
                ]}
              >
                <View
                  style={[
                    s.mark,
                    {
                      borderColor: on ? c.brand500 : c.borderStrong,
                      backgroundColor: on ? c.brand500 : 'transparent',
                    },
                  ]}
                >
                  {on ? <Check size={11} /> : null}
                </View>

                <View style={s.rowMain}>
                  <Text style={[text.body, { color: c.fg, ...sans(600) }]}>{entry.label}</Text>
                  <Text style={[text.caption, { color: c.fgMuted, marginTop: 2 }]}>
                    {entry.address}
                  </Text>
                  {line.words === '' ? null : (
                    <Text
                      style={[
                        text.caption,
                        {
                          color: line.tone === 'bad' ? c.danger600 : c.fgSubtle,
                          marginTop: 4,
                        },
                      ]}
                    >
                      {line.words}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
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

/**
 * The one sentence under an address, and which colour it wears.
 *
 * "Not on the map" is a *native* sentence and lives here rather than in
 * `@restaurant/surfaces/mp/copy`: the catalogue was transcribed from a design
 * that has no such state, because a browser geolocating a typed address never
 * produces one. A key added to the shared catalogue for a case only this build
 * can reach would be a key the web screens have to carry and never print.
 */
const UNMAPPED: Readonly<Record<Lang, string>> = {
  uz: 'Manzil xaritada belgilanmagan — yetkazish hisobi kassada aniqlanadi',
  ru: 'Адрес не отмечен на карте — доставка будет рассчитана при оформлении',
  en: 'This address is not marked on the map — delivery is worked out at checkout',
};

function reachLine(
  reach: AddressReach,
  address: MpAddress,
  lang: Lang,
): { words: string; tone: 'ok' | 'bad' } {
  switch (reach.state) {
    case 'ok':
      /*
       * The distance and the fee of the circle that actually covers it, not the
       * caption the address was saved with. A book entry written when the shop
       * charged 12 000 is the reason a guest argues with the bill.
       */
      return {
        words: `${reach.distanceKm.toFixed(1)} km · ${som(reach.zone.feeTiyin, lang)}`,
        tone: 'ok',
      };
    case 'outside':
      return { words: t('addrOutside', lang), tone: 'bad' };
    case 'unmapped':
      return { words: UNMAPPED[lang], tone: 'ok' };
    default:
      // Nobody has chosen a shop, so the row keeps whatever the book says about
      // itself — which is what this sheet drew before it could measure anything.
      return { words: address.note ?? '', tone: 'ok' };
  }
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
  listInner: { gap: size.sp2, paddingBottom: size.sp2 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: size.sp3,
    padding: size.sp4,
    minHeight: 44,
    borderWidth: 1,
  },
  rowMain: { flex: 1, minWidth: 0 },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
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
  off: { opacity: 0.5 },
});
