import { cn } from '@restaurant/utils';

/**
 * A loading block, shaped like what is coming.
 *
 * This was shadcn's default — `bg-accent animate-pulse`, a flat block fading in
 * and out. The design does something different and the difference is the point:
 * a band travels across a muted fill (`shimmer`, 1.15s linear), which reads as
 * *arriving* rather than as *broken*. A pulsing rectangle is the same signal a
 * disabled control gives.
 *
 * `data-sk` carries it — the gradient, its size and the animation all live in
 * `packages/ui/src/styles/motion.css`, alongside the reduced-motion fallback
 * that drops to a flat `--bg-muted`.
 *
 * `FOUNDATIONS §5` asks skeletons to match the final layout, so callers should
 * size these to the rows and cards they replace rather than dropping in a grey
 * square: a skeleton that is the wrong shape makes the page jump when the data
 * lands, which is worse than showing nothing.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      data-sk
      aria-hidden
      className={cn('rounded-md', className)}
      {...props}
    />
  );
}

export { Skeleton };
