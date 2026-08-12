import { getTranslations } from 'next-intl/server';
import type { Messages } from '@/i18n';

/**
 * A module that has its nav row and its route but not yet its screen.
 *
 * Every Phase 1 module gets one of these the day its route appears, so the
 * sidebar never links to a 404 and the shell can be reviewed end to end before
 * a single module is built. As each module lands, its page replaces the call
 * below and this component gets one caller fewer.
 *
 * It carries the design's page head — the same eyebrow, 30px Inter Tight
 * heading and lede the overview uses — so a half-built console still reads as
 * one product rather than as a finished screen next to a scaffold.
 */
export async function ModulePage({
  module,
  children,
}: {
  module: keyof Messages['console']['nav'];
  children?: React.ReactNode;
}) {
  const [nav, t] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.placeholder'),
  ]);

  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-3xl leading-[1.1] font-semibold tracking-tight">
          {nav(module)}
        </h2>
      </div>

      {children}

      <div className="text-fg-subtle rounded-lg border border-dashed p-12 text-center text-sm">
        {t('soon')}
      </div>
    </>
  );
}

/** The title a module route reports to the browser tab. */
export async function moduleMetadata(module: keyof Messages['console']['nav']) {
  const nav = await getTranslations('console.nav');
  return { title: nav(module) };
}
