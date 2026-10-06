import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function open(page:Page, project:string) {
  await page.goto(project==='headless'?'/?renderer=cpu':'/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready','true');
}
async function draw(page:Page, band='Radio') {
  await page.getByRole('button',{name:band,exact:true}).click();
  const bounds=(await page.getByTestId('spectrum-canvas').boundingBox())!;
  await page.mouse.move(bounds.x+bounds.width*.25,bounds.y+bounds.height*.7);
  await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width*.7,bounds.y+bounds.height*.25,{steps:8});
  await page.mouse.up();
}
async function image(page:Page, name='resilience.png', alternate=false) {
  const encoded=await page.evaluate(alternate=>{
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=alternate?'#77aa44':'#cc6633';ctx.fillRect(0,0,48,64);
    ctx.fillStyle='#4477bb';ctx.fillRect(48,0,48,64);
    return canvas.toDataURL().split(',')[1];
  },alternate);
  const file={name,mimeType:'image/png',buffer:Buffer.from(encoded,'base64')};
  await page.locator('#image-input').setInputFiles(file);
  return file;
}
async function download(page:Page, name:string) {
  if(!await page.locator('#export-menu').evaluate(node=>(node as HTMLDetailsElement).open))await page.locator('#export-menu summary').click();
  const event=page.waitForEvent('download');
  await page.getByRole('button',{name,exact:true}).click();
  return readFile((await (await event).path())!);
}
async function recipe(page:Page) {return JSON.parse((await download(page,'Save material JSON')).toString('utf8'));}
async function audioProbe(page:Page, holdResume=false) {
  await page.addInitScript(({holdResume})=>{
    const state={contexts:0,starts:0,stops:0,posted:0,completed:0};
    const target=window as unknown as {__audioProbe:typeof state;__releaseResume:()=>void};
    target.__audioProbe=state;
    let release!:()=>void;
    const held=holdResume?new Promise<void>(resolve=>{release=resolve;}):Promise.resolve();
    target.__releaseResume=()=>release?.();
    const Original=window.AudioContext;
    class ObservedContext extends Original {
      constructor(options?:AudioContextOptions){super(options);state.contexts++;}
      override async resume(){await super.resume();await held;}
      override createBufferSource(){
        const source=super.createBufferSource(),start=source.start.bind(source),stop=source.stop.bind(source);
        source.start=(...args:Parameters<AudioBufferSourceNode['start']>)=>{state.starts++;start(...args);};
        source.stop=(...args:Parameters<AudioBufferSourceNode['stop']>)=>{state.stops++;stop(...args);};
        return source;
      }
    }
    window.AudioContext=ObservedContext;
    const OriginalWorker=window.Worker;
    class ObservedWorker extends OriginalWorker {
      constructor(url:string|URL,options?:WorkerOptions){
        super(url,options);
        const audio=String(url).includes('/audio/');
        if(audio){this.addEventListener('message',()=>state.completed++);
          const post=this.postMessage.bind(this);
          this.postMessage=((...args:Parameters<Worker['postMessage']>)=>{state.posted++;post(...args);}) as Worker['postMessage'];
        }
      }
    }
    window.Worker=ObservedWorker;
  },{holdResume});
}
async function probe(page:Page) {return page.evaluate(()=>(window as unknown as {__audioProbe:{contexts:number;starts:number;stops:number;posted:number;completed:number}}).__audioProbe);}
async function play(page:Page) {
  await page.getByRole('button',{name:'Play sound',exact:true}).click();
  await expect(page.locator('#app')).toHaveAttribute('data-audio-state','playing');
}
async function settlesStopped(page:Page) {
  await expect(page.locator('#app')).toHaveAttribute('data-audio-state','stopped');
  await expect.poll(async()=>{const p=await probe(page);return p.completed>=p.posted;}).toBe(true);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page.locator('#app')).toHaveAttribute('data-audio-state','stopped');
}

test('real audio is lazy and a cancelled activation never starts a late voice',async({page},info)=>{
  await audioProbe(page,true);await open(page,info.project.name);await draw(page);
  expect((await probe(page)).contexts).toBe(0);
  await page.getByRole('button',{name:'Play sound',exact:true}).click();
  await expect(page.locator('#app')).toHaveAttribute('data-audio-state','preparing');
  await page.getByRole('button',{name:'Stop sound',exact:true}).click();
  await page.evaluate(()=>(window as unknown as {__releaseResume:()=>void}).__releaseResume());
  await settlesStopped(page);
  expect((await probe(page)).contexts).toBe(1);expect((await probe(page)).starts).toBe(0);
});

