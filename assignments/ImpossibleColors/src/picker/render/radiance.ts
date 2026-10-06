import type {SceneFrame} from '../types';
import {sourceFields} from '../fields';
import {clamp,gammaEvent,smoothstep} from './gamma';
/** RGB premultiplied by source alpha; A records the independent emitter footprint. */
export function buildLightFields(frame:SceneFrame):{emitters:Float32Array;occlusion:Float32Array} {
 const {width,height,rgba}=frame.source,n=width*height,{edges}=sourceFields(frame.source),emitters=new Float32Array(n*4),occlusion=new Float32Array(n);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,a=rgba[i*4+3]/255;occlusion[i]=frame.occlusionOverride?clamp(frame.occlusionOverride[i]):smoothstep(.2,.5,edges[i])*a;
  for(const layer of frame.layers){const m=clamp(layer.mask[i]),e=layer.appearance.emissionLinear,g=gammaEvent(frame,layer,x,y,edges[i]);
   const footprint=m*a*(.15+.85*edges[i]);
   for(let c=0;c<3;c++)emitters[i*4+c]+=footprint*e[c]+m*a*g*(c===2?2.5:1.2);
   emitters[i*4+3]=Math.max(emitters[i*4],emitters[i*4+1],emitters[i*4+2])>0?1:0;
  }
 }
 return {emitters,occlusion};
}
/** Numeric visibility fixture independent of bloom; GPU sphere tracing has this contract. */
export function traceVisibility(occlusion:Float32Array,width:number,height:number,a:readonly[number,number],b:readonly[number,number]):number {
 const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);let visibility=1;
 for(let j=1;j<steps;j++){const t=j/steps,x=Math.floor(a[0]+(b[0]-a[0])*t),y=Math.floor(a[1]+(b[1]-a[1])*t);if(x>=0&&x<width&&y>=0&&y<height)visibility*=1-clamp(occlusion[y*width+x]);if(visibility<.001)return 0;}return visibility;
}
/** Bounded separable bloom for the explicitly reduced CPU path and final GPU core glow. */
export function bloomField(emitters:Float32Array,width:number,height:number):Float32Array {
 const temp=new Float32Array(emitters.length),out=new Float32Array(emitters.length),radius=Math.max(2,Math.round(Math.max(width,height)/64));
 const weights=Array.from({length:2*radius+1},(_,i)=>Math.exp(-(((i-radius)/(radius*.6))**2)/2)),sum=weights.reduce((a,b)=>a+b,0);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){let v=0;for(let j=-radius;j<=radius;j++)v+=emitters[(y*width+Math.max(0,Math.min(width-1,x+j)))*4+c]*weights[j+radius];temp[(y*width+x)*4+c]=v/sum;}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){let v=0;for(let j=-radius;j<=radius;j++)v+=temp[(Math.max(0,Math.min(height-1,y+j))*width+x)*4+c]*weights[j+radius];out[(y*width+x)*4+c]=.3*v/sum+.35*emitters[(y*width+x)*4+c];}return out;
}
