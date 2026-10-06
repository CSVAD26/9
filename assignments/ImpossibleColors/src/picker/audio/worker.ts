import type { Sonification } from '../types';
import { renderSonification } from './pcm';
interface WorkerScope { onmessage:((event:MessageEvent<{id:number;spec:Sonification}>)=>void)|null;postMessage(message:unknown,transfer:Transferable[]):void; }
const scope=globalThis as unknown as WorkerScope;
scope.onmessage=({data})=>{
 try{
  const pcm=renderSonification(data.spec);
  scope.postMessage({id:data.id,pcm},[pcm.left.buffer,pcm.right.buffer]);
 }catch(error){scope.postMessage({id:data.id,error:error instanceof Error?error.message:'Audio generation failed'},[]);}
};
