import type { Sonification, StereoPCM } from '../types';
import { renderModalString } from './modal';
import { decimatePulsarTrain, renderPulsarTrain } from './pulsar';
export function renderSonification(spec:Sonification):StereoPCM {
 const radio=spec.mode==='microwave'?null:renderModalString(spec);
 const microwave=spec.mode==='radio'?null:decimatePulsarTrain(renderPulsarTrain(spec,96000));
 const left=new Float32Array(384000),right=new Float32Array(384000);
 for(let n=0;n<left.length;n++){
  const scan=n/(left.length-1),fade=Math.min(1,n/960,(left.length-1-n)/960),sample=((radio?.[n]??0)+(microwave?.[n]??0))*fade;
  left[n]=sample===0?0:sample*Math.cos(scan*Math.PI/2);right[n]=sample===0?0:sample*Math.sin(scan*Math.PI/2);
 }
 return {sampleRate:48000,left,right};
}
