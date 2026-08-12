/**
 * Render the PWA raster icons from their vector sources.
 *
 * A web manifest names its icons by an exact pixel size, so an SVG alone
 * cannot satisfy an install prompt. This script is the one step between the
 * two, kept in the repo so the PNGs are reproducible rather than a set of
 * binaries nobody can regenerate.
 *
 *   node tools/icons/render.mjs
 *
 * sharp is resolved out of the pnpm store because it arrives as a transitive
 * dependency of Next.js rather than as a direct one; adding it to the root
 * package.json only to run this occasionally would be a heavier promise than
 * the task deserves.
 */

import { glob, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The two sizes a Chromium install prompt asks for: one small, one large. */
const SIZES = [192, 512];

const TARGETS = [{ name: 'web', source: 'apps/web/public/icon.svg', outDir: 'apps/web/public' }];

async function loadSharp() {
  try {
    return require('sharp');
  } catch {
    // Not a direct dependency, so fall back to the store copy Next.js installed.
    for await (const entry of glob('node_modules/.pnpm/sharp@*/node_modules/sharp', {
      cwd: repoRoot,
    })) {
      return require(join(repoRoot, entry));
    }
    throw new Error('sharp not found — run pnpm install first');
  }
}

const sharp = await loadSharp();

for (const target of TARGETS) {
  const svg = await readFile(join(repoRoot, target.source));
  const outDir = join(repoRoot, target.outDir);
  await mkdir(outDir, { recursive: true });

  for (const size of SIZES) {
    const out = join(outDir, `icon-${size}.png`);
    // Rasterise from the vector at high density rather than upscaling a small
    // bitmap, or the 512 comes out of a 32-viewBox source visibly soft.
    const png = await sharp(svg, { density: 512 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(out, png);
    console.log(`${target.name}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} KiB  ${out}`);
  }
}
