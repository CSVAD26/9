import type {Raster,SceneFrame,Vec3} from '../types';
import {decodeSrgb,encodeSrgb} from '../../color/srgb';
import {linearRgbToOklab,oklabToLinearRgb} from '../../color/oklab';
import {sourceFields} from '../fields';
import {clamp,depthAt,gammaEvent,gammaParameters,sensorHash,smoothstep} from './gamma';
import {bloomField,buildLightFields} from './radiance';

const ramps=['071329','49206b','bd2148','f37b26','fff4bc'].map(hex=>decodeSrgb([0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255) as unknown as Vec3));
function thermal(t:number):Vec3 {const p=clamp(t)*4,j=Math.min(3,Math.floor(p)),f=p-j;return ramps[j].map((v,c)=>v+(ramps[j+1][c]-v)*f) as unknown as Vec3;}
const sourceCache=new WeakMap<Raster,Float32Array>();
function linearSource(source:Raster):Float32Array {let out=sourceCache.get(source);if(out)return out;out=new Float32Array(source.width*source.height*4);for(let i=0;i<source.width*source.height;i++){const rgb=decodeSrgb([source.rgba[i*4]/255,source.rgba[i*4+1]/255,source.rgba[i*4+2]/255]);for(let c=0;c<3;c++)out[i*4+c]=rgb[c];out[i*4+3]=source.rgba[i*4+3]/255;}sourceCache.set(source,out);return out;}
const labCache=new WeakMap<Raster,Float64Array>();
function sourceOklab(source:Raster,linear:Float32Array):Float64Array {
 let cached=labCache.get(source);if(cached)return cached;
 cached=new Float64Array(source.width*source.height*3);
 for(let i=0;i<source.width*source.height;i++)cached.set(linearRgbToOklab([linear[i*4],linear[i*4+1],linear[i*4+2]]),i*3);
 labCache.set(source,cached);return cached;
}
/** All targets derive from the unchanged source; scene masks include material priority. */
export function composeBase(frame:SceneFrame):Float32Array {
 const {width,height}=frame.source,original=linearSource(frame.source),out=original.slice();
 const fields=frame.layers.some(l=>l.appearance.bands.infrared.area>0||l.appearance.bands.xray.area>0||l.appearance.bands.gamma.area>0)?sourceFields(frame.source):undefined;
 const lab=frame.layers.some(l=>l.deltaOklab.some(v=>v!==0))?sourceOklab(frame.source,original):undefined;
 for(const layer of frame.layers){const stats=layer.appearance.bands,p=gammaParameters(stats.gamma,frame.seed,frame.time),target=original.slice(),colorChanged=layer.deltaOklab.some(v=>v!==0);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,m=clamp(layer.mask[i]);if(m===0||original[i*4+3]===0)continue;
   let rgb:Vec3=[original[i*4],original[i*4+1],original[i*4+2]];
   if(colorChanged)rgb=oklabToLinearRgb([lab![i*3]+layer.deltaOklab[0],lab![i*3+1]+layer.deltaOklab[1],lab![i*3+2]+layer.deltaOklab[2]]);
   if(stats.infrared.area>0){const heat=thermal(.65*fields!.luminance[i]+.35*stats.infrared.centroid);rgb=rgb.map((v,c)=>v+(heat[c]-v)*stats.infrared.area) as unknown as Vec3;}
   if(stats.xray.area>0){const d=depthAt(frame,x,y);if(d!==undefined){const within=1-smoothstep(.15,.18,Math.abs(d-stats.xray.centroid)),gray=clamp(.25+.65*(1-d)+.1*fields!.edges[i])*(.15+.85*within);rgb=rgb.map(v=>v+(gray-v)*stats.xray.area) as unknown as Vec3;}}
   for(let c=0;c<3;c++)target[i*4+c]=rgb[c];
  }
  // Gamma samples an isolated, already treated material; it cannot restore source
  // colors or borrow a neighbouring material's treatment across the fixed mask.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,m=clamp(layer.mask[i]);if(m===0||original[i*4+3]===0)continue;
   let rgb:Vec3=[target[i*4],target[i*4+1],target[i*4+2]];
   if(stats.gamma.area>0){const ny=Math.floor(y/height*512),line=sensorHash(0,Math.floor(ny/3),frame.seed,p.tick);if(line<.14*stats.gamma.area){const shift=Math.round((sensorHash(1,ny,frame.seed,p.tick)-.5)*2*p.displacementPx*width/512),offset=Math.max(1,Math.round(stats.gamma.area*2*width/512));rgb=rgb.map((v,c)=>{const sx=Math.max(0,Math.min(width-1,x+shift+(c===0?offset:c===2?-offset:0))),si=y*width+sx;return layer.mask[si]>0?v*.55+target[si*4+c]*.45:v;}) as unknown as Vec3;}
    const g=gammaEvent(frame,layer,x,y,fields!.edges[i]);rgb=[rgb[0]+g*.32,rgb[1]+g*.12,rgb[2]+g*.6];
   }
   if(stats.radio.area>0||stats.microwave.area>0){
    const radio=stats.radio.area>0?.15*stats.radio.area*(.5+.5*Math.sin(y/height*(8+stats.radio.centroid*24)+frame.time*2))**12:0;
    const dx=x/width-.5,dy=y/height-.5,micro=stats.microwave.area>0?.15*stats.microwave.area*Math.exp(-(dx*dx+dy*dy)*12)*(.5+.5*Math.sin(Math.hypot(dx,dy)*(60+80*stats.microwave.centroid)-frame.time*5))**10:0;
    const signal=Math.min(.15,radio+micro);rgb=rgb.map((v,c)=>v+((c===2?.65:.3)-v)*signal) as unknown as Vec3;
   }
   for(let c=0;c<3;c++)out[i*4+c]+=(rgb[c]-original[i*4+c])*m;
  }
 }return out;
}
/** One radiance compression and one output encoding; alpha remains source alpha. */
export function finishRaster(frame:SceneFrame,base:Float32Array,radiance?:Float32Array):Raster {
 const out=new Uint8ClampedArray(frame.source.rgba.length);
 for(let i=0;i<frame.source.width*frame.source.height;i++){const a=base[i*4+3];if(a===0){out[i*4]=frame.source.rgba[i*4];out[i*4+1]=frame.source.rgba[i*4+1];out[i*4+2]=frame.source.rgba[i*4+2];continue;}const rgb=encodeSrgb([0,1,2].map(c=>1-(1-clamp(base[i*4+c]))*(radiance?Math.exp(-Math.max(0,radiance[i*4+c])/a):1)) as unknown as Vec3);for(let c=0;c<3;c++)out[i*4+c]=Math.round(clamp(rgb[c])*255);out[i*4+3]=frame.source.rgba[i*4+3];}
 return {...frame.source,rgba:out};
}
export function renderCpu(frame:SceneFrame):Raster {
 const base=composeBase(frame);
 if(!frame.layers.some(l=>l.appearance.bands.gamma.area>0||l.appearance.emissionLinear.some(v=>v>0)))return finishRaster(frame,base);
 const {emitters}=buildLightFields(frame);return finishRaster(frame,base,bloomField(emitters,frame.source.width,frame.source.height));
}
