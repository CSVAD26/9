import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {composeBase,renderCpu} from '../../src/picker/render/cpu';
import * as radiance from '../../src/picker/render/radiance';
import type {SceneFrame} from '../../src/picker/types';

function fixture(mode:'zero'|'visible'|'mixed'):SceneFrame {
 const width=32,height=24,n=width*height,rgba=new Uint8ClampedArray(n*4);
 for(let i=0;i<n;i++)rgba.set([(i*73)%256,(i*37+11)%256,(i*17+51)%256,[0,64,128,255][i%4]],i*4);
 const bands=Object.fromEntries(['gamma','xray','uv','visible','infrared','microwave','radio'].map((id,j)=>[id,{area:mode==='mixed'?.15+j*.09:0,centroid:.2+j*.1,spread:.12}])) as SceneFrame['layers'][number]['appearance']['bands'];
 const layer=(id:string,second=false)=>({materialId:id,mask:Float32Array.from({length:n},(_,i)=>second?(i%7)/10:1-(i%7)/10),deltaOklab:(mode==='zero'?[0,0,0]:second?[-.07,.03,-.04]:[.04,-.03,.02]) as [number,number,number],appearance:{visibleLinear:[.3,.4,.5] as const,emissionLinear:(mode==='mixed'?[.1,.6,.4]:[0,0,0]) as [number,number,number],bands}});
 return {revision:3,seed:236,time:1.7,source:{width,height,rgba},depth:{width,height,imageHash:'fixture',modelHash:'known',values:Float32Array.from({length:n},(_,i)=>i/(n-1))},layers:mode==='mixed'?[layer('first'),layer('second',true)]:[layer('first')]};
}
function digest(values:Uint8ClampedArray|Float32Array){return createHash('sha256').update(new Uint8Array(values.buffer,values.byteOffset,values.byteLength)).digest('hex');}
it('captures exact existing CPU raster and linear-base contracts for zero, visible and mixed effects',()=>{
 const results=Object.fromEntries((['zero','visible','mixed'] as const).map(mode=>{const frame=fixture(mode);return [mode,{rgba:digest(renderCpu(frame).rgba),base:digest(composeBase(frame))}];}));
 expect(results).toEqual({
  zero:{rgba:'09fa588f1fbcaa813eafa27522b4ed1adc5e2faee204302cef6acf39fa4c49a3',base:'33c297e9405e22873779c99a759b2899389070e09e3ee71dd1dd027c68412a88'},
  visible:{rgba:'fea4275d6f6ab80b060556b80959ad9e365d65d1527e27b2d89d1dcbf78381e4',base:'8a8c6cde13b9321bff7e2751b1464aa457ca02727ae390b3327d5092ef23bc53'},
  mixed:{rgba:'ade22848d6885104f0dbf7e27e7f5bb3699bc51b594c848937c89af9f24c519f',base:'9b279a6724a10dbb02ab72eca8ef6bb71618bb9eb2b3ead7bf89aa385d0c1730'},
 });
});
it('does not construct light fields or run bloom for an unlit visible-only edit',()=>{
 const fields=vi.spyOn(radiance,'buildLightFields'),bloom=vi.spyOn(radiance,'bloomField');
 try{renderCpu(fixture('visible'));expect(fields).not.toHaveBeenCalled();expect(bloom).not.toHaveBeenCalled();}
 finally{fields.mockRestore();bloom.mockRestore();}
});
