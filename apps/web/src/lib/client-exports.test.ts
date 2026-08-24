import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A server file may not import a VALUE from a `'use client'` module.
 *
 * Next.js hands a server component a client *reference* for anything it
 * imports from a client module — which is what a component needs and what
 * an array, a function or a constant is not. `BOOKS_TABS.filter is not a
 * function` and `bookDays is not a function` each took a whole screen to 500
 * in production within an hour of being written; tsc, eslint and vitest saw
 * nothing, because the types were right and the unit tests import the real
 * module. The rule: components and hooks cross the boundary, everything
 * else lives in a module without the directive (`*-data.ts`, `*-days.ts`),
 * and a server file imports only types from a client one.
 */

const ROOT = path.resolve(__dirname, '..', 'app');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(ROOT);
const isClient = (source: string) => /^\s*['"]use client['"]/.test(source);
/** Server-side files: pages, layouts, route handlers, server seams. */
const isServerFile = (file: string, source: string) =>
  !isClient(source) &&
  !/^\s*['"]use server['"]/.test(source) &&
  (/\/(page|layout|template|not-found|error|route)\.tsx?$/.test(file) ||
    /-server\.tsx?$/.test(file));

/** Non-component, non-hook exports of a client module: the ones that do not cross. */
function valueExports(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(
    /^export\s+(?:const|let|function|async function)\s+(\w+)/gm,
  )) {
    const name = match[1]!;
    if (/^[A-Z][a-z]/.test(name)) continue; // a Component
    if (/^use[A-Z]/.test(name)) continue; // a hook (server code cannot call one anyway)
    names.add(name);
  }
  return names;
}

describe('the client/server boundary', () => {
  it('lets no server file import a value from a "use client" module', () => {
    const offences: string[] = [];
    const sources = new Map(FILES.map((file) => [file, readFileSync(file, 'utf8')]));

    for (const [file, source] of sources) {
      if (!isServerFile(file, source)) continue;

      for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g)) {
        const names = match[1]!
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part !== '' && !part.startsWith('type '))
          .map((part) => part.replace(/\s+as\s+\w+$/, ''));
        const target = path.resolve(path.dirname(file), match[2]!);
        const targetFile = ['.tsx', '.ts', '/index.tsx', '/index.ts']
          .map((ext) => target + ext)
          .find((candidate) => sources.has(candidate));
        if (targetFile === undefined) continue;
        const targetSource = sources.get(targetFile)!;
        if (!isClient(targetSource)) continue;

        const forbidden = valueExports(targetSource);
        for (const name of names) {
          if (forbidden.has(name)) {
            offences.push(
              `${path.relative(ROOT, file)} imports ${name} from ${path.relative(ROOT, targetFile)}`,
            );
          }
        }
      }
    }

    expect(offences).toEqual([]);
  });
});
