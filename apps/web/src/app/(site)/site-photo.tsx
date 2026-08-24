import type { DishImage } from '@restaurant/surfaces/media/image';

import { DishPhoto } from '@/components/dish-photo';

/**
 * A dish photograph, or the panel that holds its place.
 *
 * FOUNDATIONS §12: "Food surfaces are photo-led — the images do roughly 70% of
 * the work." The surface was rendering the tinted `.site-shot` panel everywhere
 * and never reading `image_url`, which the public menu endpoint has been
 * sending all along — so the one thing this page sells with was switched off.
 *
 * Now the whole size set, through the shared `DishPhoto`: the browser picks
 * `thumb` for a 96px menu row and `full` for the hero from one `srcset`, with
 * the 16px placeholder blur painted under it. The first cut of this file wrote
 * `src={image_url}` — the 1600px file — into every box on the page, and a menu
 * of thirty rows was thirty full-size downloads to paint thirty 96px squares.
 * `sizes` is the box in CSS, which a caller knows and this file cannot guess;
 * the default is the widest box the site draws, so a caller that forgets
 * over-fetches rather than getting a blurred picture.
 *
 * `eager` only for the hero: a menu page carries thirty of these and only the
 * first screenful is worth blocking on. Why a plain `<img>` and not
 * `next/image` is explained once, on `DishPhoto`.
 */
export function SitePhoto({
  image,
  alt,
  sizes = '(min-width: 900px) 420px, 100vw',
  className = '',
  eager = false,
}: {
  image: DishImage | null;
  /** The dish name. Empty only where a caller has already named the image. */
  alt: string;
  /** The box's width in CSS — `'96px'` for a row thumb, `'100vw'` for a band. */
  sizes?: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <DishPhoto
      image={image}
      alt={alt}
      sizes={sizes}
      eager={eager}
      className={`size-full ${className}`}
      fallback={<span aria-hidden data-shot className={`site-shot block ${className}`} />}
    />
  );
}
