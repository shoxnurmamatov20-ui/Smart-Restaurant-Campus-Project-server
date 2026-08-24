import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every native dependency is the version this Expo SDK was built against.
 *
 * Expo ships `bundledNativeModules.json` — the one version of each native
 * module its SDK is tested with — and `npm view <pkg> version` answers the
 * *latest*, which is not the same thing. This app was first written against
 * `react-native@0.87.0` because that was latest; Expo 57 is built on 0.86.2,
 * `tsc` was perfectly happy, and Metro then failed to start because a file
 * `@expo/metro-config` requires from the RN package had moved.
 *
 * A type check cannot see this. Only bundling can, and bundling is not part
 * of `pnpm test` — so this reads Expo's own list and compares.
 */

const require = createRequire(import.meta.url);

const bundled = require('expo/bundledNativeModules.json') as Record<string, string>;
const ours = (
  JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  }
).dependencies;

describe('native dependencies match the Expo SDK', () => {
  /*
   * `catalog:` is excluded below because a catalogued version is the
   * monorepo's, and the monorepo's is Next.js's — `react` is the one package
   * where the two disagree (Next wants ^19.2.8, Expo 57 bundles 19.2.3), so it
   * is pinned in this app rather than catalogued. Anything else Expo names that
   * is still catalogued would be that disagreement going unnoticed, which is
   * why it is reported rather than skipped.
   */
  const catalogued = Object.entries(ours).filter(
    ([name, spec]) => name in bundled && spec.startsWith('catalog'),
  );

  it('nothing Expo pins is left to the workspace catalog', () => {
    expect(
      catalogued.map(([name]) => name),
      'pin these in apps/mobile instead of taking the catalog version',
    ).toEqual([]);
  });

  const native = Object.entries(ours).filter(
    ([name, spec]) =>
      name in bundled && !spec.startsWith('workspace') && !spec.startsWith('catalog'),
  );

  it('found the native set', () => {
    expect(native.length).toBeGreaterThan(8);
  });

  it.each(native)('%s', (name, spec) => {
    expect(spec, `${name}: Expo SDK bundles ${bundled[name]}`).toBe(bundled[name]);
  });
});
