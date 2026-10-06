import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function open(page:Page, project:string) {
  await page.goto(project === 'headless' ? '/?renderer=cpu' : '/');
  await expect(page.getByRole('heading', { name: 'Impossible colors.' })).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
}
async function draw(page:Page, band='Visible') {
  await page.getByRole('button', { name: band, exact: true }).click();
  const graph=page.getByTestId('spectrum-canvas');
  const box=(await graph.boundingBox())!;
  await page.mouse.move(box.x+box.width*.2,box.y+box.height*.65);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.8,box.y+box.height*.22,{steps:12});
  await page.mouse.up();
}
async function recipe(page:Page) {
  await page.locator('#export-menu summary').click();
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'Save material JSON'}).click();
  const file=await downloading;
  return JSON.parse(await readFile((await file.path())!,'utf8'));
}
async function imageFile(page:Page) {
  const data=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#cf643d';ctx.fillRect(0,0,80,100);ctx.fillStyle='#4477bb';ctx.fillRect(80,0,80,100);
    ctx.clearRect(0,0,12,12);return canvas.toDataURL().split(',')[1];
  });
  await page.locator('#image-input').setInputFiles({name:'two-colors.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await expect(page.locator('#source-name')).toHaveText('two-colors.png');
}

test('curve edits commit once, undo and material JSON preserve authored samples',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page,info.project.name);
  const before=await recipe(page);
  await draw(page);
  const after=await recipe(page);
  expect(after.materials[0].curves.visible).not.toEqual(before.materials[0].curves.visible);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect((await recipe(page)).materials[0].curves.visible).toEqual(before.materials[0].curves.visible);
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  expect((await recipe(page)).materials[0].curves.visible).toEqual(after.materials[0].curves.visible);
  expect(errors).toEqual([]);
});

test('image selection preserves source, recolors and exports current PNG',async({page},info)=>{
  await open(page,info.project.name);await imageFile(page);
  const canvas=page.getByTestId('material-preview');
  await expect(canvas).toHaveAttribute('width','160');
  const box=(await canvas.boundingBox())!;
  await page.mouse.click(box.x+box.width*.3,box.y+box.height*.5);
  await expect(page.locator('#materials')).toHaveAttribute('data-count','2');
  await draw(page,'Ultraviolet');
  await page.locator('#export-menu summary').click();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Save appearance PNG'}).click();
  const data=await readFile((await (await downloading).path())!);
  expect(data.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  expect(data.readUInt32BE(16)).toBe(160);expect(data.readUInt32BE(20)).toBe(100);
});

test('sound stays stopped until Play, stops on demand and exports deterministic WAV',async({page},info)=>{
  await open(page,info.project.name);
  await expect(page.locator('#app')).toHaveAttribute('data-audio-state','stopped');
  await draw(page,'Radio');
  await page.getByRole('button',{name:'Play sound',exact:true}).click();
  await expect(page.locator('#app')).toHaveAttribute('data-audio-state','playing');
  await page.getByRole('button',{name:'Stop sound',exact:true}).click();
  await expect(page.locator('#app')).toHaveAttribute('data-audio-state','stopped');
  await page.locator('#export-menu summary').click();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Save sound WAV'}).click();
  const data=await readFile((await (await downloading).path())!);
  expect(data.length).toBe(1536044);expect(data.toString('ascii',0,4)).toBe('RIFF');
  expect(data.readUInt32LE(24)).toBe(48000);
});

test('mobile and keyboard keep the complete instrument usable',async({page},info)=>{
  await page.setViewportSize({width:375,height:900});await open(page,info.project.name);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Visible',exact:true}).click();
  const graph=page.getByTestId('spectrum-canvas');await graph.focus();
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();
  await page.screenshot({path:`test-results/mobile-${info.project.name}.png`,fullPage:true});
});
