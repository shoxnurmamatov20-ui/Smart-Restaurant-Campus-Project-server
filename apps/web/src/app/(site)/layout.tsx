import type { ReactNode } from 'react';

import './site.css';

/**
 * A restaurant's own website.
 *
 * `data-site` rather than a class, matching every other surface here: the
 * attribute carries the measurements (`--site-measure`, `--site-gutter`) and a
 * screen inherits them by being inside it, so no section can invent its own
 * edge.
 *
 * **The accent is not here, and that is the fix.** It used to be `data-acc="a1"`
 * written into this element — Osh Xona's terracotta on every restaurant on the
 * platform, because a route-group layout sits above `r/[restaurant]` and
 * therefore never learns which restaurant it is wrapping. `params` only carries
 * the segments below the layout that declares it, so there was nothing here to
 * read a venue's choice with.
 *
 * So the attribute moved one level down, to `r/[restaurant]/layout.tsx`, which
 * has the slug and reads `settings.site.accent` off `GET /api/v1/public/site`.
 * Custom properties cascade, so a `[data-acc]` on the inner element seeds every
 * token underneath it exactly as one here did — and now it seeds the *venue's*
 * colour rather than one venue's colour for everybody.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div data-site className="min-h-dvh">
      {children}
    </div>
  );
}
