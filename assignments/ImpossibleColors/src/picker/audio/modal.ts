import type { AudioProfile, Sonification } from '../types';
import { sampleScanField } from './fields';
export function stringModes(profile:AudioProfile):readonly {frequency:number;decaySeconds:number;weight:number}[] {
 return Array.from({length:8},(_,i)=>{
  let weight=0;for(let j=0;j<8;j++)weight+=profile.q[i*8+j]/8;
  return {frequency:(i+1)*80*2**(2*profile.centroid),decaySeconds:(.15+1.35*profile.width)/(1+.08*i*i),weight};
 });
}
export function renderModalString(spec:Sonification):Float32Array {
 const out=new Float32Array(384000);if(spec.radio.area===0)return out;
 const modes=stringModes(spec.radio),real=new Float64Array(8),imag=new Float64Array(8);
 const cos=modes.map(m=>Math.exp(-1/(48000*m.decaySeconds))*Math.cos(2*Math.PI*m.frequency/48000));
 const sin=modes.map(m=>Math.exp(-1/(48000*m.decaySeconds))*Math.sin(2*Math.PI*m.frequency/48000));
 const harmonicSum=2.7178571428571425,gain=.25*(1-Math.exp(-.125/1.5))/harmonicSum;
 for(let n=0;n<out.length;n++){
  if(n%6000===0){
   const scan=n/384000,light=sampleScanField(spec.fields.luminance,scan),xe=.1+.8*sampleScanField(spec.fields.centroidY,scan);
   for(let k=1;k<=8;k++)real[k-1]+=gain*light*modes[k-1].weight*Math.sin(k*Math.PI*xe)*Math.sin(k*Math.PI*.37)/k;
  }
  let sum=0;
  for(let i=0;i<8;i++){sum+=imag[i];const r=real[i];real[i]=r*cos[i]-imag[i]*sin[i];imag[i]=r*sin[i]+imag[i]*cos[i];}
  out[n]=sum;
 }
 return out;
}
