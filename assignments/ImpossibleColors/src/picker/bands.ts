import type { BandId } from './types';
export const SAMPLE_COUNT = 257;
export const BANDS: readonly {id:BandId;label:string;short:string;range:readonly[number,number];linear:boolean;color:string;description:string}[] = [
  {id:'gamma',label:'Gamma',short:'γ',range:[1e-14,1e-11],linear:false,color:'#d2b7ff',description:'Fractured contours and radiation-inspired sensor glitches.'},
  {id:'xray',label:'X-ray',short:'X',range:[1e-11,1e-8],linear:false,color:'#9ddcec',description:'Slices through estimated surface depth.'},
  {id:'uv',label:'Ultraviolet',short:'UV',range:[1e-8,380e-9],linear:true,color:'#b098ff',description:'Invisible light becomes visible emission and neon glow.'},
  {id:'visible',label:'Visible',short:'VIS',range:[380e-9,780e-9],linear:true,color:'#b8f0c0',description:'Shape the material’s base color under daylight.'},
  {id:'infrared',label:'Infrared',short:'IR',range:[780e-9,1e-3],linear:false,color:'#ffab80',description:'An authored heatmap, shaped by image texture.'},
  {id:'microwave',label:'Microwave',short:'μ',range:[1e-3,1],linear:false,color:'#e8d293',description:'Windowed pulsars turn the image into a pulsing sound.'},
  {id:'radio',label:'Radio',short:'R',range:[1,1e5],linear:false,color:'#9cdacf',description:'The image excites a ringing, physically modelled string.'},
];
export const BAND_IDS = BANDS.map(b=>b.id);
export const clamp = (n:number,min=0,max=1) => Math.max(min,Math.min(max,n));
export function bandWavelength(id:BandId,u:number):number {
  if(!Number.isFinite(u)) throw Error('Invalid curve coordinate.');
  const band=BANDS.find(b=>b.id===id); if(!band)throw Error('Unknown band.');
  const [a,b]=band.range; u=clamp(u);
  return band.linear ? a+(b-a)*u : a*Math.pow(b/a,u);
}
export function bandCoordinate(id:BandId,meters:number):number {
  if(!Number.isFinite(meters)||meters<=0)throw Error('Invalid wavelength.');
  const band=BANDS.find(b=>b.id===id); if(!band)throw Error('Unknown band.');
  const [a,b]=band.range;
  return clamp(band.linear?(meters-a)/(b-a):Math.log(meters/a)/Math.log(b/a));
}
export function wavelengthLabel(m:number):string {
  if(m<1e-9)return `${+(m*1e12).toPrecision(3)} pm`;
  if(m<1e-6)return `${+(m*1e9).toPrecision(3)} nm`;
  if(m<1e-3)return `${+(m*1e6).toPrecision(3)} μm`;
  if(m<1)return `${+(m*1e3).toPrecision(3)} mm`;
  if(m<1e3)return `${+m.toPrecision(3)} m`;
  return `${+(m/1e3).toPrecision(3)} km`;
}
