import type { ColorValue } from 'react-native';
import { Circle, Path, Rect, Svg } from 'react-native-svg';

import { useTheme } from '../lib/theme-context';

/**
 * The handful of marks the phone screens draw, as vectors.
 *
 * `FOUNDATIONS §8` bans emoji, and it is not a style rule: an emoji renders as a
 * different picture on every platform and is read aloud by a screen reader as
 * whatever its vendor called it. These are the same paths the web build inlines
 * — a chevron, a star, a map pin, a tick — traced from the design file, at the
 * 24-unit box every icon in this system is drawn on.
 *
 * Colour is a prop with a token default rather than `currentColor`, which React
 * Native has no equivalent of: an SVG here inherits nothing from its parent.
 */
/*
 * `colour` takes React Native's own `ColorValue` rather than `string`: the tab
 * navigator hands its icons a `ColorValue`, which may be an opaque platform
 * colour object as well as a hex string, and narrowing it here would make every
 * dock icon a cast at the call site.
 */
type IconProps = { size?: number; colour?: ColorValue };

export function Chevron({
  size: box = 16,
  colour,
  direction = 'right',
}: IconProps & { direction?: 'right' | 'left' | 'down' }) {
  const c = useTheme();
  const d =
    direction === 'down'
      ? 'm6 9 6 6 6-6'
      : direction === 'left'
        ? 'm15 18-6-6 6-6'
        : 'm9 6 6 6-6 6';

  return (
    <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
      <Path
        d={d}
        stroke={colour ?? c.fgSubtle}
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The rating star. Filled, and in the one token reserved for it. */
export function Star({ size: box = 12, colour }: IconProps) {
  const c = useTheme();

  return (
    <Svg width={box} height={box} viewBox="0 0 24 24">
      <Path
        d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.4l6.6-.9z"
        fill={colour ?? c.ratingStar}
      />
    </Svg>
  );
}

/** Where a branch is. */
export function Pin({ size: box = 15, colour }: IconProps) {
  const c = useTheme();

  return (
    <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"
        stroke={colour ?? c.brand600}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <Path
        d="M14.6 10a2.6 2.6 0 1 1-5.2 0 2.6 2.6 0 0 1 5.2 0z"
        stroke={colour ?? c.brand600}
        strokeWidth={1.9}
      />
    </Svg>
  );
}

export function Search({ size: box = 17, colour }: IconProps) {
  const c = useTheme();

  return (
    <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"
        stroke={colour ?? c.fgSubtle}
        strokeWidth={1.9}
      />
      <Path
        d="m20 20-4.3-4.3"
        stroke={colour ?? c.fgSubtle}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** The tick inside a checked box. Drawn only when the box is on. */
export function Check({ size: box = 13, colour }: IconProps) {
  const c = useTheme();

  return (
    <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
      <Path
        d="m5 12.5 4.5 4.5L19 7"
        stroke={colour ?? c.n0}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/* ============================================================
   The customer dock's four — `Mijoz ilovasi.dc.html:679-694`
   ============================================================ */

/**
 * Each is the design's own 24-unit path at `stroke-width:1.75`, drawn at 21.
 *
 * The dock used to hide its icons entirely — `tabBarIconStyle: {display:'none'}`
 * with a comment claiming the design draws none. It draws four, and a tab bar of
 * bare words is the one piece of chrome a person navigates by shape.
 */
export function DishIcon({ size: box = 21, colour }: IconProps) {
  const c = useTheme();

  return (
    <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 4.5h11a4 4 0 0 1 0 8H4z"
        stroke={colour ?? c.fgSubtle}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M4 12.5v7" stroke={colour ?? c.fgSubtle} strokeWidth={1.75} strokeLinecap="round" />
      <Path
        d="M18.5 4.5v15"
        stroke={colour ?? c.fgSubtle}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function CartIcon({ size: box = 21, colour }: IconProps) {
  const c = useTheme();
  const stroke = colour ?? c.fgSubtle;

  return (
    <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 4h2l2.2 10.5a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.5L20 7H6"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={9.5} cy={20} r={1.3} stroke={stroke} strokeWidth={1.75} />
      <Circle cx={17} cy={20} r={1.3} stroke={stroke} strokeWidth={1.75} />
    </Svg>
  );
}

export function ClockIcon({ size: box = 21, colour }: IconProps) {
  const c = useTheme();
  const stroke = colour ?? c.fgSubtle;

  return (
    <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={stroke} strokeWidth={1.75} />
      <Path d="M12 7.5V12l3 2" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" />
    </Svg>
  );
}

export function PersonIcon({ size: box = 21, colour }: IconProps) {
  const c = useTheme();
  const stroke = colour ?? c.fgSubtle;

  return (
    <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.6} stroke={stroke} strokeWidth={1.75} />
      <Path
        d="M4.5 20a7.5 7.5 0 0 1 15 0"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * The design's picture placeholder — the glyph inside every `image-slot`.
 *
 * `rect 18×15 rx 2.5`, a lens at `8.6,10` and the two-peak horizon, stroked
 * `--fg-disabled` at 1.6. The design draws it wherever a photograph will go, and
 * this platform has no photographs yet: every `logo_url` and `cover_url` comes
 * back null. Drawing the band with this mark in it is what the design itself
 * renders in that state, and it is the honest alternative to both a grey
 * rectangle that reads as a stuck loading state and an invented picture.
 */
export function Photo({ size: box = 19, colour }: IconProps) {
  const c = useTheme();
  const stroke = colour ?? c.fgDisabled;

  return (
    <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4.5} width={18} height={15} rx={2.5} stroke={stroke} strokeWidth={1.6} />
      <Circle cx={8.6} cy={10} r={1.6} stroke={stroke} strokeWidth={1.6} />
      <Path
        d="m3.6 17.4 4.9-4.2 4.2 3.4 3-2.6 4.7 3.9"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
