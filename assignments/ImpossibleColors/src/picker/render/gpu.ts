import type { Gpu } from 'vgpu';
import type { Raster,RenderCapture,SceneFrame } from '../types';
import { composeBase,renderCpu } from './cpu';
import { bloomField,buildLightFields } from './radiance';
import fieldsCode from './shaders/fields.wgsl?raw';
import jfaCode from './shaders/jfa.wgsl?raw';
import cascadeCode from './shaders/cascade.wgsl?raw';
import presentCode from './shaders/present.wgsl?raw';

export interface PickerRenderer {
 readonly mode:'gpu'|'cpu';
 draw(frame:SceneFrame):Promise<void>;
 capture(frame:SceneFrame):Promise<RenderCapture>;
 dispose():Promise<void>;
}
type Resources={width:number;height:number;previewWidth:number;previewHeight:number;
 emitters:GPUBuffer;obstacles:GPUBuffer;seeds:[GPUBuffer,GPUBuffer];atlases:[GPUBuffer,GPUBuffer];base:GPUBuffer;bloom:GPUBuffer;output:GPUBuffer;readback:GPUBuffer;
 fields:GPUBuffer;jumps:GPUBuffer[];levels:GPUBuffer[];present:GPUBuffer;all:GPUBuffer[]};
function write(device:GPUDevice,buffer:GPUBuffer,data:Float32Array|Uint32Array){device.queue.writeBuffer(buffer,0,data.buffer as ArrayBuffer,data.byteOffset,data.byteLength);}
async function pipeline(device:GPUDevice,label:string,code:string):Promise<GPUComputePipeline>{
 const module=device.createShaderModule({label,code});const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(`${label}: ${errors.map(m=>m.message).join('; ')}`);
 return device.createComputePipelineAsync({label,layout:'auto',compute:{module,entryPoint:'main'}});
}
/** One vgpu owner; native compute buffers port the reference atlas without a second engine. */
class CascadeEngine {
 private resources?:Resources;
 private obstacleKey='';private distanceIndex=0;
 private constructor(readonly owner:Gpu,readonly pipes:GPUComputePipeline[]){}
 static async create(owner:Gpu) {return new CascadeEngine(owner,await Promise.all([pipeline(owner.gpu,'Emitter and obstacle seeds',fieldsCode),pipeline(owner.gpu,'Jump flood distance',jfaCode),pipeline(owner.gpu,'Shared UV gamma cascades',cascadeCode),pipeline(owner.gpu,'One display conversion',presentCode)]));}
 private allocate(w:number,h:number):Resources {
  const old=this.resources;if(old?.previewWidth===w&&old.previewHeight===h)return old;
  old?.all.forEach(b=>b.destroy());const device=this.owner.gpu,scale=256/Math.max(w,h),width=Math.max(32,Math.ceil(w*scale/32)*32),height=Math.max(32,Math.ceil(h*scale/32)*32),all:GPUBuffer[]=[];
  const buffer=(size:number,usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC)=>{const b=device.createBuffer({size,usage});all.push(b);return b;};
  const uniform=(data:number[])=>{const b=buffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);write(device,b,new Uint32Array(data));return b;};
  const n=width*height,preview=w*h;
  const r:Resources={width,height,previewWidth:w,previewHeight:h,all,
   emitters:buffer(n*16),obstacles:buffer(n*4),seeds:[buffer(n*16),buffer(n*16)],atlases:[buffer(n*64),buffer(n*64)],
   base:buffer(preview*16),bloom:buffer(preview*16),output:buffer(preview*4),readback:buffer(preview*4,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),
   fields:uniform([width,height,0,0]),jumps:Array.from({length:8},(_,i)=>uniform([width,height,128>>i,0])),levels:Array.from({length:6},(_,i)=>uniform([width,height,i,0])),present:uniform([width,height,w,h])};
  this.resources=r;this.obstacleKey='';return r;
 }
 async render(frame:SceneFrame):Promise<Raster> {
  const device=this.owner.gpu,{width:w,height:h}=frame.source,r=this.allocate(w,h),{emitters,occlusion}=buildLightFields(frame),small=new Float32Array(r.width*r.height*4),obstacles=new Float32Array(r.width*r.height);
  let hash=2166136261;
  // Max-reduce obstacle/emitter support so thin barriers and small sensor hits survive.
  for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
   const i=y*r.width+x,x0=Math.floor(x*w/r.width),x1=Math.max(x0+1,Math.ceil((x+1)*w/r.width)),y0=Math.floor(y*h/r.height),y1=Math.max(y0+1,Math.ceil((y+1)*h/r.height));let count=0;
   for(let sy=y0;sy<Math.min(h,y1);sy++)for(let sx=x0;sx<Math.min(w,x1);sx++){const j=sy*w+sx;obstacles[i]=Math.max(obstacles[i],occlusion[j]);for(let c=0;c<3;c++)small[i*4+c]+=emitters[j*4+c];count++;}
   for(let c=0;c<3;c++)small[i*4+c]/=count||1;
   const occupied=obstacles[i]>.5||Math.max(small[i*4],small[i*4+1],small[i*4+2])>.001;
   hash=Math.imul(hash^Number(occupied),16777619)>>>0;
  }
  write(device,r.emitters,small);write(device,r.obstacles,obstacles);write(device,r.base,composeBase(frame));write(device,r.bloom,bloomField(emitters,w,h));
  const encoder=device.createCommandEncoder({label:`Spectrum revision ${frame.revision}`});
  const dispatch=(pipe:GPUComputePipeline,bindings:GPUBuffer[],width:number,height:number)=>{const group=device.createBindGroup({layout:pipe.getBindGroupLayout(0),entries:bindings.map((buffer,binding)=>({binding,resource:{buffer}}))});const pass=encoder.beginComputePass();pass.setPipeline(pipe);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(width/8),Math.ceil(height/8));pass.end();};
  const key=`${r.width},${r.height}:${hash}`;
  if(key!==this.obstacleKey){dispatch(this.pipes[0],[r.fields,r.emitters,r.obstacles,r.seeds[0]],r.width,r.height);let previous=0;for(const jump of r.jumps){dispatch(this.pipes[1],[jump,r.seeds[previous],r.seeds[1-previous]],r.width,r.height);previous=1-previous;}this.distanceIndex=previous;this.obstacleKey=key;}
  let upper=0;for(let level=5;level>=0;level--){dispatch(this.pipes[2],[r.levels[level],r.emitters,r.seeds[this.distanceIndex],r.atlases[upper],r.atlases[1-upper]],r.width*2,r.height*2);upper=1-upper;}
  dispatch(this.pipes[3],[r.present,r.atlases[upper],r.base,r.bloom,r.output],w,h);
  encoder.copyBufferToBuffer(r.output,0,r.readback,0,w*h*4);device.queue.submit([encoder.finish()]);await r.readback.mapAsync(GPUMapMode.READ);
  const rgba=new Uint8ClampedArray(r.readback.getMappedRange().slice(0));r.readback.unmap();
  // Keep arbitrary hidden RGB bytes for exact transparent zero-effect identity.
  for(let i=0;i<w*h;i++)if(frame.source.rgba[i*4+3]===0)rgba.set(frame.source.rgba.subarray(i*4,i*4+4),i*4);
  return {width:w,height:h,rgba};
 }
 dispose(){this.resources?.all.forEach(b=>b.destroy());this.resources=undefined;this.owner.dispose();}
}

