import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { messages } from './index';

/**
 * Every key a screen asks for exists in the catalogue.
 *
 * `t('hire_first')` is a string to the compiler and a thrown MISSING_MESSAGE
 * to the reader — the error boundary, "Xatolik yuz berdi", over a whole page
 * because one key was misspelt or added to the wrong block. Four hands added
 * a hundred keys in one evening; this is what makes the next typo a red test
 * instead of a red screen.
 *
 * A namespace is taken from `getTranslations('console.x')` /
 * `useTranslations('console.x')` bound to a variable, and every literal
 * `variable('key')` below that binding must resolve. A page binds `t` twice —
 * `console.nav` in `generateMetadata`, its own block in the component — so a
 * call resolves against the nearest binding above it. Dynamic keys (template
 * literals, variables) are skipped; those files guard themselves.
 */

type Tree = Record<string, unknown>;

function resolve(tree: Tree, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((node, part) => {
    if (node === null || typeof node !== 'object') return undefined;
    return (node as Tree)[part];
  }, tree);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const ROOT = path.resolve(__dirname, '..');
const FILES = walk(path.join(ROOT, 'app')).concat(walk(path.join(ROOT, 'components')));

const BINDING =
  /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*['"]([\w.]+)['"]\s*\)/g;
const DESTRUCTURED = /const\s*\[([^\]]+)\]\s*=\s*await\s+Promise\.all\(\[([\s\S]*?)\]\);/g;
const TRANSLATOR = /^\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*['"]([\w.]+)['"]\s*\)/;

/** Split an array literal's body on top-level commas only. */
function items(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of body) {
    if ('([{'.includes(char)) depth++;
    if (')]}'.includes(char)) depth--;
    if (char === ',' && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim() !== '') out.push(current);

  return out;
}

type Binding = { name: string; namespace: string; at: number };

function bindings(source: string): Binding[] {
  const found: Binding[] = [];

  for (const match of source.matchAll(BINDING)) {
    found.push({ name: match[1]!, namespace: match[2]!, at: match.index ?? 0 });
  }

  for (const match of source.matchAll(DESTRUCTURED)) {
    const names = items(match[1]!).map((name) => name.trim());
    items(match[2]!).forEach((item, index) => {
      const namespace = TRANSLATOR.exec(item);
      const name = names[index];
      if (name && namespace) found.push({ name, namespace: namespace[1]!, at: match.index ?? 0 });
    });
  }

  return found.sort((a, b) => a.at - b.at);
}

function namespaceAt(found: Binding[], name: string, at: number): string | null {
  let best: Binding | null = null;
  for (const binding of found) {
    if (binding.name === name && binding.at <= at) best = binding;
  }
  return best?.namespace ?? null;
}

/**
 * Keys built from a list at render time — `t(`channel_${key}`)` over
 * `CHANNEL_FILTERS`. The literal scan above cannot see them, and the first
 * three of these shipped missing: the orders screen threw MISSING_MESSAGE on
 * every render for a week. Each entry names the list and the prefix, and the
 * test expands one against the other.
 */
const DYNAMIC: readonly { namespace: string; prefix: string; keys: readonly string[] }[] = [
  {
    namespace: 'console.orders',
    prefix: 'channel_',
    keys: ['dine_in', 'takeaway', 'delivery', 'aggregator'],
  },
  {
    namespace: 'console.orderStatus',
    prefix: '',
    keys: ['placed', 'cooking', 'ready', 'served', 'paid', 'voided', 'new', 'accepted', 'to_pay'],
  },
  {
    namespace: 'console.staff',
    prefix: 'role',
    keys: [
      'Waiter',
      'Cashier',
      'HeadChef',
      'Kitchen',
      'Store',
      'Bartender',
      'Host',
      'Courier',
      'ShiftManager',
    ],
  },
];

describe('catalogue keys in use', () => {
  it('has every key a screen builds from a list at render time', () => {
    const missing: string[] = [];

    for (const group of DYNAMIC) {
      for (const key of group.keys) {
        const dotted = `${group.namespace}.${group.prefix}${key}`;

        if (resolve(messages.uz as unknown as Tree, dotted) === undefined) missing.push(dotted);
      }
    }

    expect(missing).toEqual([]);
  });

  it('exist in the merged uz catalogue for every literal t("key") call', () => {
    const missing: string[] = [];

    for (const file of FILES) {
      const source = readFileSync(file, 'utf8');
      const bound = bindings(source);
      if (bound.length === 0) continue;

      for (const name of new Set(bound.map((binding) => binding.name))) {
        const call = new RegExp(
          `(?<![\\w.])${name}(?:\\.raw|\\.rich|\\.has)?\\(\\s*['"]([\\w.]+)['"]`,
          'g',
        );
        for (const match of source.matchAll(call)) {
          const namespace = namespaceAt(bound, name, match.index ?? 0);
          if (namespace === null) continue;
          const key = `${namespace}.${match[1]}`;
          if (resolve(messages.uz as unknown as Tree, key) === undefined) {
            missing.push(`${path.relative(ROOT, file)} → ${key}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
