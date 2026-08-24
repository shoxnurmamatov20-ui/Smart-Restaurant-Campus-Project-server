import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppManifest } from './download-data';
import { DownloadBoard } from './download-board';

/**
 * The two states this page has, rendered.
 *
 * `download.test.ts` proves the manifest is parsed and refused correctly;
 * nothing there proves the page *draws* what it parsed. That gap matters more
 * here than on most screens, because the populated branch cannot be looked at
 * on a developer's machine: it needs `/srv/srcp/shared/downloads/manifest.json`,
 * which exists only on a server that has run `srcp-apk`. Without these
 * assertions the button's href, the size and the checksum would first be seen
 * by a restaurant owner.
 */

vi.mock('next-intl', () => ({ useLocale: () => 'uz' }));

// The toast is a click away and not what these assertions read.
vi.mock('@restaurant/ui', () => ({ flash: vi.fn() }));

// next/link wants an app-router context a unit test has no reason to build.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const PAGE_URL = 'https://smartrestaurant.uz/download';

const PUBLISHED: AppManifest = {
  app: 'Smart Restaurant',
  package: 'uz.smartrestaurant.campus',
  version: '0.1.0',
  versionCode: 345_600,
  file: 'smart-restaurant-0.1.0-345600.apk',
  url: '/downloads/smart-restaurant-0.1.0-345600.apk',
  sizeBytes: 43_952_640,
  sha256: 'c'.repeat(64),
  builtAt: '20260821T134500Z',
  commit: '4b08fae',
  minAndroid: '7.0',
  signerSha256: 'd'.repeat(64),
};

afterEach(cleanup);

describe('with a published build', () => {
  it('hands over the exact file the manifest names', () => {
    render(<DownloadBoard manifest={PUBLISHED} pageUrl={PAGE_URL} />);

    /*
     * Two controls hand the file over now — the big button and the Google
     * Play badge under the title — and both must point at the manifest's
     * file. `getAllByRole` rather than `getByRole`, because a second link to
     * the same APK is the design (a badge people recognise, a button that
     * explains), not a duplicate to be hunted down.
     */
    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/downloads/'));

    expect(links.length).toBe(2);

    for (const link of links) expect(link.getAttribute('href')).toBe(PUBLISHED.url);

    const button = screen.getByRole('link', { name: /android uchun yuklab olish/i });
    // `download` is what makes the tap a download rather than a navigation, and
    // naming the file keeps it recognisable in the notification shade.
    expect(button.getAttribute('download')).toBe(PUBLISHED.file);
  });

  it('says which build it is, in units a person can check', () => {
    render(<DownloadBoard manifest={PUBLISHED} pageUrl={PAGE_URL} />);

    expect(screen.getByText('0.1.0')).toBeTruthy();
    expect(screen.getByText('41.9 MB')).toBeTruthy();
    expect(screen.getByText('21.08.2026')).toBeTruthy();
    expect(screen.getByText('uz.smartrestaurant.campus')).toBeTruthy();

    // Both digests, whole. A truncated checksum is worse than none: it invites
    // a comparison that cannot be completed.
    expect(screen.getByText(PUBLISHED.sha256)).toBeTruthy();
    expect(screen.getByText(PUBLISHED.signerSha256)).toBeTruthy();
  });

  it('states that this did not come from the Play Store, and walks the three steps', () => {
    render(<DownloadBoard manifest={PUBLISHED} pageUrl={PAGE_URL} />);

    expect(screen.getByText(/Play Market orqali emas/)).toBeTruthy();
    expect(screen.getByText(/Noma’lum manbalardan/)).toBeTruthy();
  });
});

describe('with nothing published yet', () => {
  it('offers no button at all rather than a dead one', () => {
    render(<DownloadBoard manifest={null} pageUrl={PAGE_URL} />);

    // The big button is gone; the Google Play badge stays but is no link —
    // `aria-disabled`, with the reason under it — so it cannot be pressed
    // into a 404.
    expect(screen.queryByRole('link', { name: /android uchun yuklab olish/i })).toBeNull();
    // Said twice on purpose — under the badge and as the section heading.
    expect(screen.getAllByText(/hali nashr qilinmagan/i).length).toBeGreaterThanOrEqual(2);

    for (const link of screen.queryAllByRole('link')) {
      expect(link.getAttribute('href')?.startsWith('/downloads/')).not.toBe(true);
    }
  });

  it('says so plainly, and points at the route that does work today', () => {
    render(<DownloadBoard manifest={null} pageUrl={PAGE_URL} />);

    expect(screen.getByText(/Ilova hali nashr qilinmagan/)).toBeTruthy();

    // The PWA path is the honest alternative, and it is the same three words
    // `install-prompt.tsx` shows a guest inside the app.
    expect(screen.getByText(/Bosh ekranga qo’shish/)).toBeTruthy();
  });

  it('drops the Android steps with the file they describe', () => {
    render(<DownloadBoard manifest={null} pageUrl={PAGE_URL} />);

    // "Tap the button above" is not advice on a page with no button above.
    expect(screen.queryByText(/Noma’lum manbalardan/)).toBeNull();
  });
});

describe('both states', () => {
  it('prints the address instead of a QR code, and never an empty one', () => {
    /*
     * The QR was dropped deliberately — see the comment in `download-board.tsx`.
     * What replaced it has to actually be there, in both states, or a reader on
     * a laptop has no way to get this page onto the phone in their hand.
     */
    for (const manifest of [PUBLISHED, null]) {
      cleanup();
      render(<DownloadBoard manifest={manifest} pageUrl={PAGE_URL} />);

      expect(screen.getByText(PAGE_URL)).toBeTruthy();
    }
  });

  it('never links the QR guest card, which has no page to land on', () => {
    for (const manifest of [PUBLISHED, null]) {
      cleanup();
      render(<DownloadBoard manifest={manifest} pageUrl={PAGE_URL} />);

      expect(screen.getByText('Stol QR').closest('a')).toBeNull();
      // The three that do have a page stay reachable.
      expect(screen.getByText('Buyurtma').closest('a')?.getAttribute('href')).toBe('/customer');
    }
  });
});
