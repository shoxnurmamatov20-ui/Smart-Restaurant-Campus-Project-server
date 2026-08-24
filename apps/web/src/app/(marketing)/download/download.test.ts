import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import robots from '@/app/robots';

import { pagesCopy } from '../pages-copy';
import {
  type AppManifest,
  DOWNLOAD_MANIFEST_PATH,
  DOWNLOAD_SURFACES,
  formatBuiltAt,
  formatMegabytes,
  parseManifest,
} from './download-data';

/**
 * `/download`, and the file it reads at request time.
 *
 * The manifest is written by a shell script on a server this test will never
 * run on (`infrastructure/server/bin/srcp-apk`), so what is checkable here is
 * the contract between the two: the shape that script emits, and every way the
 * page must refuse to draw a half-published release rather than render "NaN MB"
 * under a button.
 */

const LOCALES = ['uz', 'ru', 'en'] as const;

/** `apps/web`. Vitest runs from the package root, as `pages-fidelity` assumes too. */
const WEB = process.cwd();

/**
 * A manifest exactly as `srcp-apk` writes one — the heredoc at the bottom of
 * that script, field for field. Every negative case below is this object with
 * one thing wrong, so a field added there and forgotten here shows up as a
 * passing test for a shape nothing produces.
 */
const GOOD: AppManifest = {
  app: 'Smart Restaurant',
  package: 'uz.smartrestaurant.campus',
  version: '0.1.0',
  versionCode: 345_600,
  file: 'smart-restaurant-0.1.0-345600.apk',
  url: '/downloads/smart-restaurant-0.1.0-345600.apk',
  sizeBytes: 43_952_640,
  sha256: 'a'.repeat(64),
  builtAt: '20260821T134500Z',
  commit: '4b08fae',
  minAndroid: '7.0',
  signerSha256: 'b'.repeat(64),
};

/** The published JSON, with `patch` applied on top. */
function manifestJson(patch: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...GOOD, ...patch });
}

describe('parseManifest', () => {
  it('reads the manifest srcp-apk writes', () => {
    expect(parseManifest(manifestJson())).toEqual(GOOD);
  });

  it('answers null when no APK has been published on this host', () => {
    // The normal case on a laptop and on a fresh server: /srv/srcp/shared/
    // downloads/ does not exist yet, `download-server.ts` catches ENOENT and
    // hands null straight through.
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest('')).toBeNull();
    expect(parseManifest('   ')).toBeNull();
  });

  it('answers null on JSON it cannot parse', () => {
    expect(parseManifest('{')).toBeNull();
    expect(parseManifest('not json at all')).toBeNull();
    // Valid JSON, wrong shape. `JSON.parse` is happy with all three.
    expect(parseManifest('null')).toBeNull();
    expect(parseManifest('"a string"')).toBeNull();
    expect(parseManifest('[]')).toBeNull();
  });

  it('refuses a manifest missing a field the page renders', () => {
    /*
     * This is the assertion that matters most. A manifest without `sizeBytes`
     * type-checks nowhere and renders "NaN MB"; without `version` it renders
     * "undefined". Either one is worse than the honest empty state, because a
     * restaurant owner reading it concludes the download is broken and stops.
     */
    for (const key of [
      'app',
      'package',
      'version',
      'file',
      'url',
      'sizeBytes',
      'sha256',
      'builtAt',
      'commit',
      'minAndroid',
      'signerSha256',
      'versionCode',
    ]) {
      const partial: Record<string, unknown> = { ...GOOD };
      delete partial[key];

      expect(parseManifest(JSON.stringify(partial)), key).toBeNull();
    }
  });

  it('refuses a blank string where a value belongs', () => {
    expect(parseManifest(manifestJson({ version: '' }))).toBeNull();
    expect(parseManifest(manifestJson({ minAndroid: '   ' }))).toBeNull();
  });

  it('keeps the download button pointing at our own /downloads/', () => {
    /*
     * `url` is what the one big button on the page links to, and it comes from
     * a file on disk. A manifest naming another host would turn "this exact
     * file, checksummed, from us" into an off-site link — the single worst
     * thing this page could do — so the prefix is checked rather than trusted.
     */
    expect(parseManifest(manifestJson({ url: 'https://elsewhere.example/app.apk' }))).toBeNull();
    expect(parseManifest(manifestJson({ url: '//elsewhere.example/app.apk' }))).toBeNull();
    expect(parseManifest(manifestJson({ url: '/uploads/app.apk' }))).toBeNull();
  });

  it('refuses a zero-byte or impossible size', () => {
    // A zero-byte APK is a failed build that got published, not a small one.
    expect(parseManifest(manifestJson({ sizeBytes: 0 }))).toBeNull();
    expect(parseManifest(manifestJson({ sizeBytes: -1 }))).toBeNull();
    expect(parseManifest(manifestJson({ sizeBytes: '43952640' }))).toBeNull();
  });

  it('refuses a versionCode that is not a positive whole number', () => {
    // Android reads it as an integer and refuses a downgrade; a float or a
    // string here means the script that derives it from the clock has changed.
    expect(parseManifest(manifestJson({ versionCode: 0 }))).toBeNull();
    expect(parseManifest(manifestJson({ versionCode: 1.5 }))).toBeNull();
    expect(parseManifest(manifestJson({ versionCode: '345600' }))).toBeNull();
  });

  it('refuses a digest that is not 64 lower-case hex characters', () => {
    // `sha256sum` and `apksigner` both print lower-case hex. Anything else is
    // a truncated write or a hand-edited file, and the page invites a reader
    // to compare these character for character.
    expect(parseManifest(manifestJson({ sha256: 'a'.repeat(63) }))).toBeNull();
    expect(parseManifest(manifestJson({ sha256: 'A'.repeat(64) }))).toBeNull();
    expect(parseManifest(manifestJson({ sha256: 'z'.repeat(64) }))).toBeNull();
    expect(parseManifest(manifestJson({ signerSha256: '' }))).toBeNull();
  });

  it('refuses a build stamp that is not a real instant', () => {
    expect(parseManifest(manifestJson({ builtAt: '2026-08-21T13:45:00Z' }))).toBeNull();
    expect(parseManifest(manifestJson({ builtAt: '20260231T134500Z' }))).toBeNull();
  });

  it('publishes the path srcp-apk installs to', () => {
    // Both sides of one contract: the script writes here, the page reads here.
    expect(DOWNLOAD_MANIFEST_PATH).toBe('/srv/srcp/shared/downloads/manifest.json');
  });
});

