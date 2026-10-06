import { DEFAULT_IMPORT_LIMITS, prepareImage } from '../io/images';
import { decodeSrgb } from '../color/srgb';
import type { ImageRef, Raster, Vec3 } from './types';
export const SOURCE_LIMITS=Object.freeze({...DEFAULT_IMPORT_LIMITS,previewLongEdge:512});
const cancelled=(signal:AbortSignal)=>{if(signal.aborted)throw new DOMException('Image load cancelled','AbortError');};
export async function loadSource(file:File,signal:AbortSignal):Promise<{ref:ImageRef;pixels:Raster;dispose():void}> {
  cancelled(signal);
  const image=await prepareImage(file,SOURCE_LIMITS);
  let closed=false;
  const dispose=()=>{if(!closed){closed=true;image.bitmap.close();}};
  try {
    cancelled(signal);
    const canvas=new OffscreenCanvas(image.bitmap.width,image.bitmap.height);
    const context=canvas.getContext('2d',{colorSpace:'srgb'});
    if(!context)throw Error('sRGB image reading is unavailable');
    context.drawImage(image.bitmap,0,0);
    const pixels:Raster={width:canvas.width,height:canvas.height,rgba:context.getImageData(0,0,canvas.width,canvas.height).data};
    canvas.width=1;canvas.height=1;
    cancelled(signal);
    return {ref:{hash:image.hash,name:file.name,width:image.width,height:image.height},pixels,dispose};
  } catch(error){dispose();throw error;}
}
/** Original color, never the current appearance. Alpha enters this mean exactly once. */
export function meanSourceLinear(source:Raster):Vec3 {
  const sum=[0,0,0],rgba=source.rgba;let total=0;
  for(let i=0;i<rgba.length;i+=4) {
    const alpha=rgba[i+3]/255;if(!alpha)continue;
    const rgb=decodeSrgb([rgba[i]/255,rgba[i+1]/255,rgba[i+2]/255]);
    for(let j=0;j<3;j++)sum[j]+=rgb[j]*alpha;total+=alpha;
  }
  return total?sum.map(v=>v/total) as unknown as Vec3:[0,0,0];
}
