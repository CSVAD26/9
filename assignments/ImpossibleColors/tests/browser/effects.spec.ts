import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function open(page:Page,project:string){
 await page.goto(project==='headless'?'/?renderer=cpu':'/');
 await expect(page.locator('#app')).toHaveAttribute('data-ready','true');
}
async function revision(page:Page){return page.locator('#preview').getAttribute('data-revision');}
async function renderedAfter(page:Page,previous:string|null){
 await expect.poll(()=>revision(page)).not.toBe(previous);
}
async function draw(page:Page,band:string,from=.2,to=.7){
 await page.getByRole('button',{name:band,exact:true}).click();
 const before=await revision(page),box=(await page.getByTestId('spectrum-canvas').boundingBox())!;
 await page.mouse.move(box.x+box.width*from,box.y+box.height*.68);await page.mouse.down();
 await page.mouse.move(box.x+box.width*to,box.y+box.height*.23,{steps:8});await page.mouse.up();
 await renderedAfter(page,before);
}
async function download(page:Page,name:string){
 await page.locator('#export-menu summary').click();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();
 return readFile((await (await pending).path())!);
}
async function recipe(page:Page){return JSON.parse((await download(page,'Save material JSON')).toString('utf8'));}
async function pixels(page:Page,png:Buffer){
 return page.evaluate(async encoded=>{
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(bitmap,0,0);
  const result={width:bitmap.width,height:bitmap.height,rgba:[...ctx.getImageData(0,0,bitmap.width,bitmap.height).data]};bitmap.close();return result;
 },png.toString('base64'));
}
async function png(page:Page){return download(page,'Save appearance PNG');}

test('UV changes appearance independently and frozen mixed UV/gamma exports repeat exactly',async({page},info)=>{
 await open(page,info.project.name);const baseline=await png(page),initial=await recipe(page);
 await draw(page,'Ultraviolet');const emitting=await png(page),withUv=await recipe(page);
 expect(emitting).not.toEqual(baseline);
 expect(withUv.materials[0].curves.visible).toEqual(initial.materials[0].curves.visible);
 expect(withUv.materials[0].curves.uv.some((value:number)=>value>0)).toBe(true);
 const previous=await revision(page);await page.getByRole('button',{name:'Clear selected band'}).click();await renderedAfter(page,previous);
 expect(await png(page)).toEqual(baseline);
 await draw(page,'Ultraviolet');await draw(page,'Gamma');
 await expect(page.locator('#app')).toHaveAttribute('data-depth-state','ready');
 await expect(page.locator('#animate')).toHaveAttribute('aria-pressed','false');
 const mixed=await png(page);expect(mixed).not.toEqual(emitting);expect(await png(page)).toEqual(mixed);
 const snapshot=await recipe(page);expect(snapshot.frozenTime).toBe(0);
 await page.screenshot({path:`test-results-effects-${info.project.name}/desktop-mixed.png`,fullPage:true});
});

test('infrared authored peaks and starter X-ray depth produce distinct appearances',async({page},info)=>{
 await open(page,info.project.name);const baseline=await png(page);
 await draw(page,'Infrared',.12,.42);const lower=await png(page);expect(lower).not.toEqual(baseline);
 const previous=await revision(page);await page.getByRole('button',{name:'Clear selected band'}).click();await renderedAfter(page,previous);
 await draw(page,'Infrared',.58,.86);const upper=await png(page);expect(upper).not.toEqual(lower);
 const resetRevision=await revision(page);await page.getByRole('button',{name:'Reset material',exact:true}).click();await renderedAfter(page,resetRevision);
 expect(await png(page)).toEqual(baseline);
 await draw(page,'X-ray',.2,.7);await expect(page.locator('#app')).toHaveAttribute('data-depth-state','ready');
 await expect(page.locator('#depth-status')).toContainText('known geometry');
 expect(await png(page)).not.toEqual(baseline);
});

