import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../src/picker/document';
import { parseMaterial, reattachSource, serializeMaterial } from '../../src/picker/recipe';
import { capturePng } from '../../src/picker/export';
import type { PickerDocument, Raster, SceneFrame } from '../../src/picker/types';
import type { PickerRenderer } from '../../src/picker/render';

const { loadSource } = vi.hoisted(() => ({ loadSource: vi.fn() }));
// Node has no image decoder: mock this resource boundary, keeping admission real.
vi.mock('../../src/picker/image', () => ({ loadSource }));
const hash = 'a'.repeat(64);
const imageDocument = (): PickerDocument => ({ ...createDocument(), image: { hash, name: 'photo.png', width: 2, height: 1 } });
const pixels: Raster = { width: 2, height: 1, rgba: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 127]) };
const frame: SceneFrame = { revision: 42, source: pixels, layers: [], seed: 236, time: 1.5 };
const renderer = (capture: PickerRenderer['capture']): PickerRenderer => ({ mode: 'cpu', capture, draw: async () => {}, dispose: async () => {} });
const file = {} as File;
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('portable material files', () => {
  it('round trips all bands, fixed brush selection, source, frozen time and sound settings', () => {
    const initial = imageDocument();
    const doc: PickerDocument = { ...initial, frozenTime: 7.25, audio: { mode: 'both', volume: .3 }, materials: initial.materials.map(m => ({ ...m,
      curves: { ...m.curves, radio: Array(257).fill(.7), uv: Array(257).fill(.2) },
      selection: { kind: 'color', rgb: [.2, .4, .7], tolerance: .1, strokes: [{ mode: 'erase', radius: .04, strength: .5, points: [[0, 1], [.5, .25]] }] },
    })) };
    const restored = parseMaterial(serializeMaterial(doc));
    expect(restored).toEqual(doc);
    expect(Object.keys(restored)).toEqual(['version', 'materials', 'activeId', 'image', 'seed', 'frozenTime', 'audio']);
    expect(Object.isFrozen(restored.materials[0].curves.radio)).toBe(true);
  });

  it('applies the 1,000,000 byte limit to UTF-8, including whitespace', () => {
    const json = serializeMaterial(createDocument());
    expect(() => parseMaterial(' '.repeat(1_000_000) + json)).toThrow(/1,000,000/);
    const oversized = JSON.stringify({ ...imageDocument(), image: { ...imageDocument().image, name: '🌈'.repeat(250_001) } });
    expect(oversized.length).toBeLessThan(1_000_000);
    expect(() => parseMaterial(oversized)).toThrow(/1,000,000/);
    expect(parseMaterial(' '.repeat(1_000_000 - new TextEncoder().encode(json).length) + json).version).toBe(1);
  });

  it('rejects malformed files, legacy schemas and embedded runtime fields atomically', () => {
    const before = createDocument();
    for (const input of ['{', JSON.stringify({ version: 1, spectra: [] }), JSON.stringify({ ...before, playing: true }), JSON.stringify({ ...before, imageBytes: 'data:image/png;base64,abc' })]) {
      expect(() => parseMaterial(input)).toThrow(/material/i);
    }
    expect(before.materials[0].curves.uv[128]).toBe(0);
    expect(() => serializeMaterial({ ...before, frozenTime: Infinity })).toThrow();
  });

  it('rejects bad curve samples, IDs, brush counts and source URLs', () => {
    const initial = createDocument();
    const material = initial.materials[0];
    for (const doc of [
      { ...initial, activeId: 'missing' },
      { ...initial, materials: [material, material] },
      { ...initial, materials: [{ ...material, curves: { ...material.curves, radio: Array(257).fill(-1) } }] },
      { ...initial, materials: [{ ...material, curves: { ...material.curves, visible: Array(256).fill(0) } }] },
      { ...initial, materials: [{ ...material, selection: { kind: 'color', rgb: [0, 0, 0], tolerance: .1, strokes: Array.from({ length: 9 }, () => ({ mode: 'add', radius: .04, strength: .5, points: Array(1024).fill([.5, .5]) })) } }] },
      { ...initial, image: { hash, name: 'photo.png', width: 1, height: 1, url: 'https://example.com/photo.png' } },
    ]) expect(() => parseMaterial(JSON.stringify(doc))).toThrow();
  });
});

