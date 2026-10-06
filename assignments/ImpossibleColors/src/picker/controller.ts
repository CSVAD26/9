import { BANDS, BAND_IDS, wavelengthLabel } from './bands';
import { createDocument, createHistory } from './document';
import { deriveAppearance, colorHex, seedVisible } from './appearance';
import { mountCurveEditor } from './editor';
import { createWorkspace } from './workspace';
import { createStarterScene, buildScene } from './scene';
import { loadSource, meanSourceLinear } from './image';
import { selectionMask, sourcePoint } from './selection';
import { appendBrushPoint } from './brush';
import { createRenderer } from './render';
import { createDepthEstimator } from './depth';
import { createSound } from './sound';
import { compileSonification } from './audio/profile';
import { extractScanFields } from './audio/fields';
import { encodeWav } from './audio/wav';
import { serializeMaterial, parseMaterial, reattachSource } from './recipe';
import { capturePng, downloadBlob } from './export';
import { decodeSrgb } from '../color/srgb';
import type { BandId, Curve, Curves, Material, PickerDocument, DepthField, SceneFrame, Vec3, BrushStroke } from './types';

export async function mountPicker(host:HTMLElement):Promise<{dispose():Promise<void>}> {
  const ui=createWorkspace(host), el=ui.el;
  const events=new AbortController(), history=createHistory(createDocument());
  const starter=createStarterScene();
  let source=starter.pixels, releaseSource=()=>{}, occlusion:Float32Array|undefined=starter.occlusion;
  let documentLoadGeneration=0;
  let sourceGeneration=0, loadAbort=new AbortController(), depthAbort=new AbortController(), exportAbort=new AbortController();
  let depth:DepthField|undefined, depthPromise:Promise<void>|undefined, depthState='idle', pendingRecipe:PickerDocument|null=null;
  let disposed=false, activeBand:BandId='visible', optical=true, comparing=false, animation=false;
  let frozenTime=0, animationStart=performance.now(), raf=0, dirty=true, drawing=false, renderedRevision=-1;
  let maskTool:'select'|'add'|'erase'='select';
  let brush:{pointer:number;material:Material;stroke:BrushStroke}|null=null;
  const preview=el<HTMLCanvasElement>('preview');
  const estimator=createDepthEstimator();
  const signal=events.signal;
  const on=(target:EventTarget,event:string,fn:(event:any)=>void)=>target.addEventListener(event,fn,{signal});
  const report=(text:string)=>{el('message').textContent=text;};
  const fail=(error:unknown)=>{if(!(error instanceof DOMException&&error.name==='AbortError'))report(error instanceof Error?error.message:String(error));};
  const run=(task:Promise<unknown>)=>{void task.catch(fail);};
  const current=()=>history.snapshot.document;
  const material=()=>current().materials.find(m=>m.id===current().activeId)!;
  const edited=(next:Material):PickerDocument=>({...current(),materials:current().materials.map(m=>m.id===next.id?next:m)});
  const sourceName=()=>current().image?.name??'Sculpted light / sample surface';
  const currentTime=()=>animation?frozenTime+(performance.now()-animationStart)/1000:frozenTime;
  function cancelInteraction(){editor.cancelGesture();cancelBrush();}
  function commit(change:(doc:PickerDocument)=>PickerDocument){cancelInteraction();history.begin();history.preview(change(current()));history.commit();committed();}
  function committed(){ensureDepth();run(sound.refresh());}
  function updateMaterial(change:(m:Material)=>Material){commit(()=>edited(change(material())));}
  function resetRuntime(){
    cancelInteraction();
    sourceGeneration++;loadAbort.abort();loadAbort=new AbortController();depthAbort.abort();depthAbort=new AbortController();
    exportAbort.abort();exportAbort=new AbortController();depth=undefined;depthPromise=undefined;depthState='idle';
    sound.stop();animation=false;frozenTime=current().frozenTime;animationStart=performance.now();comparing=false;
  }
  const sound=createSound(()=>{
    const frame=buildScene(history.snapshot,source,current().image?depth:starter.knownDepth,occlusion,current().image?undefined:starter.materialMask), active=material();
    const mask=frame.layers.find(l=>l.materialId===active.id)!.mask;
    return {key:JSON.stringify([sourceGeneration,active.id,current().materials.map(m=>[m.id,m.selection]),active.curves.radio,active.curves.microwave,current().audio.mode]),
      score:compileSonification(extractScanFields(source,mask),active.curves,current().audio.mode)};
  },state=>{
    host.dataset.audioState=state;
    el<HTMLButtonElement>('play').disabled=state==='playing'||state==='preparing';
    el<HTMLButtonElement>('stop').disabled=state==='stopped'||state==='unavailable';
    el('sound-status').textContent=state==='playing'?'Scanning the original image, left to right.':state==='preparing'?'Preparing the eight-second scan…':state==='unavailable'?'Sound is unavailable. You can keep drawing.':'Radio rings like a string. Microwave speaks in pulses.';
  });
  host.dataset.audioState='stopped';
  const editor=mountCurveEditor(el('curve-editor'),(phase,band,curve)=>{
    if(phase==='begin'){cancelBrush();history.begin();return;}
    if(phase==='cancel'){history.cancel();return;}
    if(phase==='preview')history.preview(edited({...material(),curves:{...material().curves,[band]:curve}}));
    if(phase==='commit'){history.commit();committed();}
  },{onBandChange:band=>{activeBand=band;updateBandUI();}});
  const renderer=await createRenderer(preview,{forceCpu:new URLSearchParams(location.search).get('renderer')==='cpu',onStatus:message=>{
    const gpu=message.startsWith('GPU:');
    el('render-status').textContent=gpu?'Light transport · shared radiance cascades':'Reduced CPU preview · glow and color effects';
    el('render-status').title=message;host.dataset.renderer=gpu?'gpu':'cpu';
  }});

  function scene():SceneFrame {
    const frame=buildScene(history.snapshot,source,current().image?depth:starter.knownDepth,occlusion,current().image?undefined:starter.materialMask);
    return {...frame,time:sound.state==='playing'?sound.position():currentTime()};
  }
  function needsDepth(){return current().materials.some(m=>m.curves.xray.some(v=>v>0)||m.curves.gamma.some(v=>v>0));}
  function updateDepthUI(){
    const needed=needsDepth();el('depth-row').hidden=!needed;host.dataset.depthState=depthState;
    el<HTMLButtonElement>('retry-depth').hidden=depthState!=='error';
    el('depth-status').textContent=!current().image?'Sample depth · known geometry':depthState==='loading'?'Estimating surface depth once for this image…':depthState==='ready'?'Estimated surface depth · cached':depthState==='error'?'Depth unavailable. Your edits are preserved.':'Depth loads when you draw in X-ray or Gamma.';
  }
  function ensureDepth(retry=false):Promise<void> {
    if(!needsDepth()){updateDepthUI();return Promise.resolve();}
    if(!current().image){depthState='ready';updateDepthUI();return Promise.resolve();}
    if(depth)return Promise.resolve();
    if(depthPromise)return depthPromise;
    if(depthState==='error'&&!retry)return Promise.resolve();
    depthState='loading';updateDepthUI();
    const token=sourceGeneration, hash=current().image!.hash, sourceAtRequest=source;
    const task=estimator.estimate(sourceAtRequest,hash,depthAbort.signal).then(field=>{
      if(disposed||token!==sourceGeneration)return;depth=field;depthState='ready';dirty=true;
    }).catch(error=>{
      if(disposed||token!==sourceGeneration||(error instanceof DOMException&&error.name==='AbortError'))return;
      depthState='error';el('depth-status').title=error instanceof Error?error.message:String(error);
    }).finally(()=>{if(token===sourceGeneration){depthPromise=undefined;updateDepthUI();}});
    depthPromise=task;return task;
  }
  function updateBandUI(){
    const band=BANDS.find(b=>b.id===activeBand)!;
    for(const button of host.querySelectorAll<HTMLButtonElement>('[data-band]'))button.setAttribute('aria-pressed',String(button.dataset.band===activeBand));
    el('band-title').textContent=optical?'The optical window':band.label;
    el('band-range').textContent=optical?'200 – 1100 nm':`${wavelengthLabel(band.range[0])} – ${wavelengthLabel(band.range[1])}`;
    el('band-description').textContent=optical?'Shape visible color. Reach left for neon, right for warmth.':band.description;
    el<HTMLButtonElement>('optical-view').disabled=optical;
    const curves=material().curves;
    el('sound-strip').hidden=!['radio','microwave'].includes(activeBand)&&!curves.radio.some(v=>v>0)&&!curves.microwave.some(v=>v>0);
  }
  function syncUI(){
    const doc=current(),m=material(),hex=colorHex(deriveAppearance(m.curves).visibleLinear);
    editor.update(m.curves);el('color-chip').style.background=hex;el('color-value').textContent=hex;
    el<HTMLButtonElement>('undo').disabled=!history.canUndo;el<HTMLButtonElement>('redo').disabled=!history.canRedo;
    el('source-name').textContent=sourceName();el('resolution').textContent=`${source.width} × ${source.height}`;
    el('use-sample').hidden=!doc.image&&!pendingRecipe;
    el('stage-caption').textContent=doc.image?'Click a source color to shape its material':'A surface for your spectrum';
    el('view-label').textContent=comparing?'ORIGINAL SOURCE':'LIVE MATERIAL';el('compare').setAttribute('aria-pressed',String(comparing));
    el('selection-controls').hidden=!doc.image;el('tolerance-label').hidden=m.selection.kind==='whole';
    el('brush-label').hidden=maskTool==='select'||m.selection.kind==='whole';
    for(const id of ['mask-add','mask-erase'])el<HTMLButtonElement>(id).disabled=m.selection.kind==='whole';
    el('select-color').setAttribute('aria-pressed',String(maskTool==='select'));el('mask-add').setAttribute('aria-pressed',String(maskTool==='add'));el('mask-erase').setAttribute('aria-pressed',String(maskTool==='erase'));
    if(m.selection.kind==='color'){el<HTMLInputElement>('tolerance').value=String(m.selection.tolerance);el('tolerance-value').textContent=m.selection.tolerance.toFixed(2);}
    const materials=el('materials');materials.replaceChildren();materials.dataset.count=String(doc.materials.length);
    for(const [index,item] of doc.materials.entries()){
      const button=document.createElement('button');button.className='material-button';button.type='button';button.setAttribute('aria-pressed',String(item.id===doc.activeId));button.setAttribute('aria-label',index===0?'Whole image material':`Color material ${index}`);
      const dot=document.createElement('span');dot.className='material-dot';dot.style.background=colorHex(deriveAppearance(item.curves).visibleLinear);
      const name=document.createElement('span');name.textContent=item.selection.kind==='whole'?'All':String(index);button.append(dot,name);
      button.onclick=()=>{sound.stop();maskTool='select';commit(doc=>({...doc,activeId:item.id}));};materials.append(button);
    }
    el('remove-material').hidden=doc.materials.length<2||m.selection.kind==='whole';
    el<HTMLSelectElement>('sound-mode').value=doc.audio.mode;el<HTMLInputElement>('volume').value=String(doc.audio.volume);sound.setVolume(doc.audio.volume);
    const animated=doc.materials.some(item=>['gamma','radio','microwave'].some(b=>item.curves[b as BandId].some(v=>v>0)));
    el('animate').hidden=!animated;el('animate').setAttribute('aria-pressed',String(animation));el('animate').textContent=animation?'Pause':'Animate';
    updateBandUI();updateDepthUI();dirty=true;
  }
  const unsubscribe=history.subscribe(syncUI);
  async function render(){
    if(drawing||disposed||document.hidden)return;
    drawing=true;dirty=false;const token=sourceGeneration, revision=history.snapshot.revision, compareAtRequest=comparing;
    try {
      const frame=scene();
      await renderer.draw(comparing?{...frame,layers:[]}:frame);
      if(token===sourceGeneration&&revision===history.snapshot.revision&&compareAtRequest===comparing){renderedRevision=revision;preview.dataset.revision=String(revision);}
      else dirty=true;
    } catch(error){fail(error);}finally{drawing=false;}
  }
  let lastFrame=0;
  function tick(now:number){
    if(disposed)return;
    if(!document.hidden){
      if((animation||sound.state==='playing')&&now-lastFrame>90){dirty=true;lastFrame=now;}
      if(dirty&&!drawing)void render();
      const playing=sound.state==='playing',position=sound.position();
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      el('scan-line').hidden=!playing||reduced;el('scan-line').style.left=`${position/8*100}%`;
      el('sound-position').textContent=playing?`${position.toFixed(1)} / 8.0 S`:'8 SECOND SCAN';
    }
    raf=requestAnimationFrame(tick);
  }
  raf=requestAnimationFrame(tick);
  function cancelBrush(){if(brush){const pointer=brush.pointer;brush=null;history.cancel();if(preview.hasPointerCapture(pointer))preview.releasePointerCapture(pointer);}}
  function selectColor(u:number,v:number){
    cancelInteraction();
    if(!current().image)return;
    const x=Math.min(source.width-1,Math.floor(u*source.width)),y=Math.min(source.height-1,Math.floor(v*source.height)),i=y*source.width+x;
    if(source.rgba[i*4+3]===0){report('Choose a color in the visible part of the image.');return;}
    for(const m of [...current().materials].reverse())if(m.selection.kind==='color'&&selectionMask(source,m.selection)[i]>.5){sound.stop();commit(doc=>({...doc,activeId:m.id}));return;}
    if(current().materials.length>=6){report('Six materials are available. Remove a color material to select another.');return;}
    sound.stop();const rgb:Vec3=[source.rgba[i*4]/255,source.rgba[i*4+1]/255,source.rgba[i*4+2]/255],visible=seedVisible(decodeSrgb(rgb));
    const curves=Object.fromEntries(BAND_IDS.map(b=>[b,b==='visible'?visible:Array(257).fill(0)])) as unknown as Curves;
    const id=`color-${crypto.randomUUID()}`,next:Material={id,curves,baselineVisible:visible,selection:{kind:'color',rgb,tolerance:.1,strokes:[]}};
    commit(doc=>({...doc,materials:[...doc.materials,next],activeId:id}));report('Color selected. Draw a spectrum to change its appearance.');
  }
  function point(event:PointerEvent){return sourcePoint(event.clientX,event.clientY,preview.getBoundingClientRect(),source);}
  function brushMove(event:PointerEvent){
    if(!brush||event.pointerId!==brush.pointer)return;
    const p=point(event);if(!p)return;
    brush.stroke={...brush.stroke,points:appendBrushPoint(brush.stroke.points,p,source)};
    const old=brush.material;if(old.selection.kind!=='color')return;
    try{history.preview(edited({...old,selection:{...old.selection,strokes:[...old.selection.strokes,brush.stroke]}}));}
    catch(error){cancelBrush();fail(error);}
  }
  on(preview,'pointerdown',(event:PointerEvent)=>{
    if(event.button!==0||brush||!current().image||comparing)return;const p=point(event);if(!p)return;
    editor.cancelGesture();
    if(maskTool==='select'){selectColor(...p);return;}
    if(material().selection.kind!=='color')return;
    event.preventDefault();preview.setPointerCapture(event.pointerId);history.begin();
    brush={pointer:event.pointerId,material:material(),stroke:{mode:maskTool,radius:el<HTMLInputElement>('brush-size').valueAsNumber,strength:.5,points:[]}};brushMove(event);
  });
  on(preview,'pointermove',brushMove);
  on(preview,'pointerup',(event:PointerEvent)=>{if(brush?.pointer===event.pointerId){brushMove(event);brush=null;history.commit();committed();if(preview.hasPointerCapture(event.pointerId))preview.releasePointerCapture(event.pointerId);}});
  on(preview,'pointercancel',cancelBrush);on(preview,'lostpointercapture',()=>{if(brush)cancelBrush();});
  on(preview,'keydown',(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectColor(.5,.5);}});
  const resize=new ResizeObserver(cancelBrush);resize.observe(preview);
  for(const button of host.querySelectorAll<HTMLButtonElement>('[data-band]'))on(button,'click',()=>{activeBand=button.dataset.band as BandId;optical=false;editor.setViewport(activeBand);updateBandUI();});
  on(el('optical-view'),'click',()=>{optical=true;editor.setViewport('optical');updateBandUI();});
  on(el('undo'),'click',()=>{cancelInteraction();history.undo();committed();});on(el('redo'),'click',()=>{cancelInteraction();history.redo();committed();});
  on(el('reset'),'click',()=>{cancelInteraction();sound.stop();animation=false;frozenTime=0;updateMaterial(m=>({...m,curves:Object.fromEntries(BAND_IDS.map(b=>[b,b==='visible'?m.baselineVisible:Array(257).fill(0)])) as unknown as Curves}));report('Material restored to its starting response.');});
  on(el('remove-material'),'click',()=>{sound.stop();commit(doc=>({...doc,materials:doc.materials.filter(m=>m.id!==doc.activeId),activeId:doc.materials[0].id}));});
  on(el('compare'),'click',()=>{cancelInteraction();comparing=!comparing;syncUI();});
  on(el('animate'),'click',()=>{if(animation)frozenTime=currentTime();else animationStart=performance.now();animation=!animation;syncUI();});
  on(el('retry-depth'),'click',()=>run(ensureDepth(true)));
  for(const [id,tool] of [['select-color','select'],['mask-add','add'],['mask-erase','erase']] as const)on(el(id),'click',()=>{cancelInteraction();maskTool=tool;syncUI();});
  on(el('tolerance'),'input',()=>{const value=el<HTMLInputElement>('tolerance').valueAsNumber;cancelInteraction();const m=material();if(m.selection.kind==='color'){history.begin();history.preview(edited({...m,selection:{...m.selection,tolerance:value}}));}});
  on(el('tolerance'),'change',()=>{history.commit();committed();});
  on(el('volume'),'input',()=>{const value=el<HTMLInputElement>('volume').valueAsNumber;cancelInteraction();history.begin();history.preview({...current(),audio:{...current().audio,volume:value}});});
  on(el('volume'),'change',()=>history.commit());
  on(el('sound-mode'),'change',()=>{commit(doc=>({...doc,audio:{...doc.audio,mode:el<HTMLSelectElement>('sound-mode').value as 'radio'|'microwave'|'both'}}));});
  on(el('play'),'click',()=>{cancelInteraction();run(sound.play());});on(el('stop'),'click',()=>sound.stop());
  on(document,'keydown',(event:KeyboardEvent)=>{
    if(event.key==='Escape'){cancelInteraction();el<HTMLDetailsElement>('export-menu').open=false;}
    if(!(event.metaKey||event.ctrlKey)||event.key.toLowerCase()!=='z'||(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement))return;
    event.preventDefault();cancelInteraction();event.shiftKey?history.redo():history.undo();committed();
  });
  const stopHidden=()=>{cancelInteraction();sound.stop();if(animation){frozenTime=currentTime();animation=false;}syncUI();};
  on(document,'visibilitychange',()=>{if(document.hidden)stopHidden();else dirty=true;});on(window,'pagehide',stopHidden);
  const motion=matchMedia('(prefers-reduced-motion: reduce)');on(motion,'change',()=>{if(motion.matches&&animation){frozenTime=currentTime();animation=false;syncUI();}});
  async function importImage(file:File){
    cancelInteraction();const loadGeneration=++documentLoadGeneration;
    loadAbort.abort();loadAbort=new AbortController();const token=loadAbort;
    sound.stop();report(pendingRecipe?'Checking the material’s source image…':'Opening image locally…');
    const waiting=pendingRecipe;
    try {
      const loaded=waiting?await reattachSource(waiting,file,token.signal):await loadSource(file,token.signal);
      if(token.signal.aborted||disposed||loadGeneration!==documentLoadGeneration){loaded.dispose();return;}
      resetRuntime();releaseSource();releaseSource=loaded.dispose;source=loaded.pixels;occlusion=undefined;maskTool='select';
      const ref='ref' in loaded?loaded.ref:waiting!.image!;
      const base=createDocument(),visible=seedVisible(meanSourceLinear(source));
      const doc=waiting??{...base,image:ref,materials:[{...base.materials[0],curves:{...base.materials[0].curves,visible},baselineVisible:visible}]};
      pendingRecipe=null;frozenTime=doc.frozenTime;history.replace(doc);committed();report('Image loaded; history starts here. Click a source color to create a material.');
    } catch(error){if(!token.signal.aborted)fail(error);}
  }
  on(el('open-image'),'click',()=>el<HTMLInputElement>('image-input').click());
  on(el('image-input'),'change',()=>{const input=el<HTMLInputElement>('image-input'),file=input.files?.[0];input.value='';if(file)run(importImage(file));});
  const stage=el('preview-stage');on(stage,'dragover',(event:DragEvent)=>{event.preventDefault();stage.classList.add('drag-over');});on(stage,'dragleave',()=>stage.classList.remove('drag-over'));
  on(stage,'drop',(event:DragEvent)=>{event.preventDefault();stage.classList.remove('drag-over');const file=event.dataTransfer?.files[0];if(file)run(importImage(file));});
  on(el('use-sample'),'click',()=>{documentLoadGeneration++;resetRuntime();pendingRecipe=null;releaseSource();releaseSource=()=>{};source=starter.pixels;occlusion=starter.occlusion;maskTool='select';frozenTime=0;history.replace(createDocument());report('Sample surface restored.');});
  on(el('load-material'),'click',()=>el<HTMLInputElement>('material-input').click());
  on(el('material-input'),'change',()=>run((async()=>{
    const input=el<HTMLInputElement>('material-input'),file=input.files?.[0];input.value='';if(!file)return;
    const loadGeneration=++documentLoadGeneration;loadAbort.abort();cancelInteraction();
    if(file.size>1000000)throw Error('Material files must be at most 1 MB.');
    const text=await file.text();if(disposed||loadGeneration!==documentLoadGeneration)return;
    const doc=parseMaterial(text);cancelInteraction();sound.stop();
    if(doc.image&&doc.image.hash!==current().image?.hash){pendingRecipe=doc;syncUI();report(`Material needs “${doc.image.name}”. Open the same image to attach it.`);return;}
    pendingRecipe=null;
    if(!doc.image){resetRuntime();releaseSource();releaseSource=()=>{};source=starter.pixels;occlusion=starter.occlusion;}
    frozenTime=doc.frozenTime;animation=false;history.replace(doc);committed();report('Material opened.');
  })()));
  async function freezeForExport(){
    cancelInteraction();
    const time=sound.state==='playing'?sound.position():currentTime();
    animation=false;frozenTime=time;
    if(current().frozenTime!==time){history.begin();history.preview({...current(),frozenTime:time});history.commit();}
    const snapshot=history.snapshot;
    const sourceAtRequest=sourceGeneration;
    const requestedDepth=snapshot.document.materials.some(m=>m.curves.xray.some(v=>v>0)||m.curves.gamma.some(v=>v>0));
    if(depthPromise)await depthPromise;
    if(sourceAtRequest!==sourceGeneration)throw new DOMException('Export cancelled','AbortError');
    if(snapshot.document.image&&requestedDepth&&!depth)throw Error('The requested depth effect is unavailable. Retry depth before saving this appearance.');
    const frame=buildScene(snapshot,source,snapshot.document.image?depth:starter.knownDepth,occlusion,snapshot.document.image?undefined:starter.materialMask);
    return {...frame,time};
  }
  const closeExport=()=>{el<HTMLDetailsElement>('export-menu').open=false;};
  on(el('export-png'),'click',()=>{closeExport();run((async()=>{
    const token=sourceGeneration,signal=exportAbort.signal;report('Saving the current appearance…');const frame=await freezeForExport();
    const blob=await capturePng(renderer,frame,signal);if(token!==sourceGeneration||signal.aborted)return;
    downloadBlob(blob,'impossible-colors.png');report('Appearance saved at preview resolution.');
  })());});
  on(el('export-json'),'click',()=>{cancelInteraction();closeExport();run((async()=>{
    const time=sound.state==='playing'?sound.position():currentTime();frozenTime=time;animation=false;
    const doc={...current(),frozenTime:time};downloadBlob(new Blob([serializeMaterial(doc)],{type:'application/json'}),'impossible-colors.material.json');syncUI();report('Material saved. Keep its original image for reopening.');
  })());});
  on(el('export-wav'),'click',()=>{cancelInteraction();closeExport();run((async()=>{
    const token=sourceGeneration,signal=exportAbort.signal,volume=current().audio.volume;report('Rendering the eight-second sound…');
    const pcm=await sound.pcm(signal);if(token!==sourceGeneration||signal.aborted)return;
    const bytes=encodeWav(pcm,volume);downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'audio/wav'}),'impossible-colors.wav');report('Eight-second stereo sound saved.');
  })());});
  const copy=()=>run((async()=>{const hex=colorHex(deriveAppearance(material().curves).visibleLinear);try{await navigator.clipboard.writeText(hex);report(`${hex} copied — base visible color.`);}catch{report(`Base visible color: ${hex}`);}closeExport();})());
  on(el('copy-hex'),'click',copy);on(el('color-value'),'click',copy);
  on(document,'click',(event:MouseEvent)=>{if(!el('export-menu').contains(event.target as Node))closeExport();});
  await render();host.dataset.ready='true';
  return {async dispose(){
    if(disposed)return;documentLoadGeneration++;cancelInteraction();disposed=true;cancelAnimationFrame(raf);events.abort();resize.disconnect();unsubscribe();cancelBrush();loadAbort.abort();depthAbort.abort();exportAbort.abort();
    await Promise.all([editor.dispose(),renderer.dispose(),estimator.dispose(),sound.dispose()]);releaseSource();ui.destroy();
  }};
}
