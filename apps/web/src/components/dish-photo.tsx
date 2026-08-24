import type { CSSProperties, ReactNode } from 'react';

import { type DishImage } from '@restaurant/surfaces/media/image';

/**
 * A dish photograph, drawn the same way on every surface that has one.
 *
 * One `<img>` with the whole `srcset` and a `sizes` hint, so the browser picks
 * the file for the box and the screen: a 48px till tile on a 2× tablet fetches
 * `thumb` (5 KB), a full-width sheet on a 3× phone fetches `full`. Before this
 * every surface wrote `src={image_url}` — the largest file — and a menu of
 * two hundred dishes was two hundred 120 KB downloads to paint two hundred
 * thumbnails, on the guest's mobile data.
 *
 * The inline placeholder is painted under the image as a background: a 16px
 * blur of the real photograph, a few hundred bytes, already in the JSON. The
 * box goes from blur to picture rather than from grey to picture, and because
 * `width`/`height` are set from the photograph's own dimensions the box never
 * reflows when the bytes land.
 *
 * **A plain `<img>`, not `next/image`.** The files live on whatever host a
 * tenant's bucket is published from — a CDN, MinIO, this box — and
 * `next/image` refuses any host not in `images.remotePatterns`, a list that
 * cannot be written ahead of time for a multi-tenant product. The optimiser
 * would also re-encode through this Node process what the API has already
 * sized and encoded once.
 *
 * `fallback` is what the surface draws when there is no photograph, because
 * each surface has its own stand-in (`.site-shot`, `.c-shot`, `.tg-shot`, the
 * till's monogram) and a shared grey box would be the wrong one everywhere.
 */
export function DishPhoto({
  image,
  alt,
  sizes = '100vw',
  className = '',
  style,
  eager = false,
  fallback = null,
  draggable = false,
}: {
  image: DishImage | null;
  /** The dish name. Empty only where a caller has already named the picture. */
  alt: string;
  /**
   * The `sizes` attribute — the box's width in CSS, so the browser can choose
   * a file before layout. `'48px'` for a tile, `'(min-width: 640px) 96px,
   * 74px'` for a row that grows, `'100vw'` for a sheet.
   */
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  /** Above the fold — the sheet's hero, the site's first card. */
  eager?: boolean;
  /** What to draw when there is no photograph. */
  fallback?: ReactNode;
  draggable?: boolean;
}) {
  if (image === null) {
    return <>{fallback}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the note above
    <img
      src={image.src}
      srcSet={image.srcSet === '' ? undefined : image.srcSet}
      sizes={image.srcSet === '' ? undefined : sizes}
      alt={alt}
      width={image.width > 0 ? image.width : undefined}
      height={image.height > 0 ? image.height : undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      draggable={draggable}
      className={`bg-bg-muted block object-cover ${className}`}
      style={
        image.placeholder === null
          ? style
          : {
              ...style,
              backgroundImage: `url(${image.placeholder})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
      }
    />
  );
}