describe('image reattachment', () => {
  it('requires a source reference before decoding', async () => {
    await expect(reattachSource(createDocument(), file, new AbortController().signal)).rejects.toThrow(/image/i);
    expect(loadSource).not.toHaveBeenCalled();
  });
  it('closes a mismatched source and preserves the caller document', async () => {
    const dispose = vi.fn(), doc = imageDocument(), before = serializeMaterial(doc);
    loadSource.mockResolvedValue({ ref: { ...doc.image, hash: 'b'.repeat(64) }, pixels, dispose });
    await expect(reattachSource(doc, file, new AbortController().signal)).rejects.toThrow(/match/i);
    expect(dispose).toHaveBeenCalledOnce();
    expect(serializeMaterial(doc)).toBe(before);
  });
  it('reattaches a matching image without changing its saved name or authoring state', async () => {
    const dispose = vi.fn(), doc = imageDocument();
    loadSource.mockResolvedValue({ ref: { ...doc.image, name: 'renamed.png' }, pixels, dispose });
    const attached = await reattachSource(doc, file, new AbortController().signal);
    expect(attached.document).toEqual(doc); expect(attached.pixels).toBe(pixels);
    attached.dispose(); expect(dispose).toHaveBeenCalledOnce();
  });
  it('disposes a decoded source if cancellation wins before reattachment', async () => {
    const control = new AbortController(), dispose = vi.fn(), doc = imageDocument();
    loadSource.mockImplementation(async () => { control.abort(); return { ref: doc.image, pixels, dispose }; });
    await expect(reattachSource(doc, file, control.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(dispose).toHaveBeenCalledOnce();
  });
  it('rejects an image reference whose dimensions do not match decoded source metadata', async () => {
    const dispose = vi.fn(), doc = imageDocument();
    loadSource.mockResolvedValue({ ref: { ...doc.image, width: 3 }, pixels, dispose });
    await expect(reattachSource(doc, file, new AbortController().signal)).rejects.toThrow(/match/i);
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe('PNG frame capture', () => {
  it('encodes the supplied revision pixels and preview dimensions as PNG', async () => {
    let stored: { data: Uint8ClampedArray; width: number; height: number } | undefined;
    vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(public width: number, public height: number) {}
      getContext() { return { putImageData(value: typeof stored) { stored = value; } }; }
      async convertToBlob(options: { type: string }) { return new Blob([new Uint8ClampedArray(stored!.data)], { type: options.type }); }
    });
    const capture = vi.fn(async (supplied: SceneFrame) => ({ revision: supplied.revision, pixels }));
    const blob = await capturePng(renderer(capture), frame, new AbortController().signal);
    expect(capture).toHaveBeenCalledWith(frame); expect(blob.type).toBe('image/png');
    expect(stored?.width).toBe(2); expect(stored?.height).toBe(1);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 255, 4, 5, 6, 127]));
  });
  it('rejects stale captures, malformed rasters and changed preview dimensions', async () => {
    for (const capture of [
      { revision: 41, pixels },
      { revision: 42, pixels: { ...pixels, rgba: new Uint8ClampedArray(4) } },
      { revision: 42, pixels: { width: 1, height: 2, rgba: pixels.rgba } },
    ]) await expect(capturePng(renderer(async () => capture), frame, new AbortController().signal)).rejects.toThrow();
  });
  it('rejects already cancelled and pending captures without encoding', async () => {
    const control = new AbortController(), capture = vi.fn(async () => ({ revision: 42, pixels }));
    control.abort();
    await expect(capturePng(renderer(capture), frame, control.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(capture).not.toHaveBeenCalled();
    const pendingControl = new AbortController();
    const pending = capturePng(renderer(() => new Promise(() => {})), frame, pendingControl.signal);
    pendingControl.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('cancels encoding without delivering an outdated export', async () => {
    const control = new AbortController();
    vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() { return { putImageData() {} }; }
      async convertToBlob() { control.abort(); return new Blob(['png'], { type: 'image/png' }); }
    });
    await expect(capturePng(renderer(async () => ({ revision: 42, pixels })), frame, control.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('handles renderer failure when cancellation occurs during capture submission', async () => {
    const control = new AbortController();
    await expect(capturePng(renderer(() => {
      control.abort(); return Promise.reject(Error('GPU lost during submission'));
    }), frame, control.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  it('rejects oversized preview frames and missing PNG encoders', async () => {
    const oversized = { width: 513, height: 1, rgba: new Uint8ClampedArray(513 * 4) };
    await expect(capturePng(renderer(async () => ({ revision: 42, pixels: oversized })), { ...frame, source: oversized }, new AbortController().signal)).rejects.toThrow(/preview/i);
    vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
    vi.stubGlobal('OffscreenCanvas', class { getContext() { return null; } });
    await expect(capturePng(renderer(async () => ({ revision: 42, pixels })), frame, new AbortController().signal)).rejects.toThrow(/unavailable/i);
  });
});
