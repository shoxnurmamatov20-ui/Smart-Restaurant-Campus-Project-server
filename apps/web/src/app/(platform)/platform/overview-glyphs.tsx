import type { ReactNode } from 'react';

import type { Tone } from '@restaurant/ui';

/**
 * The four glyphs on the platform operator's opening screen.
 *
 * `Smart Restaurant OS.dc.html:6904-6925` — the design gives this row the same
 * treatment as the restaurant dashboards: a 15px stroked icon at 1.85 inside a
 * 30px tinted badge, one per figure. The console's own dashboards got theirs;
 * this screen was missed, so four cards that the design distinguishes by picture
 * read here as four identical label-and-number blocks.
 *
 * The tint is part of the pair rather than a per-screen choice — the same reason
 * `(dashboard)/dashboard/kpi-icons.tsx` gives: a figure that changes colour
 * between two screens is a figure a reader stops trusting. Failing branches wear
 * danger here and nowhere else, because on this screen they are the one thing an
 * operator is looking for.
 *
 * Paths transcribed from the file. A building for tenants, stacked layers for
 * branches, a rising line for revenue, a warning triangle for what is broken.
 */

const BOX = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.85,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const OVERVIEW_GLYPH: Readonly<Record<string, { icon: ReactNode; iconTone: Tone }>> = {
  tenants: {
    iconTone: 'brand',
    icon: (
      <svg {...BOX} aria-hidden>
        <path d="M4 21V6.5L11 4v17" />
        <path d="M11 10h6.5A1.5 1.5 0 0 1 19 11.5V21M4 21h17" />
      </svg>
    ),
  },
  branches: {
    iconTone: 'accent',
    icon: (
      <svg {...BOX} aria-hidden>
        <path d="M12 3 3 7.5 12 12l9-4.5z" />
        <path d="M3 16.5 12 21l9-4.5M3 12l9 4.5L21 12" />
      </svg>
    ),
  },
  mrr: {
    iconTone: 'success',
    icon: (
      <svg {...BOX} aria-hidden>
        <path d="M3 16.5 9 10l4 4 8-8" />
        <path d="M17 6h4v4" />
      </svg>
    ),
  },
  failing: {
    iconTone: 'danger',
    icon: (
      <svg {...BOX} aria-hidden>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9.5v4M12 17.5h.01" />
      </svg>
    ),
  },
};
