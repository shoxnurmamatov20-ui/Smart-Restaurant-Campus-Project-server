import type { ReactNode } from 'react';

/**
 * The page transition, and why this file exists rather than a layout.
 *
 * `Sayt v2.dc.html:57` puts `animation: fade 260ms` on `[data-page]` — six
 * pixels up and a fade, on every one of the marketing site's eight screens. In
 * the prototype the screens swap with `sc-if`, so the element is genuinely new
 * each time and the animation re-fires on its own.
 *
 * A `layout.tsx` cannot reproduce that: the App Router deliberately *preserves*
 * a layout across navigations, which is what keeps the header and the scroll
 * position — and it means the element never remounts, so a CSS animation on it
 * plays once, on the first page anybody lands on, and never again.
 *
 * `template.tsx` is the App Router's answer: same position in the tree, new
 * instance on every navigation. Nothing else in this file, because nothing else
 * needs to remount.
 *
 * The marketing site only. The console is a workspace — a manager switching
 * from Orders to Tables forty times an hour does not want the screen to move
 * each time, and the design does not ask for it there: `[data-page]` appears in
 * the marketing file and in no other.
 */
export default function MarketingTemplate({ children }: { children: ReactNode }) {
  return <div data-page>{children}</div>;
}
