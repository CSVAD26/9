import { encodeSrgb } from '../color/srgb';
import { linearRgbToOklab } from '../color/oklab';
import { deriveAppearance } from './appearance';
import { selectionMask } from './selection';
import type { DepthField, Raster, SceneFrame, Snapshot, Vec3 } from './types';

/** Central neutral surface uses this known source reference for absolute coloring. */
export const STARTER_NEUTRAL_LINEAR:Vec3=[.5,.5,.5];
const STARTER_IMAGE_HASH='authored-starter-scene-v1';
const STARTER_DEPTH_HASH='authored-starter-depth-v1';
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
/** One-pixel analytic coverage keeps hard geometry smooth at preview resolution. */
function rectangleCoverage(x:number,y:number,left:number,top:number,right:number,bottom:number,radius=2):number {
  const dx=Math.abs(x-(left+right)/2)-(right-left)/2+radius;
  const dy=Math.abs(y-(top+bottom)/2)-(bottom-top)/2+radius;
  const distance=Math.hypot(Math.max(0,dx),Math.max(0,dy))+Math.min(Math.max(dx,dy),0)-radius;
  return clamp(.5-distance);
}
export function createStarterScene():{pixels:Raster;occlusion:Float32Array;materialMask:Float32Array;knownDepth:DepthField} {
  const width=512,height=384,rgba=new Uint8ClampedArray(width*height*4),occlusion=new Float32Array(width*height);
  const materialMask=new Float32Array(width*height),values=new Float32Array(width*height);
  const cx=208.5,cy=176.5,radius=100;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*width+x,px=x+.5,py=y+.5,dx=(px-cx)/radius,dy=(py-cy)/radius,r2=dx*dx+dy*dy;
    const floor=clamp((py-247)/137),wallGlow=.006*Math.exp(-(((px-220)/210)**2+((py-155)/170)**2));
    const vignette=1-.2*((px-width/2)/(width/2))**2;
    let shade=(py<247?.013+wallGlow:.020+.010*floor)*vignette;
    if(py>=247) {
      const sphereShadow=Math.exp(-(((px-228)/100)**2+((py-284)/18)**2));
      const blockerShadow=Math.exp(-(((px-370)/23)**2+((py-291)/7)**2));
      const receiverShadow=Math.exp(-(((px-420)/34)**2+((py-291)/8)**2));
      shade*=1-.65*sphereShadow-.25*blockerShadow-.22*receiverShadow;
    }
    let rgb:Vec3=[shade*.90,shade*.98,shade*1.10];
    let distance=py<247?.94:.82-.28*floor;
    const coverage=clamp(radius+.5-Math.hypot(px-cx,py-cy));materialMask[i]=coverage;
    if(coverage>0) {
      const nz=Math.sqrt(Math.max(0,1-r2));
      const diffuse=Math.max(0,-.42*dx-.48*dy+.77*nz);
      const highlight=.035*Math.max(0,-.22*dx-.25*dy+.943*nz)**44;
      const texture=.002*Math.sin((px-cx)*.23)*Math.sin((py-cy)*.19);
      const surface=dx===0&&dy===0?.5:Math.max(.09,Math.min(.72,.5*(.42+.58*diffuse)/(.42+.58*.77)+highlight+texture));
      rgb=rgb.map(value=>value+(surface-value)*coverage) as unknown as Vec3;
      distance+=(.44-.24*nz-distance)*coverage;
    }
    // Receivers are unchanged neutral geometry, separate from the editable sphere.
    for(const receiver of [{left:31,top:237,right:65,bottom:282,depth:.54},{left:403,top:218,right:439,bottom:285,depth:.61}]) {
      const cover=rectangleCoverage(px,py,receiver.left,receiver.top,receiver.right,receiver.bottom,3);
      if(cover>0) {
        const face=.075+.020*(1-(py-receiver.top)/(receiver.bottom-receiver.top));
        const bevel=px<receiver.left+3||py<receiver.top+3?.016:0;
        rgb=rgb.map(value=>value+(face+bevel-value)*cover) as unknown as Vec3;
        distance+=(receiver.depth-distance)*cover;
      }
    }
    const blocker=rectangleCoverage(px,py,347,119,365,286,2);occlusion[i]=blocker;
    if(blocker>0) {
      const face=.092+.016*(1-(py-119)/167)+(px<350?.025:0);
      rgb=rgb.map(value=>value+(face-value)*blocker) as unknown as Vec3;
      distance+=(.36-distance)*blocker;
    }
    values[i]=clamp(distance);
    const display=encodeSrgb(rgb);rgba.set([Math.round(display[0]*255),Math.round(display[1]*255),Math.round(display[2]*255),255],4*i);
  }
  return {pixels:{width,height,rgba},occlusion,materialMask,knownDepth:{imageHash:STARTER_IMAGE_HASH,modelHash:STARTER_DEPTH_HASH,width,height,values}};
}
/** All assignments derive from original pixels; masks carry resolved priority weights. */
export function buildScene(snapshot:Snapshot,source:Raster,depth?:DepthField,occlusionOverride?:Float32Array,materialFootprint?:Float32Array):SceneFrame {
  const {document,revision}=snapshot;
  const masks=document.materials.map(material=>selectionMask(source,material.selection));
  const uncovered=new Float32Array(source.width*source.height).fill(1);
  for(let j=masks.length-1;j>=0;j--)for(let i=0;i<uncovered.length;i++) {
    const raw=masks[j][i];masks[j][i]=raw*uncovered[i];uncovered[i]*=1-raw;
  }
  if(materialFootprint) {
    if(materialFootprint.length!==uncovered.length||!materialFootprint.every(value=>Number.isFinite(value)&&value>=0&&value<=1))throw Error('Material footprint must match source dimensions and contain finite weights in [0,1].');
    for(const mask of masks)for(let i=0;i<mask.length;i++)mask[i]*=materialFootprint[i];
  }
  const layers=document.materials.map((material,index)=>{
    const appearance=deriveAppearance(material.curves);
    const baseline=document.image?deriveAppearance({...material.curves,visible:material.baselineVisible}).visibleLinear:STARTER_NEUTRAL_LINEAR;
    const from=linearRgbToOklab(baseline),to=linearRgbToOklab(appearance.visibleLinear);
    return {materialId:material.id,mask:masks[index],deltaOklab:to.map((v,i)=>v-from[i]) as unknown as Vec3,appearance};
  });
  const matchesDepth=depth&&(document.image?depth.imageHash===document.image.hash:depth.imageHash===STARTER_IMAGE_HASH&&depth.modelHash===STARTER_DEPTH_HASH);
  const validDepth=depth&&matchesDepth&&depth.width===source.width&&depth.height===source.height&&depth.values.length===source.width*source.height?depth:undefined;
  if(occlusionOverride&&occlusionOverride.length!==source.width*source.height)throw Error('Occlusion size does not match source');
  return {revision,source,layers,depth:validDepth,occlusionOverride,seed:document.seed,time:document.frozenTime};
}
