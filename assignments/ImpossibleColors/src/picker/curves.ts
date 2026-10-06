import type { BandStats, Curve, CurvePoint } from './types';
import { clamp, SAMPLE_COUNT } from './bands';
export function assertCurve(curve:Curve):void {
  if(!Array.isArray(curve)||curve.length!==SAMPLE_COUNT)throw Error('A curve needs 257 samples.');
  for(let i=0;i<SAMPLE_COUNT;i++)if(!Number.isFinite(curve[i])||curve[i]<0||curve[i]>1)throw Error('Curve samples must be between 0 and 1.');
}
export function sampleCurve(curve:Curve,u:number):number {
  const t=clamp(u)*(curve.length-1), i=Math.floor(t);
  return curve[i]+(curve[Math.min(i+1,curve.length-1)]-curve[i])*(t-i);
}
export function editCurve(curve:Curve,points:readonly CurvePoint[],mode:'draw'|'erase'):Curve {
  assertCurve(curve);
  if(mode!=='draw'&&mode!=='erase')throw Error('Unknown curve tool.');
  const next=curve.slice(); let previous:{i:number;value:number}|undefined;
  for(const point of points){
    if(!Number.isFinite(point.u)||!Number.isFinite(point.value))throw Error('Invalid curve point.');
    const current={i:Math.round(clamp(point.u)*256),value:mode==='erase'?0:clamp(point.value)};
    const start=previous||current, distance=Math.abs(current.i-start.i);
    for(let step=0;step<=distance;step++){
      const t=distance?step/distance:1;
      next[Math.round(start.i+(current.i-start.i)*t)]=start.value+(current.value-start.value)*t;
    }
    previous=current;
  }
  return next;
}
export function moveCurveSample(curve:Curve,fromIndex:number,to:CurvePoint):Curve {
  assertCurve(curve);
  if(!Number.isInteger(fromIndex)||fromIndex<0||fromIndex>256||!Number.isFinite(to.u)||!Number.isFinite(to.value))throw Error('Invalid point.');
  const next=curve.slice(), dest=Math.round(clamp(to.u)*256);
  if(dest!==fromIndex)next[fromIndex]=(curve[Math.max(0,fromIndex-1)]+curve[Math.min(256,fromIndex+1)])/2;
  next[dest]=clamp(to.value); return next;
}
export function smoothCurve(curve:Curve):Curve {
  assertCurve(curve);
  return curve.map((v,i)=>(curve[Math.max(0,i-1)]+2*v+curve[Math.min(256,i+1)])/4);
}
export function curveStats(curve:Curve):BandStats {
  let sum=0,moment=0,second=0;
  curve.forEach((v,i)=>{const w=v*(i===0||i===curve.length-1?.5:1), u=i/(curve.length-1);sum+=w;moment+=w*u;second+=w*u*u;});
  if(!sum)return {area:0,centroid:.5,spread:0};
  const centroid=moment/sum;
  return {area:sum/(curve.length-1),centroid,spread:Math.sqrt(Math.max(0,second/sum-centroid*centroid))};
}
