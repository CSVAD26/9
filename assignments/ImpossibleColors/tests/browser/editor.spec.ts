import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Curves, PickerDocument } from '../../src/picker/types';
import { smoothCurve } from '../../src/picker/curves';

async function openEditor(page:Page) {
  await page.goto('/?renderer=cpu');
  await expect(page.locator('#app')).toHaveAttribute('data-ready','true');
  const canvas = page.getByTestId('spectrum-canvas');
  await expect(canvas).toBeVisible();
  return canvas;
}

async function curves(page:Page):Promise<Curves> {
  await page.locator('#export-menu').evaluate((node:HTMLDetailsElement)=>{node.open=true;});
  const downloading = page.waitForEvent('download');
  await page.getByRole('button',{name:'Save material JSON'}).click();
  const download = await downloading;
  const document = JSON.parse(await readFile((await download.path())!,'utf8')) as PickerDocument;
  await page.locator('#export-menu').evaluate((node:HTMLDetailsElement)=>{node.open=false;});
  return document.materials.find(material=>material.id===document.activeId)!.curves;
}

async function stroke(page:Page, canvas:Locator, from:[number,number], to:[number,number], release=true, steps=1) {
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x+box.width*from[0],box.y+box.height*from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*to[0],box.y+box.height*to[1],{steps});
  if(release) await page.mouse.up();
}

test('fast optical strokes fill visible samples and Undo restores all three visited bands',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const canvas = await openEditor(page), before = await curves(page);
  await stroke(page,canvas,[.12,.78],[.95,.18]);
  const after = await curves(page);
  expect(after.visible.every(value=>value>0)).toBe(true);
  expect(after.visible.filter((value,i)=>value!==before.visible[i]).length).toBeGreaterThan(200);
  expect(after.uv.some(value=>value>0)).toBe(true);
  expect(after.infrared.some(value=>value>0)).toBe(true);
  expect(after.radio).toEqual(before.radio);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await curves(page)).toEqual(before);
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  expect(await curves(page)).toEqual(after);
  expect(errors).toEqual([]);
});

test('Escape, pointer cancellation and resize restore the complete unfinished stroke',async({page})=>{
  const canvas = await openEditor(page), before = await curves(page);
  await page.getByRole('button',{name:'Visible',exact:true}).click();
  await stroke(page,canvas,[.25,.2],[.75,.2],false);
  const capturedBox = (await canvas.boundingBox())!;
  await page.mouse.move(capturedBox.x+capturedBox.width+20,capturedBox.y+capturedBox.height+20);
  await page.keyboard.press('Escape');await page.mouse.up();
  expect(await curves(page)).toEqual(before);
  await stroke(page,canvas,[.25,.2],[.75,.2],false);
  await canvas.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
  expect(await curves(page)).toEqual(before);
  const oldWidth = await canvas.evaluate((node:HTMLCanvasElement)=>node.width);
  await stroke(page,canvas,[.25,.2],[.75,.2],false);
  await page.setViewportSize({width:900,height:1000});
  await expect.poll(()=>canvas.evaluate((node:HTMLCanvasElement)=>node.width)).not.toBe(oldWidth);
  await page.mouse.up();
  expect(await curves(page)).toEqual(before);
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
});

test('Smooth cancels an active stroke before smoothing its original samples',async({page})=>{
  const canvas = await openEditor(page), before = await curves(page);
  await page.getByRole('button',{name:'Visible',exact:true}).click();
  await stroke(page,canvas,[.25,.2],[.75,.2],false);
  // Native activation while capture remains active models keyboard/second-touch use.
  await page.getByRole('button',{name:'Smooth selected band'}).evaluate((node:HTMLButtonElement)=>node.click());
  await page.mouse.up();
  const after = await curves(page);
  expect(after.visible).toEqual(smoothCurve(before.visible));
  expect(after.uv).toEqual(before.uv);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await curves(page)).toEqual(before);
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
});

