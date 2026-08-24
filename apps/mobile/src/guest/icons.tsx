import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The design's own glyphs, path for path.
 *
 * `FOUNDATIONS §8` bans emoji, and a bell drawn as 🔔 is a different picture on
 * every phone. These are the exact `d` attributes in
 * `Smart Restaurant Mehmon.dc.html`, at the stroke widths it draws them —
 * 1.75 for a control, 2 for a chevron, 2.2 for a warning, 2.6 for the paid
 * check.
 *
 * `colour` is always passed in from `useTheme()`; nothing here names one.
 */
type IconProps = { size?: number; colour: string };

const STROKE = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function ChevronLeft({ size = 18, colour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={colour} strokeWidth={2} {...STROKE} />
    </Svg>
  );
}

export function ChevronRight({ size = 17, colour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m9 18 6-6-6-6" stroke={colour} strokeWidth={2} {...STROKE} />
    </Svg>
  );
}

/** The menu door — `Mehmon.dc.html:105`. */
export function MenuGrid({ size = 20, colour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 3h18v18H3z" stroke={colour} strokeWidth={1.75} {...STROKE} />
      <Path d="M3 9h18M9 21V9" stroke={colour} strokeWidth={1.75} {...STROKE} />
    </Svg>
  );
}

/** The waiter bell — `Mehmon.dc.html:113`. */
export function Bell({ size = 20, colour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
        stroke={colour}
        strokeWidth={1.75}
        {...STROKE}
      />
      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" stroke={colour} strokeWidth={1.75} {...STROKE} />
    </Svg>
  );
}

/** The bill — `Mehmon.dc.html:121`. */
export function Banknote({ size = 20, colour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 9V5h20v4" stroke={colour} strokeWidth={1.75} {...STROKE} />
      <Path d="M2 13h20v6H2z" stroke={colour} strokeWidth={1.75} {...STROKE} />
      <Path d="M6 9v4M18 9v4" stroke={colour} strokeWidth={1.75} {...STROKE} />
    </Svg>
  );
}

/** The allergen warning — `Mehmon.dc.html:199`. */
export function Alert({ size = 13, colour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 8v5M12 17h0" stroke={colour} strokeWidth={2.2} {...STROKE} />
      <Circle cx={12} cy={12} r={9} stroke={colour} strokeWidth={2.2} />
    </Svg>
  );
}

export function Check({ size = 12, colour, weight = 3.4 }: IconProps & { weight?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6 9 17l-5-5" stroke={colour} strokeWidth={weight} {...STROKE} />
    </Svg>
  );
}

/** The rating star — filled or empty, never the `★` character. */
export function Star({ size = 30, colour, fill }: IconProps & { fill: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="m12 2.6 2.9 6 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.5l6.5-.9z"
        fill={fill}
        stroke={colour}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The empty photograph slot — `Mehmon.dc.html:206`. */
export function Picture({ size = 22, colour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={3}
        width={18}
        height={18}
        rx={2}
        stroke={colour}
        strokeWidth={1.5}
        {...STROKE}
      />
      <Circle cx={9} cy={9} r={1.6} stroke={colour} strokeWidth={1.5} />
      <Path d="m21 15-5-5L5 21" stroke={colour} strokeWidth={1.5} {...STROKE} />
    </Svg>
  );
}

/** The receipt — `Mehmon.dc.html:507`. */
export function Receipt({ size = 19, colour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={colour}
        strokeWidth={1.75}
        {...STROKE}
      />
      <Path d="M14 2v6h6" stroke={colour} strokeWidth={1.75} {...STROKE} />
    </Svg>
  );
}

export function Search({ size = 17, colour }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={colour} strokeWidth={1.75} />
      <Path d="m20 20-3.5-3.5" stroke={colour} strokeWidth={1.75} {...STROKE} />
    </Svg>
  );
}
