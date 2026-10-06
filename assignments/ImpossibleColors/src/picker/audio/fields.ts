import type { Raster, ScanFields } from '../types';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const linear=(x:number)=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;

/** Integrate 64 equal-area columns of the original pixels, including fractional pixels. */
export function extractScanFields(source:Raster,mask:Float32Array):ScanFields {
 const {width,height,rgba}=source;
 if(width<1||height<1||rgba.length!==width*height*4||mask.length!==width*height) throw new Error('Invalid audio source raster or mask');
 const luma=new Float32Array(width*height), edges=new Float32Array(width*height);
 for(let i=0;i<luma.length;i++) luma[i]=.2126*linear(rgba[i*4]/255)+.7152*linear(rgba[i*4+1]/255)+.0722*linear(rgba[i*4+2]/255);
 // Transparent neighbors contribute no hidden RGB to the edge field.
 const at=(x:number,y:number)=>{const i=Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x));return luma[i]*rgba[i*4+3]/255;};
 for(let y=0;y<height;y++) for(let x=0;x<width;x++){
  const gx=-at(x-1,y-1)+at(x+1,y-1)-2*at(x-1,y)+2*at(x+1,y)-at(x-1,y+1)+at(x+1,y+1);
  const gy=-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1)+at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1);
  edges[y*width+x]=clamp(Math.hypot(gx,gy)/(4*Math.SQRT2));
 }
 const luminance=new Float32Array(64),centroidY=new Float32Array(64).fill(.5),outEdges=new Float32Array(64);
 const columnArea=width*height/64;
 for(let c=0;c<64;c++){
  const start=c*width/64,end=(c+1)*width/64;let light=0,weightedY=0,edge=0;
  for(let x=Math.floor(start);x<Math.ceil(end);x++){
   const overlap=Math.max(0,Math.min(end,x+1)-Math.max(start,x));
   for(let y=0;y<height;y++){
    const i=y*width+x,weight=overlap*rgba[i*4+3]/255*clamp(mask[i]),amount=luma[i]*weight;
    light+=amount;weightedY+=amount*(y+.5)/height;edge+=edges[i]*weight;
   }
  }
  luminance[c]=light/columnArea;outEdges[c]=edge/columnArea;
  if(light>0)centroidY[c]=weightedY/light;
 }
 return {luminance,centroidY,edges:outEdges};
}

export function sampleScanField(field:Float32Array,scan:number):number {
 const u=clamp(scan)*(field.length-1),a=Math.floor(u),b=Math.min(a+1,field.length-1);
 return field[a]+(field[b]-field[a])*(u-a);
}
