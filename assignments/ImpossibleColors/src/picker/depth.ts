import { DEPTH_MANIFEST } from './depth-manifest';
import type { DepthField, Raster } from './types';
export interface DepthEstimator {estimate(source:Raster,imageHash:string,signal:AbortSignal):Promise<DepthField>;dispose():Promise<void>}
export interface DepthBackend {run(input:Float32Array):Promise<Float32Array>;dispose():Promise<void>}
export interface DepthRect {x:number;y:number;width:number;height:number}
const abortError=()=>new DOMException('Depth estimate cancelled','AbortError');
function withSignal<T>(promise:Promise<T>,signal:AbortSignal):Promise<T> {
  return new Promise((resolve,reject)=>{
    const onAbort=()=>{signal.removeEventListener('abort',onAbort);reject(abortError());};
    signal.addEventListener('abort',onAbort,{once:true});
    promise.then(value=>{signal.removeEventListener('abort',onAbort);if(signal.aborted)reject(abortError());else resolve(value);},error=>{signal.removeEventListener('abort',onAbort);reject(error);});
    if(signal.aborted)onAbort();
  });
}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
function bilinear(at:(x:number,y:number)=>number,x:number,y:number):number {
  const x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
  return (1-ty)*((1-tx)*at(x0,y0)+tx*at(x0+1,y0))+ty*((1-tx)*at(x0,y0+1)+tx*at(x0+1,y0+1));
}
/** Preserve the entire oriented source rather than estimating only a center crop. */
export function preprocessDepth(source:Raster,width=320,height=256):{tensor:Float32Array;rect:DepthRect} {
  const scale=Math.min(width/source.width,height/source.height),rw=Math.max(1,Math.round(source.width*scale)),rh=Math.max(1,Math.round(source.height*scale));
  const rect={x:Math.floor((width-rw)/2),y:Math.floor((height-rh)/2),width:rw,height:rh};
  const tensor=new Float32Array(width*height*3).fill(.5);
  for(let c=0;c<3;c++) {
    const at=(x:number,y:number)=>{const i=(clamp(y,0,source.height-1)*source.width+clamp(x,0,source.width-1))*4,alpha=source.rgba[i+3]/255;return alpha*(source.rgba[i+c]/255)+(1-alpha)*.5;};
    for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)tensor[c*width*height+(rect.y+y)*width+rect.x+x]=bilinear(at,(x+.5)*source.width/rw-.5,(y+.5)*source.height/rh-.5);
  }
  return {tensor,rect};
}
export function remapDepth(output:Float32Array,width:number,height:number,rect:DepthRect,sourceWidth:number,sourceHeight:number):Float32Array {
  if(output.length!==width*height)throw Error('Depth output shape does not match the admitted model');
  const values=new Float32Array(sourceWidth*sourceHeight),at=(x:number,y:number)=>output[clamp(y,0,height-1)*width+clamp(x,0,width-1)];
  for(let y=0;y<sourceHeight;y++)for(let x=0;x<sourceWidth;x++)values[y*sourceWidth+x]=bilinear(at,rect.x+(x+.5)*rect.width/sourceWidth-.5,rect.y+(y+.5)*rect.height/sourceHeight-.5);
  return values;
}
export function normalizeDepth(input:Float32Array):Float32Array {
  if(!input.length||input.some(v=>!Number.isFinite(v)))throw Error('Depth model returned nonfinite or empty output');
  const valid=[...input].filter(v=>v>=0).sort((a,b)=>a-b);
  if(!valid.length)throw Error('Depth model returned no valid metric depth');
  const percentile=(p:number)=>{const i=(valid.length-1)*p,low=Math.floor(i);return valid[low]+(valid[Math.ceil(i)]-valid[low])*(i-low);};
  const low=percentile(.02),high=percentile(.98);
  return Float32Array.from(input,v=>v<0||high-low<1e-6?.5:clamp((v-low)/(high-low),0,1));
}
async function localBackend():Promise<DepthBackend> {
  const ort=await import('onnxruntime-web/webgpu');
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=new URL(`${import.meta.env.BASE_URL}${DEPTH_MANIFEST.runtime.directory}`,location.href).href;
  const response=await fetch(`${import.meta.env.BASE_URL}${DEPTH_MANIFEST.file}`);
  if(!response.ok)throw Error(`Estimated depth unavailable: local model load failed (${response.status}). Retry when assets are available.`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==DEPTH_MANIFEST.bytes||hash!==DEPTH_MANIFEST.sha256)throw Error('Estimated depth unavailable: model integrity check failed');
  // Separate ORT device/session ownership; no graphics resource or vgpu device is shared.
  const providers=navigator.gpu?['webgpu','wasm']:['wasm'];
  const session=await ort.InferenceSession.create(bytes,{executionProviders:providers});
  return {
    async run(input){
      const tensor=new ort.Tensor('float32',input,[1,3,256,320]);
      let outputs:Record<string,InstanceType<typeof ort.Tensor>>|undefined;
      try {
        const result=await session.run({[DEPTH_MANIFEST.input.name]:tensor});outputs=result;
        const output=result[DEPTH_MANIFEST.output.name];
        if(!output||output.type!=='float32'||output.dims.join(',')!=='1,1,256,320')throw Error('Depth output violates admitted graph contract');
        const data=await output.getData();
        if(!(data instanceof Float32Array))throw Error('Depth output is not float32');
        return data.slice();
      } finally {tensor.dispose();for(const output of Object.values(outputs??{}))output.dispose();}
    },async dispose(){await session.release();},
  };
}
export function createDepthEstimator(options:{backend?:()=>Promise<DepthBackend>}={}):DepthEstimator {
  let backend:Promise<DepthBackend>|undefined,generation=0,disposed=false,currentHash='';
  let cached:DepthField|undefined;
  let pending:{key:string;generation:number;token:object;promise:Promise<DepthField>}|undefined;
  return {
    async estimate(source,imageHash,signal){
      if(disposed||signal.aborted)throw abortError();
      const key=`${imageHash}:${DEPTH_MANIFEST.sha256}`;
      if(currentHash!==imageHash){generation++;currentHash=imageHash;cached=undefined;pending=undefined;}
      if(cached?.imageHash===imageHash)return cached;
      if(pending?.key===key&&pending.generation===generation)return withSignal(pending.promise,signal);
      const requestedGeneration=generation,token={};
      let cancelled=false;const onAbort=()=>{cancelled=true;if(generation===requestedGeneration){generation++;pending=undefined;}};signal.addEventListener('abort',onAbort,{once:true});
      const checkpoint=()=>{if(disposed||cancelled||signal.aborted||requestedGeneration!==generation)throw abortError();};
      const promise=(async()=>{
        try {
          backend??=(options.backend??localBackend)();
          const runtime=await backend;checkpoint();
          const prepared=preprocessDepth(source),output=await runtime.run(prepared.tensor);checkpoint();
          const values=normalizeDepth(remapDepth(output,320,256,prepared.rect,source.width,source.height));checkpoint();
          const result={imageHash,modelHash:DEPTH_MANIFEST.sha256,width:source.width,height:source.height,values};
          cached=result;return result;
        } catch(error){
          checkpoint();
          if(error instanceof DOMException&&error.name==='AbortError')throw error;
          const oldBackend=backend;backend=undefined;void oldBackend?.then(b=>b.dispose()).catch(()=>{});
          throw error;
        } finally {signal.removeEventListener('abort',onAbort);if(pending?.token===token)pending=undefined;}
      })();
      pending={key,generation:requestedGeneration,token,promise};return withSignal(promise,signal);
    },
    async dispose(){disposed=true;generation++;cached=undefined;pending=undefined;const previous=backend;backend=undefined;if(previous)await previous.then(b=>b.dispose()).catch(()=>{});},
  };
}
