import { describe, expect, it } from 'vitest';

import { placeNameOf } from './session';

describe('placeNameOf', () => {
  const tenant = {
    id: 1,
    name: 'Osh Markazi',
    slug: 'osh',
    locale: 'uz',
    timezone: 'Asia/Tashkent',
  };

  it('is the pinned venue for a branch manager', () => {
    expect(
      placeNameOf({
        tenant,
        branch: { id: 3, name: 'Sergeli', slug: 'sergeli' },
        branch_pinned: true,
      }),
    ).toBe('Sergeli');
  });

  it('is the restaurant for an owner reading the whole business', () => {
    expect(
      placeNameOf({
        tenant,
        branch: { id: 3, name: 'Sergeli', slug: 'sergeli' },
        branch_pinned: false,
      }),
    ).toBe('Osh Markazi');
  });

  it('does not crash for a platform operator, who belongs to no restaurant', () => {
    // `tenant: null` is what the API answers for a super-admin; the first
    // version read `.name` off it and every page answered 500.
    expect(placeNameOf({ tenant: null, branch: null, branch_pinned: false })).toBe(
      'Smart Restaurant',
    );
  });
});
