#!/usr/bin/env node
/**
 * Add keys to the three catalogues, safely from several hands at once.
 *
 *   node scripts/i18n-add.mjs '{"console.staff.hire_first": {"uz":"Ism","ru":"Имя","en":"First name"}}'
 *   node scripts/i18n-add.mjs path/to/keys.json
 *
 * The catalogues are one object literal per language, formatted by prettier.
 * A key is inserted as the last entry of its block (`console.staff` → the
 * `staff: {` object under `console: {`), in all three files, under one file
 * lock — so four agents adding keys in parallel cannot lose each other's
 * edits, which is what happens when two processes each read, edit and write
 * the same 3 000-line file.
 *
 * Existing keys are left alone (reported, not overwritten). Strings are
 * written as single-quoted TS literals with quotes escaped; prettier runs
 * afterwards so the result is what a person would have typed.
 */
import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const CATALOGUES = { uz: 'src/i18n/uz.ts', ru: 'src/i18n/ru.ts', en: 'src/i18n/en.ts' };
const LOCK = path.join(root, 'src/i18n/.add.lock');

const arg = process.argv[2];
if (!arg) {
  console.error('usage: i18n-add.mjs <json | file.json>');
  process.exit(2);
}
const input = JSON.parse(existsSync(arg) ? readFileSync(arg, 'utf8') : arg);

function literal(value) {
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/** Insert `line` as the last entry of the block at `dotted` inside `source`. */
function insert(source, dotted, keyName, value) {
  const parts = dotted.split('.');
  const lines = source.split('\n');
  let indent = 0;
  let cursor = 0;

  for (const part of parts) {
    const opener = new RegExp(`^${' '.repeat(indent + 2)}(${part}|'${part}'): \\{$`);
    let found = -1;
    for (let i = cursor; i < lines.length; i++) {
      if (opener.test(lines[i])) {
        found = i;
        break;
      }
      // Do not walk past the end of the enclosing block.
      if (indent > 0 && new RegExp(`^${' '.repeat(indent)}\\},?$`).test(lines[i]) && i > cursor)
        break;
    }
    if (found === -1) throw new Error(`block ${dotted} not found at ${part}`);
    cursor = found + 1;
    indent += 2;
  }

  // The block's own closing line has the block's indent.
  const closer = new RegExp(`^${' '.repeat(indent)}\\},?$`);
  const keyRe = new RegExp(`^${' '.repeat(indent + 2)}(${keyName}|'${keyName}'):`);
  for (let i = cursor; i < lines.length; i++) {
    if (keyRe.test(lines[i])) return { source, existed: true };
    if (closer.test(lines[i])) {
      lines.splice(i, 0, `${' '.repeat(indent + 2)}${keyName}: ${literal(value)},`);
      return { source: lines.join('\n'), existed: false };
    }
  }
  throw new Error(`closing brace for ${dotted} not found`);
}

const lock = openSync(LOCK, 'wx').valueOf();
try {
  const report = [];
  for (const [lang, rel] of Object.entries(CATALOGUES)) {
    const file = path.join(root, rel);
    let source = readFileSync(file, 'utf8');
    for (const [dottedKey, values] of Object.entries(input)) {
      const keyName = dottedKey.slice(dottedKey.lastIndexOf('.') + 1);
      const block = dottedKey.slice(0, dottedKey.lastIndexOf('.'));
      const value = values[lang];
      if (value === undefined) throw new Error(`${dottedKey}: no ${lang} value`);
      const result = insert(source, block, keyName, value);
      source = result.source;
      if (result.existed && lang === 'uz') report.push(`exists: ${dottedKey}`);
    }
    writeFileSync(file, source);
  }
  execSync(`npx prettier --write ${Object.values(CATALOGUES).join(' ')}`, {
    cwd: root,
    stdio: 'ignore',
  });
  console.log(
    `added ${Object.keys(input).length} key(s)` + (report.length ? `\n${report.join('\n')}` : ''),
  );
} finally {
  closeSync(lock);
  unlinkSync(LOCK);
}
