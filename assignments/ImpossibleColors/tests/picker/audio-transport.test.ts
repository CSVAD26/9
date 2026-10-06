import {it,expect,vi,afterEach} from 'vitest';
import {createAudioTransport} from '../../src/picker/audio/transport';
class Param {value=1;events:{value:number;time:number}[]=[];cancelScheduledValues(){} setValueAtTime(value:number,time:number){this.value=value;this.events.push({value,time});}linearRampToValueAtTime(value:number,time:number){this.events.push({value,time});}}
class Gain {gain=new Param();disconnected=false;connect(){}disconnect(){this.disconnected=true;}}
class Source {buffer:unknown;onended:(()=>void)|null=null;offset=-1;stopTime=-1;disconnected=false;connect(){}disconnect(){this.disconnected=true;}start(_when:number,offset:number){this.offset=offset;}stop(time:number){this.stopTime=time;}}
class Context {
 static created=0;static latest:Context;static denied=false;state='suspended';currentTime=10;destination={};sources:Source[]=[];gains:Gain[]=[];closed=false;
 constructor(){Context.created++;Context.latest=this;}
 async resume(){if(Context.denied)throw new Error('denied');this.state='running';}
 createGain(){const gain=new Gain();this.gains.push(gain);return gain;}
 createBuffer(_channels:number,length:number,rate:number){return {length,sampleRate:rate,copyToChannel(){}};}
 createBufferSource(){const source=new Source();this.sources.push(source);return source;}
 async close(){this.closed=true;}
}
const pcm={sampleRate:48000 as const,left:new Float32Array(384000),right:new Float32Array(384000)};
afterEach(()=>{vi.unstubAllGlobals();Context.created=0;Context.denied=false;});
it('creates context only on activation and refuses denied playback',async()=>{
 vi.stubGlobal('AudioContext',Context);const states:string[]=[];const transport=createAudioTransport(state=>states.push(state));
 expect(Context.created).toBe(0);await expect(transport.play(pcm)).rejects.toThrow('activated');
 Context.denied=true;const activate=transport.activate();expect(Context.created).toBe(1);await expect(activate).rejects.toThrow('denied');
 expect(states.at(-1)).toBe('unavailable');expect(Context.latest.sources.length).toBe(0);await transport.dispose();
});
it('crossfades replacements at the current audio-clock offset without a second scan',async()=>{
 vi.stubGlobal('AudioContext',Context);const states:string[]=[];const transport=createAudioTransport(state=>states.push(state));
 await transport.activate();await transport.play(pcm);await transport.play(pcm);expect(Context.latest.sources.length).toBe(1);
 Context.latest.currentTime=12;expect(transport.position()).toBe(2);transport.replace(pcm);
 expect(Context.latest.sources[1].offset).toBe(2);expect(Context.latest.sources[0].stopTime).toBeCloseTo(12.02);
 transport.setVolume(.3);expect(Context.latest.gains[0].gain.events.at(-1)?.value).toBe(.3);
 Context.latest.currentTime=19;expect(transport.position()).toBe(8);transport.replace(pcm);expect(Context.latest.sources.length).toBe(2);
 transport.stop();expect(transport.position()).toBe(0);expect(states.at(-1)).toBe('stopped');await transport.dispose();expect(Context.latest.closed).toBe(true);
});
it('does not let stopped activation completion re-enable playback',async()=>{
 let resume:()=>void=()=>{};class SlowContext extends Context{override resume(){return new Promise<void>(resolve=>{resume=()=>{this.state='running';resolve();};});}}
 vi.stubGlobal('AudioContext',SlowContext);const transport=createAudioTransport(()=>{}),activation=transport.activate();transport.stop();resume();
 await expect(activation).rejects.toMatchObject({name:'AbortError'});await expect(transport.play(pcm)).rejects.toThrow('activated');await transport.dispose();
});
