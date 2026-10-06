import type { AudioProfile, Sonification } from '../types';
import { sampleScanField } from './fields';
export function pulsarParameters(profile:AudioProfile,edge:number):{repetitionHz:number;widthHz:number} {
 return {repetitionHz:8*2**(4*profile.centroid),widthHz:300*2**(3*profile.width)*(1+.5*edge)};
}
/** Onset-frozen pulsaret followed by real silence, before the anti-alias filter. */
export function renderPulsarTrain(spec:Sonification,sampleRate:96000):Float32Array {
 const out=new Float32Array(8*sampleRate),profile=spec.microwave;
 if(profile.area===0)return out;
 let onset=0;
 while(onset<8){
  const scan=onset/8,{repetitionHz,widthHz}=pulsarParameters(profile,sampleScanField(spec.fields.edges,scan));
  const duration=1/widthHz,amplitude=.25*profile.area*sampleScanField(profile.q,scan)*sampleScanField(spec.fields.luminance,scan);
  for(let n=Math.ceil(onset*sampleRate);n<Math.min(out.length,Math.ceil((onset+duration)*sampleRate));n++){
   const u=(n/sampleRate-onset)/duration;
   out[n]=amplitude*Math.sin(2*Math.PI*u)*Math.sin(Math.PI*u)**2;
  }
  onset+=1/repetitionHz;
 }
 return out;
}
export function firCoefficients():Float64Array {
 const taps=new Float64Array(63),cutoff=18000/96000;let absSum=0;
 for(let i=0;i<63;i++){
  const m=i-31,sinc=m===0?2*cutoff:Math.sin(2*Math.PI*cutoff*m)/(Math.PI*m);
  taps[i]=sinc*(.54-.46*Math.cos(2*Math.PI*i/62));absSum+=Math.abs(taps[i]);
 }
 for(let i=0;i<63;i++)taps[i]/=absSum;
 return taps;
}
export function decimatePulsarTrain(input:Float32Array):Float32Array {
 const taps=firCoefficients(),out=new Float32Array(Math.ceil(input.length/2));
 // Centering the convolution at input 2*n compensates the 31-sample causal delay.
 for(let n=0;n<out.length;n++){
  let sum=0;for(let k=0;k<63;k++){const i=2*n+k-31;if(i>=0&&i<input.length)sum+=input[i]*taps[k];}
  out[n]=sum;
 }
 return out;
}
