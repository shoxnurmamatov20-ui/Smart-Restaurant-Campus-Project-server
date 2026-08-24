import { describe, expect, it } from 'vitest';

import type { GuestDish, GuestMenu } from '../guest/menu-data';
import { tgMenuFrom } from './live';

/**
 * The mini app's menu, from the restaurant's own card.
 *
 * The property worth protecting is the **id**: the cart's
 * `placeOrderPayloadFrom` refuses a basket whose dish ids are not numbers, so a
 * fixture menu made the mini app's whole checkout answer `not_orderable`. A
 * numeric id surviving this mapping is what makes the surface able to sell.
 */
function dish(partial: Partial<GuestDish> & { id: string; name: string }): GuestDish {
  return {
    description: '',
    price: 4_500_000,
    weightGrams: null,
    calories: null,
    allergens: [],
    vegetarian: false,
    spicy: false,
    imageUrl: null,
    image: null,
    categoryId: 'c1',
    soldOut: false,
    questions: [],
    ...partial,
  } as GuestDish;
}

const menu: GuestMenu = {
  restaurant: { name: 'Osh Xona', slug: 'osh-xona' },
  categories: [
    { id: '11', name: 'Osh', dishes: [dish({ id: '501', name: 'Toshkent oshi' })] },
    { id: '12', name: 'Grill', dishes: [] },
    {
      id: '13',
      name: 'Salatlar',
      dishes: [dish({ id: '502', name: 'Achchiq-chuchuk', soldOut: true })],
    },
  ],
  live: true,
};

describe('tgMenuFrom', () => {
  it('keeps the numeric dish id the checkout is keyed on', () => {
    expect(tgMenuFrom(menu).dishes[0]?.id).toBe('501');
  });

  it('drops a heading with nothing sellable under it', () => {
    // A chip that filters to an empty screen is a chip a guest taps twice and
    // then leaves.
    expect(tgMenuFrom(menu).categories.map((row) => row.id)).toEqual(['11', '13']);
  });

  it('keeps a stopped dish, so the guest is told "finished" rather than nothing', () => {
    const stopped = tgMenuFrom(menu).dishes.find((row) => row.id === '502');

    expect(stopped?.soldOut).toBe(true);
  });

  it('re-uses the name the API resolved rather than inventing two translations', () => {
    const first = tgMenuFrom(menu).dishes[0];

    expect(first?.name.uz).toBe('Toshkent oshi');
    expect(first?.name.ru).toBe('Toshkent oshi');
  });

  it('files every dish under the heading it arrived in', () => {
    expect(tgMenuFrom(menu).dishes.map((row) => row.categoryId)).toEqual(['11', '13']);
  });

  it('carries the photograph set through, and null when there is none', () => {
    /*
     * The set rather than `imageUrl`: a 64px row that draws the largest file
     * is the download this mapping exists to avoid. Null — not undefined — on
     * a live dish without one, because undefined is what marks a fixture.
     */
    const image: GuestDish['image'] = {
      src: 'https://cdn.example/osh-full.webp',
      width: 1600,
      height: 1200,
      placeholder: null,
      srcSet: 'https://cdn.example/osh-thumb.webp 160w, https://cdn.example/osh-full.webp 1600w',
      sizes: {
        thumb: { url: 'https://cdn.example/osh-thumb.webp', width: 160, height: 120 },
        full: { url: 'https://cdn.example/osh-full.webp', width: 1600, height: 1200 },
      },
    };

    const photographed: GuestMenu = {
      ...menu,
      categories: [
        { id: '11', name: 'Osh', dishes: [dish({ id: '501', name: 'Toshkent oshi', image })] },
      ],
    };

    expect(tgMenuFrom(photographed).dishes[0]?.image).toBe(image);
    expect(tgMenuFrom(menu).dishes[0]?.image).toBeNull();
  });
});