export async function createRenderer(canvas:HTMLCanvasElement,options:{forceCpu?:boolean;onStatus:(message:string)=>void}):Promise<PickerRenderer> {
 let engine:CascadeEngine|undefined,disposed=false,currentMode:'gpu'|'cpu'='cpu',queue:Promise<unknown>=Promise.resolve(),status='';
 const say=(message:string)=>{if(message!==status){status=message;options.onStatus(message);}};
 const cpuStatus='Reduced CPU preview: bloom and infrared; image-edge gamma contours. Full radiance cascades unavailable.';
 const fallBack=()=>{currentMode='cpu';engine?.dispose();engine=undefined;say(cpuStatus);};
 if(!options.forceCpu&&typeof navigator!=='undefined'&&navigator.gpu){let owner:Gpu|undefined;try {const {init}=await import('vgpu');owner=await init({label:'Impossible Colors shared radiance'});engine=await CascadeEngine.create(owner);currentMode='gpu';void owner.gpu.lost.then(()=>{if(!disposed)fallBack();});say('GPU: one shared UV/gamma field, six radiance cascades at 256 pixels.');}catch {owner?.dispose();fallBack();}}
 else say(cpuStatus);
 // Visible presentation remains a 2D canvas so device loss never invalidates its DOM,
 // pointer handlers, or export owner. GPU buffers are the replaceable backing target.
 const context=canvas.getContext('2d');if(!context){engine?.dispose();throw Error('Preview canvas unavailable');}
 const enqueue=<T>(work:()=>Promise<T>):Promise<T>=>{const task=queue.then(()=>{if(disposed)throw Error('Renderer disposed');return work();});queue=task.catch(()=>{});return task;};
 const raster=async(frame:SceneFrame)=>{if(engine){try{const pixels=await engine.render(frame);const gamma=frame.layers.some(l=>l.appearance.bands.gamma.area>0);say(gamma?`GPU: six shared UV/gamma radiance cascades; ${frame.depth?'estimated depth':'image-edge'} gamma contours.`:'GPU: one shared UV/gamma field, six radiance cascades at 256 pixels.');return pixels;}catch{fallBack();}}say(frame.depth?'Reduced CPU preview: bloom and infrared; cached estimated depth for X-ray and gamma contours. Full radiance cascades unavailable.':cpuStatus);return renderCpu(frame);};
 return {
  get mode(){return currentMode;},
  draw:frame=>enqueue(async()=>{if(typeof document!=='undefined'&&document.hidden)return;const pixels=await raster(frame);canvas.width=pixels.width;canvas.height=pixels.height;context.putImageData(new ImageData(pixels.rgba as Uint8ClampedArray<ArrayBuffer>,pixels.width,pixels.height),0,0);}),
  capture:frame=>enqueue(async()=>({revision:frame.revision,pixels:await raster(frame)})),
  dispose:async()=>{await queue;disposed=true;engine?.dispose();engine=undefined;},
 };
}
