/**
 * A phone photograph, made small enough to send before it is sent.
 *
 * The API takes twelve megabytes and makes its own sizes, so this is not about
 * what is stored — it is about the upload. A manager standing in their own
 * dining room is on the restaurant's Wi-Fi or on mobile data, and a 6 MB
 * camera original over either is twenty seconds of a spinner that looks like
 * a hang. Drawn onto a canvas at 2000px on the long edge and re-encoded, the
 * same photograph is 300–500 KB and the upload is a second.
 *
 * 2000px rather than the server's 1600: the server scales down once more, and
 * a little headroom keeps that last resample from working on pixels that were
 * already interpolated once.
 *
 * **Orientation.** `createImageBitmap` with `imageOrientation: 'from-image'`
 * applies the EXIF rotation while decoding, so the canvas holds the picture
 * the way the phone showed it and the bytes sent carry no rotation tag at all
 * — which is the one way to be sure the server, which also honours the tag,
 * does not turn it a second time.
 *
 * **Every failure falls back to the original file.** An old browser without
 * `createImageBitmap`, a WebP the canvas cannot decode, a HEIC Safari handed
 * over unconverted, a canvas that is tainted — all of them return the file as
 * chosen and the API does the work. Shrinking is an optimisation of the
 * upload, never a gate on it.
 */

/** Below this the upload is already quick and re-encoding would only cost quality. */
const SHRINK_ABOVE_BYTES = 1_200_000;

/** The long edge the canvas is drawn at. */
const LONG_EDGE = 2000;

/** JPEG, because every browser that can draw a canvas can encode one. */
const ENCODE_AS = 'image/jpeg';
const ENCODE_QUALITY = 0.88;

export type Shrunk = {
  file: File;
  /** Whether the bytes are the canvas's, or the file exactly as chosen. */
  shrunk: boolean;
};

export async function shrinkPhoto(file: File): Promise<Shrunk> {
  if (file.size <= SHRINK_ABOVE_BYTES || typeof createImageBitmap !== 'function') {
    return { file, shrunk: false };
  }

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { file, shrunk: false };
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);

    // Already small in pixels but large in bytes — a PNG screenshot, say. The
    // canvas still helps: a JPEG of the same pixels is a tenth of the size.
    const scale = Math.min(1, LONG_EDGE / Math.max(1, longest));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (context === null) {
      return { file, shrunk: false };
    }

    // A PNG with transparency lands on white rather than black: JPEG has no
    // alpha, and black is what an unpainted canvas encodes to.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, ENCODE_AS, ENCODE_QUALITY);
    });

    if (blob === null || blob.size === 0 || blob.size >= file.size) {
      return { file, shrunk: false };
    }

    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';

    return {
      file: new File([blob], `${name}.jpg`, { type: ENCODE_AS, lastModified: Date.now() }),
      shrunk: true,
    };
  } catch {
    return { file, shrunk: false };
  } finally {
    bitmap.close();
  }
}
