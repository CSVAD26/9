import type { StereoPCM } from '../types';
export function encodeWav(pcm:StereoPCM,volume:number):Uint8Array {
 if(pcm.sampleRate!==48000||pcm.left.length!==384000||pcm.right.length!==384000||!Number.isFinite(volume)||volume<0||volume>1)throw new Error('Invalid audio export');
 const bytes=new Uint8Array(44+pcm.left.length*4),view=new DataView(bytes.buffer);
 const text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
 text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
 view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,48000,true);view.setUint32(28,192000,true);
 view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,pcm.left.length*4,true);
 for(let i=0;i<pcm.left.length;i++)for(let channel=0;channel<2;channel++){
  const raw=(channel===0?pcm.left[i]:pcm.right[i])*volume;if(!Number.isFinite(raw))throw new Error('Nonfinite audio export');
  const s=Math.max(-1,Math.min(1,raw));view.setInt16(44+i*4+channel*2,Math.round(s*(s<0?32768:32767)),true);
 }
 return bytes;
}
