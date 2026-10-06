import type { AudioProfile, AudioSettings, Curve, Curves, ScanFields, Sonification } from '../types';
export function audioProfile(curve:Curve):AudioProfile {
 if(curve.length!==257||curve.some(x=>!Number.isFinite(x)||x<0||x>1))throw new Error('Invalid audio curve');
 const q=new Float32Array(64);let sum=0,moment=0;
 for(let i=0;i<64;i++){
  const u=(1-i/63)*256,a=Math.floor(u),b=Math.min(256,a+1);
  q[i]=curve[a]+(curve[b]-curve[a])*(u-a);sum+=q[i];moment+=q[i]*i/63;
 }
 if(sum===0)return {q,area:0,centroid:.5,width:0};
 const centroid=moment/sum;let variance=0;
 for(let i=0;i<64;i++)variance+=q[i]*(i/63-centroid)**2;
 return {q,area:sum/64,centroid,width:Math.min(1,2*Math.sqrt(variance/sum))};
}
export function compileSonification(fields:ScanFields,curves:Curves,mode:AudioSettings['mode']):Sonification {
 return {mappingVersion:1,fields,radio:audioProfile(curves.radio),microwave:audioProfile(curves.microwave),mode};
}
