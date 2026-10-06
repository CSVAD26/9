import { BANDS, bandCoordinate, bandWavelength, clamp } from './bands';
import { editCurve } from './curves';
import type { BandId, Curve, Curves } from './types';

export type CurveViewport = 'optical' | BandId;
export type StrokePoint = Readonly<{x:number; value:number}>;
export function viewWavelength(view:CurveViewport, x:number):number {
  return view === 'optical' ? (200 + 900 * clamp(x)) * 1e-9 : bandWavelength(view, x);
}
export function wavelengthPosition(view:CurveViewport, meters:number):number {
  return view === 'optical' ? (meters * 1e9 - 200) / 900 : bandCoordinate(view, meters);
}
export function curveLocation(view:CurveViewport, x:number, value:number) {
  const wavelength = viewWavelength(view, x);
  const band = view === 'optical' ? wavelength < 380e-9 ? 'uv' : wavelength < 780e-9 ? 'visible' : 'infrared' : view;
  return {band, u:bandCoordinate(band, wavelength), value:clamp(value)};
}

/** Clip each screen-space segment at band boundaries before rasterizing samples. */
export function editStroke(curves:Curves, view:CurveViewport, from:StrokePoint, to:StrokePoint, tool:'draw'|'erase'):Partial<Record<BandId, Curve>> {
  const result:Partial<Record<BandId, Curve>> = {};
  if(view !== 'optical') {
    result[view] = editCurve(curves[view], [{u:from.x,value:from.value},{u:to.x,value:to.value}], tool);
    return result;
  }
  const start = {x:clamp(from.x),value:clamp(from.value)}, end = {x:clamp(to.x),value:clamp(to.value)};
  for(const band of BANDS) {
    if(!['uv','visible','infrared'].includes(band.id)) continue;
    const left = Math.max(0,wavelengthPosition(view,band.range[0]));
    const right = Math.min(1,wavelengthPosition(view,band.range[1]));
    const low = Math.max(Math.min(start.x,end.x),left), high = Math.min(Math.max(start.x,end.x),right);
    if(low > high) continue;
    // A stationary point belongs to one band, including shared boundaries.
    if(start.x === end.x && curveLocation(view,start.x,start.value).band !== band.id) continue;
    const at = (x:number) => ({u:bandCoordinate(band.id,viewWavelength(view,x)),value:start.x === end.x ? end.value : start.value+(end.value-start.value)*(x-start.x)/(end.x-start.x)});
    result[band.id] = editCurve(curves[band.id], start.x <= end.x ? [at(low),at(high)] : [at(high),at(low)], tool);
  }
  return result;
}
