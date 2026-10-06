import {it,expect,vi,afterEach} from 'vitest';
import {createAudioClient} from '../../src/picker/audio/client';
import type {Sonification} from '../../src/picker/types';
const profile={q:new Float32Array(64),area:0,centroid:.5,width:0};
const spec:Sonification={mappingVersion:1,mode:'radio',radio:profile,microwave:profile,fields:{luminance:new Float32Array(64),centroidY:new Float32Array(64),edges:new Float32Array(64)}};
class WorkerDouble {
 static latest:WorkerDouble;onmessage:((e:MessageEvent)=>void)|null=null;onerror:((e:Event)=>void)|null=null;
 jobs:{id:number;spec:Sonification}[]=[];terminated=false;
 constructor(){WorkerDouble.latest=this;}
 postMessage(job:{id:number;spec:Sonification}){this.jobs.push(job);}
 terminate(){this.terminated=true;}
 finish(index:number){this.onmessage?.({data:{id:this.jobs[index].id,pcm:{sampleRate:48000,left:new Float32Array(384000),right:new Float32Array(384000)}}} as MessageEvent);}
}
afterEach(()=>vi.unstubAllGlobals());
it('rejects an aborted active job and coalesces queued edits without releasing stale results',async()=>{
 vi.stubGlobal('Worker',WorkerDouble);const client=createAudioClient(),a=new AbortController();
 const first=client.render(spec,a.signal);const rejected=expect(first).rejects.toMatchObject({name:'AbortError'});a.abort();
 const second=client.render(spec,new AbortController().signal);const superseded=expect(second).rejects.toMatchObject({name:'AbortError'});
 const third=client.render(spec,new AbortController().signal);expect(WorkerDouble.latest.jobs.length).toBe(1);
 WorkerDouble.latest.finish(0);await rejected;await superseded;
 expect(WorkerDouble.latest.jobs.length).toBe(2);WorkerDouble.latest.finish(1);
 expect((await third).left.length).toBe(384000);client.dispose();expect(WorkerDouble.latest.terminated).toBe(true);
});
it('reports unavailable worker and rejects active work on worker failure',async()=>{
 vi.stubGlobal('Worker',undefined);const unavailable=createAudioClient();await expect(unavailable.render(spec,new AbortController().signal)).rejects.toThrow('unavailable');
 vi.stubGlobal('Worker',WorkerDouble);const client=createAudioClient(),p=client.render(spec,new AbortController().signal);
 WorkerDouble.latest.onerror?.(new Event('error'));await expect(p).rejects.toThrow('worker');client.dispose();
});
