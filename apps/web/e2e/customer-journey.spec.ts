import { expect, test, type Page } from '@playwright/test';

/**
 * The customer app, from a phone number to a kitchen docket.
 *
 * Six modules were built separately and each was green on its own; the chain
 * between them was broken in three places that no per-module suite could see —
 * a promo code nobody read, an order paid online that never reached a pass, and
 * a history screen that drew a fixture under a live figure. `CustomerJourneyTest`
 * covers the same ground on the server. This one covers the half the server
 * cannot: whether a person holding a phone can actually get from one end to the
 * other, through the screens.
 *
 * ---------------------------------------------------------------------------
 * The sign-in code, and why a fixed one had to exist
 *
 * The code never travels back over the wire — that is `OtpCredentials`' first
 * rule and it is not being relaxed for a test. Locally it goes to
 * `storage/logs/laravel.log` through `LogSmsSender`, which this runner cannot
 * read: in CI the browser and the API are not on the same box, and a test that
 * parses a log file breaks the day somebody rewords a log line.
 *
 * So the API accepts one fixed code, `OTP_TEST_CODE`, and only in `local` and
 * `testing`. The environment check is not configurable and
 * `CustomerJourneyTest::test_a_fixed_sign_in_code_cannot_exist_in_production`
 * is the lock on it. Here it is read from the environment and the whole file
 * skips without it — a run against a server that has no fixed code should skip,
 * never fail, and never silently pass by faking a session.
 *
 * ---------------------------------------------------------------------------
 * What is asserted, and what deliberately is not
 *
 * Asserted: the basket survives a navigation, the checkout produces a REAL bill
 * number, and the tracking screen shows that number with a rung reached. Those
 * are the joins.
 *
 * Not asserted: prices. `pricing.test.ts` already locks the browser's
 * arithmetic against the server's, from figures taken out of PHP, and
 * re-checking a total through a browser would be a slower copy of a test that
 * already exists — one that fails for rendering reasons rather than for
 * arithmetic ones.
 */

/** The four digits the API will accept for any number, in a test environment. */
const CODE = process.env.OTP_TEST_CODE ?? '';

/** A number nobody's seeder owns, so a re-run is a new guest each time. */
const PHONE = '90 700 61 42';

