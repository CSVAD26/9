import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {strict as assert} from 'node:assert';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../dist/',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.md':'text/plain','.png':'image/png','.onnx':'application/octet-stream'};
const server=createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith('/9/')){res.writeHead(404).end();return;}
    let filename=resolve(root,path.slice(3)||'index.html');
    if(filename!==root&&!filename.startsWith(root+sep)){res.writeHead(403).end();return;}
    if((await stat(filename)).isDirectory())filename=resolve(filename,'index.html');
    res.setHeader('Content-Type',types[extname(filename)]??'application/octet-stream');res.end(await readFile(filename));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const headed=process.argv.includes('--headed');
const browser=await chromium.launch({headless:!headed,args:headed?['--enable-unsafe-webgpu','--use-angle=metal']:[]});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],failures=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)failures.push(`${response.status()} ${response.url()}`);});
  page.on('request',request=>requests.push(request.url()));
  // CPU-only route must load its own local WASM on the real GitHub Pages prefix.
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{configurable:true,value:undefined}));
  await page.goto(`${origin}/9/assignments/ImpossibleColors/`);
  try{await page.waitForSelector('#app[data-ready=true]');}
  catch(error){console.error(JSON.stringify({errors,failures,requests,body:await page.locator('body').innerText()}));throw error;}
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=96;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#ba7142';ctx.fillRect(0,0,96,64);ctx.fillStyle='#345d87';ctx.fillRect(48,0,48,64);return c.toDataURL().split(',')[1];});
  await page.locator('#image-input').setInputFiles({name:'production.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>document.querySelector('#source-name').textContent==='production.png');
  await page.getByRole('button',{name:'X-ray',exact:true}).click();await page.getByTestId('curve-response').fill('0.8');await page.getByRole('button',{name:'Apply point',exact:true}).click();
  await page.waitForSelector('#app[data-depth-state=ready]',{timeout:30000});
  await page.getByRole('button',{name:'Radio',exact:true}).click();await page.getByTestId('curve-response').fill('0.8');await page.getByRole('button',{name:'Apply point',exact:true}).click();
  await page.locator('#export-menu summary').click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save sound WAV',exact:true}).click();
  const wav=await readFile(await (await download).path());assert.equal(wav.length,1536044);
  assert(requests.some(url=>url.endsWith('/models/depth/fastdepth-320x256.onnx')));
  assert(requests.some(url=>url.includes('/models/depth/runtime/')&&url.endsWith('.wasm')));
  assert(requests.some(url=>url.includes('/assets/worker-')),'Compiled audio worker was requested');
  assert.equal((await page.request.get(`${origin}/9/assignments/ImpossibleColors/notices/THIRD_PARTY_NOTICES.md`)).status(),200);
  await page.goto(`${origin}/9/`);assert(await page.getByRole('link',{name:'Full spectrum',exact:true}).count());
  await page.goto(`${origin}/9/assignments/MiniAssignment2/`);await page.waitForSelector('canvas');
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  const outside=requests.filter(url=>/^https?:/.test(url)&&!url.startsWith(origin));assert.deepEqual(outside,[]);
  console.log(JSON.stringify({passed:true,mode:headed?'headed':'headless',prefix:'/9/',compiledApp:true,localDepthWasm:true,compiledAudioWorker:true,wavBytes:wav.length,originalP5:true,externalRequests:outside.length}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
