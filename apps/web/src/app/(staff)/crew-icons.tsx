import type { CrewIcon } from '@restaurant/surfaces/crew/data';

/**
 * The dock's glyphs, inline.
 *
 * Ten small paths taken from the design file rather than an icon package: this
 * screen is opened on a phone over a restaurant's wifi, and pulling a tree of
 * components to draw ten shapes is bandwidth spent on the one surface least
 * able to afford it. They are also the design's own strokes — 1.85 at 24, which
 * is what makes them read at 20px on a dock button.
 *
 * Always `aria-hidden`. Every one of these sits inside a control that already
 * carries its own accessible name, and a second name would have a screen reader
 * announce the tab twice.
 */
export function CrewGlyph({ name, size = 20 }: { name: CrewIcon; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.85,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
        </svg>
      );
    case 'box':
      return (
        <svg {...common}>
          <path d="M21 8 12 3 3 8l9 5 9-5z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...common}>
          <path d="M12 3 3 7.5 12 12l9-4.5L12 3z" />
          <path d="m3 16.5 9 4.5 9-4.5" />
          <path d="m3 12 9 4.5L21 12" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case 'list':
      return (
        <svg {...common}>
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3.5 6h.01" />
          <path d="M3.5 12h.01" />
          <path d="M3.5 18h.01" />
        </svg>
      );
    case 'hand':
      return (
        <svg {...common}>
          <path d="M18 11V6.5a1.5 1.5 0 0 0-3 0V11" />
          <path d="M15 10.5V4.5a1.5 1.5 0 0 0-3 0V11" />
          <path d="M12 10.5V5.5a1.5 1.5 0 0 0-3 0V12" />
          <path d="M9 12V8.5a1.5 1.5 0 0 0-3 0V15a6 6 0 0 0 6 6h1a6 6 0 0 0 6-6v-4" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
          <path d="M10.3 20a2 2 0 0 0 3.4 0" />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z" />
          <path d="M8 3v18" />
        </svg>
      );
    case 'cash':
      return (
        <svg {...common}>
          <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
          <circle cx="12" cy="12" r="2.6" />
          <path d="M6 10v4" />
          <path d="M18 10v4" />
        </svg>
      );
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.3" />
          <circle cx="12" cy="12" r="1.3" />
          <circle cx="19" cy="12" r="1.3" />
        </svg>
      );
  }
}
