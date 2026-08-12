import * as React from 'react';

import { cn } from '@restaurant/utils';

/**
 * Nothing here, said usefully.
 *
 * The design's rule, and it is a short one: one line of plain text stating what
 * would be here, and a single action when there is one. **Empty states must not
 * occupy a full panel height** — a 300px box containing the word "empty" reads
 * as a failure, and the reader starts wondering what broke.
 *
 * The error variant says what failed and what to do. "Couldn't load results.
 * Try again." — never "Oops!". A reader who has just lost their work is not the
 * audience for a joke.
 */
export function EmptyState({
  children,
  action,
  className,
  ...props
}: React.ComponentProps<'div'> & { action?: React.ReactNode }) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'text-fg-subtle flex flex-col items-center gap-3 px-4 py-8 text-center text-sm',
        className,
      )}
      {...props}
    >
      <p className="max-w-[42ch] leading-normal">{children}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  children,
  action,
  className,
  ...props
}: React.ComponentProps<'div'> & { action?: React.ReactNode }) {
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        'text-danger-700 bg-danger-50 flex flex-col items-center gap-3 rounded-md px-4 py-6 text-center text-sm',
        className,
      )}
      {...props}
    >
      <p className="max-w-[42ch] leading-normal">{children}</p>
      {action}
    </div>
  );
}

/**
 * A block standing in for content that has not arrived.
 *
 * Matched to the final layout rather than a generic grey bar: the design asks
 * for skeletons that hold the shape of what is coming, so the page does not
 * jump when it does. Spinners are for actions under a second, not for loads.
 */
export function SkeletonBlock({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton-block"
      aria-hidden
      className={cn('bg-bg-muted animate-pulse rounded-md', className)}
      {...props}
    />
  );
}
