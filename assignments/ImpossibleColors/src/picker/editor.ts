import p5 from 'p5';
import { BANDS, bandCoordinate, bandWavelength, clamp, wavelengthLabel } from './bands';
import { moveCurveSample, sampleCurve, smoothCurve } from './curves';
import { createDocument } from './document';
import { curveLocation, editStroke, viewWavelength, wavelengthPosition } from './editor-math';
import type { CurveViewport, StrokePoint } from './editor-math';
import type { BandId, Curve, Curves } from './types';
import './editor.css';

export type CurveTool = 'draw'|'points'|'erase';
export type CurveGesturePhase = 'begin'|'preview'|'commit'|'cancel';
export type CurveEditor = {
  update(curves:Curves):void;
  setViewport(view:CurveViewport):void;
  setTool(tool:CurveTool):void;
  cancelGesture():void;
  dispose():Promise<void>;
};
type Selection = {band:BandId; index:number};
type Gesture = {pointer:number; before:Curves; band:BandId; index:number; previous:StrokePoint};

export function mountCurveEditor(host:HTMLElement, onGesture:(phase:CurveGesturePhase, band:BandId, curve:Curve)=>void, options:{onBandChange?:(band:BandId)=>void} = {}):CurveEditor {
  let curves = createDocument().materials[0].curves;
  let view:CurveViewport = 'optical', tool:CurveTool = 'draw';
  let selected:Selection = {band:'visible',index:106}, hover:StrokePoint|null = null;
  let gesture:Gesture|null = null, canvas:HTMLCanvasElement|undefined;
  let disposed = false, ready = false, raf = 0, width = 0, height = 320;
  const listeners:{target:EventTarget; type:string; fn:EventListener}[] = [];
  const root = document.createElement('div'); root.className = 'curve-editor';
  const graph = document.createElement('div'); graph.className = 'curve-graph';
  graph.setAttribute('role','application'); graph.setAttribute('aria-label','Spectrum editor');
  const controls = document.createElement('div'); controls.className = 'curve-controls';
  const tools = document.createElement('div'); tools.className = 'curve-tools'; tools.setAttribute('role','group'); tools.setAttribute('aria-label','Curve tools');
  const button = (label:string, title:string, action:()=>void) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.setAttribute('aria-label',title);
    listen(node,'click',action); return node;
  };
  const toolButtons = (['draw','points','erase'] as const).map(value => {
    const node = button(value === 'points' ? 'Points' : value === 'draw' ? 'Draw' : 'Erase',`${value === 'points' ? 'Edit points' : value} curve`,()=>setTool(value));
    node.dataset.testid = `curve-tool-${value}`; tools.append(node); return node;
  });
  const actions = document.createElement('div'); actions.className = 'curve-actions';
  actions.append(button('Smooth','Smooth selected band',()=>{cancel();replaceBand(smoothCurve(curves[selected.band]));}),button('Clear','Clear selected band',()=>replaceBand(Array(257).fill(0))));
  const form = document.createElement('form'); form.className = 'curve-point-form'; form.setAttribute('aria-label','Edit selected point');
  const waveLabel = document.createElement('label'), responseLabel = document.createElement('label');
  const waveText = document.createElement('span');
  const wavelength = document.createElement('input'); wavelength.type = 'number'; wavelength.dataset.testid = 'curve-wavelength'; wavelength.required = true;
  const response = document.createElement('input'); response.type = 'number'; response.min = '0'; response.max = '1'; response.step = '0.01'; response.required = true; response.setAttribute('aria-label','Response'); response.dataset.testid = 'curve-response';
  waveLabel.append(waveText,wavelength); responseLabel.append(document.createTextNode('Response'),response);
  const apply = document.createElement('button'); apply.type = 'submit'; apply.textContent = 'Apply'; apply.setAttribute('aria-label','Apply point');
  form.append(waveLabel,responseLabel,apply);
  const status = document.createElement('output'); status.className = 'curve-status'; status.setAttribute('aria-live','polite');
  const hint = document.createElement('p'); hint.className = 'curve-hint'; hint.id = `curve-hint-${Math.random().toString(36).slice(2)}`;
  hint.textContent = 'Draw a response. Arrow keys edit a point · Escape cancels a stroke'; graph.setAttribute('aria-describedby',hint.id);
  controls.append(tools,actions,form); root.append(graph,controls,status,hint); host.append(root);

  function listen(target:EventTarget, type:string, action:(event:any)=>void) {
    const fn = action as EventListener; target.addEventListener(type,fn); listeners.push({target,type,fn});
  }
  function schedule() {
    if(disposed || !ready || raf) return;
    raf = requestAnimationFrame(()=>{raf = 0; if(!disposed) sketch.redraw();});
  }
  function plot() {return {left:42,top:35,width:Math.max(1,width-62),height:height-83};}
  function units(band:BandId) {
    const end = BANDS.find(b=>b.id===band)!.range[1];
    return end <= 1e-9 ? {scale:1e12,label:'pm'} : end <= 1.1e-6 ? {scale:1e9,label:'nm'} : end <= 1e-3 ? {scale:1e6,label:'μm'} : end <= 1 ? {scale:1e3,label:'mm'} : {scale:1,label:'m'};
  }
  function syncControls() {
    const band = BANDS.find(b=>b.id===selected.band)!;
    const unit = units(selected.band);
    waveText.textContent = `Wavelength (${unit.label})`; wavelength.setAttribute('aria-label',`Wavelength (${unit.label})`);
    wavelength.min = String(band.range[0]*unit.scale); wavelength.max = String(band.range[1]*unit.scale); wavelength.step = 'any';
    if(document.activeElement !== wavelength) wavelength.value = String(+(bandWavelength(selected.band,selected.index/256)*unit.scale).toPrecision(7));
    if(document.activeElement !== response) response.value = String(+curves[selected.band][selected.index].toFixed(4));
    status.textContent = `${band.label} · ${wavelengthLabel(bandWavelength(selected.band,selected.index/256))} · ${curves[selected.band][selected.index].toFixed(2)}`;
    toolButtons.forEach((node,i)=>node.setAttribute('aria-pressed',String(tool === ['draw','points','erase'][i])));
    schedule();
  }
  function select(band:BandId,index:number) {
    const changed = selected.band !== band;
    selected = {band,index:clamp(Math.round(index),0,256)};
    if(changed) options.onBandChange?.(band);
    syncControls();
  }
  function preview(band:BandId,curve:Curve) {
    curves = {...curves,[band]:curve}; onGesture('preview',band,curve);
  }
  function release(pointer:number) {
    if(canvas?.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }
  function cancel() {
    if(!gesture) return;
    const old = gesture; gesture = null; curves = old.before;
    onGesture('cancel',old.band,curves[old.band]); release(old.pointer); syncControls();
  }
  function replaceBand(curve:Curve) {
    cancel(); const band = selected.band;
    onGesture('begin',band,curves[band]); preview(band,curve); onGesture('commit',band,curves[band]); syncControls();
  }
  function applyPoint() {
    const band = selected.band, index = selected.index;
    const meters = wavelength.valueAsNumber/units(band).scale, value = response.valueAsNumber;
    if(!Number.isFinite(meters) || meters<=0 || !Number.isFinite(value) || !form.checkValidity()) return;
    cancel();
    const u = bandCoordinate(band,meters);
    const next = moveCurveSample(curves[band],index,{u,value});
    selected = {band,index:Math.round(u*256)}; replaceBand(next);
  }
  listen(form,'submit',(event:SubmitEvent)=>{event.preventDefault();applyPoint();});
  listen(response,'change',applyPoint);
  function setTool(next:CurveTool) {cancel(); tool = next; syncControls();}
  function pointerPosition(event:PointerEvent):StrokePoint {
    const rect = canvas!.getBoundingClientRect(), box = plot();
    return {x:clamp(((event.clientX-rect.left)*width/rect.width-box.left)/box.width),value:clamp(1-((event.clientY-rect.top)*height/rect.height-box.top)/box.height)};
  }
  function inside(event:PointerEvent) {
    const rect = canvas!.getBoundingClientRect(), box = plot();
    const x = (event.clientX-rect.left)*width/rect.width, y = (event.clientY-rect.top)*height/rect.height;
    return x>=box.left&&x<=box.left+box.width&&y>=box.top&&y<=box.top+box.height;
  }
  function stroke(point:StrokePoint) {
    if(!gesture) return;
    if(tool === 'points') {
      const band = gesture.band, u = bandCoordinate(band,viewWavelength(view,point.x));
      preview(band,moveCurveSample(gesture.before[band],gesture.index,{u,value:point.value}));
      select(band,u*256);
    } else {
      const changed = editStroke(curves,view,gesture.previous,point,tool);
      for(const band of BANDS) if(changed[band.id]) preview(band.id,changed[band.id]!);
      const location = curveLocation(view,point.x,point.value); select(location.band,location.u*256);
    }
    gesture.previous = point; syncControls();
  }
  function pointerDown(event:PointerEvent) {
    if(gesture || event.button!==0 || !inside(event)) return;
    event.preventDefault(); canvas!.focus({preventScroll:true});
    const point = pointerPosition(event), location = curveLocation(view,point.x,point.value);
    select(location.band,location.u*256);
    gesture = {pointer:event.pointerId,before:curves,band:selected.band,index:selected.index,previous:point};
    canvas!.setPointerCapture(event.pointerId); onGesture('begin',selected.band,curves[selected.band]); stroke(point);
  }
  function pointerMove(event:PointerEvent) {
    if(gesture && gesture.pointer !== event.pointerId) return;
    hover = inside(event) ? pointerPosition(event) : null;
    if(gesture) {
      event.preventDefault();
      for(const item of event.getCoalescedEvents?.() || []) stroke(pointerPosition(item));
      stroke(pointerPosition(event));
    }
    schedule();
  }
  function pointerUp(event:PointerEvent) {
    if(!gesture || gesture.pointer !== event.pointerId) return;
    stroke(pointerPosition(event)); const old = gesture; gesture = null;
    onGesture('commit',old.band,curves[old.band]); release(old.pointer); syncControls();
  }
  function key(event:KeyboardEvent) {
    if(event.key === 'Escape') {cancel();event.preventDefault();return;}
    if(gesture || event.altKey || event.metaKey || event.ctrlKey) return;
    const keys = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Delete','Backspace'];
    if(!keys.includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? 10 : 1;
    let index = selected.index, value = curves[selected.band][index];
    if(event.key==='ArrowLeft') index -= step;
    if(event.key==='ArrowRight') index += step;
    if(event.key==='Home') index = 0;
    if(event.key==='End') index = 256;
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {select(selected.band,index);return;}
    if(event.key==='ArrowUp') value += event.shiftKey ? .1 : .01;
    if(event.key==='ArrowDown') value -= event.shiftKey ? .1 : .01;
    if(event.key==='Delete'||event.key==='Backspace') value = 0;
    index = clamp(index,0,256);
    const next = moveCurveSample(curves[selected.band],selected.index,{u:index/256,value});
    selected = {...selected,index}; replaceBand(next);
  }
  listen(root,'keydown',(event:KeyboardEvent)=>{if(event.key==='Escape')cancel();});
  const observer = new ResizeObserver(()=>{
    const nextWidth = Math.max(160,Math.round(graph.clientWidth)), nextHeight = nextWidth<480 ? 290 : 330;
    if(nextWidth===width&&nextHeight===height) return;
    cancel(); width = nextWidth; height = nextHeight;
    if(ready) sketch.resizeCanvas(width,height,true); schedule();
  }); observer.observe(graph);

  const sketch = new p5(p=>{
    p.setup = () => {
      if(disposed) return;
      width = Math.max(160,Math.round(graph.clientWidth)); height = width<480 ? 290 : 330;
      const renderer = p.createCanvas(width,height); renderer.parent(graph); canvas = renderer.elt as HTMLCanvasElement;
      canvas.dataset.testid = 'spectrum-canvas'; canvas.tabIndex = 0; canvas.setAttribute('aria-label','Spectrum response curve'); canvas.setAttribute('aria-describedby',hint.id);
      listen(canvas,'pointerdown',pointerDown); listen(canvas,'pointermove',pointerMove); listen(canvas,'pointerup',pointerUp);
      listen(canvas,'pointercancel',(event:PointerEvent)=>{if(gesture?.pointer===event.pointerId)cancel();});
      listen(canvas,'lostpointercapture',(event:PointerEvent)=>{if(gesture?.pointer===event.pointerId)cancel();});
      listen(canvas,'pointerleave',()=>{hover = null;schedule();}); listen(canvas,'keydown',key);
      p.pixelDensity(Math.min(2,window.devicePixelRatio || 1)); p.noLoop(); ready = true; syncControls();
    };
    p.draw = () => {
      if(disposed) return;
      const box = plot(), ctx = p.drawingContext as CanvasRenderingContext2D;
      const px = (x:number)=>box.left+x*box.width, py = (value:number)=>box.top+(1-value)*box.height;
      p.background('#101112'); p.textFont('monospace'); p.textSize(10); p.strokeWeight(1);
      for(const value of [0,.25,.5,.75,1]) {
        p.stroke('#25282a'); p.line(box.left,py(value),box.left+box.width,py(value));
        p.noStroke(); p.fill('#858883'); p.textAlign(p.RIGHT,p.CENTER); p.text(value.toFixed(value===0||value===1?0:2),box.left-12,py(value));
      }
      const ticks = view === 'optical' ? (width<430 ? [200,400,600,800,1100] : [200,300,400,500,600,700,800,900,1100]).map(n=>({x:(n-200)/900,label:String(n)})) : [0,.25,.5,.75,1].map(x=>({x,label:wavelengthLabel(viewWavelength(view,x))}));
      ticks.forEach(tick=>{
        p.stroke('#202325');p.line(px(tick.x),box.top,px(tick.x),box.top+box.height);
        p.noStroke();p.fill('#858883');p.textAlign(tick.x===0?p.LEFT:tick.x===1?p.RIGHT:p.CENTER,p.TOP);p.text(tick.label,px(tick.x),box.top+box.height+16);
      });
      const gradient = ctx.createLinearGradient(px(wavelengthPosition(view,380e-9)),0,px(wavelengthPosition(view,780e-9)),0);
      // Optical rainbow only; distant band views use their own quiet accent.
      if(view==='optical'||view==='visible') {
        for(const [stop,color] of [[0,'#7d66ef'],[.17,'#4489f0'],[.34,'#4dc9c5'],[.5,'#ace290'],[.68,'#f0d37e'],[.84,'#ed9a74'],[1,'#db706e']] as const) gradient.addColorStop(stop,color);
      }
      ctx.save();ctx.beginPath();ctx.rect(box.left,box.top,box.width,box.height);ctx.clip();
      const visibleBands = view === 'optical' ? BANDS.filter(b=>['uv','visible','infrared'].includes(b.id)) : BANDS.filter(b=>b.id===view);
      for(const band of visibleBands) {
        const left = view === 'optical' ? Math.max(0,wavelengthPosition(view,band.range[0])) : 0;
        const right = view === 'optical' ? Math.min(1,wavelengthPosition(view,band.range[1])) : 1;
        ctx.fillStyle = band.id==='visible' ? gradient : band.color;ctx.globalAlpha = .045;ctx.fillRect(px(left),box.top,(right-left)*box.width,box.height);ctx.globalAlpha = 1;
        const path = (fill:boolean) => {
          ctx.beginPath();
          for(let n=0;n<=Math.ceil((right-left)*box.width);n++) {
            const x = left+(right-left)*n/Math.max(1,Math.ceil((right-left)*box.width));
            const value = sampleCurve(curves[band.id],bandCoordinate(band.id,viewWavelength(view,x)));
            if(n===0)ctx.moveTo(px(x),py(value));else ctx.lineTo(px(x),py(value));
          }
          if(fill){ctx.lineTo(px(right),py(0));ctx.lineTo(px(left),py(0));ctx.closePath();}
        };
        path(true);ctx.globalAlpha = .1;ctx.fill();ctx.globalAlpha = 1;
        path(false);ctx.strokeStyle = band.id==='visible' ? gradient : band.color;ctx.lineWidth = 2.25;ctx.stroke();
        ctx.globalAlpha = .6;ctx.fillRect(px(left),py(0)-2,(right-left)*box.width,2);ctx.globalAlpha = 1;
      }
      if((view==='optical'||view==='visible')&&curves.uv.some(v=>v>0)) {
        ctx.beginPath();ctx.setLineDash([4,5]);ctx.lineWidth = 1.5;ctx.strokeStyle = '#d6b8fa';
        for(let i=0;i<=256;i++){const x=wavelengthPosition(view,(420+280*i/256)*1e-9),y=py(curves.uv[i]);if(i===0)ctx.moveTo(px(x),y);else ctx.lineTo(px(x),y);}
        ctx.stroke();ctx.setLineDash([]);
      }
      if(tool==='points') {
        const location = hover ? curveLocation(view,hover.x,hover.value) : {band:selected.band,u:selected.index/256};
        const center = Math.round(location.u*256);
        const dx = Math.abs(wavelengthPosition(view,bandWavelength(location.band,Math.min(256,center+1)/256))-wavelengthPosition(view,bandWavelength(location.band,Math.max(0,center-1)/256)))*box.width/2;
        const stride = Math.max(1,Math.ceil(9/Math.max(.1,dx)));
        for(let i=Math.max(0,center-4*stride);i<=Math.min(256,center+4*stride);i+=stride) {
          const x = wavelengthPosition(view,bandWavelength(location.band,i/256));
          ctx.beginPath();ctx.arc(px(x),py(curves[location.band][i]),i===selected.index&&location.band===selected.band?4:2.4,0,Math.PI*2);ctx.fillStyle = '#e8e8e3';ctx.fill();
        }
      }
      const sx = wavelengthPosition(view,bandWavelength(selected.band,selected.index/256));
      if(sx>=0&&sx<=1) {
        ctx.beginPath();ctx.arc(px(sx),py(curves[selected.band][selected.index]),4.5,0,Math.PI*2);ctx.fillStyle = '#101112';ctx.fill();ctx.strokeStyle = '#ecece3';ctx.lineWidth = 1.5;ctx.stroke();
      }
      if(hover) {
        ctx.beginPath();ctx.moveTo(px(hover.x),box.top);ctx.lineTo(px(hover.x),py(0));ctx.strokeStyle = '#777b7460';ctx.lineWidth = 1;ctx.setLineDash([2,4]);ctx.stroke();ctx.setLineDash([]);
      }
      ctx.restore();
      p.noStroke();p.fill('#b8bcb5');p.textAlign(p.LEFT,p.CENTER);p.textSize(10);
      if(view==='optical') {
        for(const [x,label] of [[.015,'UV'],[.22,'VISIBLE'],[.68,'NEAR INFRARED']] as const)p.text(label,px(x),17);
        p.fill('#686d68');p.textAlign(p.RIGHT,p.TOP);p.text('nm',box.left+box.width,box.top+box.height+33);
      } else {
        const band = BANDS.find(b=>b.id===view)!;p.text(band.label.toUpperCase(),box.left,17);
        p.fill('#686d68');p.textAlign(p.RIGHT,p.CENTER);p.text(band.linear?'LINEAR WAVELENGTH':'LOG WAVELENGTH',box.left+box.width,17);
      }
      if((view==='optical'||view==='visible')&&curves.uv.some(v=>v>0)) {
        p.fill('#ad96c7');p.textAlign(p.LEFT,p.TOP);p.text('– – UV emission',box.left,box.top+box.height+33);
      }
    };
  },graph);
  syncControls();
  return {
    update(next) {if(disposed)return;curves = next;syncControls();},
    setViewport(next) {
      if(disposed)return;cancel();view = next;hover = null;
      if(next!=='optical')select(next,selected.band===next?selected.index:128);else if(!['uv','visible','infrared'].includes(selected.band))select('visible',106);
      syncControls();
    },
    setTool,
    cancelGesture:cancel,
    async dispose() {
      if(disposed)return;cancel();disposed = true;observer.disconnect();if(raf)cancelAnimationFrame(raf);
      listeners.forEach(({target,type,fn})=>target.removeEventListener(type,fn));sketch.remove();root.remove();
    },
  };
}
