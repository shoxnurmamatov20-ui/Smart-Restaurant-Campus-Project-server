import { copy, PENDING } from '@restaurant/surfaces/crew/copy';
import type { Lang } from '@restaurant/surfaces/crew/data';

/** Which of the specific reasons this screen is waiting on. */
export type PendingReason =
  'scanner' | 'counting' | 'stock' | 'deliveries' | 'route' | 'cash' | 'generic';

/**
 * A screen that is named, reached, and honest about not existing.
 *
 * The alternative was leaving these tabs off the dock, and that is worse: a
 * storekeeper whose app has three tabs where the design promises four assumes
 * the app is broken, and a manager who cannot find "Close the shift" goes
 * hunting for it in the console instead.
 *
 * Every reason is a *specific* one — a camera, a variance the server has to
 * compute, a till-ledger write. `CLAUDE.md` rule 10 applied to an absence: say
 * what is missing and what it is waiting on, never "coming soon". Somebody who
 * learns the receiving screen needs barcode scanning stops checking for it
 * every morning.
 */
export function NotBuilt({ lang, reason = 'generic' }: { lang: Lang; reason?: PendingReason }) {
  const t = copy(PENDING, lang);

  return (
    <section className="border-border bg-bg-subtle rounded-[14px] border border-dashed px-4 py-8 text-center">
      <p className="text-fg text-sm font-semibold">{t.title}</p>
      <p className="text-fg-subtle mx-auto mt-2 max-w-[30ch] text-xs leading-normal">{t[reason]}</p>
    </section>
  );
}
