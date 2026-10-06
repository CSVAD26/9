import { expect, it } from 'vitest';
import { appendBrushPoint } from '../../src/picker/brush';

it('keeps the whole stroke and current endpoint after more than 1024 pointer samples',()=>{
  let points:readonly (readonly [number,number])[]=[];
  for(let i=0;i<2500;i++)points=appendBrushPoint(points,[i/2499,.5+.3*Math.sin(i/2499*Math.PI*4)]);
  expect(points.length).toBeLessThanOrEqual(1024);
  expect(points[0]).toEqual([0,.5]);
  expect(points.at(-1)![0]).toBe(1);
  expect(points.some(p=>p[0]>.9)).toBe(true);
  for(const x of [.1,.3,.5,.7,.9]){
    const nearest=points.reduce((a,b)=>Math.abs(a[0]-x)<Math.abs(b[0]-x)?a:b);
    expect(Math.abs(nearest[1]-(.5+.3*Math.sin(x*Math.PI*4)))).toBeLessThan(.015);
  }
});
it('deduplicates stationary pointer samples without consuming the point budget',()=>{
  const points=appendBrushPoint([[.1,.2]],[.1,.2]);
  expect(points).toEqual([[.1,.2]]);
});
