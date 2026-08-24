import { getTranslations } from 'next-intl/server';

import { renderWasDegraded } from '@/lib/api-server';

/**
 * "These figures are a sample" — said once, when it is true.
 *
 * Renders nothing on a healthy render and nothing on the demo console, where
 * `session.live === false` already says the whole thing is a sample. It appears
 * exactly in the case the audit found: a **real** session where a read failed
 * and the screen quietly drew its fixtures.
 *
 * It is deliberately not an error page. The fallback is the right behaviour and
 * the console stays usable; what changes is that the reader knows which of the
 * numbers in front of them to act on.
 *
 * A server component, and it must render *after* the page. Next renders
 * children before their parent's siblings resolve, so by the time this reads
 * the flag every `apiGet` on the page has already run.
 */
export async function DegradedNote() {
  if (!renderWasDegraded()) return null;

  const t = await getTranslations('console.shell');

  return (
    <p
      role="status"
      className="border-warning-500/30 bg-warning-50 text-warning-700 mb-5 rounded-md border px-3.5 py-2.5 text-sm leading-normal"
    >
      {t('degraded')}
    </p>
  );
}
