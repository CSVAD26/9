import { expect, it } from 'vitest';
import { createDepthEstimator, normalizeDepth, preprocessDepth, remapDepth, type DepthBackend } from '../../src/picker/depth';
import { DEPTH_MANIFEST } from '../../src/picker/depth-manifest';
import type { Raster } from '../../src/picker/types';
const source:Raster={width:2,height:1,rgba:new Uint8ClampedArray([255,0,0,255,0,0,255,255])};
it('preprocesses original oriented RGB in NCHW and preserves aspect with padding',()=>{
  const prepared=preprocessDepth(source,4,4);
  expect(prepared.rect).toEqual({x:0,y:1,width:4,height:2});
  expect(prepared.tensor).toHaveLength(48);
  expect(prepared.tensor[0]).toBe(.5);expect(prepared.tensor[4]).toBe(1);expect(prepared.tensor[7]).toBe(0);
  expect(prepared.tensor[32+4]).toBe(0);expect(prepared.tensor[32+7]).toBe(1);
  const hidden=preprocessDepth({...source,rgba:new Uint8ClampedArray([255,0,0,0,0,0,255,0])},4,4);
  expect([...hidden.tensor]).toEqual(Array(48).fill(.5));
});
it('remaps the full source through its padded rectangle and keeps near-to-far ordering',()=>{
  const output=new Float32Array([100,100,100,100,1,1,3,3,1,1,3,3,100,100,100,100]);
  expect([...remapDepth(output,4,4,{x:0,y:1,width:4,height:2},2,1)]).toEqual([1,3]);
  expect([...normalizeDepth(new Float32Array([1,2,3]))]).toEqual([0,.5,1]);
  expect([...normalizeDepth(new Float32Array([4,4,4]))]).toEqual([.5,.5,.5]);
  expect(()=>normalizeDepth(new Float32Array([NaN]))).toThrow();
  expect(()=>normalizeDepth(new Float32Array([-1,-2]))).toThrow();
});
it('caches one inference for twenty curve edits of an unchanged source',async()=>{
  let inferenceCalls=0;
  const backend:DepthBackend={async run(){inferenceCalls++;return new Float32Array(320*256).fill(2);},async dispose(){}};
  const estimator=createDepthEstimator({backend:async()=>backend});
  const first=await estimator.estimate(source,'same',new AbortController().signal);
  for(let i=0;i<20;i++)expect(await estimator.estimate(source,'same',new AbortController().signal)).toBe(first);
  expect(inferenceCalls).toBe(1);expect(first.modelHash).toBe(DEPTH_MANIFEST.sha256);expect([...first.values]).toEqual([.5,.5]);
  await estimator.dispose();
});
it('discards cancelled and out-of-order source jobs and never caches their result',async()=>{
  const pending:((values:Float32Array)=>void)[]=[];let calls=0;
  const backend:DepthBackend={run(){calls++;return new Promise(resolve=>pending.push(resolve));},async dispose(){}};
  const estimator=createDepthEstimator({backend:async()=>backend});
  const oldAbort=new AbortController();const old=estimator.estimate(source,'old',oldAbort.signal);const rejected=expect(old).rejects.toMatchObject({name:'AbortError'});
  await Promise.resolve();await Promise.resolve();oldAbort.abort();
  const next=estimator.estimate(source,'new',new AbortController().signal);
  await Promise.resolve();await Promise.resolve();
  pending[0](new Float32Array(320*256).fill(1));pending[1](new Float32Array(320*256).fill(3));
  await rejected;expect((await next).imageHash).toBe('new');
  const retry=estimator.estimate(source,'old',new AbortController().signal);await Promise.resolve();await Promise.resolve();
  pending[2](new Float32Array(320*256).fill(2));expect((await retry).imageHash).toBe('old');expect(calls).toBe(3);
  await estimator.dispose();
});
it('allows retry after an unavailable runtime while preserving the source',async()=>{
  let attempts=0;
  const estimator=createDepthEstimator({backend:async()=>{if(++attempts===1)throw Error('Runtime unavailable');return {async run(){return new Float32Array(320*256).fill(1);},async dispose(){}};}});
  await expect(estimator.estimate(source,'image',new AbortController().signal)).rejects.toThrow('Runtime unavailable');
  expect((await estimator.estimate(source,'image',new AbortController().signal)).imageHash).toBe('image');await estimator.dispose();
});
it('rejects cancellation promptly while a native inference is still running',async()=>{
  let finish!:(values:Float32Array)=>void;
  const estimator=createDepthEstimator({backend:async()=>({run(){return new Promise(resolve=>{finish=resolve;});},async dispose(){}})});
  const controller=new AbortController(),job=estimator.estimate(source,'image',controller.signal);
  const rejected=expect(job).rejects.toMatchObject({name:'AbortError'});
  await Promise.resolve();await Promise.resolve();controller.abort();
  await rejected;
  finish(new Float32Array(320*256).fill(1));await estimator.dispose();
},200);