test('unedited photo selection preserves pixels and alpha while mask strokes commit and undo',async({page},info)=>{
 await open(page,info.project.name);
 const fixture=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
  ctx.fillStyle='#cc6633';ctx.fillRect(0,0,48,64);ctx.fillStyle='#4477bb';ctx.fillRect(48,0,48,64);
  ctx.clearRect(0,0,8,8);ctx.clearRect(80,0,16,8);ctx.fillStyle='rgba(68,119,187,0.5)';ctx.fillRect(80,0,16,8);
  return {encoded:canvas.toDataURL().split(',')[1],rgba:[...ctx.getImageData(0,0,96,64).data]};
 });
 const before=await revision(page);await page.locator('#image-input').setInputFiles({name:'alpha-colors.png',mimeType:'image/png',buffer:Buffer.from(fixture.encoded,'base64')});
 await expect(page.locator('#source-name')).toHaveText('alpha-colors.png');await renderedAfter(page,before);
 await expect(page.locator('#preview')).toHaveAttribute('width','96');
 const imported=await pixels(page,await png(page));
 imported.rgba.forEach((value,i)=>expect(Math.abs(value-fixture.rgba[i])).toBeLessThanOrEqual(i%4===3?0:1));
 const box=(await page.getByTestId('material-preview').boundingBox())!,prior=await revision(page);
 await page.mouse.click(box.x+box.width*.25,box.y+box.height*.5);await renderedAfter(page,prior);
 await expect(page.locator('#materials')).toHaveAttribute('data-count','2');
 expect((await pixels(page,await png(page))).rgba).toEqual(imported.rgba);
 await draw(page,'Visible');const selected=await recipe(page),active=selected.materials.find((m:{id:string})=>m.id===selected.activeId);
 const stroke=async(mode:'add'|'erase')=>{
  await page.locator(mode==='add'?'#mask-add':'#mask-erase').click();const rev=await revision(page);
  await page.mouse.move(box.x+box.width*.65,box.y+box.height*.4);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.82,box.y+box.height*.6,{steps:6});await page.mouse.up();await renderedAfter(page,rev);
 };
 await stroke('add');const added=await recipe(page),addedActive=added.materials.find((m:{id:string})=>m.id===added.activeId);
 expect(addedActive.selection.strokes).toHaveLength(active.selection.strokes.length+1);
 expect(addedActive.selection.strokes.at(-1).mode).toBe('add');
 const addedPixels=await pixels(page,await png(page));expect(addedPixels.rgba).not.toEqual(imported.rgba);
 await stroke('erase');const erased=await recipe(page),erasedActive=erased.materials.find((m:{id:string})=>m.id===erased.activeId);
 expect(erasedActive.selection.strokes.at(-1).mode).toBe('erase');expect(erasedActive.selection.strokes).toHaveLength(addedActive.selection.strokes.length+1);
 const undoRevision=await revision(page);await page.getByRole('button',{name:'Undo',exact:true}).click();await renderedAfter(page,undoRevision);
 expect((await recipe(page)).materials).toEqual(added.materials);
 const undone=await pixels(page,await png(page));expect(undone.rgba).toEqual(addedPixels.rgba);
 for(let i=3;i<undone.rgba.length;i+=4)expect(undone.rgba[i]).toBe(fixture.rgba[i]);
});

test('radio microwave and both voices export distinct nonzero deterministic native WAVs',async({page},info)=>{
 await open(page,info.project.name);await draw(page,'Radio');await draw(page,'Microwave');
 const sounds:Buffer[]=[];
 for(const mode of ['radio','microwave','both']){
  await page.locator('#sound-mode').selectOption(mode);const wav=await download(page,'Save sound WAV');
  expect(wav.toString('ascii',0,4)).toBe('RIFF');expect(wav.readUInt32LE(24)).toBe(48000);
  expect(wav.length).toBe(1536044);
  let nonzero=false;for(let offset=44;offset<wav.length;offset+=2)if(wav.readInt16LE(offset)!==0){nonzero=true;break;}
  expect(nonzero).toBe(true);sounds.push(wav);
  expect(await download(page,'Save sound WAV')).toEqual(wav);
 }
 expect(sounds[0]).not.toEqual(sounds[1]);expect(sounds[2]).not.toEqual(sounds[0]);expect(sounds[2]).not.toEqual(sounds[1]);
 await expect(page.locator('#app')).toHaveAttribute('data-audio-state','stopped');
});
