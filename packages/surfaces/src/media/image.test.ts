import { describe, expect, it } from 'vitest';

import { aspectOf, dishImageFrom, pick, srcSetOf, type ImagePayload } from './image';

/** The shape `ImageSet::toArray()` writes, for a 1600×1200 upload. */
const payload: ImagePayload = {
  src: 'https://cdn.test/storage/dish/fe/6c/1/42/abc-full.webp',
  width: 1600,
  height: 1200,
  placeholder: 'data:image/webp;base64,AAAA',
  sizes: {
    thumb: {
      url: 'https://cdn.test/storage/dish/fe/6c/1/42/abc-thumb.webp',
      width: 160,
      height: 120,
    },
    card: {
      url: 'https://cdn.test/storage/dish/fe/6c/1/42/abc-card.webp',
      width: 640,
      height: 480,
    },
    full: {
      url: 'https://cdn.test/storage/dish/fe/6c/1/42/abc-full.webp',
      width: 1600,
      height: 1200,
    },
  },
};

describe('dishImageFrom', () => {
  it('turns the set into one photograph with a srcset, narrowest first', () => {
    const image = dishImageFrom(payload, null);

    expect(image).not.toBeNull();
    expect(image?.src).toBe(payload.src);
    expect(image?.width).toBe(1600);
    expect(image?.placeholder).toBe('data:image/webp;base64,AAAA');
    expect(image?.srcSet).toBe(
      [
        'https://cdn.test/storage/dish/fe/6c/1/42/abc-thumb.webp 160w',
        'https://cdn.test/storage/dish/fe/6c/1/42/abc-card.webp 640w',
        'https://cdn.test/storage/dish/fe/6c/1/42/abc-full.webp 1600w',
      ].join(', '),
    );
    expect(image?.sizes.thumb?.width).toBe(160);
  });

  it('prefers the set over a typed-in address when both arrive', () => {
    expect(dishImageFrom(payload, 'https://elsewhere.test/osh.jpg')?.src).toBe(payload.src);
  });

  it('still draws an address somebody typed in, as a set of one', () => {
    const image = dishImageFrom(null, 'https://elsewhere.test/osh.jpg');

    expect(image).toEqual({
      src: 'https://elsewhere.test/osh.jpg',
      width: 0,
      height: 0,
      placeholder: null,
      srcSet: '',
      sizes: {},
    });
  });

  it('is null when there is nothing to draw', () => {
    expect(dishImageFrom(null, null)).toBeNull();
    expect(dishImageFrom(undefined, undefined)).toBeNull();
    expect(dishImageFrom(null, '')).toBeNull();
    expect(dishImageFrom({ ...payload, src: '' }, null)).toBeNull();
  });

  it('ignores a size it does not know and a size with no address', () => {
    const image = dishImageFrom(
      {
        ...payload,
        sizes: {
          ...payload.sizes,
          poster: { url: 'https://cdn.test/poster.webp', width: 3000, height: 2000 },
          card: { url: '', width: 640, height: 480 },
        },
      },
      null,
    );

    expect(Object.keys(image?.sizes ?? {})).toEqual(['thumb', 'full']);
    expect(image?.srcSet).not.toContain('poster');
  });

  it('treats an empty placeholder as none', () => {
    expect(dishImageFrom({ ...payload, placeholder: '' }, null)?.placeholder).toBeNull();
    expect(dishImageFrom({ ...payload, placeholder: undefined }, null)?.placeholder).toBeNull();
  });
});

describe('srcSetOf', () => {
  it('is empty for a set of one — a single size is a src, not a choice', () => {
    expect(srcSetOf({ full: { url: 'x', width: 800, height: 600 } })).toBe('');
    expect(srcSetOf({})).toBe('');
  });

  it('declares the stored width, which is not always the configured one', () => {
    // A 300px upload is stored at 300 for every rendition wider than that.
    expect(
      srcSetOf({
        thumb: { url: 't', width: 160, height: 107 },
        card: { url: 'c', width: 300, height: 200 },
      }),
    ).toBe('t 160w, c 300w');
  });
});

describe('pick', () => {
  const image = dishImageFrom(payload, null)!;

  it('asks for the narrowest size that covers the box at the screen density', () => {
    expect(pick(image, 48, 3)).toBe(payload.sizes.thumb?.url); // 144 needed
    expect(pick(image, 96, 2)).toBe(payload.sizes.card?.url); // 192 needed
    expect(pick(image, 390, 3)).toBe(payload.sizes.full?.url); // 1170 needed
  });

  it('answers the largest when nothing covers the box', () => {
    expect(pick(image, 1200, 3)).toBe(payload.src);
  });

  it('answers the only address of a typed-in picture', () => {
    expect(pick(dishImageFrom(null, 'https://elsewhere.test/osh.jpg')!, 48)).toBe(
      'https://elsewhere.test/osh.jpg',
    );
  });
});

describe('aspectOf', () => {
  it('is the photograph’s own ratio, or null when it is not known', () => {
    expect(aspectOf(dishImageFrom(payload, null))).toBeCloseTo(4 / 3);
    expect(aspectOf(dishImageFrom(null, 'https://elsewhere.test/osh.jpg'))).toBeNull();
    expect(aspectOf(null)).toBeNull();
  });
});
