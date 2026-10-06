import type { Sonification, StereoPCM } from '../types';
export interface AudioClient {render(spec:Sonification,signal:AbortSignal):Promise<StereoPCM>;dispose():void;}
type Job={id:number;spec:Sonification;signal:AbortSignal;resolve:(pcm:StereoPCM)=>void;reject:(reason:unknown)=>void;cleanup:()=>void;settled:boolean};
const aborted=()=>new DOMException('Audio generation cancelled','AbortError');
export function createAudioClient():AudioClient {
 let worker:Worker|null=null,failure:Error|null=null,disposed=false,nextId=0,active:Job|null=null,pending:Job|null=null;
 try{if(typeof Worker==='undefined')throw new Error('Audio worker unavailable');worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});}catch(error){failure=error instanceof Error?error:new Error('Audio worker unavailable');}
 const reject=(job:Job,reason:unknown)=>{if(!job.settled){job.settled=true;job.cleanup();job.reject(reason);}};
 const dispatch=(job:Job)=>{
  active=job;
  // Transfer cloned inputs: the immutable runtime score remains usable for later edits/exports.
  const spec=structuredClone(job.spec),transfer=[spec.fields.luminance.buffer,spec.fields.centroidY.buffer,spec.fields.edges.buffer,spec.radio.q.buffer,spec.microwave.q.buffer];
  try{worker!.postMessage({id:job.id,spec},[...new Set(transfer)]);}catch(error){reject(job,error);active=null;}
 };
 const advance=()=>{if(!active&&pending){const job=pending;pending=null;dispatch(job);}};
 if(worker){
  worker.onmessage=({data}:{data:{id:number;pcm?:StereoPCM;error?:string}})=>{
   if(!active||data.id!==active.id)return;
   const job=active;active=null;
   if(!job.settled){
    if(data.error||!data.pcm)reject(job,new Error(data.error??'Audio worker returned no PCM'));
    else{job.settled=true;job.cleanup();job.resolve(data.pcm);}
   }
   advance();
  };
  worker.onerror=()=>{
   failure=new Error('Audio worker failed');if(active)reject(active,failure);if(pending)reject(pending,failure);
   active=null;pending=null;worker?.terminate();worker=null;
  };
 }
 return {
  render(spec,signal){
   if(disposed)return Promise.reject(new Error('Audio client disposed'));
   if(failure||!worker)return Promise.reject(failure??new Error('Audio worker unavailable'));
   if(signal.aborted)return Promise.reject(aborted());
   return new Promise((resolve,rejectPromise)=>{
    const job:Job={id:++nextId,spec,signal,resolve,reject:rejectPromise,cleanup:()=>signal.removeEventListener('abort',cancel),settled:false};
    const cancel=()=>{reject(job,aborted());if(pending===job)pending=null;};signal.addEventListener('abort',cancel,{once:true});
    if(active){if(pending)reject(pending,aborted());pending=job;}else dispatch(job);
   });
  },
  dispose(){disposed=true;if(active)reject(active,aborted());if(pending)reject(pending,aborted());active=null;pending=null;worker?.terminate();worker=null;},
 };
}
