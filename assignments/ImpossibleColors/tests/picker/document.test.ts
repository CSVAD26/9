import { describe, it, expect } from 'vitest';
import { createDocument, createHistory, validateDocument } from '../../src/picker/document';
import { editCurve, curveStats, moveCurveSample, smoothCurve } from '../../src/picker/curves';
import { BANDS, bandCoordinate, bandWavelength } from '../../src/picker/bands';
const edit = (doc:ReturnType<typeof createDocument>, value:number) => ({...doc, materials:doc.materials.map(m=>({...m,curves:{...m.curves,visible:Array(257).fill(value)}}))});
describe('curve authoring',()=>{
  it('fills every crossed sample in either direction without mutating input',()=>{
    const source=Array(257).fill(0);
    const a=editCurve(source,[{u:0,value:0},{u:1,value:1}],'draw');
    const b=editCurve(source,[{u:1,value:1},{u:0,value:0}],'draw');
    expect(a).toHaveLength(257); expect(a[128]).toBeCloseTo(.5,6); expect(a).toEqual(b); expect(source.every(v=>v===0)).toBe(true);
    expect(editCurve(a,[{u:.5,value:1}],'erase')[128]).toBe(0);
    expect(()=>editCurve(source,[{u:NaN,value:1}],'draw')).toThrow();
  });
  it('moves points, replicates endpoints for smoothing and handles empty signal',()=>{
    const a=Array(257).fill(0); a[12]=1;
    const moved=moveCurveSample(a,12,{u:20/256,value:.6});
    expect(moved[12]).toBe(0); expect(moved[20]).toBe(.6);
    expect(moveCurveSample(a,12,{u:12/256,value:.4})[12]).toBe(.4);
    a[0]=1; expect(smoothCurve(a)[0]).toBe(.75);
    expect(curveStats(Array(257).fill(0))).toEqual({area:0,centroid:.5,spread:0});
    expect(curveStats(Array(257).fill(1)).area).toBeCloseTo(1,10);
  });
  it('round trips all wavelength coordinate systems',()=>{
    for(const band of BANDS) for(const u of [0,.1,.5,.9,1]) expect(bandCoordinate(band.id,bandWavelength(band.id,u))).toBeCloseTo(u,10);
  });
});
describe('document and gesture history',()=>{
  it('previews continuously, commits one gesture and keeps runtime revision monotonic',()=>{
    const initial=createDocument(), h=createHistory(initial);
    h.begin(); h.preview(edit(initial,.2)); h.preview(edit(initial,.8)); h.commit();
    const revision=h.snapshot.revision; h.undo();
    expect(h.snapshot.document).toEqual(initial); expect(h.snapshot.revision).toBeGreaterThan(revision);
    expect(h.canUndo).toBe(false); h.redo(); expect(h.snapshot.document.materials[0].curves.visible[0]).toBe(.8);
    h.begin(); h.preview(edit(initial,1)); h.cancel(); expect(h.snapshot.document.materials[0].curves.visible[0]).toBe(.8);
  });
  it('caps undo at 100 commits and rejects invalid commands atomically',()=>{
    const h=createHistory(createDocument());
    for(let i=1;i<=101;i++){h.begin();h.preview(edit(h.snapshot.document,i/101));h.commit();}
    for(let i=0;i<100;i++)h.undo();
    expect(h.canUndo).toBe(false); expect(h.snapshot.document.materials[0].curves.visible[0]).toBeCloseTo(1/101);
    const before=h.snapshot;
    expect(()=>h.preview(edit(before.document,Infinity))).toThrow(); expect(h.snapshot).toBe(before);
  });
  it('validates material IDs, curves, limits and copies data out of caller ownership',()=>{
    const doc=structuredClone(createDocument());
    expect(()=>validateDocument({...doc,materials:Array(7).fill(doc.materials[0])})).toThrow();
    expect(()=>validateDocument({...doc,activeId:'missing'})).toThrow();
    expect(()=>validateDocument({...doc,version:2})).toThrow();
    expect(()=>validateDocument(edit(doc,-.1))).toThrow();
    const validated=validateDocument(doc); (doc.materials[0].curves.visible as number[])[0]=1;
    expect(validated.materials[0].curves.visible[0]).not.toBe(1);
  });
});
