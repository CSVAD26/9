import { decodeSrgb } from '../color/srgb';
import { linearRgbToOklab } from '../color/oklab';
import type { Raster, Selection, Vec3 } from './types';

export const SELECTION_FEATHER = .04;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const cache=new WeakMap<Raster,WeakMap<Selection,Float32Array>>();
function segmentDistance(x:number,y:number,a:readonly number[],b:readonly number[],width:number,height:number):number {
  const ax=a[0]*width,ay=a[1]*height,bx=b[0]*width,by=b[1]*height;
  const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
  const t=length?clamp(((x-ax)*dx+(y-ay)*dy)/length):0;
  return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
/** Weights are geometric only. Source alpha is applied once by compositing/emission. */
export function selectionMask(source:Raster,selection:Selection):Float32Array {
  let selections=cache.get(source);
  if(!selections){selections=new WeakMap();cache.set(source,selections);}
  const previous=selections.get(selection);if(previous)return previous.slice();
  const mask=rasterizeMask(source,selection);selections.set(selection,mask.slice());return mask;
}
function rasterizeMask(source:Raster,selection:Selection):Float32Array {
  const {width,height,rgba}=source,mask=new Float32Array(width*height);
  if(selection.kind==='whole'){mask.fill(1);return mask;}
  const anchor=linearRgbToOklab(decodeSrgb(selection.rgb));
  for(let i=0;i<mask.length;i++) {
    if(rgba[4*i+3]===0)continue;
    const rgb:Vec3=[rgba[4*i]/255,rgba[4*i+1]/255,rgba[4*i+2]/255];
    const lab=linearRgbToOklab(decodeSrgb(rgb));
    mask[i]=1-smooth(Math.max(0,selection.tolerance-SELECTION_FEATHER),selection.tolerance,Math.hypot(...lab.map((v,j)=>v-anchor[j])));
  }
  for(const stroke of selection.strokes) {
    if(!stroke.points.length)continue;
    const radius=stroke.radius*Math.min(width,height);
    const influence=new Float32Array(mask.length);
    for(let j=0;j<stroke.points.length;j++) {
      const a=stroke.points[j],b=stroke.points[Math.min(j+1,stroke.points.length-1)];
      const x0=Math.max(0,Math.floor(Math.min(a[0],b[0])*width-radius)),x1=Math.min(width-1,Math.ceil(Math.max(a[0],b[0])*width+radius));
      const y0=Math.max(0,Math.floor(Math.min(a[1],b[1])*height-radius)),y1=Math.min(height-1,Math.ceil(Math.max(a[1],b[1])*height+radius));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
        const i=y*width+x;if(!rgba[4*i+3])continue;
        influence[i]=Math.max(influence[i],clamp(1-segmentDistance(x+.5,y+.5,a,b,width,height)/radius));
      }
    }
    for(let i=0;i<mask.length;i++) {
      const weight=influence[i]*stroke.strength;
      mask[i]=stroke.mode==='add'?mask[i]+(1-mask[i])*weight:mask[i]*(1-weight);
    }
  }
  return mask;
}
/** Object-fit contain coordinates; padding never selects a source pixel. */
export function sourcePoint(x:number,y:number,bounds:{left:number;top:number;width:number;height:number},source:Pick<Raster,'width'|'height'>):readonly [number,number]|null {
  const scale=Math.min(bounds.width/source.width,bounds.height/source.height);
  const width=source.width*scale,height=source.height*scale;
  const left=bounds.left+(bounds.width-width)/2,top=bounds.top+(bounds.height-height)/2;
  const u=(x-left)/width,v=(y-top)/height;
  return u<0||v<0||u>1||v>1?null:[u,v];
}
