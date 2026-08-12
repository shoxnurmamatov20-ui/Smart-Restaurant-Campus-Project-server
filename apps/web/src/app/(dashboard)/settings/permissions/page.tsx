import { getTranslations } from 'next-intl/server';

import { ACTION_PRIMARY, PageHead } from '../../screen';
import { GRANT_STYLE, MATRIX, ROLES } from './permissions-data';

/** Its own title rather than Settings' — this is a screen, not a section. */
export async function generateMetadata() {
  const t = await getTranslations('console.permissions');
  return { title: t('title') };
}

/**
 * Who may do what.
 *
 * Built to the design's Permissions screen: twenty actions down, eight roles
 * across, and a legend above saying what the three marks mean.
 *
 * Every cell carries a glyph — a tick, the word PIN, or an em dash — rather
 * than a colour alone. On a screen this dense that is not a nicety: a grid of
 * green and amber squares is unreadable to anyone who cannot separate the two,
 * and this is the grid that decides who can issue a refund.
 *
 * The action column is sticky and the header row with it, because a matrix read
 * by scrolling in both directions is useless the moment either label leaves.
 *
 * TODO — Phase 1 · settings/permissions, once the module is built:
 *   - Editing a grant, and saving it through to Spatie
 *   - Custom roles beyond the eight the design ships
 *   - The audit trail: who changed which grant, and when
 *   - Per-branch overrides, since a manager's scope is one venue
 */
const GRID = '[grid-template-columns:minmax(300px,1.4fr)_repeat(8,minmax(92px,1fr))]';

export default async function PermissionsPage() {
  const t = await getTranslations('console.permissions');

  return (
    <>
      <PageHead title={t('title')} subtitle={t('subtitle')}>
        <button type="button" className={ACTION_PRIMARY}>
          {t('save')}
        </button>
      </PageHead>

      <div className="mb-5 flex flex-wrap gap-4">
        {([1, 2, 0] as const).map((grant) => {
          const style = GRANT_STYLE[grant];
          const label = grant === 1 ? t('allowed') : grant === 2 ? t('withPin') : t('denied');

          return (
            <span key={grant} className="text-fg-muted inline-flex items-center gap-2 text-xs">
              <span
                className={`text-2xs inline-flex h-5 items-center justify-center rounded-xs px-1.5 font-bold ${style.className}`}
              >
                {style.glyph}
              </span>
              {label}
            </span>
          );
        })}
      </div>

      <div data-scroll className="bg-surface overflow-x-auto rounded-lg border">
        <div className="min-w-[1080px]">
          <div className={`bg-bg-subtle sticky top-0 grid ${GRID} border-b`}>
            <div className="text-fg-subtle self-end px-5 py-3.5 text-xs font-semibold tracking-wide">
              {t('action')}
            </div>

            {ROLES.map((role) => (
              <div key={role.key} className="border-divider border-l px-2 py-3 text-center">
                <div className="bg-bg-muted text-fg-muted rounded-pill text-3xs mx-auto mb-[7px] grid size-[26px] place-items-center font-bold">
                  {role.initials}
                </div>
                <div className="text-fg-muted text-2xs leading-[1.25] font-semibold">
                  {t(role.key)}
                </div>
              </div>
            ))}
          </div>

          {MATRIX.map((row) => (
            <div key={row.action} data-row className={`border-divider grid ${GRID} border-b`}>
              <div className="px-5 py-[13px] text-sm">{t(row.action)}</div>

              {row.grants.map((grant, index) => {
                const style = GRANT_STYLE[grant];

                return (
                  <div
                    key={`${row.action}-${ROLES[index].key}`}
                    className="border-divider flex items-center justify-center border-l p-2"
                  >
                    <span
                      className={`text-2xs flex h-[22px] min-w-[26px] items-center justify-center rounded-xs px-[7px] font-bold ${style.className}`}
                    >
                      {style.glyph}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
