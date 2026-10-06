import type { PickerDocument, Material, Curves, Curve, Snapshot, Selection, Vec3 } from './types';
import { BAND_IDS } from './bands';
import { assertCurve } from './curves';
export function createDocument():PickerDocument {
  const visible=Array.from({length:257},(_,i)=>.8*Math.exp(-.5*((380+i*400/256-545)/30)**2));
  const curves=Object.fromEntries(BAND_IDS.map(id=>[id,id==='visible'?visible:Array(257).fill(0)])) as unknown as Curves;
  return validateDocument({version:1,materials:[{id:'material-1',curves,baselineVisible:visible,selection:{kind:'whole'}}],activeId:'material-1',image:null,seed:236,frozenTime:0,audio:{mode:'radio',volume:.5}});
}
function record(value:unknown,keys:string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Invalid material document.');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Object.keys(descriptors).some(k=>!keys.includes(k)||!('value' in descriptors[k]))||keys.some(k=>!Object.hasOwn(descriptors,k)))throw Error('Unknown or missing material field.');
  return value as Record<string,unknown>;
}
function num(v:unknown,min:number,max:number,integer=false):number {
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isSafeInteger(v)))throw Error('Invalid material value.');return v;
}
function str(v:unknown,max=160):string {
  if(typeof v!=='string'||!v.length||v.length>max)throw Error('Invalid material text.');return v;
}
function curve(v:unknown):Curve { assertCurve(v as Curve);return Object.freeze((v as number[]).slice()); }
export function validateDocument(value:unknown):PickerDocument {
  const v=record(value,['version','materials','activeId','image','seed','frozenTime','audio']);
  if(v.version!==1)throw Error('Unsupported material version.');
  if(!Array.isArray(v.materials)||v.materials.length<1||v.materials.length>6)throw Error('Use one to six materials.');
  const ids=new Set<string>();let totalPoints=0;
  const materials=v.materials.map((input):Material=>{
    const m=record(input,['id','curves','baselineVisible','selection']);const id=str(m.id);
    if(ids.has(id))throw Error('Duplicate material.');ids.add(id);
    const c=record(m.curves,BAND_IDS);const curves=Object.fromEntries(BAND_IDS.map(b=>[b,curve(c[b])])) as unknown as Curves;
    let selection:Selection;
    if((m.selection as {kind?:unknown})?.kind==='whole'){record(m.selection,['kind']);selection={kind:'whole'};}
    else {
      const s=record(m.selection,['kind','rgb','tolerance','strokes']);
      if(s.kind!=='color'||!Array.isArray(s.rgb)||s.rgb.length!==3||!Array.isArray(s.strokes))throw Error('Invalid selection.');
      const rgb=s.rgb.map(c=>num(c,0,1)) as unknown as Vec3;
      const strokes=s.strokes.map(item=>{
        const b=record(item,['mode','radius','strength','points']);
        if(b.mode!=='add'&&b.mode!=='erase')throw Error('Invalid brush.');
        if(!Array.isArray(b.points)||b.points.length<1||b.points.length>1024)throw Error('A brush stroke allows 1–1024 points.');
        totalPoints+=b.points.length;
        const points=b.points.map(p=>{if(!Array.isArray(p)||p.length!==2)throw Error('Invalid brush point.');return Object.freeze([num(p[0],0,1),num(p[1],0,1)] as const);});
        return Object.freeze({mode:b.mode,radius:num(b.radius,.001,1),strength:num(b.strength,0,1),points:Object.freeze(points)});
      });
      selection={kind:'color',rgb:Object.freeze(rgb),tolerance:num(s.tolerance,.01,.4),strokes:Object.freeze(strokes)};
    }
    return Object.freeze({id,curves:Object.freeze(curves),baselineVisible:curve(m.baselineVisible),selection:Object.freeze(selection)});
  });
  if(totalPoints>8192)throw Error('This material file has too many brush points.');
  const activeId=str(v.activeId);if(!ids.has(activeId))throw Error('Active material is missing.');
  let image:PickerDocument['image']=null;
  if(v.image!==null){const i=record(v.image,['hash','name','width','height']);const hash=str(i.hash,64);if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid image hash.');const width=num(i.width,1,24000000,true),height=num(i.height,1,24000000,true);if(width*height>24000000)throw Error('Image is too large.');image=Object.freeze({hash,name:str(i.name,512),width,height});}
  const a=record(v.audio,['mode','volume']);if(!['radio','microwave','both'].includes(a.mode as string))throw Error('Invalid sound mode.');
  return Object.freeze({version:1,materials:Object.freeze(materials),activeId,image,seed:num(v.seed,0,0xffffffff,true),frozenTime:num(v.frozenTime,0,1e9),audio:Object.freeze({mode:a.mode as PickerDocument['audio']['mode'],volume:num(a.volume,0,1)})});
}
export function createHistory(initial:PickerDocument) {
  let current:Snapshot={document:validateDocument(initial),revision:0};
  let past:PickerDocument[]=[],future:PickerDocument[]=[],before:PickerDocument|null=null;
  const listeners=new Set<(s:Snapshot)=>void>();
  const publish=(document:PickerDocument)=>{current={document,revision:current.revision+1};listeners.forEach(fn=>fn(current));};
  const commit=()=>{if(before&&JSON.stringify(before)!==JSON.stringify(current.document)){past.push(before);if(past.length>100)past.shift();future=[];}before=null;listeners.forEach(fn=>fn(current));};
  return {
    get snapshot(){return current;},get canUndo(){return past.length>0;},get canRedo(){return future.length>0;},
    begin(){if(!before)before=current.document;},
    preview(next:PickerDocument){const validated=validateDocument(next);if(!before)before=current.document;publish(validated);},
    commit,
    cancel(){if(before){const old=before;before=null;publish(old);}},
    replace(next:PickerDocument){const validated=validateDocument(next);before=null;past=[];future=[];publish(validated);},
    undo(){commit();if(past.length){future.push(current.document);publish(past.pop()!);}},
    redo(){commit();if(future.length){past.push(current.document);publish(future.pop()!);}},
    subscribe(fn:(s:Snapshot)=>void){listeners.add(fn);fn(current);return ()=>{listeners.delete(fn);};},
  };
}
export type History=ReturnType<typeof createHistory>;
