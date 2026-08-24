import { describe, expect, it } from 'vitest';

import {
  clampOffset,
  coverScale,
  cropRect,
  frameFor,
  outputSize,
  turn,
  turnedSize,
  zoomTo,
} from './crop-math';

/** A landscape phone photograph, and the 4:3 frame the drawer shows it in. */
const photo = { width: 4000, height: 3000 };
const frame = { width: 320, height: 240 };

describe('turnedSize', () => {
  it('swaps the sides on a quarter-turn and keeps them on a half-turn', () => {
    expect(turnedSize(photo, 0)).toEqual(photo);
    expect(turnedSize(photo, 180)).toEqual(photo);
    expect(turnedSize(photo, 90)).toEqual({ width: 3000, height: 4000 });
    expect(turnedSize(photo, 270)).toEqual({ width: 3000, height: 4000 });
  });
});

describe('coverScale', () => {
  it('is the scale at which the tighter axis just fills the frame', () => {
    // 4000×3000 into 320×240 is the same ratio: both axes say 0.08.
    expect(coverScale(photo, frame)).toBeCloseTo(0.08);
    // Turned portrait into a landscape frame: the width decides, 320/3000.
    expect(coverScale(turnedSize(photo, 90), frame)).toBeCloseTo(320 / 3000);
  });
});

describe('clampOffset', () => {
  it('pins an axis with no overhang at zero', () => {
    // Exactly covering: no slack on either axis, any drag snaps back.
    expect(clampOffset({ x: 50, y: -30 }, photo, frame, 0.08)).toEqual({ x: 0, y: 0 });
  });

  it('allows half the overhang each way', () => {
    // At 0.16 the picture is 640×480 over a 320×240 frame: 160px of slack on
    // x, 120 on y, each way.
    expect(clampOffset({ x: 500, y: -500 }, photo, frame, 0.16)).toEqual({ x: 160, y: -120 });
    expect(clampOffset({ x: 10, y: 10 }, photo, frame, 0.16)).toEqual({ x: 10, y: 10 });
  });
});

describe('cropRect', () => {
  it('is the whole photograph when it exactly covers the frame', () => {
    const rect = cropRect(photo, frame, 0.08, { x: 0, y: 0 });

    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    // In display pixels; divided by the scale this is 4000×3000.
    expect(rect.width / 0.08).toBeCloseTo(4000);
    expect(rect.height / 0.08).toBeCloseTo(3000);
  });

  it('moves against the drag — dragging the picture right shows its left', () => {
    const centred = cropRect(photo, frame, 0.16, { x: 0, y: 0 });
    const draggedRight = cropRect(photo, frame, 0.16, { x: 100, y: 0 });

    expect(centred.x).toBeCloseTo(160);
    expect(draggedRight.x).toBeCloseTo(60);
  });
});

describe('outputSize', () => {
  it('never invents pixels and never exceeds the long-edge ceiling', () => {
    // Whole 4000×3000 photograph at 0.08: 4000 source pixels wide, capped to 2000.
    expect(outputSize(frame, 0.08, 2000)).toEqual({ width: 2000, height: 1500 });
    // A tight crop — 320px of frame at 1× is 320 source pixels — stays 320.
    expect(outputSize(frame, 1, 2000)).toEqual({ width: 320, height: 240 });
  });
});

describe('frameFor', () => {
  it('fills the box on whichever axis the aspect allows', () => {
    expect(frameFor({ width: 400, height: 400 }, 4 / 3)).toEqual({ width: 400, height: 300 });
    expect(frameFor({ width: 400, height: 200 }, 4 / 3)).toEqual({
      width: 200 * (4 / 3),
      height: 200,
    });
    expect(frameFor({ width: 400, height: 400 }, 1)).toEqual({ width: 400, height: 400 });
  });
});

describe('zoomTo', () => {
  it('never goes below the covering scale', () => {
    const zoomed = zoomTo(0.01, { scale: 0.08, offset: { x: 0, y: 0 } }, photo, frame);

    expect(zoomed.scale).toBeCloseTo(0.08);
  });

  it('scales the offset with the picture so the frame keeps its subject', () => {
    const zoomed = zoomTo(0.32, { scale: 0.16, offset: { x: 40, y: -20 } }, photo, frame);

    expect(zoomed.scale).toBeCloseTo(0.32);
    expect(zoomed.offset).toEqual({ x: 80, y: -40 });
  });

  it('clamps the scaled offset when zooming back out', () => {
    const zoomed = zoomTo(0.08, { scale: 0.16, offset: { x: 160, y: 120 } }, photo, frame);

    expect(zoomed.offset).toEqual({ x: 0, y: 0 });
  });
});

describe('turn', () => {
  it('walks the four quarters both ways', () => {
    expect(turn(0, 90)).toBe(90);
    expect(turn(270, 90)).toBe(0);
    expect(turn(0, -90)).toBe(270);
    expect(turn(90, -90)).toBe(0);
  });
});
