import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `apiBase()` already ends in `/api/v1`. A path that starts with `/v1/` on top
 * of it becomes `/api/v1/v1/…`, and the API answers 404 — which every caller
 * here treats as "no live data" and quietly falls back to fixtures.
 *
 * That is how the whole platform console and the entire restaurant site were
 * rendering invented branches and an invented phone number for a day while
 * every test stayed green: nothing errored, the screens simply looked like the
 * demo. Four files carried the mistake. This reads every source file that
 * reaches the API and refuses the pattern.
 */
const SRC = join(process.cwd(), 'src');

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path);
  }

  return found;
}

const DOUBLED =
  /(?:apiBase\(\)|API_BASE|apiUrl)\s*\}?\s*\/v1\/|api(?:Get|Post|Patch|Put|Delete)(?:<[^>]*>)?\(\s*[`'"]\/v1\//;

describe('no caller doubles the /v1 prefix', () => {
  it('holds across src', () => {
    const offenders = sources(SRC)
      .filter((path) => DOUBLED.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(process.cwd().length + 1));

    expect(offenders, 'these build /api/v1/v1/… and silently fall back to fixtures').toEqual([]);
  });
});
