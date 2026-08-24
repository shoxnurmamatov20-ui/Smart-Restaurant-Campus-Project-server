import { expect, test } from '@playwright/test';

/**
 * The five phone surfaces, on a phone.
 *
 * `design-rules.test.ts` asserts by reading source that every bottom dock pads
 * for the home indicator. This asserts it by measuring: nothing interactive
 * sits in the bottom 34 CSS pixels of the viewport, where iOS draws over it.
 */
const SURFACES = ['/customer', '/customer/menu', '/mp', '/qr/osh-xona/12', '/tg/menu'];

for (const path of SURFACES) {
  test(`${path} pads its pinned dock for the home indicator`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('body')).toBeVisible();

    /*
     * Measured by declaration, not by pixels. `env(safe-area-inset-bottom)`
     * is 0 in every emulated viewport Playwright has — the inset is something
     * only a real iPhone reports — so a pixel check would pass on a dock that
     * is wrong and fail on one that is right. What can be checked is that
     * every element pinned to the bottom of the viewport *asks* for the inset:
     * a dock that does not is the bug, whatever height it renders at here.
     */
    const offenders = await page.evaluate(() => {
      const bad: string[] = [];

      for (const el of document.querySelectorAll<HTMLElement>('*')) {
        const style = getComputedStyle(el);

        if (style.position !== 'fixed' && style.position !== 'sticky') continue;

        const box = el.getBoundingClientRect();
        const pinnedToBottom = Math.abs(box.bottom - window.innerHeight) < 2 && box.height > 0;

        if (!pinnedToBottom) continue;
        if (!el.querySelector('a, button')) continue;

        const declared = el.getAttribute('style') ?? '';

        if (!declared.includes('safe-area-inset-bottom')) {
          bad.push(
            `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`,
          );
        }
      }

      return bad;
    });

    expect(offenders, 'bottom-pinned docks that never ask for the inset').toEqual([]);
  });

  test(`${path} has no horizontal scroll`, async ({ page }) => {
    await page.goto(path);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(1);
  });
}
