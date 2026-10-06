import { createAudioClient } from './audio/client';
import { createAudioTransport, type AudioState } from './audio/transport';
import type { Sonification, StereoPCM } from './types';

/** A generation owns both worker output and playback; lifecycle stops invalidate both. */
export function createSound(getScore:()=>{key:string;score:Sonification}, onState:(state:AudioState)=>void) {
  const client=createAudioClient();
  let state:AudioState='stopped', generation=0, pending:AbortController|null=null;
  let cache:{key:string;pcm:StereoPCM}|null=null;
  const transport=createAudioTransport(next=>{state=next;onState(next);});
  async function pcm(signal:AbortSignal):Promise<StereoPCM> {
    const {key,score}=getScore();
    if(cache?.key===key)return cache.pcm;
    const result=await client.render(score,signal);
    if(signal.aborted)throw new DOMException('Sound cancelled','AbortError');
    cache={key,pcm:result};return result;
  }
  function stop(){generation++;pending?.abort();pending=null;transport.stop();}
  async function prepare(){
    const token=++generation;pending?.abort();pending=new AbortController();
    const signal=pending.signal;
    // Initial Play calls this in the click stack. Refresh shares pending activation.
    const activation=transport.activate();
    try {
      const [,buffer]=await Promise.all([activation,pcm(signal)]);
      if(token===generation&&!signal.aborted)await transport.play(buffer);
    } catch(error){if(token===generation){stop();throw error;}}
  }
  return {
    get state(){return state;},
    position:()=>transport.position(),
    setVolume:(value:number)=>transport.setVolume(value),
    stop,
    async play(){
      if(state==='playing'||state==='preparing')return;
      await prepare();
    },
    async refresh(){
      if(state==='preparing'){await prepare();return;}
      if(state!=='playing')return;
      const token=++generation;pending?.abort();pending=new AbortController();
      try {const buffer=await pcm(pending.signal);if(token===generation&&state==='playing')transport.replace(buffer);}
      catch(error){if(token===generation&&!(error instanceof DOMException&&error.name==='AbortError')){stop();throw error;}}
    },
    pcm,
    async dispose(){stop();client.dispose();await transport.dispose();},
  };
}
