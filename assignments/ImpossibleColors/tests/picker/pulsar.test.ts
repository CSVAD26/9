import { it, expect } from 'vitest';
import { pulsarParameters, renderPulsarTrain, decimatePulsarTrain, firCoefficients } from '../../src/picker/audio/pulsar';
import type { AudioProfile, Sonification } from '../../src/picker/types';
const p:AudioProfile={q:new Float32Array(64).fill(1),area:1,centroid:0,width:0};
const spec=(profile=p):Sonification=>({mappingVersion:1,mode:'microwave',radio:profile,microwave:profile,fields:{luminance:new Float32Array(64).fill(1),centroidY:new Float32Array(64).fill(.5),edges:new Float32Array(64)}});
it('has real pulsarets followed by exact silent intervals',()=>{
 const a=renderPulsarTrain(spec(),96000);
 expect(a.length).toBe(768000); expect(a[80]).toBeCloseTo(.125,7);expect(a[240]).toBeCloseTo(-.125,7);
 expect([...a.slice(321,11999)].every(x=>x===0)).toBe(true);
 expect(renderPulsarTrain(spec({...p,area:0,q:new Float32Array(64)}),96000).every(x=>x===0)).toBe(true);
});
it('separates repetition from packet width and reaches specified endpoints',()=>{
 expect(pulsarParameters({...p,centroid:1},0)).toEqual({repetitionHz:128,widthHz:300});
 expect(pulsarParameters({...p,width:1},1)).toEqual({repetitionHz:8,widthHz:3600});
});
it('decimates using a bounded symmetric 63 tap filter and compensates delay',()=>{
 const taps=firCoefficients(); expect(taps.length).toBe(63);
 expect(taps.reduce((a,b)=>a+Math.abs(b),0)).toBeCloseTo(1,12);
 const impulse=new Float32Array(100); impulse[40]=1;
 const out=decimatePulsarTrain(impulse);
 expect(out.length).toBe(50);
 expect(out[20]).toBeCloseTo(taps[31],7);
 expect(out[19]).toBeCloseTo(out[21],7);
});
