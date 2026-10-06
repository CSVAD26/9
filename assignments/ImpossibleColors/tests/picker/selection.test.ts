import { describe, expect, it } from 'vitest';
import { selectionMask, sourcePoint } from '../../src/picker/selection';
import { sourceFields } from '../../src/picker/fields';
import type { Raster, Selection } from '../../src/picker/types';
const raster = (colors:number[][]):Raster => ({width:colors.length,height:1,rgba:new Uint8ClampedArray(colors.flat())});
const selected:Selection = {kind:'color',rgb:[1,0,0],tolerance:.1,strokes:[]};
describe('original image selection', () => {
  it('selects original RGB without multiplying partial alpha into its weight', () => {
    expect([...selectionMask(raster([[255,0,0,128],[0,255,0,255],[255,0,0,0]]),selected)]).toEqual([1,0,0]);
  });
  it('applies ordered refinement strokes and rasterizes the full segment', () => {
    const source=raster(Array.from({length:9},()=>[0,255,0,255]));
    const add={mode:'add' as const,radius:.5,strength:1,points:[[0,.5],[1,.5]] as const};
    const erase={mode:'erase' as const,radius:.5,strength:1,points:[[.5,.5]] as const};
    const original=selectionMask(source,selected);
    const added=selectionMask(source,{...selected,strokes:[add]});
    const refined=selectionMask(source,{...selected,strokes:[add,erase]});
    expect([...original]).toEqual(Array(9).fill(0));
    expect([...added]).toEqual(Array(9).fill(1));
    expect(refined[4]).toBe(0); expect(refined[0]).toBe(1);
    expect([...selectionMask(source,selected)]).toEqual([...original]);
  });
  it('excludes letterbox padding while accepting the image edge', () => {
    const source=raster([[0,0,0,255],[0,0,0,255]]);
    const bounds={left:10,top:20,width:200,height:200};
    expect(sourcePoint(10,70,bounds,source)).toEqual([0,0]);
    expect(sourcePoint(210,170,bounds,source)).toEqual([1,1]);
    expect(sourcePoint(110,69,bounds,source)).toBeNull();
  });
  it('clears hidden color and leaves uniform opaque images without obstacles', () => {
    const hidden=sourceFields(raster([[255,255,255,0],[255,255,255,0]]));
    expect([...hidden.luminance]).toEqual([0,0]); expect([...hidden.edges]).toEqual([0,0]);
    const uniform=sourceFields(raster([[255,255,255,255],[255,255,255,255]]));
    expect([...uniform.edges]).toEqual([0,0]); expect(uniform.luminance[0]).toBeCloseTo(1,6);
  });
  it('keeps the fixed selection when appearance revisions recolor the selected pixels',()=>{
    const original=raster([[255,0,0,255],[0,255,0,255]]);
    const mask=selectionMask(original,selected);
    const recolored=raster([[0,0,255,255],[0,255,0,255]]);
    expect([...mask]).toEqual([1,0]);
    expect([...selectionMask(original,selected)]).toEqual([1,0]);
    expect([...selectionMask(recolored,selected)]).toEqual([0,0]);
  });
});
