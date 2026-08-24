import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/* `next/navigation` outside the router: the settings rows use it, and this test
   is about what the screen may show, not about navigating away from it. */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/customer/profile',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../customer-client', () => ({
  readProfile: vi.fn(async () => ({ ok: false as const, error: 'unauthenticated' })),
  myOrders: vi.fn(async () => ({ ok: false as const, error: 'unauthenticated' })),
  listAddresses: vi.fn(async () => ({ ok: false as const, error: 'unauthenticated' })),
  addAddress: vi.fn(),
  removeAddress: vi.fn(),
  signOut: vi.fn(),
  reportProblem: vi.fn(),
}));

import { CartProvider } from '../../cart-store';
import { ProfileBoard } from './profile-board';

/** The board reads the basket for its dock badge, so it needs the provider. */
const board = () =>
  render(
    <CartProvider>
      <ProfileBoard lang="uz" signedIn={false} />
    </CartProvider>,
  );

/**
 * What a phone with nobody signed in may show.
 *
 * This screen drew the design's guest — a name, a phone number, eleven orders,
 * 3.6 million spent, 2 480 points and a home address with a door code — to
 * anybody who opened it. Not a cosmetic fixture: a stranger reads it as their
 * own account, and the address belongs to a person who exists in a design file.
 *
 * `me === null` used to mean two things at once — "the answer has not come back
 * yet" and "there is nobody here" — and the fixture stood in for both. The
 * session cookie is httpOnly, so only the server can tell them apart; `signedIn`
 * is that answer, and these tests are about what may be drawn without it.
 */
describe('the profile with nobody signed in', () => {
  it('shows an invitation instead of a person', () => {
    board();

    expect(screen.getByText('Bir daqiqada buyurtma')).toBeDefined();
    expect(screen.queryByText('Dilnoza Abdullayeva')).toBeNull();
    expect(screen.queryByText(/\+998 90 123/)).toBeNull();
  });

  it('shows no figures, no address book and no order history', () => {
    board();

    // The three figures, the addresses and the history are all about a person.
    expect(screen.queryByText('2 480')).toBeNull();
    expect(screen.queryByText(/47-xonadon/)).toBeNull();
    expect(screen.queryByText('Manzillar')).toBeNull();
    expect(screen.queryByText('Buyurtmalar tarixi')).toBeNull();
  });

  it('still offers the settings and the way in', () => {
    board();

    // Language and theme work signed out, and the sign-in row is the point.
    expect(screen.getAllByText('Sozlamalar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Telefon raqami').length).toBeGreaterThan(0);
  });
});
