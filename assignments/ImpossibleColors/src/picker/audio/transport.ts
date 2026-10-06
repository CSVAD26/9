import type { StereoPCM } from '../types';
export type AudioState='stopped'|'preparing'|'playing'|'unavailable';
export interface AudioTransport {
 activate():Promise<void>;play(pcm:StereoPCM):Promise<void>;replace(pcm:StereoPCM):void;
 position():number;setVolume(value:number):void;stop():void;dispose():Promise<void>;
}
type Voice={source:AudioBufferSourceNode;gain:GainNode};
export function createAudioTransport(onState:(state:AudioState,offset:number)=>void):AudioTransport {
 let context:AudioContext|null=null,master:GainNode|null=null,current:Voice|null=null,retiring:Voice|null=null;
 let volume=.5,startedAt=0,activated=false,disposed=false,generation=0,activation:Promise<void>|null=null;
 const position=()=>current&&context?Math.max(0,Math.min(8,context.currentTime-startedAt)):0;
 const disconnect=(voice:Voice)=>{voice.source.onended=null;voice.source.disconnect();voice.gain.disconnect();};
 const end=(voice:Voice,fade:boolean)=>{
  const now=context!.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value,now);
  voice.gain.gain.linearRampToValueAtTime(0,now+(fade?.02:0));
  voice.source.onended=()=>{disconnect(voice);if(retiring===voice)retiring=null;};
  try{voice.source.stop(now+(fade?.02:0));}catch{disconnect(voice);}
  if(!fade)disconnect(voice);
 };
 const stop=()=>{
  generation++;activated=false;activation=null;
  if(retiring)end(retiring,false);
  retiring=current;if(current)end(current,true);
  current=null;startedAt=0;onState('stopped',0);
 };
 const hidden=()=>{if(document.hidden)stop();};
 const pagehide=()=>stop();
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',hidden);
 if(typeof window!=='undefined')window.addEventListener('pagehide',pagehide);
 const makeVoice=(pcm:StereoPCM,offset:number):Voice=>{
  if(pcm.sampleRate!==48000||pcm.left.length!==384000||pcm.right.length!==384000)throw new Error('Invalid playback PCM');
  const buffer=context!.createBuffer(2,384000,48000);
  buffer.copyToChannel(pcm.left as Float32Array<ArrayBuffer>,0);buffer.copyToChannel(pcm.right as Float32Array<ArrayBuffer>,1);
  const source=context!.createBufferSource(),gain=context!.createGain();source.buffer=buffer;source.connect(gain);gain.connect(master!);
  const now=context!.currentTime;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+.02);
  const voice={source,gain};source.onended=()=>{
   disconnect(voice);
   if(current===voice){current=null;startedAt=0;onState('stopped',0);}
   if(retiring===voice)retiring=null;
  };
  source.start(now,offset);return voice;
 };
 const transport:AudioTransport={
  activate(){
   if(disposed)return Promise.reject(new Error('Audio transport disposed'));
   if(activated&&context?.state==='running')return Promise.resolve();
   if(activation)return activation;
   const token=++generation;onState('preparing',0);
   // Construction and resume both execute before returning to the gesture handler.
   try{
    if(!context){
     const Constructor=globalThis.AudioContext??(globalThis as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
     if(!Constructor)throw new Error('AudioContext unavailable');context=new Constructor();
     master=context.createGain();master.gain.value=volume;master.connect(context.destination);
    }
    const resume=context.resume();
    activation=(async()=>{
     try{await resume;if(disposed||token!==generation)throw new DOMException('Audio activation cancelled','AbortError');activated=true;}
     catch(error){if(token===generation){activated=false;onState('unavailable',0);}throw error;}
     finally{if(token===generation)activation=null;}
    })();return activation;
   }catch(error){onState('unavailable',0);return Promise.reject(error);}
  },
  async play(pcm){
   if(!activated||!context||context.state!=='running')throw new Error('Audio must be activated from Play');
   if(disposed)throw new Error('Audio transport disposed');if(current)return;
   current=makeVoice(pcm,0);startedAt=context.currentTime;onState('playing',0);
  },
  replace(pcm){
   if(!current||!context||disposed)return;
   const offset=position();if(offset>=8)return;
   if(retiring){end(retiring,false);retiring=null;}
   const next=makeVoice(pcm,offset),previous=current;current=next;retiring=previous;
   end(previous,true);
   // The scan origin remains fixed through replacement.
   onState('playing',offset);
  },
  position,
  setVolume(value){
   if(!Number.isFinite(value))throw new Error('Invalid audio volume');volume=Math.max(0,Math.min(1,value));
   if(master&&context){const now=context.currentTime;master.gain.cancelScheduledValues(now);master.gain.setValueAtTime(master.gain.value,now);master.gain.linearRampToValueAtTime(volume,now+.02);}
  },
  stop,
  async dispose(){
   if(disposed)return;stop();disposed=true;
   if(typeof document!=='undefined')document.removeEventListener('visibilitychange',hidden);
   if(typeof window!=='undefined')window.removeEventListener('pagehide',pagehide);
   master?.disconnect();if(context&&context.state!=='closed')await context.close();context=null;master=null;
  },
 };
 return transport;
}