test('reset, material switch, and source replacement stop real playback',async({page},info)=>{
  await audioProbe(page);await open(page,info.project.name);await image(page);
  await expect(page.locator('#source-name')).toHaveText('resilience.png');
  const bounds=(await page.getByTestId('material-preview').boundingBox())!;
  await page.mouse.click(bounds.x+bounds.width*.25,bounds.y+bounds.height*.5);
  await expect(page.locator('#materials')).toHaveAttribute('data-count','2');
  await draw(page);await play(page);
  await page.getByRole('button',{name:'Reset material',exact:true}).click();await settlesStopped(page);
  await draw(page);await play(page);
  await page.locator('#materials button').first().click();await settlesStopped(page);
  await draw(page);await play(page);
  await image(page,'replacement.png',true);await settlesStopped(page);
  expect((await probe(page)).stops).toBeGreaterThanOrEqual(3);
});

test('visibility and pagehide stop playback without restarting on return',async({page},info)=>{
  await audioProbe(page);await open(page,info.project.name);await draw(page);await play(page);
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });await settlesStopped(page);
  const starts=(await probe(page)).starts;
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:false});
    document.dispatchEvent(new Event('visibilitychange'));
  });await settlesStopped(page);expect((await probe(page)).starts).toBe(starts);
  await play(page);await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await settlesStopped(page);
  const afterHide=(await probe(page)).starts;
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await settlesStopped(page);expect((await probe(page)).starts).toBe(afterHide);
});

test('adapter denial preserves editing and current PNG export',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'gpu',{configurable:true,value:{requestAdapter:async()=>null}});
  });
  await page.goto('/');await expect(page.locator('#app')).toHaveAttribute('data-ready','true');
  await expect(page.locator('#render-status')).toContainText('CPU');
  const before=await recipe(page);await draw(page,'Visible');
  expect((await recipe(page)).materials[0].curves.visible).not.toEqual(before.materials[0].curves.visible);
  const png=await download(page,'Save appearance PNG');
  expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  expect(png.readUInt32BE(16)).toBe(512);expect(png.readUInt32BE(20)).toBe(384);
});

test('reduced motion leaves an authored gamma preview static',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});await open(page,info.project.name);
  await draw(page,'Gamma');await expect(page.locator('#animate')).toHaveAttribute('aria-pressed','false');
  // Read the real canvas after render work has settled, then across successive frames.
  await page.evaluate(()=>new Promise<void>(resolve=>setTimeout(resolve,250)));
  const frames=await page.evaluate(async()=>{
    const canvas=document.querySelector<HTMLCanvasElement>('#preview')!;
    const first=canvas.toDataURL();
    await new Promise<void>(resolve=>setTimeout(resolve,350));
    return [first,canvas.toDataURL()];
  });expect(frames[1]).toBe(frames[0]);
});

test('pending depth failure is retryable and preserves curve edits',async({page},info)=>{
  let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});let requests=0;
  await page.route('**/models/depth/fastdepth-320x256.onnx',async route=>{
    requests++;
    if(requests===1){await hold;await route.fulfill({status:503,body:'Temporary unavailable'});}
    else await route.continue();
  });
  await open(page,info.project.name);await image(page);
  await expect(page.locator('#source-name')).toHaveText('resilience.png');await draw(page,'X-ray');
  await expect.poll(()=>requests).toBe(1);
  await draw(page,'Visible');const authored=await recipe(page);release();
  await expect(page.locator('#retry-depth')).toBeVisible();
  expect((await recipe(page)).materials[0].curves.visible).toEqual(authored.materials[0].curves.visible);
  await page.locator('#retry-depth').click();
  await expect.poll(()=>requests).toBe(2);
  await expect(page.locator('#app')).toHaveAttribute('data-depth-state','ready');
  expect((await recipe(page)).materials[0].curves.visible).toEqual(authored.materials[0].curves.visible);
});

test('material JSON preserves edits while requiring the matching original image',async({page},info)=>{
  await open(page,info.project.name);const original=await image(page);
  await expect(page.locator('#source-name')).toHaveText('resilience.png');await draw(page,'Visible');
  const authored=await recipe(page),json=Buffer.from(JSON.stringify(authored));
  await page.reload();await expect(page.locator('#app')).toHaveAttribute('data-ready','true');
  const retained=await recipe(page);
  await page.locator('#material-input').setInputFiles({name:'material.json',mimeType:'application/json',buffer:json});
  await expect(page.locator('#message')).toContainText(/reattach|same|matching/i);
  await image(page,'wrong.png',true);
  await expect(page.locator('#message')).toContainText(/match|different|same/i);
  expect((await recipe(page)).materials).toEqual(retained.materials);
  await page.locator('#image-input').setInputFiles(original);
  await expect(page.locator('#source-name')).toHaveText('resilience.png');
  const restored=await recipe(page);
  expect(restored.image.hash).toBe(authored.image.hash);
  expect(restored.materials).toEqual(authored.materials);
});