describe('formatMegabytes', () => {
  it('counts mebibytes, one decimal, like the tool that built the file', () => {
    // `srcp-apk` prints `SIZE / 1048576`. Two places quoting one file's size
    // have to agree or the first support question is which one is lying.
    expect(formatMegabytes(43_952_640)).toBe('41.9');
    expect(formatMegabytes(1024 * 1024)).toBe('1.0');
    expect(formatMegabytes(1024 * 1024 * 10)).toBe('10.0');
  });

  it('writes a full stop in every language', () => {
    // Never `Intl.NumberFormat`: a file size that reads "41,9" to one reader
    // and "41.9" to another is a value that depends on who is looking at it.
    expect(formatMegabytes(43_952_640)).not.toContain(',');
  });
});

describe('formatBuiltAt', () => {
  it('expands the basic ISO stamp date -u writes', () => {
    // `new Date('20260821T134500Z')` is Invalid Date — the basic form has no
    // separators and the parser wants the extended one.
    expect(formatBuiltAt('20260821T134500Z')).toBe('21.08.2026');
    expect(formatBuiltAt('20260101T000000Z')).toBe('01.01.2026');
  });

  it('answers null rather than a date nobody had', () => {
    expect(formatBuiltAt('20260231T134500Z')).toBeNull();
    expect(formatBuiltAt('20261301T134500Z')).toBeNull();
    expect(formatBuiltAt('20260821T256100Z')).toBeNull();
    expect(formatBuiltAt('2026-08-21T13:45:00Z')).toBeNull();
    expect(formatBuiltAt('')).toBeNull();
  });
});

describe('the page', () => {
  it('has its head, its board and its two data modules on disk', () => {
    for (const file of [
      'page.tsx',
      'download-board.tsx',
      'download-data.ts',
      'download-server.ts',
    ]) {
      expect(existsSync(join(import.meta.dirname, file)), file).toBe(true);
    }
  });

  it('keeps node:fs out of everything a client component may import', () => {
    /*
     * The split that lets `download-data.ts` be imported from a `'use client'`
     * module. `download-server.ts` is the only file here allowed to touch the
     * filesystem, and it is imported by `page.tsx` alone — the same rule the
     * console's `*-data.ts` / `*-server.ts` pairs follow.
     */
    const board = readFileSync(join(import.meta.dirname, 'download-board.tsx'), 'utf8');
    const data = readFileSync(join(import.meta.dirname, 'download-data.ts'), 'utf8');

    /* Imports, not occurrences. The first version of this grepped for the
       string `node:fs` and failed on the sentence in `download-data.ts` that
       explains why it is not there — a test that forbids talking about a rule
       is a test nobody keeps. */
    const importsNode = /^\s*import\b[^\n]*'node:/m;
    const importsServer = /^\s*import\b[^\n]*'\.\/download-server'/m;

    expect(board).toContain("'use client'");
    expect(importsServer.test(board)).toBe(false);
    expect(importsNode.test(board)).toBe(false);
    expect(importsNode.test(data)).toBe(false);

    // And the regex finds one where there is one, or it proves nothing.
    expect(
      importsNode.test(readFileSync(join(import.meta.dirname, 'download-server.ts'), 'utf8')),
    ).toBe(true);
  });

  it('is left open to crawlers', () => {
    /*
     * An owner who searches for the app by name has to land here — there is no
     * store listing to find instead. Disallow is a prefix match, so this asks
     * the question the way a crawler does rather than looking for the literal
     * string.
     */
    const rules = robots().rules;
    const disallowed = Array.isArray(rules) ? [] : [rules.disallow ?? []].flat();

    for (const rule of disallowed) {
      expect('/download'.startsWith(rule), rule).toBe(false);
    }
  });
});

