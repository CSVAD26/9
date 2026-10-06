import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function exported(page:import('@playwright/test').Page,label='Save material JSON') {
  await page.locator('#export-menu summary').click();
  const event=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();
  return readFile((await (await event).path())!);
}

test('edits made while sound prepares are used by the first audible buffer',async({page},info)=>{
  await page.addInitScript(()=>{
    let release!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;});
    const probe={nonSilent:[] as boolean[],release:()=>release()};
    (window as unknown as {soundProbe:typeof probe}).soundProbe=probe;
    const Original=AudioContext;
    window.AudioContext=class extends Original {
      override async resume(){await super.resume();await held;}
      override createBufferSource(){
        const source=super.createBufferSource(),start=source.start.bind(source);
        source.start=(...args:Parameters<AudioBufferSourceNode['start']>)=>{
          probe.nonSilent.push(source.buffer!.getChannelData(0).some(value=>value!==0));start(...args);
        };
        return source;
      }
    };
  });
  await page.goto(info.project.name==='headless'?'/?renderer=cpu':'/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready','true');
  await page.getByRole('button',{name:'Radio',exact:true}).click();
  const box=(await page.getByTestId('spectrum-canvas').boundingBox())!;
  await page.mouse.move(box.x+box.width*.25,box.y+box.height*.3);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.75,box.y+box.height*.3,{steps:8});await page.mouse.up();
  await page.getByRole('button',{name:'Play sound',exact:true}).click();
  await expect(page.locator('#app')).toHaveAttribute('data-audio-state','preparing');
  await page.getByRole('button',{name:'Clear selected band',exact:true}).click();
  await page.evaluate(()=>(window as unknown as {soundProbe:{release():void}}).soundProbe.release());
  await expect(page.locator('#app')).toHaveAttribute('data-audio-state','playing');
  expect(await page.evaluate(()=>(window as unknown as {soundProbe:{nonSilent:boolean[]}}).soundProbe.nonSilent)).toEqual([false]);
});

test('a slower earlier material read cannot overwrite a newer material',async({page},info)=>{
  await page.addInitScript(()=>{
    const original=Blob.prototype.text;
    let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
    (window as unknown as {releaseMaterial():void}).releaseMaterial=()=>release();
    Blob.prototype.text=async function(){const text=await original.call(this);if(this instanceof File&&this.name==='earlier.json')await held;return text;};
  });
  await page.goto(info.project.name==='headless'?'/?renderer=cpu':'/');await expect(page.locator('#app')).toHaveAttribute('data-ready','true');
  const baseline=JSON.parse((await exported(page)).toString('utf8'));
  await page.locator('#material-input').setInputFiles({name:'earlier.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...baseline,seed:111}))});
  await page.locator('#material-input').setInputFiles({name:'later.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...baseline,seed:222}))});
  await expect(page.locator('#message')).toHaveText('Material opened.');
  expect(JSON.parse((await exported(page)).toString('utf8')).seed).toBe(222);
  await page.evaluate(async()=>{(window as unknown as {releaseMaterial():void}).releaseMaterial();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  expect(JSON.parse((await exported(page)).toString('utf8')).seed).toBe(222);
});

test('sound cache follows the effective mask after another material takes priority',async({page},info)=>{
  await page.goto(info.project.name==='headless'?'/?renderer=cpu':'/');await expect(page.locator('#app')).toHaveAttribute('data-ready','true');
  const bytes=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#cc5533';ctx.fillRect(0,0,64,96);ctx.fillStyle='#334499';ctx.fillRect(64,0,64,96);return canvas.toDataURL().split(',')[1];});
  await page.locator('#image-input').setInputFiles({name:'priority.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});await expect(page.locator('#source-name')).toHaveText('priority.png');
  await page.getByRole('button',{name:'Radio',exact:true}).click();
  const graph=(await page.getByTestId('spectrum-canvas').boundingBox())!;
  await page.mouse.move(graph.x+graph.width*.25,graph.y+graph.height*.3);await page.mouse.down();await page.mouse.move(graph.x+graph.width*.75,graph.y+graph.height*.3,{steps:8});await page.mouse.up();
  const before=await exported(page,'Save sound WAV');
  const preview=(await page.getByTestId('material-preview').boundingBox())!;
  await page.mouse.click(preview.x+preview.width*.3,preview.y+preview.height*.5);await expect(page.locator('#materials')).toHaveAttribute('data-count','2');
  await page.getByRole('button',{name:'Whole image material',exact:true}).click();
  const after=await exported(page,'Save sound WAV');
  expect(after.equals(before)).toBe(false);
});

test('two touch surfaces never share a curve and mask history transaction',async({page},info)=>{
  await page.goto(info.project.name==='headless'?'/?renderer=cpu':'/');await expect(page.locator('#app')).toHaveAttribute('data-ready','true');
  const bytes=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=128;c.height=96;const ctx=c.getContext('2d')!;ctx.fillStyle='#cc5533';ctx.fillRect(0,0,128,96);return c.toDataURL().split(',')[1];});
  await page.locator('#image-input').setInputFiles({name:'touch.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});await expect(page.locator('#source-name')).toHaveText('touch.png');
  const preview=(await page.getByTestId('material-preview').boundingBox())!;
  await page.mouse.click(preview.x+preview.width*.4,preview.y+preview.height*.5);await expect(page.locator('#materials')).toHaveAttribute('data-count','2');
  await page.getByRole('button',{name:'Add mask',exact:true}).click();await page.getByRole('button',{name:'Visible',exact:true}).click();
  const before=JSON.parse((await exported(page)).toString('utf8'));
  const graph=(await page.getByTestId('spectrum-canvas').boundingBox())!;
  const session=await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const mask={id:1,x:preview.x+preview.width*.4,y:preview.y+preview.height*.5};
  const curve={id:2,x:graph.x+graph.width*.3,y:graph.y+graph.height*.3};
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[mask]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...mask,x:mask.x+25}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...mask,x:mask.x+25},curve]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...mask,x:mask.x+35},{...curve,x:graph.x+graph.width*.65}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await session.send('Emulation.setTouchEmulationEnabled',{enabled:false});await session.detach();
  const after=JSON.parse((await exported(page)).toString('utf8'));
  expect(after.materials[1].selection.strokes).toEqual(before.materials[1].selection.strokes);
  expect(after.materials[1].curves.visible).not.toEqual(before.materials[1].curves.visible);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(JSON.parse((await exported(page)).toString('utf8')).materials).toEqual(before.materials);
});
