import { expect, test } from '@playwright/test';

import { PAGE_PLANS } from '../src/app/(marketing)/pages-data';

/**
 * The pages a stranger can reach, and the two things each has to do: render
 * without an error boundary, and not leak a console surface.
 */
test.describe('public surfaces', () => {
  for (const path of [
    '/',
    '/product',
    '/roles',
    '/pricing',
    '/customers',
    '/faq',
    '/contact',
    '/download',
  ]) {
    test(`${path} renders`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(errors, 'uncaught errors on the page').toEqual([]);
    });
  }

  test('/download hands out the APK with the right type, or says why not', async ({
    page,
    request,
  }) => {
    await page.goto('/download');

    const apk = page.locator('a[href^="/downloads/"][download]').first();

    if ((await apk.count()) === 0) {
      // Nothing published on this box: the page must say so rather than draw
      // a button into a 404.
      await expect(page.getByText(/hali nashr qilinmagan/i).first()).toBeVisible();
      return;
    }

    const href = await apk.getAttribute('href');
    const head = await request.head(href!);

    expect(head.status()).toBe(200);
    expect(head.headers()['content-type']).toContain('application/vnd.android.package-archive');
  });

  test('the console is not reachable without a session', async ({ page }) => {
    for (const path of ['/dashboard', '/orders', '/finance', '/documents', '/platform']) {
      const response = await page.goto(path);

      /*
       * Redirected to the sign-in, never rendered.
       *
       * Matched on the tail rather than on `/login` exactly: every URL on this
       * site carries a language, so the guard lands on `/uz/login` — and pinning
       * the prefix here would make the assertion a test of what the default
       * language is rather than of whether a stranger got in. The half that
       * matters is that the console did not render.
       */
      const landed = new URL(page.url()).pathname;

      expect(landed, `${path} rendered for a stranger`).toMatch(/(^|\/)login$/);
      expect(response?.status()).toBeLessThan(500);
    }
  });

  test('the pricing page shows the plan in so‘m, not a hundred times cheaper', async ({ page }) => {
    await page.goto('/pricing');

    /*
     * The bug this guards is a *unit* error, not a particular number.
     * `formatTiyinAmount` divides by a hundred, so a price transcribed from the
     * design as so'm renders a plan a hundred times too cheap — Start was
     * advertised at 24 000 for weeks against a real 2 400 000.
     *
     * So the figure is read from the same table the page renders instead of
     * being written here. Hard-coding it made this test expire the day the owner
     * repriced the plans — 2026-08-23, to 150 000 and 390 000 — and a test that
     * fails for being out of date teaches people to ignore it.
     *
     * `Intl.NumberFormat('uz')` groups with U+00A0 and the design writes U+2009;
     * either is the right number, a plain space or nothing at all is not.
     */
    const monthlyTiyin = PAGE_PLANS[0]?.monthlyTiyin;

    expect(monthlyTiyin, 'the first plan has to have a price to look for').not.toBeNull();

    const grouped = String(Math.round((monthlyTiyin ?? 0) / 100)).replace(
      /\B(?=(\d{3})+(?!\d))/g,
      '[\\u00a0\\u2009\\u202f ]',
    );

    await expect(page.getByText(new RegExp(grouped)).first()).toBeVisible();
  });
});
