import { it, expect } from 'vitest';
import { stringModes, renderModalString } from '../../src/picker/audio/modal';
import type { AudioProfile, Sonification } from '../../src/picker/types';
const p:AudioProfile={q:new Float32Array(64).fill(1),area:1,centroid:1,width:1};
const spec=(v=.5):Sonification=>({mappingVersion:1,mode:'radio',radio:p,microwave:p,fields:{luminance:new Float32Array([1,...Array(63).fill(0)]),centroidY:new Float32Array(64).fill(v),edges:new Float32Array(64)}});
it('uses eight harmonic string modes and specified damping',()=>{
 const modes=stringModes(p);
 expect(modes.map(m=>m.frequency)).toEqual([320,640,960,1280,1600,1920,2240,2560]);
 expect(modes[0].decaySeconds).toBe(1.5); expect(modes[7].decaySeconds).toBeCloseTo(1.5/4.92);
 expect(modes.every(m=>m.weight===1)).toBe(true);
});
it('rings after excitation ends with decaying energy and spatial coupling',()=>{
 const a=renderModalString(spec()), b=renderModalString(spec(.1));
 expect(a[0]).toBe(0);expect(a[1]).toBeCloseTo(-.000043712651201277876,10);
 const energy=(start:number,end:number)=>a.slice(start*48000,end*48000).reduce((s,x)=>s+x*x,0);
 expect(energy(1,2)).toBeGreaterThan(energy(4,5)*10);
 expect(a.some((x,i)=>Math.abs(x-b[i])>1e-5)).toBe(true);
 expect(a.every(Number.isFinite)).toBe(true);
});
