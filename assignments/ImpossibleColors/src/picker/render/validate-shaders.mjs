import { chromium } from '@playwright/test';
import { readFile,readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {createServer} from 'node:http';
const directory=new URL('./shaders/',import.meta.url);
const shaders=await Promise.all((await readdir(directory)).filter(f=>f.endsWith('.wgsl')).map(async name=>({name,code:await readFile(new URL(name,directory),'utf8')})));
const server=process.argv.includes('--render')?undefined:createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Shader validation</title>');});
if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server?.address();const origin=address&&typeof address!=='string'?`http://127.0.0.1:${address.port}/`:'http://127.0.0.1:5180/';
const hardware=process.argv.includes('--hardware');
const browser=await chromium.launch({headless:!hardware,args:['--enable-unsafe-webgpu',...(hardware?['--use-angle=metal']:[])]});
try {
 const page=await browser.newPage();if(process.argv.includes('--render'))await page.route(origin,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Renderer checks</title>'}));await page.goto(origin+(process.argv.includes('--visual')?'#visual':''));
 const result=await page.evaluate(async shaders=>{
  const adapter=await navigator.gpu?.requestAdapter();if(!adapter)throw Error('GPU gate unverified: no real WebGPU adapter');
  const device=await adapter.requestDevice();const results=[];
  for(const {name,code} of shaders){const module=device.createShaderModule({code,label:name});const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error').map(m=>m.message);if(errors.length)throw Error(`${name}: ${errors.join('; ')}`);await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});results.push(name);}
  device.destroy();return {validated:results,adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description}};
 },shaders);
 console.log(JSON.stringify(result));
 if(process.argv.includes('--render')) {
  const result=await page.evaluate(async()=>{
   const {createRenderer}=await import('/src/picker/render/gpu.ts');
   const {renderCpu}=await import('/src/picker/render/cpu.ts');
   const originalRequestAdapter=navigator.gpu.requestAdapter.bind(navigator.gpu);let rendererDevice;
   navigator.gpu.requestAdapter=async(...args)=>{const adapter=await originalRequestAdapter(...args);if(adapter){const originalRequestDevice=adapter.requestDevice.bind(adapter);adapter.requestDevice=async(...options)=>{rendererDevice=await originalRequestDevice(...options);return rendererDevice;};}return adapter;};
   const canvas=document.createElement('canvas'),statuses=[];const renderer=await createRenderer(canvas,{onStatus:m=>statuses.push(m)});
   if(renderer.mode!=='gpu')throw Error(`GPU renderer gate unverified: ${statuses}`);
   const width=128,height=64,rgba=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++)rgba[i*4+3]=255;
   const zero={area:0,centroid:.5,spread:0},appearance={visibleLinear:[0,0,0],emissionLinear:[8,0,0],bands:{gamma:zero,xray:zero,uv:{area:1,centroid:.5,spread:0},visible:zero,infrared:zero,microwave:zero,radio:zero}};
   const mask=new Float32Array(width*height);for(let y=24;y<40;y++)for(let x=16;x<24;x++)mask[y*width+x]=1;
   const frame={revision:1,source:{width,height,rgba},layers:[{materialId:'light',mask,deltaOklab:[0,0,0],appearance}],seed:236,time:0};
   const start=performance.now(),open=await renderer.capture(frame),firstMs=performance.now()-start;
   const obstacles=new Float32Array(width*height);for(let y=0;y<height;y++)for(let x=58;x<63;x++)obstacles[y*width+x]=1;
   const blocked=await renderer.capture({...frame,revision:2,occlusionOverride:obstacles});
   const red=(r)=>{let n=0,total=0;for(let y=25;y<39;y++)for(let x=80;x<104;x++){total+=r.pixels.rgba[(y*width+x)*4];n++;}return total/n;};
   const before=red(open),behind=red(blocked);if(!(before>behind+1))throw Error(`Obstacle failed: open=${before}, blocked=${behind}`);
   const dark={...frame,revision:3,layers:[{...frame.layers[0],appearance:{...appearance,emissionLinear:[0,0,0],bands:{...appearance.bands,uv:zero}}}]};
   const identity=await renderer.capture(dark);if(identity.pixels.rgba.some((v,i)=>v!==rgba[i]))throw Error('GPU zero-effect identity failed');
   const start2=performance.now();await renderer.capture(frame);const cachedMs=performance.now()-start2;
   const flat={...dark,revision:4,depth:{imageHash:'test',modelHash:'test',width,height,values:new Float32Array(width*height).fill(.5)},layers:[{...dark.layers[0],mask:new Float32Array(width*height).fill(1),appearance:{...dark.layers[0].appearance,bands:{...dark.layers[0].appearance.bands,infrared:{area:.4,centroid:.7,spread:0},xray:{area:.3,centroid:.5,spread:0}}}}]};
   const gpuFlat=await renderer.capture(flat),cpuFlat=renderCpu(flat);let maxByteDifference=0;for(let i=0;i<rgba.length;i++)maxByteDifference=Math.max(maxByteDifference,Math.abs(gpuFlat.pixels.rgba[i]-cpuFlat.rgba[i]));if(maxByteDifference>2)throw Error(`Color composition parity failed: ${maxByteDifference}`);
   const gamma={...frame,revision:5,layers:[{...frame.layers[0],appearance:{...appearance,bands:{...appearance.bands,gamma:{area:.6,centroid:.3,spread:.2}}}}]};
   const frozenA=await renderer.capture(gamma),frozenB=await renderer.capture(gamma);if(frozenA.pixels.rgba.some((v,i)=>v!==frozenB.pixels.rgba[i]))throw Error('Frozen UV+gamma repeatability failed');
   const large={...frame,revision:6,source:{width:512,height:256,rgba:new Uint8ClampedArray(512*256*4)},layers:[{...frame.layers[0],mask:new Float32Array(512*256)}]};
   for(let y=0;y<256;y++)for(let x=0;x<512;x++){const i=y*512+x;large.source.rgba[i*4+3]=255;if(x>80&&x<112&&y>96&&y<160)large.layers[0].mask[i]=1;}
   const largeStart=performance.now();await renderer.capture(large);const preview512Ms=performance.now()-largeStart;
   if(location.hash==='#visual'){
    document.body.style.cssText='margin:0;padding:28px;background:#10151a;color:#e9f2fa;font:16px system-ui;display:flex;flex-direction:column;gap:18px';
    for(const [title,uv,gammaArea] of [['Ultraviolet — smooth shared light',true,0],['Gamma — selective hits and broken image edges',false,.65],['UV + gamma — one radiance solve',true,.65]]){
     const pixels=large.source.rgba.slice(),m=new Float32Array(512*256);
     for(let y=0;y<256;y++)for(let x=0;x<512;x++){const i=y*512+x;const circle=Math.hypot(x-245,y-128);const value=24+Math.round(40*x/512)+((x%25<2||y%25<2)?20:0);pixels.set([value,value,value,255],i*4);m[i]=Math.max(0,Math.min(1,(84-circle)/6));}
     const scene={...large,time:.25,source:{width:512,height:256,rgba:pixels},layers:[{...large.layers[0],mask:m,appearance:{...appearance,emissionLinear:uv?[.1,1,3]:[0,0,0],bands:{...appearance.bands,gamma:{area:gammaArea,centroid:.35,spread:.2}}}}]};
     await renderer.draw(scene);const section=document.createElement('section'),label=document.createElement('div'),copy=document.createElement('canvas');label.textContent=title;copy.width=512;copy.height=256;copy.getContext('2d').drawImage(canvas,0,0);section.append(label,copy);document.body.append(section);
    }
   }
   rendererDevice.destroy();await new Promise(resolve=>setTimeout(resolve,30));const lossCapture=await renderer.capture(flat);if(renderer.mode!=='cpu'||lossCapture.revision!==flat.revision||lossCapture.pixels.rgba.some((v,i)=>v!==cpuFlat.rgba[i]))throw Error('Device-loss CPU fallback failed');
   await renderer.dispose();navigator.gpu.requestAdapter=async()=>null;const denied=await createRenderer(canvas,{onStatus:m=>statuses.push(m)});const deniedCapture=await denied.capture(flat);if(denied.mode!=='cpu'||deniedCapture.revision!==flat.revision)throw Error('Adapter-denial CPU fallback failed');await denied.dispose();
   return {modeAfterDeviceLoss:renderer.mode,adapterDenial:true,openRed:before,blockedRed:behind,firstMs,cachedMs,preview512Ms,maxByteDifference,frozenMixedBand:true,statuses};
  });console.log(JSON.stringify(result));
  if(process.argv.includes('--visual'))await page.screenshot({path:fileURLToPath(new URL('../../../../../planning/spectrum-visuals-review.png',import.meta.url)),fullPage:true});
 }
} finally {await browser.close();server?.close();}
