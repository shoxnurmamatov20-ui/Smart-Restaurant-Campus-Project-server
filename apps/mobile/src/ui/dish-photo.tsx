import { useState, type ReactNode } from 'react';
import { Image, PixelRatio, StyleSheet, View } from 'react-native';
import { pick, type DishImage } from '@restaurant/surfaces/media/image';

/**
 * A dish photograph, drawn the same way in every slot the four surfaces give
 * one — the native half of `apps/web/src/components/dish-photo.tsx`.
 *
 * **One file for the box, not the largest file.** The server keeps every
 * photograph at three widths (`thumb` 160 · `card` 640 · `full` 1600) and
 * `pick()` asks for the narrowest one that still covers this box at this
 * screen's density: a 74pt row thumbnail on a 2× phone fetches `thumb`, the
 * dish sheet's full-width band on a 3× phone fetches `full`. A browser does the
 * same arithmetic from `srcset`; React Native has no `srcset`, so the phone
 * does it here, once.
 *
 * **Blur to picture, never grey to picture.** `image.placeholder` is a 16px
 * WebP of the photograph itself, inline in the JSON as a data URI. It is drawn
 * under the real file until that file has decoded, so the slot fills with the
 * photograph's own colours the moment the row appears rather than sitting as a
 * grey rectangle that reads as a stuck load. A photograph the platform does
 * not hold — an address a restaurant typed in — has no placeholder and no
 * sizes, and draws through the same path at its one address.
 *
 * **The slot stays the caller's.** Every surface already draws its own empty
 * slot — the muted square with the picture mark, the marketplace's flat tint —
 * at the design's own size, border and radius, and a dish with no photograph
 * has to look exactly as it did. So `fallback` is returned as it is, with no
 * wrapper around it, and `fill` lets the photograph lie inside an existing
 * slot under whatever that slot keeps on top of it: the sheet's back control,
 * the marketplace's sold-out veil and its add button.
 *
 * A file that fails to load falls back too. The alternative — the placeholder
 * blur left standing — is the grey rectangle again, in colour.
 */
export function DishPhoto({
  image,
  width,
  height = width,
  radius = 0,
  fill = false,
  fallback,
  accessibilityLabel,
}: {
  image: DishImage | null;
  /**
   * The box's width in CSS pixels — what the request is sized against. In
   * `fill` mode it is a hint only: the band's width as best the caller knows
   * it (the window, half the window less the gutters) — a few points either
   * way picks the same file.
   */
  width: number;
  /** The box's height. Square when left out. */
  height?: number;
  /**
   * The corner the photograph is clipped to. A slot that clips its own
   * children (`overflow: 'hidden'` on a rounded, bordered square) needs none;
   * one that does not passes its inner radius — the border's, less the
   * border.
   */
  radius?: number;
  /**
   * Lie inside the parent instead of sizing the box — absolutely positioned
   * over the parent's padding box, under any sibling drawn after it. For the
   * slots that already exist and hold a control of their own.
   */
  fill?: boolean;
  /** What the slot draws when there is no photograph, exactly as before. */
  fallback: ReactNode;
  /**
   * The dish name, where the photograph stands alone — a sheet's band. Left
   * out in a row the reader already names the dish in, so the picture is
   * decorative and silent rather than the name read twice.
   */
  accessibilityLabel?: string;
}) {
  /*
   * Which address has finished, and how. Keyed by the address rather than a
   * bare boolean so a row that is handed a different dish — a list reusing the
   * component, a sheet reopened on another plate — starts over instead of
   * showing the new file as already loaded, or the old failure as the new
   * file's.
   */
  const [settled, setSettled] = useState<{ uri: string; ok: boolean } | null>(null);

  if (image === null) return <>{fallback}</>;

  const uri = pick(image, width, PixelRatio.get());
  const state = settled !== null && settled.uri === uri ? settled : null;

  if (state !== null && !state.ok) return <>{fallback}</>;

  const loaded = state !== null && state.ok;
  const decorative = accessibilityLabel === undefined;

  return (
    <View
      style={[fill ? StyleSheet.absoluteFill : { width, height }, { borderRadius: radius }, s.box]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    >
      {image.placeholder === null || loaded ? null : (
        <Image
          source={{ uri: image.placeholder }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessible={false}
          accessibilityIgnoresInvertColors
        />
      )}

      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoad={() => setSettled({ uri, ok: true })}
        onError={() => setSettled({ uri, ok: false })}
        accessible={false}
        /* A photograph of food is not a control: iOS Smart Invert leaves it
           alone, as the slots this replaces already asked. */
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const s = StyleSheet.create({
  box: { overflow: 'hidden' },
});
