import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Nothing in this package may reach for a browser, a server, or React.
 *
 * The rule is what makes the package worth having. `apps/mobile` bundles these
 * files through Metro, which does not resolve `next/*` and has no `document`;
 * `apps/web` imports them into client components, where `next/headers` throws.
 * One stray import in a 2 000-line fixture file breaks one build or the other,
 * and the build that breaks is the one the author was not running.
 *
 * Comments are stripped first. Several of these files *mention* `next/headers`
 * by name — to say why they must never import it — and a check that flagged the
 * explanation would push the next reader to delete it.
 */

const SRC = join(process.cwd(), 'src');

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) sources(path, found);
    else if (entry.endsWith('.ts') && !entry.includes('.test.')) found.push(path);
  }

  return found;
}

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FORBIDDEN = [
  /from\s+['"]react['"]/,
  /from\s+['"]react-dom/,
  /from\s+['"]next\//,
  /from\s+['"]next['"]/,
  /from\s+['"]@restaurant\/ui/,
  /^['"]use client['"]/m,
  /*
   * Globals, as code rather than as prose. These files are mostly sentences,
   * and "before signing the document." and "a delivery window." are both in
   * them — so the match is a property access or a call outside a string:
   * preceded by something that is not a word character, a quote, or the end
   * of a sentence's word.
   */
  /(?<![\w'"`.])(document|window|navigator|localStorage)\.\w/,
  /(?<![\w'"`.])fetch\(/,
];

describe('@restaurant/surfaces stays pure', () => {
  const files = sources(SRC);

  it('found the modules', () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
  });

  it.each(files.map((path) => [path.slice(SRC.length + 1), path] as const))(
    '%s imports no runtime',
    (_name, path) => {
      const code = withoutComments(readFileSync(path, 'utf8'));

      for (const rule of FORBIDDEN) {
        expect(code, `${_name} matches ${rule}`).not.toMatch(rule);
      }
    },
  );

  it('only depends on the other pure package', () => {
    // `@restaurant/i18n` is the one allowed dependency — it is the same kind of
    // package, and the order-state ladder lives there.
    for (const path of files) {
      const code = withoutComments(readFileSync(path, 'utf8'));
      const external = [...code.matchAll(/from\s+['"](@[^'"]+|[a-z][^'"./]*)['"]/g)].map(
        (m) => m[1],
      );

      for (const specifier of external) {
        expect(specifier, `${path.slice(SRC.length + 1)} imports ${specifier}`).toMatch(
          /^@restaurant\/i18n(\/|$)/,
        );
      }
    }
  });
});
