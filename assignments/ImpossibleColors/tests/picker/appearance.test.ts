import { it, expect } from 'vitest';
import { createDocument } from '../../src/picker/document';
import { deriveAppearance, seedVisible } from '../../src/picker/appearance';
it('UV changes emission independently of the authored visible color',()=>{
  const curves=createDocument().materials[0].curves;
  const no=deriveAppearance(curves), uv=deriveAppearance({...curves,uv:Array(257).fill(1)});
  expect(no.emissionLinear).toEqual([0,0,0]); expect(uv.visibleLinear).toEqual(no.visibleLinear);
  expect(Math.max(...uv.emissionLinear)).toBeCloseTo(4,8);
  const short=deriveAppearance({...curves,uv:Array.from({length:257},(_,i)=>i<20?1:0)});
  const long=deriveAppearance({...curves,uv:Array.from({length:257},(_,i)=>i>230?1:0)});
  expect(short.emissionLinear[2]).toBeGreaterThan(short.emissionLinear[0]);
  expect(long.emissionLinear[0]).toBeGreaterThan(long.emissionLinear[2]);
});
it('seeding is bounded and all-zero visible contributes no color',()=>{
  const curves=createDocument().materials[0].curves;
  expect(deriveAppearance({...curves,visible:Array(257).fill(0)}).visibleLinear).toEqual([0,0,0]);
  expect(seedVisible([1,1,1]).every(v=>v>=0 && v<=1)).toBe(true);
});