test('numeric Apply preserves entered values while cancelling a dirty stroke',async({page})=>{
  const canvas = await openEditor(page), before = await curves(page);
  await page.getByRole('button',{name:'Visible',exact:true}).click();
  await stroke(page,canvas,[.25,.2],[.75,.2],false);
  await page.getByTestId('curve-wavelength').evaluate((node:HTMLInputElement)=>{node.value='580';});
  await page.getByTestId('curve-response').evaluate((node:HTMLInputElement)=>{node.value='0.12';});
  await page.getByRole('button',{name:'Apply point'}).evaluate((node:HTMLButtonElement)=>node.click());
  await page.mouse.up();
  const after = await curves(page);
  expect(after.visible[128]).toBe(.12);
  expect(after.visible[80]).toBe(before.visible[80]);
  expect(after.uv).toEqual(before.uv);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await curves(page)).toEqual(before);
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
});

test('Reset ends a held pointer stroke so later movement cannot alter the reset material',async({page})=>{
  const canvas = await openEditor(page), initial = await curves(page);
  await page.getByRole('button',{name:'Visible',exact:true}).click();
  await stroke(page,canvas,[.25,.5],[.75,.35]);
  const committed = await curves(page);
  expect(committed.visible).not.toEqual(initial.visible);
  await stroke(page,canvas,[.25,.2],[.75,.2],false);
  await page.getByRole('button',{name:'Reset material'}).evaluate((node:HTMLButtonElement)=>node.click());
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.8);
  await page.mouse.up();
  expect(await curves(page)).toEqual(initial);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await curves(page)).toEqual(committed);
});

test('band zoom and keyboard navigation preserve samples while keyboard response edits undo',async({page})=>{
  const canvas = await openEditor(page), before = await curves(page);
  for(const band of ['Gamma','X-ray','Ultraviolet','Visible','Infrared','Microwave','Radio'])
    await page.getByRole('button',{name:band,exact:true}).click();
  await page.getByRole('button',{name:'Optical view'}).click();
  expect(await curves(page)).toEqual(before);
  await page.getByRole('button',{name:'Visible',exact:true}).click();
  await canvas.focus();
  for(const key of ['ArrowRight','ArrowLeft','Home','End']) await page.keyboard.press(key);
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
  expect(await curves(page)).toEqual(before);
  await canvas.focus();await page.keyboard.press('ArrowUp');
  const edited = await curves(page);
  expect(edited.visible[256]).toBeCloseTo(.01,10);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await curves(page)).toEqual(before);
});

test('point movement, erase, smoothing and numeric controls work on a narrow chart',async({page})=>{
  await page.setViewportSize({width:375,height:900});
  const canvas = await openEditor(page), before = await curves(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Visible',exact:true}).click();
  await page.getByTestId('curve-tool-points').click();
  await stroke(page,canvas,[.4,.25],[.6,.2],true,12);
  const moved = await curves(page);
  const changed = moved.visible.filter((value,i)=>value!==before.visible[i]);
  expect(changed.length).toBe(2); // Source restored and final destination assigned; no trail.
  await page.getByRole('button',{name:'Smooth selected band'}).click();
  expect((await curves(page)).visible).toEqual(smoothCurve(moved.visible));
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.getByTestId('curve-tool-erase').click();
  await stroke(page,canvas,[.3,.6],[.7,.6]);
  const erased = await curves(page);
  expect(erased.visible[128]).toBe(0);
  expect(erased.visible[0]).toBe(moved.visible[0]);
  expect(erased.uv).toEqual(before.uv);
  await page.getByTestId('curve-wavelength').fill('580');
  await page.getByTestId('curve-response').fill('0.42');
  await page.getByRole('button',{name:'Apply point'}).click();
  expect((await curves(page)).visible[128]).toBe(.42);
  await expect(page.getByRole('application',{name:'Spectrum editor'})).toBeVisible();
});
