import { Path, Svg } from 'react-native-svg';

/**
 * The dock's five glyphs, traced from `MyPOS Marketplace - Ilova.dc.html`.
 *
 * They live here rather than in `ui/icons.tsx` because they are this dock's
 * alphabet: the design gives the marketplace a picture-and-word bar, while the
 * customer app's dock is words alone. `ui/icons.tsx` holds what every surface
 * uses — a chevron, a star, a tick — and importing four marketplace glyphs into
 * it would put them in every other app's bundle to no purpose.
 *
 * The paths are the design's own `ICON()` table (`:544-551`), at the same
 * 24-unit box and the same 1.85 stroke. Colour is a required prop: React Native
 * has no `currentColor`, so an icon inherits nothing and every caller must say
 * what it is.
 */
type GlyphProps = { colour: string; size?: number };

const BOX = 21;

const PATHS = {
  /* A roof and two walls — "home", the design's own house rather than a door. */
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  /* A shopping bag with a handle. The cart, which the dock badges. */
  bag: 'M6 7h13l-1.3 9.2a2 2 0 0 1-2 1.8H9.3a2 2 0 0 1-2-1.8L6 7ZM9 7V5.5a3 3 0 0 1 6 0V7',
  /* Three rules with three bullets — a list of orders. */
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  /* A head and shoulders. */
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20.5a7 7 0 0 1 14 0',
  /*
   * A map pin, for tracking.
   *
   * The design's fifth tab is a magnifier because its dock carries search; the
   * web dock replaced it with tracking (`mp-chrome.tsx`), and a delivery on its
   * way is a place rather than a query. The pin is the header's own mark from
   * that same file, so the two builds show one glyph for one destination.
   */
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0ZM14.6 10a2.6 2.6 0 1 1-5.2 0 2.6 2.6 0 0 1 5.2 0Z',
  /* The handset on the courier card. */
  phone:
    'M5 4h3.5l1.6 4-2.2 1.4a11 11 0 0 0 6.7 6.7L16 13.9l4 1.6V19a1.8 1.8 0 0 1-2 1.8A15.5 15.5 0 0 1 3.2 6 1.8 1.8 0 0 1 5 4Z',
} as const;

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, colour, size: box = BOX }: GlyphProps & { name: GlyphName }) {
  return (
    <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
      <Path
        d={PATHS[name]}
        stroke={colour}
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