test.describe('the customer journey', () => {
  test.beforeEach(async ({ request }) => {
    const health = await request.get('/api/health').catch(() => null);

    test.skip(!health || !health.ok(), 'no API on this host');
    test.skip(CODE === '', 'OTP_TEST_CODE is not set — see the file note');
  });

  test('a guest signs in, orders, and watches it on the tracking screen', async ({ page }) => {
    await signIn(page);

    // ---------------------------------------------------------------- menu
    await page.goto('/customer/menu');

    /*
     * A live menu or nothing. The menu screen draws a banner when the API did
     * not answer, and the rest of this test would then be measuring the
     * fixtures — which is the one way it could pass while the chain is broken.
     */
    const firstDish = page.getByRole('button', { name: /so'm|сум/i }).first();

    await expect(firstDish, 'the menu drew no dishes').toBeVisible({ timeout: 15_000 });
    await firstDish.click();

    // The sheet's own add button carries the price, which is how it is told
    // apart from the dish tiles behind it.
    const add = page.getByRole('button', { name: /savatga|в корзину|add to/i }).first();

    await expect(add).toBeVisible();
    await add.click();

    // ---------------------------------------------------------------- cart
    await page.goto('/customer/cart');

    // The basket survived a navigation — it lives above the screens, in the
    // layout's provider, and this is the assertion that says so.
    await expect(page.getByRole('link', { name: /to'lov|оплат|pay/i }).first()).toBeVisible();
    await page
      .getByRole('link', { name: /to'lov|оплат|pay/i })
      .first()
      .click();

    // ----------------------------------------------------------- checkout
    await expect(page).toHaveURL(/\/customer\/pay/);

    // Takeaway, so the order needs no address book and no courier: the seam
    // being tested is the bill, not the delivery.
    await page.goto('/customer/cart');
    const pickup = page.getByRole('button', { name: /olib ketish|самовывоз|pickup/i }).first();

    if (await pickup.isVisible().catch(() => false)) await pickup.click();

    await page.goto('/customer/pay');

    const place = page.getByRole('button', { name: /buyurtma berish|оформить|place the order/i });

    await expect(place).toBeVisible();

    /*
     * A disabled button here means the app decided this basket cannot be
     * ordered, and it prints the reason above itself. Skipping rather than
     * failing when the reason is a demo catalogue: a box with no restaurant
     * seeded is a box this test has nothing to say about, and the second test
     * below is the one that covers that state deliberately.
     */
    if (!(await place.isEnabled())) {
      const why = (await page.locator('.cx-bar p').first().textContent()) ?? '';

      test.skip(/namunaviy|демо|sample/i.test(why), 'the menu is a sample on this host');

      expect(why, 'the checkout refused the basket').toBe('');
    }

    await place.click();

    // --------------------------------------------------------- tracking
    /*
     * The bill number in the URL is the whole point of this assertion. It is
     * minted by `Order::nextNumber()` inside the transaction that writes the
     * bill and the dockets, so a number here means a real order reached a real
     * kitchen — the join that used to be a hardcoded `№4471` on this button.
     */
    await page.waitForURL(/\/customer\/order\?n=/, { timeout: 20_000 });

    const number = new URL(page.url()).searchParams.get('n') ?? '';

    expect(number, 'the checkout produced no bill number').not.toBe('');

    await expect(page.getByText(`№${number}`).first()).toBeVisible();

    /*
     * And it is a real order rather than the sample. The screen labels the
     * design's demo delivery out loud precisely so a guest cannot mistake one
     * for the other; that label being absent is what proves the poll answered.
     */
    await expect(page.getByText(/namunaviy buyurtma|демо-заказ|sample order/i)).toHaveCount(0);
  });

  test('the checkout says why rather than failing at the last tap', async ({ page }) => {
    /*
     * The other half of the same seam, and the one a guest actually meets.
     *
     * A basket built from the demo catalogue cannot be ordered — the ids are
     * words and the server prices every line through the kitchen's own
     * catalogue. The screen has to say so ON the button rather than after it,
     * because a disabled control with no sentence beside it is the one outcome
     * worse than a control that fails.
     *
     * Skipped when the menu IS live, since then there is nothing to refuse.
     */
    await page.goto('/customer/menu');

    const sample = page.getByText(/namunaviy|демо|sample/i).first();
    const isSample = await sample.isVisible().catch(() => false);

    test.skip(!isSample, 'the menu is live — nothing to refuse');

    await page.goto('/customer/pay');

    await expect(page.getByText(/namunaviy menyu|демо-меню|sample menu/i).first()).toBeVisible();
  });
});

/**
 * Phone, code, and a session cookie the rest of the test rides on.
 *
 * The code goes in through the design's own twelve-key pad rather than through
 * a text input, because that is what the screen has: `Mijoz ilovasi.dc.html`
 * draws four cells and a keypad, and a test that typed into a hidden field
 * would pass over a keypad that had stopped working.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto('/customer/sign-in');

  await page.getByLabel(/telefon raqami|номер телефона|phone number/i).fill(PHONE);
  await page.getByRole('button', { name: /kod yuborish|отправить код|send the code/i }).click();

  // The code step, which only appears once the API accepted the number.
  await expect(page.getByRole('group', { name: /sms/i })).toBeVisible({ timeout: 15_000 });

  for (const digit of CODE) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }

  // The fourth digit submits itself after 240ms — the design's own delay, so
  // the last cell is seen to fill before the screen moves.
  await page.waitForURL(/\/customer(\?|$)/, { timeout: 15_000 });
}