describe('the four surfaces inside the one binary', () => {
  it('gives every surface its words, in all three languages', () => {
    for (const locale of LOCALES) {
      expect(pagesCopy(locale).download.surfaces).toHaveLength(DOWNLOAD_SURFACES.length);
    }

    expect(DOWNLOAD_SURFACES).toHaveLength(4);
  });

  it('calls each one what the phone will call it', () => {
    /*
     * The names are not ours to choose: three of the four are the `short_name`
     * of a web manifest, which is the word that ends up under the icon on a
     * home screen. A page that calls the customer app something else is how a
     * person hunts for an app they have already installed.
     *
     * Uzbek only, because that is the language the manifests are written in.
     * The fourth surface has no manifest and cannot have one — the QR guest is
     * reached by pointing a camera at a table, not by installing anything.
     */
    const uz = pagesCopy('uz').download.surfaces;

    DOWNLOAD_SURFACES.forEach((surface, index) => {
      if (surface.manifest === null) return;

      const published = JSON.parse(
        readFileSync(join(WEB, 'public', surface.manifest), 'utf8'),
      ) as Record<string, unknown>;

      expect(uz[index]?.name, surface.id).toBe(published.short_name);
    });
  });

  it('links only where there is a page to land on', () => {
    /*
     * The same argument `site-data.test.ts` makes about the sign-in link, and
     * the same mistake it was written for: the first draft of these cards sent
     * the QR guest to `/qr`, which is not a route — the guest is reached at
     * `/qr/[restaurant]/[table]`, one table in one restaurant. A 404 on the
     * site's newest public page, from a card that looked exactly like the three
     * beside it.
     *
     * Route groups are not part of a URL, so the segment is looked up under
     * every group rather than under a hard-coded one: `/crew` lives in
     * `(staff)`, `/mp` in `(marketplace)`, and moving either must not break
     * this test for the wrong reason.
     */
    const app = join(WEB, 'src/app');
    const groups = [
      '',
      ...readdirSync(app, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('('))
        .map((entry) => entry.name),
    ];

    for (const surface of DOWNLOAD_SURFACES) {
      if (surface.href === null) continue;

      const found = groups.some((group) =>
        existsSync(join(app, group, surface.href ?? '', 'page.tsx')),
      );

      expect(found, `${surface.id} -> ${surface.href}`).toBe(true);
    }

    // The surface with no address has to stay without one, or the loop above
    // silently stops covering the case it was written for.
    expect(DOWNLOAD_SURFACES.find((surface) => surface.id === 'guest')?.href).toBeNull();
  });

  it('names at least one surface with a manifest, so the check above can fail', () => {
    // Without this the loop passes on an empty list — and a test that cannot
    // fail is not a test.
    expect(DOWNLOAD_SURFACES.filter((surface) => surface.manifest !== null).length).toBe(3);
  });
});

describe('the copy', () => {
  it('carries three Android steps and three iPhone steps in every language', () => {
    for (const locale of LOCALES) {
      const t = pagesCopy(locale).download;

      expect(t.steps, locale).toHaveLength(3);
      expect(t.iosSteps, locale).toHaveLength(3);
    }
  });

  it('says out loud that this is not the Play Store', () => {
    /*
     * The one sentence on the page that stops a support call. An APK from a
     * website is an unfamiliar thing to install, and a reader who is not told
     * why Android is warning them assumes the warning is about us.
     */
    for (const locale of LOCALES) {
      expect(pagesCopy(locale).download.andNotPlay.trim(), locale).not.toBe('');
      expect(pagesCopy(locale).download.stepsP.trim(), locale).not.toBe('');
    }
  });
});
