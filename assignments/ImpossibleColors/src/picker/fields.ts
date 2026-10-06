import { decodeSrgb } from '../color/srgb';
import type { Raster } from './types';
const cache=new WeakMap<Raster,{luminance:Float32Array;edges:Float32Array}>();
/** Original unassociated linear luminance; fully hidden RGB is discarded. */
export function sourceFields(source:Raster):{luminance:Float32Array;edges:Float32Array} {
  const existing=cache.get(source);if(existing)return existing;
  const {width,height,rgba}=source,luminance=new Float32Array(width*height),edges=new Float32Array(width*height);
  for(let i=0;i<luminance.length;i++) {
    if(!rgba[4*i+3])continue;
    const rgb=decodeSrgb([rgba[4*i]/255,rgba[4*i+1]/255,rgba[4*i+2]/255]);
    luminance[i]=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  }
  const at=(x:number,y:number)=>luminance[Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x))];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const gx=at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1)-at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1);
    const gy=at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1)-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1);
    edges[y*width+x]=Math.min(1,Math.hypot(gx,gy)/4);
  }
  const fields={luminance,edges};cache.set(source,fields);return fields;
}
