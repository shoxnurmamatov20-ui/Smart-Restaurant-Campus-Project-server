import { expect, test } from '@playwright/test';

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

      // Redirected to the sign-in, never rendered.
      expect(new URL(page.url()).pathname, `${path} rendered for a stranger`).toBe('/login');
      expect(response?.status()).toBeLessThan(500);
    }
  });

  test('the pricing page shows the plan in so‘m, not a hundred times cheaper', async ({ page }) => {
    await page.goto('/pricing');

    // 2 400 000 was rendered as 24 000 for weeks because the fixture held so‘m
    // where the formatter expected tiyin. The number is the regression test.
    // `Intl.NumberFormat('uz')` groups with U+00A0; the design writes U+2009.
    // Either is the right number; a plain space or nothing at all is not.
    await expect(
      page.getByText(/2[\u00a0\u2009\u202f ]400[\u00a0\u2009\u202f ]000/).first(),
    ).toBeVisible();
  });
});
