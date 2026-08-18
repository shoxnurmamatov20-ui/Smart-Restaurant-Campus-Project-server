import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { uz } from '@/i18n/uz';

import { SignInPanel } from './sign-in-panel';

/**
 * The sign-in card has to be a door in both of its modes.
 *
 * It renders twice: on the marketing page as the illustration its section is
 * arguing, and at /login as the real front door. The difference is the `live`
 * prop, and the demonstration half is where this went wrong.
 *
 * With `live` unset the submit was `type="button"` carrying no handler at all,
 * so a visitor who filled the form in and pressed Kirish got **nothing** — no
 * navigation, no error, no hint that this particular form was a picture. The
 * header's Kirish linked to `#login`, which scrolls to exactly that card, so
 * the site's own front door led here. Reported as "I cannot log in", and the
 * whole login stack was healthy the entire time.
 *
 * So the rule both modes owe the reader: pressing the primary action must lead
 * somewhere. Live signs you in; demonstration hands you to /login.
 */

vi.mock('next-intl', () => ({ useMessages: () => uz }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

// next/link wants an app-router context that a unit test has no reason to
// build. The anchor is all these assertions read.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { enter } = uz.marketing.signin;

/**
 * Explicit, because `globals: false` in vitest.config.ts means testing-library
 * never gets the global `afterEach` its automatic cleanup hooks into. Without
 * this the first render is still in the document during the second, and the
 * queries below match two cards instead of one.
 */
afterEach(cleanup);

describe('SignInPanel', () => {
  it('sends the demonstration card to the real sign-in', () => {
    render(<SignInPanel />);

    const action = screen.getByRole('link', { name: enter });

    expect(action).toHaveProperty('href', expect.stringContaining('/login') as unknown);
  });

  it('submits its own form when live', () => {
    render(<SignInPanel live />);

    // A link here would mean /login had quietly become a page that navigates to
    // itself instead of signing anybody in.
    expect(screen.queryByRole('link', { name: enter })).toBeNull();
    expect(screen.getByRole('button', { name: enter })).toHaveProperty('type', 'submit');
  });
});
