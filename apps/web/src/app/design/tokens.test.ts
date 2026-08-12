import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The rule a palette override has to obey, enforced.
 *
 * `:root` and `.dark` both match `<html class="dark">` at the same
 * specificity, so the one written later wins. An app's palette block comes
 * after the shared token layer — which means a token an app sets only in
 * `:root` keeps its *light* value in the dark theme, because the token layer's
 * own `.dark` was overridden by a rule that came afterwards.
 *
 * That is not hypothetical. Splitting the admin palette out of its 200-line
 * globals.css left six sidebar tokens declared in `:root` and nowhere else,
 * which painted near-black navigation labels onto the near-black dark sidebar.
 * Nothing failed; the console simply had an unreadable sidebar in one theme.
 *
 * A design lands as exactly this kind of edit — a handful of values, in these
 * two blocks — so the check belongs in the test suite rather than in a comment
 * somebody reads afterwards.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

const PALETTES = [
  { app: 'web', path: join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'globals.css') },
  { app: 'admin', path: join(REPO_ROOT, 'apps', 'admin', 'src', 'app', 'globals.css') },
];

/** Token names declared directly inside a top-level `:root` or `.dark` block. */
function tokensIn(css: string, selector: ':root' | '.dark'): string[] {
  const opener = selector === ':root' ? /^:root\s*\{/ : /^\.dark\s*\{/;
  const names: string[] = [];
  let inside = false;

  for (const raw of css.split(/\r?\n/)) {
    const line = raw.trim();

    if (!inside) {
      if (opener.test(line)) inside = true;
      continue;
    }

    if (line === '}') {
      inside = false;
      continue;
    }

    const declaration = /^--([a-z0-9-]+)\s*:/.exec(line);
    if (declaration) names.push(declaration[1]);
  }

  return names;
}

describe('palette overrides', () => {
  for (const { app, path } of PALETTES) {
    describe(`apps/${app}`, () => {
      const css = readFileSync(path, 'utf8');

      /*
       * Overriding is optional, and not overriding is the better answer.
       *
       * This used to assert that every app declared a palette of its own,
       * which was true when each one invented its colours before the design
       * existed. It is now the opposite of what we want: the staff console
       * takes the design's tokens unchanged, and an app-level `:root` block is
       * a deliberate exception — the admin console neutralising the brand so
       * nobody confuses it with the window where they take orders.
       *
       * What still has to hold is the parity rule below. That is the one that
       * fails silently.
       */
      it('redefines every :root token in the dark block as well', () => {
        const light = tokensIn(css, ':root');
        const dark = tokensIn(css, '.dark');
        const stranded = light.filter((token) => !dark.includes(token));

        expect(stranded, 'Only set in :root — will keep its light value in dark mode').toEqual([]);
      });

      it('imports the shared token layer before overriding it', () => {
        // Order matters: an override has to come after the layer it overrides,
        // or it is the one that gets overridden. Apps with no override have
        // nothing to order, so the check only applies when there is one.
        const tokenImport = css.indexOf('packages/ui/src/styles/tokens.css');
        const firstOverride = css.search(/^:root\s*\{/m);

        expect(tokenImport).toBeGreaterThan(-1);

        if (firstOverride !== -1) {
          expect(firstOverride).toBeGreaterThan(tokenImport);
        }
      });

      it('tells Tailwind to scan the component library', () => {
        // Without @source the utilities used only inside @restaurant/ui are
        // never generated and its components render unstyled.
        expect(css).toContain("@source '../../../../packages/ui/src'");
      });
    });
  }
});
