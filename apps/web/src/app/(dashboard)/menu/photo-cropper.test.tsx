import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PhotoCropper, type CropperLabels } from './photo-cropper';

/**
 * The cropper, driven the way a manager drives it.
 *
 * jsdom has no bitmaps, no canvas and no layout, so the three are stood in
 * for: `createImageBitmap` answers a fake 4000×3000 bitmap, the canvas context
 * records what is drawn on it, and the stage reports a 400×400 box. What is
 * asserted is the part that matters — the state the controls produce and the
 * file that leaves — not the pixels.
 */

const labels: CropperLabels = {
  title: 'Rasmni kesish va burish',
  hint: 'Rasmni suring',
  original: 'Asl',
  zoom: 'Kattalashtirish',
  turnLeft: 'Chapga burish',
  turnRight: "O'ngga burish",
  apply: 'Saqlash',
  cancel: 'Bekor qilish',
  loading: 'Rasm ochilmoqda…',
  loadFailed: 'Ochib bo‘lmadi',
  saveFailed: 'Tayyorlab bo‘lmadi',
};

type Drawn = { rotate: number[]; scale: number[][]; translate: number[][]; images: number };

let drawn: Drawn;

function fakeBitmap(width: number, height: number): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

beforeEach(() => {
  drawn = { rotate: [], scale: [], translate: [], images: 0 };

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => fakeBitmap(4000, 3000)),
  );

  // The stage measures itself; jsdom says everything is 0×0.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 400,
    height: 400,
    top: 0,
    left: 0,
    right: 400,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: '',
    fillRect: vi.fn(),
    scale: (x: number, y: number) => drawn.scale.push([x, y]),
    translate: (x: number, y: number) => drawn.translate.push([x, y]),
    rotate: (angle: number) => drawn.rotate.push(angle),
    drawImage: () => {
      drawn.images += 1;
    },
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback, type?: string) {
    callback(new Blob(['jpeg-bytes'], { type: type ?? 'image/jpeg' }));
  };

  // `setPointerCapture` does not exist in jsdom.
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function file(): File {
  return new File(['x'], 'plov.jpg', { type: 'image/jpeg' });
}

describe('PhotoCropper', () => {
  it('opens on the photograph as shot, at the covering scale', async () => {
    render(<PhotoCropper source={file()} labels={labels} onCancel={vi.fn()} onDone={vi.fn()} />);

    expect(screen.getByText(labels.loading)).toBeTruthy();

    await waitFor(() => expect(screen.getByRole('slider')).not.toHaveProperty('disabled', true));

    // "Asl" is pressed, the zoom reads 100% — the whole photograph, nothing cut.
    expect(screen.getByRole('button', { name: 'Asl' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('100');
  });

  it('hands back a JPEG drawn with the turn the person chose', async () => {
    const onDone = vi.fn();

    render(<PhotoCropper source={file()} labels={labels} onCancel={vi.fn()} onDone={onDone} />);
    await waitFor(() => expect(screen.getByRole('slider')).not.toHaveProperty('disabled', true));

    fireEvent.click(screen.getByRole('button', { name: labels.turnRight }));
    fireEvent.click(screen.getByRole('button', { name: labels.apply }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    const out = onDone.mock.calls[0]?.[0] as File;
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('dish.jpg');

    // A quarter-turn to the right is π/2 on the canvas. The bitmap is drawn
    // twice in all: once onto the preview when it arrived (no turn — the
    // preview turns with CSS) and once onto the export.
    expect(drawn.rotate).toEqual([Math.PI / 2]);
    expect(drawn.images).toBe(2);
  });

  it('zooms from the slider and resets when the shape changes', async () => {
    render(<PhotoCropper source={file()} labels={labels} onCancel={vi.fn()} onDone={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('slider')).not.toHaveProperty('disabled', true));

    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '250' } });
    expect(slider.value).toBe('250');

    // A new shape is a new crop; the zoom goes back to covering.
    fireEvent.click(screen.getByRole('button', { name: '1:1' }));
    expect(slider.value).toBe('100');
    expect(screen.getByRole('button', { name: '1:1' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('says so when the photograph cannot be opened', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('tainted');
      }),
    );

    render(
      <PhotoCropper
        source="https://elsewhere.test/osh.jpg"
        labels={labels}
        onCancel={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText(labels.loadFailed)).toBeTruthy());
    expect((screen.getByRole('button', { name: labels.apply }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('closes without a file on cancel', async () => {
    const onCancel = vi.fn();
    const onDone = vi.fn();

    render(<PhotoCropper source={file()} labels={labels} onCancel={onCancel} onDone={onDone} />);
    await waitFor(() => expect(screen.getByRole('slider')).not.toHaveProperty('disabled', true));

    fireEvent.click(screen.getByRole('button', { name: labels.cancel }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});
