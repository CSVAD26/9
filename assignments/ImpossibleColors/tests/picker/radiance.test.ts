import { describe, expect, it } from 'vitest';
import { buildLightFields, traceVisibility } from '../../src/picker/render/radiance';
import type { SceneFrame, Appearance } from '../../src/picker/types';
export function frame(width=16,height=8):SceneFrame {
 const zero={area:0,centroid:.5,spread:0};
 const appearance:Appearance={visibleLinear:[.3,.3,.3],emissionLinear:[0,0,0],bands:{gamma:zero,xray:zero,uv:zero,visible:zero,infrared:zero,microwave:zero,radio:zero}};
 return {revision:7,seed:236,time:0,source:{width,height,rgba:new Uint8ClampedArray(width*height*4).fill(128)},layers:[{materialId:'one',mask:new Float32Array(width*height).fill(1),deltaOklab:[0,0,0],appearance}]};
}
describe('light fields',()=>{
 it('opaque uniform photographs are receivers rather than a wall',()=>{const f=frame();for(let i=3;i<f.source.rgba.length;i+=4) f.source.rgba[i]=255;expect(Math.max(...buildLightFields(f).occlusion)).toBe(0);});
 it('zero UV/gamma and hidden RGB emit nothing',()=>{const f=frame();expect(buildLightFields(f).emitters.every(v=>v===0)).toBe(true); const bright={...f,layers:[{...f.layers[0],appearance:{...f.layers[0].appearance,emissionLinear:[4,2,0] as const}}]};for(let i=3;i<f.source.rgba.length;i+=4)f.source.rgba[i]=0;expect(buildLightFields(bright).emitters.every(v=>v===0)).toBe(true);});
 it('obstacles reduce line visibility to an emitter',()=>{const w=16,o=new Float32Array(w*8);expect(traceVisibility(o,w,8,[2,4],[13,4])).toBe(1);for(let y=0;y<8;y++)o[y*w+8]=1;expect(traceVisibility(o,w,8,[2,4],[13,4])).toBe(0);});
 it('UV and gamma emit into one field and preserve two material hues',()=>{const f=frame(),n=f.source.width*f.source.height,redMask=new Float32Array(n),blueMask=new Float32Array(n);redMask[0]=1;blueMask[1]=1;const red={...f.layers[0],mask:redMask,appearance:{...f.layers[0].appearance,emissionLinear:[4,0,0] as const}},blue={...f.layers[0],mask:blueMask,appearance:{...f.layers[0].appearance,emissionLinear:[0,0,4] as const}};const fields=buildLightFields({...f,layers:[red,blue]});expect(fields.emitters[0]).toBeGreaterThan(0);expect(fields.emitters[2]).toBe(0);expect(fields.emitters[4]).toBe(0);expect(fields.emitters[6]).toBeGreaterThan(0);});
});
