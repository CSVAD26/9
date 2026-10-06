import { validateDocument } from './document';
import { loadSource } from './image';
import type { PickerDocument, Raster } from './types';

export const MATERIAL_FILE_LIMIT = 1_000_000;
function checkSize(text: string): void {
  if (new TextEncoder().encode(text).byteLength > MATERIAL_FILE_LIMIT) {
    throw Error('Material files must be at most 1,000,000 UTF-8 bytes.');
  }
}

/** Authored data only: strict validation excludes embedded runtime state and URLs. */
export function serializeMaterial(doc: PickerDocument): string {
  const text = JSON.stringify(validateDocument(doc));
  checkSize(text);
  return text;
}

export function parseMaterial(text: string): PickerDocument {
  if (typeof text !== 'string') throw Error('Invalid material file: expected JSON text.');
  checkSize(text);
  try {
    return validateDocument(JSON.parse(text));
  } catch (error) {
    throw Error(`Invalid material file: ${error instanceof Error ? error.message : 'unrecognized document'}`);
  }
}

/** The caller installs this result atomically; rejection leaves its editor intact. */
export async function reattachSource(doc: PickerDocument, file: File, signal: AbortSignal): Promise<{
  document: PickerDocument; pixels: Raster; dispose(): void;
}> {
  if (signal.aborted) throw new DOMException('Image reattachment cancelled.', 'AbortError');
  const document = validateDocument(doc);
  if (!document.image) throw Error('This material file has no image to reattach.');
  const source = await loadSource(file, signal);
  try {
    if (signal.aborted) throw new DOMException('Image reattachment cancelled.', 'AbortError');
    if (source.ref.hash !== document.image.hash || source.ref.width !== document.image.width || source.ref.height !== document.image.height) {
      throw Error('The selected image does not match this material file. Reattach the original image.');
    }
    return { document, pixels: source.pixels, dispose: source.dispose };
  } catch (error) {
    source.dispose();
    throw error;
  }
}
