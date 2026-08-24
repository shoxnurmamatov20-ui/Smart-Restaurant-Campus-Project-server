/**
 * The last-resort loading state, for routes with no closer one.
 *
 * The console has its own — `(dashboard)/loading.tsx` — which keeps the shell
 * on screen and draws a skeleton in the page's shape. This one covers the
 * public surfaces, where there is no shell to keep and a centred mark is the
 * honest answer.
 *
 * Written against the design's tokens. It used to use `border-primary` and
 * `text-muted-foreground`, which are shadcn's defaults and not this product's
 * palette — on a dark theme the spinner was invisible.
 */
export default function Loading() {
  return (
    <div className="bg-bg-subtle flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-3" role="status">
        <span
          aria-hidden
          className="border-brand-500 size-10 animate-spin rounded-full border-[3px] border-t-transparent"
        />
        <span className="sr-only">…</span>
      </div>
    </div>
  );
}
