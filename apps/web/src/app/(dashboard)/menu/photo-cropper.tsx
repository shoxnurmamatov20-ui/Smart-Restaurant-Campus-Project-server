'use client';

import { useEffect, useRef, useState } from 'react';

import {
  clampOffset,
  coverScale,
  cropRect,
  frameFor,
  outputSize,
  turn,
  turnedSize,
  zoomTo,
  type Offset,
  type Quarter,
  type Size,
} from './crop-math';

/**
 * Crop and turn a dish photograph before it is sent.
 *
 * A frame over the picture, the picture draggable under it, a slider and the
 * wheel for zoom, two buttons for quarter-turns, three aspect presets. What
 * is inside the frame is what leaves: drawn onto a canvas at the photograph's
 * own resolution (capped at 2000px on the long edge — the server keeps 1600)
 * and handed back as a JPEG for the ordinary upload path to send.
 *
 * ---------------------------------------------------------------------------
 * Why a frame you move the picture under, not handles you drag
 *
 * This is used from a phone as often as from a desk, and a resize handle is
 * eight pixels wide. Moving the picture with a finger and pinching to zoom is
 * what every phone's own photo editor does, so it is what a restaurant owner
 * already knows; the preset chips replace the only thing handles did better,
 * which was choosing a shape.
 *
 * ---------------------------------------------------------------------------
 * What it is drawn from
 *
 * Either the file just chosen — decoded with `createImageBitmap` and
 * `imageOrientation: 'from-image'`, so a phone photograph arrives the way the
 * phone showed it — or the photograph the platform already holds, fetched
 * from its `full` rendition. That second path is what makes "I uploaded it
 * sideways" fixable without finding the original again. It needs the file to
 * be readable by a canvas, which on the platform it is: the photographs are
 * served from the console's own origin. A picture on some other host taints
 * the canvas, and the editor says so rather than producing a blank.
 *
 * All arithmetic is in `crop-math.ts`, where it has tests; this file is the
 * pointer handling and the markup.
 */

/** The three shapes offered. `null` is the photograph's own. */
type Preset = { key: 'original' | 'four' | 'square'; aspect: number | null; label: string };

/** The long edge of what is handed back. */
const MAX_EDGE = 2000;

/** How far the slider goes past the covering scale. */
const MAX_ZOOM = 4;

export type CropperLabels = {
  title: string;
  hint: string;
  original: string;
  zoom: string;
  turnLeft: string;
  turnRight: string;
  apply: string;
  cancel: string;
  loading: string;
  loadFailed: string;
  saveFailed: string;
};

