/**
 * A photograph, as the API sends it and as a surface draws it.
 *
 * The server keeps every dish photograph at three widths — `thumb` (160),
 * `card` (640) and `full` (1600) — and says so in one object
 * (`App\Support\Media\ImageSet::toArray()`). This is the one place the two
 * products read that object, so the till, the guest menu, the Telegram app and
 * the phone agree on which size a 48px tile asks for and which the dish sheet
 * does. Before this, every surface read `image_url` — the largest file — and a
 * menu of two hundred dishes was two hundred full-size downloads to paint two
 * hundred thumbnails.
 *
 * Pure TypeScript: no DOM, no `fetch`, no React. The phone imports it too.
 */

/** The sizes the server keeps, narrowest first. */
export const RENDITIONS = ['thumb', 'card', 'full'] as const;

export type Rendition = (typeof RENDITIONS)[number];

/** One size, with its address and the box it fills. */
export type ImageSize = {
  url: string;
  width: number;
  height: number;
};

/** `image` on a dish, as `ImageSet::toArray()` writes it. */
export type ImagePayload = {
  src: string;
  width: number;
  height: number;
  placeholder?: string | null;
  sizes: Record<string, ImageSize | undefined>;
};

/**
 * A photograph a surface can draw.
 *
 * `src` is the one address for a reader that wants one; `srcSet` is the whole
 * set for a browser to choose from; `sizes` is the set by name for a client
 * that chooses itself (the phone). `width`/`height` describe the photograph —
 * what a box is reserved with before the bytes arrive — and `placeholder` is
 * the inline 16px blur painted under it until they do.
 *
 * A photograph the platform does not hold — an address a restaurant typed in
 * — is the same type with `srcSet` empty and no sizes, so every surface has
 * one code path and an external picture still draws.
 */
export type DishImage = {
  src: string;
  width: number;
  height: number;
  placeholder: string | null;
  srcSet: string;
  sizes: Partial<Record<Rendition, ImageSize>>;
};

/**
 * From the API's two fields to one photograph, or null when there is none.
 *
 * `image` wins when present — it is the platform's own set. `imageUrl` alone
 * is an address somebody typed in, and it is kept drawable for the same reason
 * the column stayed: a restaurant whose pictures live elsewhere is still a
 * restaurant with pictures.
 */
export function dishImageFrom(
  image: ImagePayload | null | undefined,
  imageUrl?: string | null,
): DishImage | null {
  if (image !== null && image !== undefined && typeof image.src === 'string' && image.src !== '') {
    const sizes: Partial<Record<Rendition, ImageSize>> = {};

    for (const name of RENDITIONS) {
      const size = image.sizes?.[name];

      if (size !== undefined && typeof size.url === 'string' && size.url !== '') {
        sizes[name] = { url: size.url, width: size.width, height: size.height };
      }
    }

    return {
      src: image.src,
      width: image.width,
      height: image.height,
      placeholder:
        typeof image.placeholder === 'string' && image.placeholder !== ''
          ? image.placeholder
          : null,
      srcSet: srcSetOf(sizes),
      sizes,
    };
  }

  if (typeof imageUrl === 'string' && imageUrl !== '') {
    return { src: imageUrl, width: 0, height: 0, placeholder: null, srcSet: '', sizes: {} };
  }

  return null;
}

/**
 * `url 160w, url 640w, url 1600w` — every size the set holds, narrowest first.
 *
 * Widths are the file's own, not the configured target: a photograph narrower
 * than a rendition is stored at its own width and declared at it, which is what
 * keeps the browser from asking for pixels that do not exist.
 */
export function srcSetOf(sizes: Partial<Record<Rendition, ImageSize>>): string {
  const parts: string[] = [];

  for (const name of RENDITIONS) {
    const size = sizes[name];

    if (size !== undefined && size.width > 0) {
      parts.push(`${size.url} ${size.width}w`);
    }
  }

  // One entry is not a choice: a set with a single size is just a `src`.
  return parts.length > 1 ? parts.join(', ') : '';
}

/**
 * The address for a box of a given width, in CSS pixels, on a screen of a
 * given density.
 *
 * For the clients that choose themselves — the phone, a `background-image`,
 * a `<canvas>` — where the browser's `srcset` arithmetic is not available.
 * Picks the narrowest rendition that still covers the box at that density,
 * and the largest when none does; a 48px tile at 3× asks for 144 and gets
 * `thumb`, a full-width sheet on a 390px phone at 3× asks for 1170 and gets
 * `full`.
 */
export function pick(image: DishImage, cssWidth: number, density = 2): string {
  const needed = Math.ceil(cssWidth * density);

  for (const name of RENDITIONS) {
    const size = image.sizes[name];

    if (size !== undefined && size.width >= needed) {
      return size.url;
    }
  }

  return image.src;
}

/** The aspect ratio to reserve, or null when the photograph's size is unknown. */
export function aspectOf(image: DishImage | null): number | null {
  if (image === null || image.width <= 0 || image.height <= 0) return null;

  return image.width / image.height;
}
