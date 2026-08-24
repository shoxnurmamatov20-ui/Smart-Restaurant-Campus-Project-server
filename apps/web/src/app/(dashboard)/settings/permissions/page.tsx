import { getLocale, getTranslations } from 'next-intl/server';

import type { Lang } from '@/lib/console-post';

import { PageHead } from '../../screen';
import { GRANT_STYLE, MATRIX, ROLES } from './permissions-data';
import { PermissionGrid } from './permissions-grid';
import { fetchPermissionMatrix } from './permissions-server';

/** Its own title rather than Settings' — this is a screen, not a section. */
export async function generateMetadata() {
  const t = await getTranslations('console.permissions');
  return { title: t('title') };
}

/**
 * Who may do what.
 *
 * Built to the design's Permissions screen: twenty-three actions down, nine
 * roles across, and a legend above saying what the three marks mean.
 *
 * Every cell carries a glyph — a tick, the word PIN, or an em dash — rather
 * than a colour alone. On a screen this dense that is not a nicety: a grid of
 * green and amber squares is unreadable to anyone who cannot separate the two,
 * and this is the grid that decides who can issue a refund.
 *
 * The action column is sticky and the header row with it, because a matrix read
 * by scrolling in both directions is useless the moment either label leaves.
 *
 * The grid is read from the server — `GET /api/v1/roles` — and translated from
 * permissions into the design's twenty-three actions in `permissions-server.ts`,
 * which is also where the PIN mark is decided: a role under its discount
 * ceiling asks rather than signs.
 *
 * The grid is editable on a live console — see `permissions-grid.tsx`, which
 * also explains the one thing about it that surprises people: a cell is a
 * PERMISSION, and five of these rows share `pos.sell`, so they move together.
 * That is what the server can store, so it is what the screen shows.
 *
 * The page itself stays a server component: it resolves the catalogue, reads
 * `GET /api/v1/roles` and hands the grid strings. Only the editing is client.
 *
 * Still to build:
 *   - The discount ceiling, which is a percentage rather than a tick and has no
 *     control here yet (`PUT /api/v1/roles/{role}` takes it)
 *   - Custom roles beyond the nine the design ships
 *   - Per-branch overrides, since a manager's scope is one venue
 */
const GRID = '[grid-template-columns:minmax(300px,1.4fr)_repeat(9,minmax(92px,1fr))]';

export default async function PermissionsPage() {
  const [t, locale, matrix] = await Promise.all([
    getTranslations('console.permissions'),
    getLocale(),
    fetchPermissionMatrix(),
  ]);

  /* The caption counts the grid it is over. `t('subtitle')` states "9 roles ×
     23 actions" as a fact from the catalogue, which is a sentence that stops
     being true the day a permission is added or a role is configured. */
  const subtitle = t('subtitleLive', {
    roles: ROLES.length,
    actions: matrix.rows.length,
  });

  return (
    <>
      <PageHead title={t('title')} subtitle={subtitle} />

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

      <PermissionGrid
        rows={matrix.rows}
        roles={matrix.roles}
        editable={matrix.editable}
        live={matrix.live}
        lang={locale as Lang}
        grid={GRID}
        /* Every string the grid draws is resolved here. The catalogue is a
           server concern and shipping `next-intl` into a 23 × 9 table to render
           thirty-two labels would be a client bundle for nothing. */
        actionLabels={Object.fromEntries(MATRIX.map((row) => [row.action, t(row.action)]))}
        roleLabels={Object.fromEntries(ROLES.map((role) => [role.key, t(role.key)]))}
        labels={{
          action: t('action'),
          save: t('save'),
          saved: t('saved'),
          saveFailed: t('saveFailed'),
          pending: t.raw('pending') as string,
        }}
      />
    </>
  );
}
