import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SIGN_IN_HREF } from './site-data';

/**
 * The public site's one outgoing link has to land on a page.
 *
 * `nav.test.ts` makes the same argument for the console sidebar: a link with no
 * page is a 404 somebody finds at the worst moment. Here it is worse than a
 * 404, because the failure that prompted this test was silent — Kirish pointed
 * at `#login`, an anchor that scrolls to the illustration further down this
 * same page, so the browser went somewhere, drew a sign-in form, and accepted
 * a password that no code was listening for.
 *
 * Checking the route exists on disk rather than asserting the literal `/login`
 * keeps the test useful if the door is ever renamed: move the page and this
 * fails until SIGN_IN_HREF follows it.
 */

/** `src/app`, from this file. */
const APP = join(import.meta.dirname, '..');

describe('SIGN_IN_HREF', () => {
  it('leaves this page rather than scrolling down it', () => {
    expect(SIGN_IN_HREF.startsWith('/')).toBe(true);
    expect(SIGN_IN_HREF).not.toContain('#');
  });

  it('points at a route that exists', () => {
    // The sign-in page is inside the (auth) route group, which the URL does not
    // carry — so the folder is looked up under it rather than at the app root.
    expect(existsSync(join(APP, '(auth)', SIGN_IN_HREF, 'page.tsx'))).toBe(true);
  });
});
