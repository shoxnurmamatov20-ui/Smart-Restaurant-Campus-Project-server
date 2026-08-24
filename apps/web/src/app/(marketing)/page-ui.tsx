import type { SiteTone } from './pages-data';

/**
 * The section furniture the design repeats on all seven pages.
 *
 * These were four string constants at the bottom of `page.tsx` when there was
 * only one page. Six more pages now use the same eyebrow, the same 44px h2 and
 * the same 18px lede, and a copied class string is how the third page ends up
 * 2px off the other two.
 */
export const EYEBROW = 'text-brand-600 text-xs font-semibold tracking-caps uppercase';
/*
 * 42px, not 44, and 640px, not 620.
 *
 * Both were read off the v1 design file. `Sayt v2.dc.html:49-51` says
 * `[data-h2]{font-size:42px}` and `[data-lede]{max-width:640px}`, and the
 * handoff README settles the tie: where a document and the design file
 * disagree, the file wins.
 */
export const H2 = 'font-display mt-3.5 text-[42px] leading-[1.12] font-bold tracking-[-.022em]';
export const LEDE = 'text-fg-muted mt-4 max-w-[640px] text-[18px] leading-[1.6] text-pretty';

/** The design's running text: 14px on 1.6, between our two body tokens. */
export const BODY = 'text-[14px] leading-[1.6]';
export const CARD = 'bg-surface rounded-lg border';

/** A page heading — 42–46px, larger than a section's. */
export function PageHead({
  eyebrow,
  title,
  lede,
  size = 46,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  size?: number;
}) {
  return (
    <>
      <div className={EYEBROW}>{eyebrow}</div>
      <h1
        data-h1
        className="font-display mt-5 max-w-[800px] leading-[1.06] font-bold tracking-[-.028em]"
        style={{ fontSize: `${size}px` }}
      >
        {title}
      </h1>
      <p data-lede className={`${LEDE} text-[19px]`}>
        {lede}
      </p>
    </>
  );
}

/** The tick the design puts beside every capability it claims. */
export function Check({ size = 11 }: { size?: number }) {
  return (
    <span className="bg-success-50 mt-0.5 grid size-5 flex-none place-items-center rounded-full">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--success-600)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

/** And the cross, which the roles page needs as often as the tick. */
export function Cross() {
  return (
    <span className="bg-danger-50 mt-0.5 grid size-5 flex-none place-items-center rounded-full">
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--danger-600)"
        strokeWidth="3.4"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </span>
  );
}

/**
 * Tone to classes, in one place.
 *
 * The design writes `var(--brand-50)` / `var(--brand-700)` inline on every
 * chip. Those are the palette's own variables, so the mapping is mechanical —
 * but it has to be mechanical in *one* place, or the eighth chip gets a
 * hand-picked pair that is almost the ramp.
 */
export const TONE_CHIP: Readonly<Record<SiteTone, string>> = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-700',
  neutral: 'bg-bg-muted text-fg-muted',
};

export const TONE_TEXT: Readonly<Record<SiteTone, string>> = {
  brand: 'text-brand-600',
  success: 'text-success-600',
  warning: 'text-warning-600',
  danger: 'text-danger-600',
  neutral: 'text-fg-muted',
};
