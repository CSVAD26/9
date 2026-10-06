import type { Appearance, Curves, Curve, Vec3 } from './types';
import type { SpectrumRecord } from '../domain/types';
import { createColorimetryContext, SPECTRAL_UNITS } from '../spectral/illuminants';
import { integrateColor } from '../spectral/colorimetry';
import { encodeSrgb } from '../color/srgb';
import { BAND_IDS, clamp } from './bands';
import { curveStats, sampleCurve } from './curves';
const context=createColorimetryContext();
function integrate(values:number[],emission=false):Vec3 {
  const spectrum:SpectrumRecord={id:'authored-material',kind:emission?'relative-radiance':'reflectance',sampling:'point',grid:{startNm:360,stepNm:1,count:471},values,valid:Array(471).fill(true),origin:Array(471).fill('authored'),units:emission?SPECTRAL_UNITS.relativeRadiance:SPECTRAL_UNITS.reflectance,sourceId:'authored',processing:[]};
  return integrateColor(spectrum,context).linearRgb.map(v=>Math.max(0,v)) as unknown as Vec3;
}
export function visibleLinear(curve:Curve):Vec3 {
  return integrate(Array.from({length:471},(_,i)=>{const nm=360+i;return nm>=380&&nm<=780?sampleCurve(curve,(nm-380)/400):0;})).map(v=>clamp(v)) as unknown as Vec3;
}
export function deriveAppearance(curves:Curves):Appearance {
  const bands=Object.fromEntries(BAND_IDS.map(id=>[id,curveStats(curves[id])])) as Appearance['bands'];
  let emissionLinear:Vec3=[0,0,0];
  if(bands.uv.area>0){const rgb=integrate(Array.from({length:471},(_,i)=>{const nm=360+i;return nm>=420&&nm<=700?sampleCurve(curves.uv,(nm-420)/280):0;}),true);const max=Math.max(...rgb);if(max>0)emissionLinear=rgb.map(v=>v/max*4*bands.uv.area) as unknown as Vec3;}
  return {visibleLinear:visibleLinear(curves.visible),emissionLinear,bands};
}
export function seedVisible(rgbLinear:Vec3):Curve {
  const centers=[610,545,450],sigmas=[45,35,25];
  const curve=Array.from({length:257},(_,i)=>rgbLinear.reduce((s,v,c)=>s+clamp(v)*Math.exp(-.5*((380+400*i/256-centers[c])/sigmas[c])**2),0));
  const max=Math.max(1,...curve);return curve.map(v=>v/max);
}
export function colorHex(rgb:Vec3):string {
  return '#'+encodeSrgb(rgb).map(v=>Math.round(clamp(v)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
