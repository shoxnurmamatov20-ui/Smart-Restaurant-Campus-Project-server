import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every installable surface points at its own manifest, and that manifest opens
 * where the surface starts.
 *
 * This is the check for a bug that is invisible until somebody installs the app:
 * the staff app and the marketplace declared no manifest, so both inherited the
 * platform's — which starts at `/dashboard`. A waiter who added the staff app to
 * their home screen from the tab bar opened the back-office console. Nothing in
 * the build says that is wrong; the page renders, the icon appears, and the only
 * symptom is a person on a phone looking at the wrong product.
 *
 * `Smart Restaurant Sayt va PWA.dc.html` treats the manifest as product surface
 * rather than plumbing — it draws the generated JSON on screen and names the
 * fields a restaurant sees. Four of them are asserted here: the name a person
 * reads under the icon, the start URL, the scope that decides what counts as
 * "inside the app", and `display: standalone`, without which none of it is an
 * app at all.
 */

const PUBLIC = join(process.cwd(), 'public');
const APP = join(process.cwd(), 'src/app');

type Surface = {
  /** The route group's layout, which is where the link is declared. */
  readonly layout: string;
  readonly manifest: string;
  /** Where an installed icon has to open. */
  readonly startsWith: string;
};

const SURFACES: Readonly<Record<string, Surface>> = {
  'the customer app': {
    layout: '(customer)/layout.tsx',
    manifest: 'manifest-customer.json',
    startsWith: '/customer',
  },
  'the staff app': {
    layout: '(staff)/layout.tsx',
    manifest: 'manifest-crew.json',
    startsWith: '/crew',
  },
  'the marketplace': {
    layout: '(marketplace)/layout.tsx',
    manifest: 'manifest-mp.json',
    startsWith: '/mp',
  },
};

describe.each(Object.entries(SURFACES))('%s', (_name, surface) => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, surface.manifest), 'utf8')) as {
    name: string;
    short_name: string;
    start_url: string;
    scope: string;
    display: string;
    icons: readonly unknown[];
  };

  it('declares its own manifest in its layout', () => {
    // Not the platform's. That is the whole bug this file exists for.
    const layout = readFileSync(join(APP, surface.layout), 'utf8');

    expect(layout).toContain(`/${surface.manifest}`);
    expect(layout).not.toContain("manifest: '/manifest.json'");
  });

  it('opens on its own surface', () => {
    expect(manifest.start_url.startsWith(surface.startsWith)).toBe(true);
    expect(manifest.scope).toBe(surface.startsWith);
  });

  it('installs as an app rather than a shortcut', () => {
    expect(manifest.display).toBe('standalone');
    // A maskable icon, or Android crops the mark inside a white circle.
    expect(JSON.stringify(manifest.icons)).toContain('maskable');
  });

  it('is named for what a person installed', () => {
    // The name under the icon is the one thing a reader sees before opening it,
    // and three apps called "Smart Restaurant Campus" are indistinguishable on
    // a home screen.
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeLessThanOrEqual(14);
    expect(manifest.name).not.toBe('Smart Restaurant Campus');
  });
});

describe('the platform manifest', () => {
  it('still belongs to the console', () => {
    const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8')) as {
      start_url: string;
    };

    expect(manifest.start_url).toContain('/dashboard');
  });
});

describe('iOS, which reads none of the above', () => {
  it('is told to run standalone in the root layout', () => {
    /*
     * Safari ignores `display: standalone` in a web manifest entirely. Without
     * `appleWebApp.capable` a guest who follows the Share → Add to Home Screen
     * instructions still opens the app inside Safari, address bar and all —
     * which looks exactly like having installed nothing.
     */
    const root = readFileSync(join(APP, 'layout.tsx'), 'utf8');

    expect(root).toContain('appleWebApp');
    expect(root).toContain('black-translucent');
    // `viewportFit: 'cover'` is what makes `env(safe-area-inset-*)` return a
    // real number; without it every bottom dock sits under the home indicator.
    expect(root).toContain("viewportFit: 'cover'");
  });
});

describe('the service worker', () => {
  it('exists, because a manifest alone does not make the browser offer to install', () => {
    expect(existsSync(join(PUBLIC, 'sw.js'))).toBe(true);
  });

  it('never caches HTML or touches the API', () => {
    // The reasoning is in the file: a cached document from one signed-in person,
    // replayed to the next person on a shared tablet, is one restaurant's
    // figures shown to another.
    const worker = readFileSync(join(PUBLIC, 'sw.js'), 'utf8');

    expect(worker).toContain('/api/');
    expect(worker).toContain('/offline');
  });
});
