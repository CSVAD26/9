import type { PickerRenderer } from './render';
import type { Raster, SceneFrame } from './types';

const cancelError = () => new DOMException('Export cancelled.', 'AbortError');
function checkCancelled(signal: AbortSignal): void { if (signal.aborted) throw cancelError(); }

/** Abort awaiting a GPU capture/encoder even when that operation cannot be interrupted. */
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(cancelError());
    if (signal.aborted) { void work.catch(() => {}); reject(cancelError()); return; }
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function validatePixels(pixels: Raster, frame: SceneFrame): void {
  const { width, height, rgba } = pixels;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || Math.max(width, height) > 512 ||
      width !== frame.source.width || height !== frame.source.height || !(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
    throw Error('The captured image must match the current preview pixels and dimensions.');
  }
}

/** Capture After directly from a frozen frame, never from a possibly stale canvas. */
export async function capturePng(renderer: PickerRenderer, frame: SceneFrame, signal: AbortSignal): Promise<Blob> {
  checkCancelled(signal);
  const capture = await abortable(renderer.capture(frame), signal);
  checkCancelled(signal);
  if (capture.revision !== frame.revision) throw Error('The captured image is from a stale material revision.');
  validatePixels(capture.pixels, frame);
  const { width, height, rgba } = capture.pixels;
  const data = new ImageData(new Uint8ClampedArray(rgba), width, height);
  let blob: Blob;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw Error('PNG encoding is unavailable.');
    context.putImageData(data, 0, 0);
    blob = await abortable(canvas.convertToBlob({ type: 'image/png' }), signal);
  } else {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw Error('PNG encoding is unavailable.');
    context.putImageData(data, 0, 0);
    blob = await abortable(new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(Error('PNG encoding failed.')), 'image/png');
    }), signal);
  }
  checkCancelled(signal);
  if (!blob.size || blob.type !== 'image/png') throw Error('PNG encoding failed.');
  return blob;
}

/** Local browser download; object URLs are revoked after the click is consumed. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.hidden = true;
  document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
