'use client';

import * as React from 'react';

import { cn } from '@restaurant/utils';

/**
 * The segmented control the design uses for a period, a station, a surface.
 *
 * Uncontrolled by default, and that is deliberate: almost every caller is a
 * server component, and a server component cannot hand a client one an
 * `onChange` — functions do not serialise. Passing `defaultValue` alone works
 * from a server page and still gives the reader a control that responds.
 *
 * `onSelect` is there for the client callers that do need to hear about it,
 * and `value` promotes the whole thing to controlled for the few screens whose
 * segment is owned by something above them.
 *
 * Painted by app-shell.css off `data-seg` / `data-active`, which is also what
 * gives it the design's press: a hair of scale and nothing else.
 */
export type Segment<T extends string = string> = {
  value: T;
  label: React.ReactNode;
  /** Announced to a screen reader when the visible label is an abbreviation. */
  title?: string;
};

export function Segmented<T extends string = string>({
  segments,
  defaultValue,
  value,
  onSelect,
  size = 'md',
  className,
  'aria-label': ariaLabel,
  ...props
}: Omit<React.ComponentProps<'div'>, 'onSelect' | 'defaultValue'> & {
  segments: readonly Segment<T>[];
  defaultValue?: T;
  value?: T;
  onSelect?: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  const [internal, setInternal] = React.useState<T | undefined>(defaultValue ?? segments[0]?.value);
  const active = value ?? internal;

  function choose(next: T) {
    if (value === undefined) setInternal(next);
    onSelect?.(next);
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-slot="segmented"
      className={cn(
        'bg-bg-muted flex flex-none items-center gap-0.5 rounded-md',
        size === 'sm' ? 'p-0.5' : 'p-[3px]',
        className,
      )}
      {...props}
    >
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          role="tab"
          data-seg
          data-active={segment.value === active ? 'true' : undefined}
          aria-selected={segment.value === active}
          title={segment.title}
          onClick={() => choose(segment.value)}
          className={cn(
            'text-fg-muted font-medium whitespace-nowrap',
            size === 'sm'
              ? 'text-2xs h-6 rounded-[5px] px-2.5 font-semibold'
              : 'h-[30px] rounded-[7px] px-3.5 text-sm',
          )}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
