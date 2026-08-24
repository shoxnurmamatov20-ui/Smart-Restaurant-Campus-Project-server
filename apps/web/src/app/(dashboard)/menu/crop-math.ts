/**
 * The arithmetic of the crop frame — pure, so the part that is easy to get
 * wrong by one sign can be tested without a browser.
 *
 * The model: a photograph of `iw × ih` pixels, turned by a quarter-turn
 * `rotation` (0 · 90 · 180 · 270), drawn at `scale` display pixels per image
 * pixel, centred on the frame's centre plus `offset`. The frame is `fw × fh`
 * display pixels and has to be covered completely — a crop with a blank corner
 * is a menu with a blank corner.
 *
 * Everything below works in the *turned* photograph's coordinates, which is
 * the only frame of reference in which a crop is a plain rectangle. The one
 * place the turn itself matters is the export, where the canvas is rotated
 * before the untouched bitmap is drawn onto it.
 */

export type Quarter = 0 | 90 | 180 | 270;

export type Offset = { x: number; y: number };

export type Size = { width: number; height: number };

/** The photograph's size once turned: a quarter-turn swaps the two sides. */
export function turnedSize(image: Size, rotation: Quarter): Size {
  return rotation % 180 === 0
    ? { width: image.width, height: image.height }
    : { width: image.height, height: image.width };
}

/**
 * The smallest scale at which the turned photograph still covers the frame —
 * the floor under every zoom control.
 */
export function coverScale(turned: Size, frame: Size): number {
  return Math.max(
    frame.width / Math.max(1, turned.width),
    frame.height / Math.max(1, turned.height),
  );
}

/**
 * Keep the frame inside the photograph.
 *
 * With the photograph centred, each edge may move at most half the overhang —
 * the part of the scaled photograph that lies outside the frame on that axis.
 * No overhang on an axis (the photograph exactly covers it) pins that axis at
 * zero, which is what stops a drag on a tightly fitted picture from revealing
 * the frame's background.
 */
export function clampOffset(offset: Offset, turned: Size, frame: Size, scale: number): Offset {
  const slackX = Math.max(0, (turned.width * scale - frame.width) / 2);
  const slackY = Math.max(0, (turned.height * scale - frame.height) / 2);

  // `+ 0` folds the `-0` that `Math.max(-0, …)` can answer into a plain zero:
  // harmless in arithmetic, but it is what a strict equality in a test and a
  // `transform` string both see.
  return {
    x: Math.min(slackX, Math.max(-slackX, offset.x)) + 0,
    y: Math.min(slackY, Math.max(-slackY, offset.y)) + 0,
  };
}

/**
 * Where the frame sits on the turned photograph, in its own pixels.
 *
 * The photograph's centre is at the frame's centre plus the offset, so the
 * frame's top-left in photograph pixels is the photograph's half-size, less
 * the offset, less half the frame — all divided by the scale.
 */
export function cropRect(
  turned: Size,
  frame: Size,
  scale: number,
  offset: Offset,
): { x: number; y: number; width: number; height: number } {
  return {
    x: (turned.width * scale) / 2 - offset.x - frame.width / 2,
    y: (turned.height * scale) / 2 - offset.y - frame.height / 2,
    width: frame.width,
    height: frame.height,
  };
}

/**
 * The pixels the export should have.
 *
 * Never more than the photograph has in the crop (no invented detail), and
 * never more than `maxEdge` on the long side — the server keeps 1600 at most,
 * and a little headroom above that is all a second resample needs.
 */
export function outputSize(crop: Size, scale: number, maxEdge: number): Size {
  const sourceWidth = crop.width / scale;
  const sourceHeight = crop.height / scale;
  const longest = Math.max(sourceWidth, sourceHeight);
  const factor = Math.min(1, maxEdge / Math.max(1, longest));

  return {
    width: Math.max(1, Math.round(sourceWidth * factor)),
    height: Math.max(1, Math.round(sourceHeight * factor)),
  };
}

/**
 * The frame that fits a box at an aspect ratio — as large as the box allows,
 * so the person crops on the biggest preview the drawer has room for.
 */
export function frameFor(box: Size, aspect: number): Size {
  const byWidth = { width: box.width, height: box.width / aspect };

  if (byWidth.height <= box.height) return byWidth;

  return { width: box.height * aspect, height: box.height };
}

/**
 * Zoom about the frame's centre and keep the picture over the frame.
 *
 * The offset scales with the picture — a point that was 40px left of centre
 * at 1× is 80px left at 2× — which is what makes the centre of the frame stay
 * on the same part of the dish while the slider moves.
 */
export function zoomTo(
  nextScale: number,
  current: { scale: number; offset: Offset },
  turned: Size,
  frame: Size,
): { scale: number; offset: Offset } {
  const floor = coverScale(turned, frame);
  const scale = Math.max(floor, nextScale);
  const ratio = scale / Math.max(1e-9, current.scale);

  return {
    scale,
    offset: clampOffset(
      { x: current.offset.x * ratio, y: current.offset.y * ratio },
      turned,
      frame,
      scale,
    ),
  };
}

export function turn(rotation: Quarter, by: 90 | -90): Quarter {
  return ((((rotation + by) % 360) + 360) % 360) as Quarter;
}
