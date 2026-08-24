import { readAppManifest } from './download/download-server';
import { HomeBoard } from './home-board';

/**
 * `/` — the server half of the home page.
 *
 * The page itself is a client component (`home-board.tsx`): the design's
 * home screen has a period toggle and animated figures that need state. What
 * it cannot do is read a file, and the store badges in its devices section
 * need to know whether an APK is published. So this thin server page reads
 * the manifest — the same `readAppManifest()` the `/download` page uses —
 * and hands the one string down. Metadata stays on the layout, where it was.
 */
export default function MarketingPage() {
  return <HomeBoard apkHref={readAppManifest()?.url ?? null} />;
}
