import type { ImageAsset, ImportLimits } from '../domain/types';
export const DEFAULT_IMPORT_LIMITS: ImportLimits = Object.freeze({ maxBytes: 20_000_000, maxPixels: 24_000_000, previewLongEdge: 2048, sampleLongEdge: 256 });
/** App-owned live image buffers are budgeted separately from browser decoder internals. */
export const IMAGE_MEMORY_BUDGET = 128 * 1024 * 1024;
/** Reserves 64 MiB for worker bitmap clones, export surfaces/chunks and in-flight mapping copies. */
export function assertImageMemoryBudget(sourceBytes:number,width:number,height:number,retainedBytes=0):number {
  if(![sourceBytes,width,height,retainedBytes].every(v=>Number.isSafeInteger(v)&&v>=0))throw Error('Invalid image memory estimate');
  const assetBytes=sourceBytes+width*height*4+512*512*17;
  if(assetBytes+retainedBytes+64*1024*1024>IMAGE_MEMORY_BUDGET)throw Error('Image memory budget reached. Remove unused image history or start a new palette before importing.');
  return assetBytes;
}
export interface ImageHeader { format: 'jpeg' | 'png'; width: number; height: number; orientation: number }
function limitsWithinCaps(limits: ImportLimits): void {
  for (const key of Object.keys(DEFAULT_IMPORT_LIMITS) as (keyof ImportLimits)[])
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > DEFAULT_IMPORT_LIMITS[key]) throw Error(`Invalid image limit: ${key}`);
}
export function boundedDimensions(width: number, height: number, longEdge: number): { width: number; height: number } {
  if (![width,height,longEdge].every(v => Number.isSafeInteger(v) && v > 0)) throw Error('Invalid image dimensions');
  const ratio = Math.min(1,longEdge / Math.max(width,height));
  return { width: Math.max(1,Math.round(width * ratio)), height: Math.max(1,Math.round(height * ratio)) };
}
function tiffOrientation(bytes: Uint8Array): number {
  if (bytes.length < 8) throw Error('Malformed EXIF header');
  const t = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const little = t.getUint16(0) === 0x4949;
  if ((!little && t.getUint16(0)!==0x4d4d) || t.getUint16(2,little)!==42) throw Error('Malformed EXIF header');
  const offset = t.getUint32(4,little);
  if (offset+2 > t.byteLength) throw Error('Malformed EXIF directory');
  const count = t.getUint16(offset,little);
  if(offset+2+count*12 > t.byteLength) throw Error('Malformed EXIF entries');
  for(let i=0;i<count;i++) {
    const p=offset+2+i*12;
    if(t.getUint16(p,little)===0x112) {
      if(t.getUint16(p+2,little)!==3 || t.getUint32(p+4,little)!==1) throw Error('Malformed EXIF orientation');
      const orientation=t.getUint16(p+8,little);
      if(orientation<1 || orientation>8) throw Error('Invalid EXIF orientation');
      return orientation;
    }
  }
  return 1;
}
function exifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 6 || String.fromCharCode(...bytes.slice(0,6)) !== 'Exif\0\0') return 1;
  return tiffOrientation(bytes.subarray(6));
}
/** Signature and dimension admission precedes any browser image decoding. PNG CRC/content validity is checked by the native decoder. */
export function inspectImageHeader(bytes: Uint8Array, limits: ImportLimits = DEFAULT_IMPORT_LIMITS): ImageHeader {
  limitsWithinCaps(limits);
  if(bytes.byteLength > limits.maxBytes) throw Error('Image exceeds the 20 MB byte limit');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let header: ImageHeader | undefined;
  if(bytes.length>=8 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)) {
    if(bytes.length<33 || v.getUint32(8)!==13 || String.fromCharCode(...bytes.slice(12,16))!=='IHDR') throw Error('Malformed PNG header');
    header={format:'png',width:v.getUint32(16),height:v.getUint32(20),orientation:1};
    let p=8, ended=false, hasExif=false;
    while(p+12<=bytes.length) {
      const n=v.getUint32(p), name=String.fromCharCode(...bytes.slice(p+4,p+8));
      if(p+12+n>bytes.length) throw Error('Truncated PNG chunk');
      if(name==='eXIf') {
        if(hasExif) throw Error('Duplicate PNG EXIF metadata');
        header.orientation=tiffOrientation(bytes.subarray(p+8,p+8+n));hasExif=true;
      }
      if(name==='acTL') throw Error('Animated PNG is unsupported; choose a still JPEG or PNG');
      p+=12+n;
      if(name==='IEND') { if(n!==0) throw Error('Malformed PNG end'); ended=true; break; }
    }
    if(!ended || p!==bytes.length) throw Error('Malformed PNG chunks');
  } else if(bytes.length>=4 && bytes[0]===255 && bytes[1]===216) {
    let p=2, orientation=1;
    while(p<bytes.length) {
      if(bytes[p++]!==255) throw Error('Malformed JPEG marker');
      while(bytes[p]===255) p++;
      const marker=bytes[p++];
      if(marker===0xda || marker===0xd9) break;
      if(marker===0x01 || marker>=0xd0 && marker<=0xd7) continue;
      if(p+2>bytes.length) throw Error('Truncated JPEG header');
      const n=v.getUint16(p);
      if(n<2 || p+n>bytes.length) throw Error('Truncated JPEG segment');
      if(marker===0xe1) orientation=exifOrientation(bytes.subarray(p+2,p+n));
      if([0xc0,0xc1,0xc2].includes(marker)) {
        if(n<8) throw Error('Malformed JPEG dimensions');
        header={format:'jpeg',width:v.getUint16(p+5),height:v.getUint16(p+3),orientation};
      }
      p+=n;
    }
    if(header) header.orientation=orientation;
  } else throw Error('Unsupported format; choose a still JPEG or PNG');
  if(!header || header.width<1 || header.height<1) throw Error('Missing or invalid image dimensions');
  if(header.width*header.height > limits.maxPixels) throw Error('Image exceeds the 24 megapixel limit');
  return header;
}
export async function prepareImage(file: File, limits: ImportLimits = DEFAULT_IMPORT_LIMITS, retainedBytes = 0): Promise<ImageAsset> {
  limitsWithinCaps(limits);
  if(file.size>limits.maxBytes) throw Error('Image exceeds the 20 MB byte limit');
  const bytes=new Uint8Array(await file.arrayBuffer()), header=inspectImageHeader(bytes,limits);
  const swapped=header.orientation>=5;
  const width=swapped?header.height:header.width, height=swapped?header.width:header.height;
  const size=boundedDimensions(width,height,limits.previewLongEdge);
  assertImageMemoryBudget(bytes.byteLength,size.width,size.height,retainedBytes);
  let decoded: ImageBitmap | undefined;
  try {
    // Native decoder applies EXIF and embedded ICC. Drawing into an explicitly sRGB canvas normalizes its output.
    decoded=await createImageBitmap(new Blob([bytes],{type:header.format==='png'?'image/png':'image/jpeg'}),
      {imageOrientation:'from-image',colorSpaceConversion:'default',premultiplyAlpha:'default',resizeWidth:size.width,resizeHeight:size.height,resizeQuality:'high'});
    const canvas=new OffscreenCanvas(size.width,size.height), context=canvas.getContext('2d',{colorSpace:'srgb'});
    if(!context) throw Error('sRGB image decoding is unavailable');
    context.drawImage(decoded,0,0,size.width,size.height); decoded.close(); decoded=undefined;
    const bitmap=canvas.transferToImageBitmap(); canvas.width=1;canvas.height=1;
    try {
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
      return Object.freeze({id:`image:${hash}`,hash,width,height,orientation:header.orientation,
        colorProcessing:['Native JPEG/PNG decoder; EXIF orientation applied once','Embedded ICC handled by browser native color management; absent profile assumed sRGB','Normalized through explicit sRGB Canvas2D; browser color-management precision applies',`Bounded bitmap ${size.width}×${size.height}; original bytes retained unchanged`],
        // Returning copies prevents callers/worker transfer from mutating or detaching the original file bytes.
        get sourceBytes(){return bytes.slice();}, bitmap});
    } catch(error) { bitmap.close(); throw error; }
  } catch(error) { decoded?.close(); throw Error(`Image could not be decoded: ${error instanceof Error?error.message:String(error)}`); }
}
