import { expect, it } from 'vitest';
import { createDocument } from '../../src/picker/document';
import { buildScene, createStarterScene } from '../../src/picker/scene';
import { renderCpu } from '../../src/picker/render/cpu';
import { buildLightFields } from '../../src/picker/render/radiance';
import { decodeSrgb } from '../../src/color/srgb';
import type { PickerDocument, Raster } from '../../src/picker/types';
const pixels:Raster={width:1,height:1,rgba:new Uint8ClampedArray([100,120,140,255])};
it('uses an identical imported baseline so a selected image starts with zero color delta', () => {
  const document={...createDocument(),image:{hash:'test',name:'test.png',width:1,height:1}};
  expect(buildScene({document,revision:4},pixels).layers[0].deltaOklab).toEqual([0,0,0]);
  const rendered=renderCpu(buildScene({document,revision:4},pixels));
  rendered.rgba.forEach((value,i)=>expect(Math.abs(value-pixels.rgba[i])).toBeLessThanOrEqual(1));
});
it('gives later assignments priority without applying source alpha twice', () => {
  const initial=createDocument(); const base=initial.materials[0];
  const document:PickerDocument={...initial,image:{hash:'test',name:'test.png',width:1,height:1},materials:[base,{...base,id:'second'}]};
  const frame=buildScene({document,revision:5},{...pixels,rgba:new Uint8ClampedArray([100,120,140,128])});
  expect([...frame.layers[0].mask]).toEqual([0]); expect([...frame.layers[1].mask]).toEqual([1]);
  expect(frame.revision).toBe(5);
});
it('generates deterministic known neutral geometry with independent obstacles', () => {
  const first=createStarterScene(),second=createStarterScene();
  expect(first.pixels).toEqual(second.pixels); expect(first.occlusion).toEqual(second.occlusion);
  expect(Math.max(first.pixels.width,first.pixels.height)).toBe(512);
  expect(first.occlusion.some(v=>v===1)).toBe(true); expect(first.occlusion.some(v=>v===0)).toBe(true);
  const frame=buildScene({document:createDocument(),revision:0},first.pixels,undefined,first.occlusion);
  expect(frame.layers[0].deltaOklab.some(v=>v!==0)).toBe(true);
});
it('rejects mismatched or stale depth instead of attaching it to a new image', () => {
  const document={...createDocument(),image:{hash:'new',name:'new.png',width:1,height:1}};
  expect(buildScene({document,revision:8},pixels,{imageHash:'old',modelHash:'model',width:1,height:1,values:new Float32Array([.5])}).depth).toBeUndefined();
});
it('keeps the starter background and separate receiver geometry unchanged by visible material edits', () => {
  const scene=createStarterScene(),document=createDocument();
  const frame=buildScene({document,revision:10},scene.pixels,scene.knownDepth,scene.occlusion,scene.materialMask);
  const rendered=renderCpu(frame);
  const at=(x:number,y:number)=>y*scene.pixels.width+x;
  for(const i of [at(20,20),at(490,350),at(410,240),at(355,180)]) {
    expect(scene.materialMask[i]).toBe(0);
    expect([...rendered.rgba.slice(i*4,i*4+4)]).toEqual([...scene.pixels.rgba.slice(i*4,i*4+4)]);
  }
  const center=at(208,176);
  expect(scene.materialMask[center]).toBe(1);
  expect([...rendered.rgba.slice(center*4,center*4+3)]).not.toEqual([...scene.pixels.rgba.slice(center*4,center*4+3)]);
  const neutral=decodeSrgb([scene.pixels.rgba[center*4]/255,scene.pixels.rgba[center*4+1]/255,scene.pixels.rgba[center*4+2]/255]);
  neutral.forEach(value=>expect(value).toBeCloseTo(.5,2));
  expect(scene.materialMask.some(value=>value>0&&value<1)).toBe(true);
});
it('restricts starter UV emitters to the material footprint while keeping its blocker independent', () => {
  const scene=createStarterScene(),initial=createDocument();
  const document={...initial,materials:initial.materials.map(material=>({...material,curves:{...material.curves,uv:Array(257).fill(.8)}}))};
  const frame=buildScene({document,revision:11},scene.pixels,scene.knownDepth,scene.occlusion,scene.materialMask);
  const light=buildLightFields(frame);
  let emitted=0,outsideEmission=0,blockerOverlap=0;
  for(let i=0;i<scene.materialMask.length;i++) {
    if(scene.materialMask[i]===0)outsideEmission+=light.emitters[i*4]+light.emitters[i*4+1]+light.emitters[i*4+2];
    else emitted+=light.emitters[i*4]+light.emitters[i*4+1]+light.emitters[i*4+2];
    if(scene.occlusion[i]>0)blockerOverlap+=scene.materialMask[i];
  }
  expect(outsideEmission).toBe(0);expect(blockerOverlap).toBe(0);
  expect(emitted).toBeGreaterThan(0);
});
it('supplies deterministic authored near/far geometry depth only for the starter', () => {
  const scene=createStarterScene(),depth=scene.knownDepth;
  expect(depth.width).toBe(scene.pixels.width);expect(depth.height).toBe(scene.pixels.height);
  expect(depth.values.length).toBe(scene.materialMask.length);
  expect(depth.values.every(value=>Number.isFinite(value)&&value>=0&&value<=1)).toBe(true);
  const at=(x:number,y:number)=>y*depth.width+x;
  expect(depth.values[at(208,176)]).toBeLessThan(depth.values[at(20,20)]);
  expect(depth.values[at(355,180)]).toBeLessThan(depth.values[at(420,240)]);
  expect(buildScene({document:createDocument(),revision:0},scene.pixels,depth,scene.occlusion,scene.materialMask).depth).toBe(depth);
  const photo={...createDocument(),image:{hash:'real-photo',name:'photo.png',width:512,height:384}};
  expect(buildScene({document:photo,revision:1},scene.pixels,depth).depth).toBeUndefined();
});
it('multiplies the footprint after resolving assignment priority and leaves photo masks unchanged when omitted', () => {
  const initial=createDocument(),base=initial.materials[0];
  const document={...initial,materials:[base,{...base,id:'later'}]};
  const source={width:2,height:1,rgba:new Uint8ClampedArray([100,100,100,255,100,100,100,255])};
  const footprint=new Float32Array([.25,.75]);
  const frame=buildScene({document,revision:1},source,undefined,undefined,footprint);
  expect([...frame.layers[0].mask]).toEqual([0,0]);expect([...frame.layers[1].mask]).toEqual([.25,.75]);
  expect([...buildScene({document,revision:1},source).layers[1].mask]).toEqual([1,1]);
  expect([...footprint]).toEqual([.25,.75]);
  expect(()=>buildScene({document,revision:1},source,undefined,undefined,new Float32Array(1))).toThrow(/footprint/i);
  expect(()=>buildScene({document,revision:1},source,undefined,undefined,new Float32Array([NaN,1]))).toThrow(/footprint/i);
});
