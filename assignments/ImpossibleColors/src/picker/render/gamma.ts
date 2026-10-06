import type { BandStats, SceneFrame, SceneLayer } from '../types';
import { sourceFields } from '../fields';

export const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export function smoothstep(a:number,b:number,x:number):number {const t=clamp((x-a)/(b-a));return t*t*(3-2*t);}
/** Integer hash shared with gamma.wgsl. Coordinates use a fixed 512-square sensor. */
export function sensorHash(x:number,y:number,seed:number,tick:number):number {
 let h=(Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(seed|0,1274126177)^Math.imul(tick|0,1597334677))>>>0;
 h=Math.imul(h^(h>>>13),1274126177)>>>0;h=(h^(h>>>16))>>>0;return h/4294967296;
}
export function gammaParameters(stats:BandStats,_seed:number,time:number) {
 return {hitRate:.06*stats.area,displacementPx:12*stats.area,contourCount:8+Math.round(24*stats.centroid),tick:Math.floor(time*12)};
}
export function depthAt(frame:SceneFrame,x:number,y:number):number|undefined {
 const d=frame.depth;if(!d)return undefined;
 return d.values[Math.min(d.height-1,Math.floor(y*d.height/frame.source.height))*d.width+Math.min(d.width-1,Math.floor(x*d.width/frame.source.width))];
}
export function gammaEvent(frame:SceneFrame,layer:SceneLayer,x:number,y:number,edge:number):number {
 const stats=layer.appearance.bands.gamma;if(stats.area===0)return 0;
 const p=gammaParameters(stats,frame.seed,frame.time),nx=Math.floor(x/frame.source.width*512),ny=Math.floor(y/frame.source.height*512);
 const noise=sensorHash(nx,ny,frame.seed,p.tick);
 const hit=noise<p.hitRate?1:0;
 const depth=depthAt(frame,x,y);
 // Derivative-width AA for estimated depth; original Sobel edges explicitly stand in
 // for contours when no admitted model is available. Neither is inferred from output.
 let contour=edge;
 if(depth!==undefined) {const phase=depth*p.contourCount;const dist=Math.abs(phase-Math.round(phase));const dx=Math.abs((depthAt(frame,Math.min(x+1,frame.source.width-1),y)??depth)-depth);const dy=Math.abs((depthAt(frame,x,Math.min(y+1,frame.source.height-1))??depth)-depth);contour=1-smoothstep(.02,.02+Math.max(.02,(dx+dy)*p.contourCount),dist);}
 const segment=sensorHash(Math.floor(nx/8),Math.floor(ny/3),frame.seed+71,p.tick)<stats.area*.65?contour*stats.area:0;
 return Math.max(hit,segment);
}
export function gammaEmitterMask(frame:SceneFrame):Float32Array {
 const {width,height,rgba}=frame.source,out=new Float32Array(width*height),{edges}=sourceFields(frame.source);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;let value=0;for(const layer of frame.layers)value+=gammaEvent(frame,layer,x,y,edges[i])*clamp(layer.mask[i]);out[i]=value*rgba[4*i+3]/255;}
 return out;
}