export function PhotoCropper({
  source,
  labels,
  onCancel,
  onDone,
}: {
  /** A file just chosen, or the address of the photograph already held. */
  source: File | string;
  labels: CropperLabels;
  onCancel: () => void;
  /** The cropped photograph, ready for the upload path. */
  onDone: (file: File) => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rotation, setRotation] = useState<Quarter>(0);
  const [preset, setPreset] = useState<Preset['key']>('original');
  /*
   * Zoom as a ratio over the covering scale — 1 is "just covers", 4 the
   * slider's end — rather than the scale itself. The covering scale changes
   * whenever the picture is turned, the shape changes, the bitmap arrives or
   * the drawer is resized, and a ratio survives all of those: the scale is
   * recomputed from it on every render, so nothing has to be synchronised
   * back into state when the frame moves under it.
   */
  const [zoom, setZoom] = useState(1);
  const [offsetRaw, setOffsetRaw] = useState<Offset>({ x: 0, y: 0 });

  /** The box the frame is fitted into — the stage's measured size. */
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size>({ width: 320, height: 320 });

  const presets: Preset[] = [
    { key: 'original', aspect: null, label: labels.original },
    { key: 'four', aspect: 4 / 3, label: '4:3' },
    { key: 'square', aspect: 1, label: '1:1' },
  ];

  // ---- decode the source ------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const blob = source instanceof File ? source : await (await fetch(source)).blob();
        const decoded = await createImageBitmap(blob, { imageOrientation: 'from-image' });

        if (cancelled) {
          decoded.close();

          return;
        }

        setBitmap(decoded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => () => bitmap?.close(), [bitmap]);

  // ---- measure the stage ------------------------------------------------

  useEffect(() => {
    const stage = stageRef.current;

    if (stage === null) return;

    const measure = () => {
      const rect = stage.getBoundingClientRect();

      setBox({ width: Math.max(120, rect.width), height: Math.max(120, rect.height) });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(stage);

    return () => observer.disconnect();
  }, []);

  // ---- derived geometry -------------------------------------------------

  const image: Size = bitmap === null ? { width: 1, height: 1 } : bitmap;
  const turned = turnedSize(image, rotation);
  const aspect = presets.find((entry) => entry.key === preset)?.aspect ?? null;
  const frame = frameFor(box, aspect ?? turned.width / Math.max(1, turned.height));
  const floor = coverScale(turned, frame);
  const scale = floor * zoom;
  // Clamped on the way out, not only on the way in: a drawer that was just
  // resized has a new frame, and the offset that was legal a moment ago may
  // now show the stage through a corner.
  const offset = clampOffset(offsetRaw, turned, frame, scale);

  /*
   * A turn or a new shape refits the picture: back to covering, centred.
   * There is no right answer for where the old offset should go on a
   * picture that has just been turned, and a new shape at the old zoom is a
   * different crop from the one the person was looking at.
   */
  function refit() {
    setZoom(1);
    setOffsetRaw({ x: 0, y: 0 });
  }

  function applyZoom(wantedScale: number) {
    const zoomed = zoomTo(
      Math.min(floor * MAX_ZOOM, wantedScale),
      { scale, offset },
      turned,
      frame,
    );

    setZoom(zoomed.scale / Math.max(1e-9, floor));
    setOffsetRaw(zoomed.offset);
  }

  // ---- pointer handling -------------------------------------------------

  /** The pointers currently down on the stage, by id, at their last position. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** The distance between two fingers when the pinch began, and the scale then. */
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);

    if (previous === undefined) return;

    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);

    if (pointers.current.size === 2 && pinch.current !== null) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);

      applyZoom(pinch.current.scale * (distance / Math.max(1, pinch.current.distance)));

      return;
    }

    setOffsetRaw(
      clampOffset(
        { x: offset.x + (next.x - previous.x), y: offset.y + (next.y - previous.y) },
        turned,
        frame,
        scale,
      ),
    );
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);

    if (pointers.current.size < 2) pinch.current = null;
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    // A notch of the wheel is a tenth of the zoom; the sign is the browser's
    // own ("scroll up to enlarge"), which is what every map does.
    applyZoom(scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
  }

  // ---- export -----------------------------------------------------------

  async function apply() {
    if (bitmap === null) return;

    setSaving(true);

    try {
      const rect = cropRect(turned, frame, scale, offset);
      const out = outputSize(frame, scale, MAX_EDGE);

      const canvas = document.createElement('canvas');
      canvas.width = out.width;
      canvas.height = out.height;

      const context = canvas.getContext('2d');

      if (context === null) throw new Error('no 2d context');

      /*
       * Map the crop onto the canvas, then draw the untouched bitmap turned.
       *
       * Three transforms, read bottom-up: the bitmap is drawn centred on the
       * origin and turned by the rotation, which puts it where the *turned*
       * coordinates expect it; that is shifted so the crop's top-left lands on
       * the origin; and the whole thing is scaled from crop pixels to canvas
       * pixels. The arithmetic is the same `cropRect` the preview uses, so
       * what the person framed is what is exported — no second model.
       */
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, out.width, out.height);
      context.scale(out.width / (rect.width / scale), out.height / (rect.height / scale));
      context.translate(-rect.x / scale, -rect.y / scale);
      context.translate(turned.width / 2, turned.height / 2);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });

      if (blob === null) throw new Error('encode failed');

      onDone(new File([blob], 'dish.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
    } catch {
      setSaving(false);
      setFailed(true);
    }
  }

  // ---- markup -----------------------------------------------------------

  const zoomPercent = Math.round((scale / Math.max(1e-9, floor)) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      /* Above the editor drawer (z-200), which is what opened it. */
      className="fixed inset-0 z-[210] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <div
        data-sheet
        className="bg-surface-raised border-border flex max-h-[92dvh] w-full max-w-[560px] flex-col rounded-t-[20px] border shadow-xl sm:rounded-[20px]"
      >
        <header className="border-divider flex-none border-b px-5 pt-5 pb-4">
          <h2 className="font-display text-lg font-semibold">{labels.title}</h2>
          <p className="text-fg-subtle mt-1 text-xs leading-normal">{labels.hint}</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/*
           * The stage: a square box the frame is fitted into. The picture is
           * drawn under the frame and the rest of the stage is dimmed, so the
           * part that will be kept is the bright part — which needs no
           * explanation.
           */}
          <div
            ref={stageRef}
            className="bg-bg-muted relative aspect-square w-full touch-none overflow-hidden rounded-lg select-none"
            onPointerDown={bitmap === null ? undefined : onPointerDown}
            onPointerMove={bitmap === null ? undefined : onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={bitmap === null ? undefined : onWheel}
          >
            {bitmap === null ? (
              <p className="text-fg-subtle absolute inset-0 grid place-items-center px-6 text-center text-sm">
                {failed ? labels.loadFailed : labels.loading}
              </p>
            ) : (
              <>
                <Picture
                  bitmap={bitmap}
                  rotation={rotation}
                  scale={scale}
                  offset={offset}
                  box={box}
                />
                <Frame frame={frame} box={box} />
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {presets.map((entry) => (
              <button
                key={entry.key}
                type="button"
                disabled={bitmap === null}
                onClick={() => {
                  setPreset(entry.key);
                  refit();
                }}
                aria-pressed={preset === entry.key}
                className={`rounded-pill border px-3.5 py-1.5 text-sm font-medium disabled:opacity-50 ${
                  preset === entry.key
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'bg-surface text-fg-muted'
                }`}
              >
                {entry.label}
              </button>
            ))}

            <span className="flex-1" />

            <button
              type="button"
              disabled={bitmap === null}
              onClick={() => {
                setRotation((current) => turn(current, -90));
                refit();
              }}
              aria-label={labels.turnLeft}
              title={labels.turnLeft}
              className="bg-surface grid size-10 place-items-center rounded-md border disabled:opacity-50"
            >
              <TurnGlyph flip />
            </button>
            <button
              type="button"
              disabled={bitmap === null}
              onClick={() => {
                setRotation((current) => turn(current, 90));
                refit();
              }}
              aria-label={labels.turnRight}
              title={labels.turnRight}
              className="bg-surface grid size-10 place-items-center rounded-md border disabled:opacity-50"
            >
              <TurnGlyph />
            </button>
          </div>

          <label className="mt-4 block">
            <span className="text-fg-subtle flex items-center justify-between text-xs">
              <span>{labels.zoom}</span>
              <span data-num>{zoomPercent}%</span>
            </span>
            <input
              type="range"
              min={100}
              max={MAX_ZOOM * 100}
              step={1}
              value={zoomPercent}
              disabled={bitmap === null}
              onChange={(event) => applyZoom((floor * Number(event.target.value)) / 100)}
              className="accent-brand-500 mt-1.5 h-11 w-full"
            />
          </label>

          {failed && bitmap !== null ? (
            <p className="text-danger-700 mt-3 text-sm">{labels.saveFailed}</p>
          ) : null}
        </div>

        <footer className="border-divider flex flex-none gap-2 border-t px-5 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="bg-surface h-11 flex-1 rounded-md border text-sm font-medium disabled:opacity-50"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            disabled={bitmap === null || saving}
            onClick={() => void apply()}
            className="bg-brand-500 h-11 flex-1 rounded-md text-sm font-semibold text-white disabled:opacity-50"
          >
            {labels.apply}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * The photograph, positioned by the model.
 *
 * A `<canvas>` painted once from the bitmap rather than an `<img>`: a bitmap
 * has no URL to give an `<img>`, and painting it once is cheaper than
 * encoding it to a blob URL to decode it again. The transform does the rest —
 * scale about the centre, turn about the centre, and move the centre to the
 * stage's centre plus the offset — in the same terms `crop-math.ts` uses, so
 * the preview and the export cannot disagree.
 */
function Picture({
  bitmap,
  rotation,
  scale,
  offset,
  box,
}: {
  bitmap: ImageBitmap;
  rotation: Quarter;
  scale: number;
  offset: Offset;
  box: Size;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) return;

    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  }, [bitmap]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
      style={{
        width: bitmap.width,
        height: bitmap.height,
        transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${rotation}deg) scale(${scale})`,
        transformOrigin: 'center',
        // The stage is measured, so this is only here to stop a flash of an
        // unscaled bitmap before the first layout.
        visibility: box.width > 0 ? 'visible' : 'hidden',
      }}
    />
  );
}

/** The frame, and the dimming around it. */
function Frame({ frame, box }: { frame: Size; box: Size }) {
  const left = (box.width - frame.width) / 2;
  const top = (box.height - frame.height) / 2;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-[6px] border-2 border-white"
      style={{
        left,
        top,
        width: frame.width,
        height: frame.height,
        // One shadow, large enough to reach every edge of the stage, is the
        // dimming: no four separate overlays to keep aligned.
        boxShadow: '0 0 0 9999px rgba(11, 14, 22, 0.55)',
      }}
    >
      {/* Thirds, the photographer's own guide, at a quarter of the frame's own
          brightness so they read as a hint rather than as a grid. */}
      <span className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
      <span className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
      <span className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
      <span className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
    </div>
  );
}

function TurnGlyph({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
