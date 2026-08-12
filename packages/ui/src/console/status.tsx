import * as React from 'react';

import { cn } from '@restaurant/utils';

/**
 * Status, carried by more than colour.
 *
 * The design's accessibility rule and its state tables both say the same thing:
 * **never colour alone.** Every chip prints its label, and the ones that mark a
 * state on a card also change fill, border style or icon. A red dot beside a
 * word is legible to a reader who cannot tell it from the green one; a red dot
 * on its own is not.
 */

export type ChipTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger';

/**
 * Tint and ink per tone.
 *
 * The 50/700 pairing is what the design uses for every status chip, and it is
 * the pairing that survives dark: both steps are remapped there, so the chip
 * stays a soft tint under readable ink in either theme rather than becoming a
 * saturated block.
 */
const CHIP: Record<ChipTone, string> = {
  neutral: 'bg-bg-muted text-fg-muted',
  brand: 'bg-brand-50 text-brand-700',
  accent: 'bg-accent-50 text-accent-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
};

const DOT: Record<ChipTone, string> = {
  neutral: 'bg-n-400',
  brand: 'bg-brand-500',
  accent: 'bg-accent-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
};

export function StatusChip({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & { tone?: ChipTone; dot?: boolean }) {
  return (
    <span
      data-slot="status-chip"
      data-tone={tone}
      className={cn(
        'rounded-pill text-2xs inline-flex w-fit items-center gap-[6px] px-2 py-[3px] font-semibold whitespace-nowrap',
        CHIP[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span aria-hidden className={cn('size-1.5 flex-none rounded-full', DOT[tone])} />
      ) : null}
      {children}
    </span>
  );
}

/**
 * A bare status dot, for rows that already print the label beside it.
 *
 * Takes an accessible name rather than assuming the label is adjacent: a dot in
 * a table cell whose header is three rows up is not self-describing.
 */
export function StatusDot({
  tone = 'neutral',
  label,
  className,
  ...props
}: Omit<React.ComponentProps<'span'>, 'children'> & { tone?: ChipTone; label: string }) {
  return (
    <span
      data-slot="status-dot"
      role="img"
      aria-label={label}
      className={cn('size-2 flex-none rounded-full', DOT[tone], className)}
      {...props}
    />
  );
}
