import { it, expect } from 'vitest';
import { renderSonification } from '../../src/picker/audio/pcm';
import type { Sonification } from '../../src/picker/types';
const profile={q:new Float32Array(64).fill(1),area:1,centroid:.5,width:1};
const spec:Sonification={mappingVersion:1,mode:'both',radio:profile,microwave:profile,fields:{luminance:new Float32Array(64).fill(1),centroidY:new Float32Array(64).fill(.5),edges:new Float32Array(64).fill(1)}};
it('returns finite deterministic 8 second stereo with bounded gain and entry/exit fades',()=>{
 for(const mode of ['radio','microwave','both'] as const){
  const pcm=renderSonification({...spec,mode});
  expect(pcm.sampleRate).toBe(48000); expect(pcm.left.length).toBe(384000); expect(pcm.right.length).toBe(384000);
  const bound=mode==='both'?.500001:.250001;
  expect(pcm.left.every(x=>Number.isFinite(x)&&Math.abs(x)<=bound)).toBe(true);
  expect(pcm.right.every(x=>Number.isFinite(x)&&Math.abs(x)<=bound)).toBe(true);
  expect(pcm.left[0]).toBe(0); expect(pcm.right[383999]).toBe(0);
  const again=renderSonification({...spec,mode});
  expect(Buffer.from(again.left.buffer).equals(Buffer.from(pcm.left.buffer))).toBe(true);
  expect(Buffer.from(again.right.buffer).equals(Buffer.from(pcm.right.buffer))).toBe(true);
 }
},15000);
it('is exactly silent for a source with no image contribution',()=>{
 const pcm=renderSonification({...spec,fields:{...spec.fields,luminance:new Float32Array(64)}});
 expect(pcm.left.every(x=>x===0)).toBe(true);expect(pcm.right.every(x=>x===0)).toBe(true);
});
