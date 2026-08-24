import { expect, test } from '@playwright/test';

/**
 * The front door.
 *
 * Sign-in goes through a Next route handler that calls the API from Node and
 * writes two cookies — the token and the role. Without the role cookie the
 * middleware assumes owner and opens every screen to a waiter; that was a real
 * bug, and `route.test.ts` guards the handler. This guards the whole journey:
 * a person types, presses, and lands where their role lands.
 *
 * Skipped when no API answers on this box — the form then has nothing to sign
 * into, and a test that passes by faking the server would not be this test.
 */
test.describe('sign-in', () => {
  test.beforeEach(async ({ request }) => {
    const health = await request.get('/api/health').catch(() => null);
    test.skip(!health || !health.ok(), 'no API on this host');
  });

  test('a wrong password is refused on the form, not with a 500', async ({ page }) => {
    await page.goto('/login');

    await page
      .getByLabel(/pochta|email/i)
      .first()
      .fill('nobody@example.uz');
    await page
      .getByLabel(/parol|password/i)
      .first()
      .fill('definitely-wrong');
    await page
      .getByRole('button', { name: /kirish|sign in/i })
      .first()
      .click();

    // Still on the sign-in page, and something said no.
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page
        .getByRole('alert')
        .or(page.getByText(/noto‘g‘ri|xato|invalid/i))
        .first(),
    ).toBeVisible();
  });
});
