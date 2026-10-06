import { describe, it, expect } from 'vitest';
import { extractScanFields } from '../../src/picker/audio/fields';
import { audioProfile, compileSonification } from '../../src/picker/audio/profile';
import type { Curves } from '../../src/picker/types';

describe('source score', () => {
  it('divides masked luminance by full column area and keeps an empty centroid centered', () => {
    const rgba = new Uint8ClampedArray([255,255,255,255,255,255,255,255]);
    const fields = extractScanFields({width:1,height:2,rgba},new Float32Array([1,0]));
    expect(fields.luminance[0]).toBeCloseTo(0.5);
    expect(fields.centroidY[0]).toBeCloseTo(0.25);
    const empty = extractScanFields({width:1,height:2,rgba},new Float32Array(2));
    expect([...empty.luminance]).toEqual(Array(64).fill(0));
    expect([...empty.centroidY]).toEqual(Array(64).fill(0.5));
  });
  it('ignores hidden RGB and computes linear rather than encoded luminance', () => {
    expect(extractScanFields({width:1,height:1,rgba:new Uint8ClampedArray([255,255,255,0])},new Float32Array([1])).luminance[0]).toBe(0);
    expect(extractScanFields({width:1,height:1,rgba:new Uint8ClampedArray([128,128,128,255])},new Float32Array([1])).luminance[0]).toBeCloseTo(0.215861,5);
  });
  it('reverses the authored wavelength profile and handles silence', () => {
    const ascending=Array.from({length:257},(_,i)=>i/256);
    const p=audioProfile(ascending);
    expect(p.q[0]).toBe(1); expect(p.q[63]).toBe(0);
    expect(p.area).toBeCloseTo(0.5);
    expect(audioProfile(Array(257).fill(0))).toMatchObject({area:0,centroid:0.5,width:0});
    const curves:Curves={gamma:ascending,xray:ascending,uv:ascending,visible:ascending,infrared:ascending,microwave:ascending,radio:ascending};
    expect(compileSonification(extractScanFields({width:1,height:1,rgba:new Uint8ClampedArray(4)},new Float32Array([1])),curves,'both').mappingVersion).toBe(1);
  });
  it('retains normalized source edges and applies alpha and mask to their full-area average',()=>{
    const source={width:2,height:1,rgba:new Uint8ClampedArray([0,0,0,255,255,255,255,255])};
    const whole=extractScanFields(source,new Float32Array([1,1]));
    expect(whole.edges[0]).toBeCloseTo(Math.SQRT1_2);
    const masked=extractScanFields(source,new Float32Array([0,.5]));
    expect(masked.edges[0]).toBe(0);expect(masked.edges[63]).toBeCloseTo(Math.SQRT1_2*.5);
  });
});
