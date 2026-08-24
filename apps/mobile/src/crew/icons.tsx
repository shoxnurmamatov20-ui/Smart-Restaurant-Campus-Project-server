import { Circle, Path, Rect, Svg } from 'react-native-svg';

import type { CrewIcon } from '@restaurant/surfaces/crew/data';

/**
 * The dock's glyphs, traced from the design file.
 *
 * `Smart Restaurant Xodimlar ilovasi.dc.html` draws eleven inline SVGs in its
 * dock and its lock screen, at 20×20 on a 24-unit grid with a 1.85 stroke. They
 * are copied here path for path rather than replaced with an icon package, for
 * two reasons: `FOUNDATIONS §8` bans emoji and a font-icon set would be a
 * thirteenth dependency, and — the one that actually matters — a *different*
 * box glyph in the dock is how a storekeeper learns to distrust the dock.
 *
 * Everything is `stroke="currentColor"` by way of an explicit `color` prop,
 * because React Native has no `currentColor` and no cascade to carry one.
 */

type Props = { color: string; size?: number };

const GRID = '0 0 24 24';

/** The shared frame: one stroke width, one join, one cap — the design's. */
function Frame({ color, size = 20, children }: Props & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={GRID}
      fill="none"
      stroke={color}
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function HomeIcon(props: Props) {
  return (
    <Frame {...props}>
      <Path d="M3 10.5 12 3l9 7.5" />
      <Path d="M5.5 9.5V20h13V9.5" />
    </Frame>
  );
}

export function BoxIcon(props: Props) {
  return (
    <Frame {...props}>
      <Path d="M21 8 12 3 3 8l9 5 9-5z" />
      <Path d="M3 8v8l9 5 9-5V8" />
      <Path d="M12 13v8" />
    </Frame>
  );
}

export function GridIcon(props: Props) {
  return (
    <Frame {...props}>
      <Rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <Rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <Rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <Rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </Frame>
  );
}

export function LayersIcon(props: Props) {
  return (
    <Frame {...props}>
      <Path d="M12 3 3 7.5 12 12l9-4.5L12 3z" />
      <Path d="m3 16.5 9 4.5 9-4.5" />
      <Path d="m3 12 9 4.5L21 12" />
    </Frame>
  );
}

export function CheckIcon(props: Props) {
  return (
    <Frame {...props}>
      <Path d="M20 6 9 17l-5-5" />
    </Frame>
  );
}

export function ListIcon(props: Props) {
  return (
    <Frame {...props}>
      <Path d="M8 6h13" />
      <Path d="M8 12h13" />
      <Path d="M8 18h13" />
      <Path d="M3.5 6h.01" />
      <Path d="M3.5 12h.01" />
      <Path d="M3.5 18h.01" />
    </Frame>
  );
}

export function HandIcon(props: Props) {
  return (
    <Frame {...props}>
      <Path d="M18 11V6.5a1.5 1.5 0 0 0-3 0V11" />
      <Path d="M15 10.5V4.5a1.5 1.5 0 0 0-3 0V11" />
      <Path d="M12 10.5V5.5a1.5 1.5 0 0 0-3 0V12" />
      <Path d="M9 12V8.5a1.5 1.5 0 0 0-3 0V15a6 6 0 0 0 6 6h1a6 6 0 0 0 6-6v-4" />
    </Frame>
  );
}

export function BellIcon(props: Props) {
  return (
    <Frame {...props}>
      <Path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <Path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </Frame>
  );
}

export function BookIcon(props: Props) {
  return (
    <Frame {...props}>
      <Path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z" />
      <Path d="M8 3v18" />
    </Frame>
  );
}

export function CashIcon(props: Props) {
  return (
    <Frame {...props}>
      <Rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <Circle cx="12" cy="12" r="2.6" />
      <Path d="M6 10v4" />
      <Path d="M18 10v4" />
    </Frame>
  );
}

export function MoreIcon(props: Props) {
  return (
    <Frame {...props}>
      <Circle cx="5" cy="12" r="1.3" />
      <Circle cx="12" cy="12" r="1.3" />
      <Circle cx="19" cy="12" r="1.3" />
    </Frame>
  );
}

/** Back. Not in the dock's eleven, but every sub-screen in the design has one. */
export function BackIcon(props: Props) {
  return (
    <Frame {...props}>
      <Path d="M15 19 8 12l7-7" />
    </Frame>
  );
}

export function ChevronIcon(props: Props) {
  return (
    <Frame {...props}>
      <Path d="m9 5 7 7-7 7" />
    </Frame>
  );
}

/**
 * One glyph by the name `CrewTab` uses.
 *
 * The union lives in `@restaurant/surfaces` so the tab table stays free of JSX;
 * this is the single place that turns one of its eleven words into a drawing,
 * which is what keeps a dock slot from ever rendering nothing.
 */
export function TabIcon({ icon, color, size = 20 }: { icon: CrewIcon } & Props) {
  const props = { color, size };

  switch (icon) {
    case 'home':
      return <HomeIcon {...props} />;
    case 'box':
      return <BoxIcon {...props} />;
    case 'grid':
      return <GridIcon {...props} />;
    case 'layers':
      return <LayersIcon {...props} />;
    case 'check':
      return <CheckIcon {...props} />;
    case 'list':
      return <ListIcon {...props} />;
    case 'hand':
      return <HandIcon {...props} />;
    case 'bell':
      return <BellIcon {...props} />;
    case 'book':
      return <BookIcon {...props} />;
    case 'cash':
      return <CashIcon {...props} />;
    case 'more':
      return <MoreIcon {...props} />;
  }
}
