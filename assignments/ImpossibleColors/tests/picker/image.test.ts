import { afterEach, expect, it, vi } from 'vitest';
import { loadSource, meanSourceLinear } from '../../src/picker/image';
import { inspectImageHeader } from '../../src/io/images';
afterEach(()=>vi.unstubAllGlobals());
function png(width:number,height:number):Uint8Array {
  const bytes=new Uint8Array(45),v=new DataView(bytes.buffer);
  bytes.set([137,80,78,71,13,10,26,10]);v.setUint32(8,13);bytes.set([73,72,68,82],12);
  v.setUint32(16,width);v.setUint32(20,height);bytes[24]=8;bytes[25]=6;bytes.set([73,69,78,68],37);return bytes;
}
function sourceFile(bytes:Uint8Array):File {return {name:'test.png',size:bytes.length,arrayBuffer:async()=>bytes.buffer} as File;}
it('enforces declared byte and pixel limits before native decoding',async()=>{
  await expect(loadSource({name:'huge.png',size:20_000_001} as File,new AbortController().signal)).rejects.toThrow('20 MB');
  expect(()=>inspectImageHeader(png(6000,4001))).toThrow('24 megapixel');
  expect(()=>inspectImageHeader(new Uint8Array([1,2,3]))).toThrow('Unsupported');
});
it('records EXIF orientation for a rotated PNG before decoding',()=>{
  const bytes=new Uint8Array(83),v=new DataView(bytes.buffer);bytes.set(png(4,2).subarray(0,33));
  v.setUint32(33,26);bytes.set([101,88,73,102],37);
  bytes.set([73,73,42,0,8,0,0,0,1,0],41);
  v.setUint16(51,0x112,true);v.setUint16(53,3,true);v.setUint32(55,1,true);v.setUint16(59,6,true);
  bytes.set([73,69,78,68],75);
  expect(inspectImageHeader(bytes)).toEqual({format:'png',width:4,height:2,orientation:6});
});
it('bounds the local preview to 512 pixels and owns bitmap disposal',async()=>{
  let closed=0;
  vi.stubGlobal('createImageBitmap',async(_blob:Blob,options:ImageBitmapOptions)=>{
    expect(options.imageOrientation).toBe('from-image');expect(options.resizeWidth).toBe(512);expect(options.resizeHeight).toBe(256);
    return {width:512,height:256,close(){closed++;}};
  });
  vi.stubGlobal('OffscreenCanvas',class {
    constructor(public width:number,public height:number){}
    getContext(){return {drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(this.width*this.height*4)})};}
    transferToImageBitmap(){return {width:this.width,height:this.height,close(){closed++;}};}
  });
  const source=await loadSource(sourceFile(png(1024,512)),new AbortController().signal);
  expect(source.pixels.width).toBe(512);expect(source.pixels.height).toBe(256);
  expect(source.ref.width).toBe(1024);expect(source.ref.height).toBe(512);expect(source.ref.hash).toHaveLength(64);
  source.dispose();source.dispose();expect(closed).toBe(2);
});
it('closes a stale decoded bitmap when its source is replaced during decoding',async()=>{
  const abort=new AbortController();let closed=0;
  vi.stubGlobal('createImageBitmap',async()=>{abort.abort();return {width:1,height:1,close(){closed++;}};});
  vi.stubGlobal('OffscreenCanvas',class {
    width=1;height=1;getContext(){return {drawImage(){}};}
    transferToImageBitmap(){return {width:1,height:1,close(){closed++;}};}
  });
  await expect(loadSource(sourceFile(png(1,1)),abort.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(closed).toBe(2);
});
it('seeds color from alpha weighted linear RGB and ignores fully hidden colors',()=>{
  expect(meanSourceLinear({width:2,height:1,rgba:new Uint8ClampedArray([255,0,0,128,0,255,0,0])})).toEqual([1,0,0]);
  expect(meanSourceLinear({width:1,height:1,rgba:new Uint8ClampedArray([255,255,255,0])})).toEqual([0,0,0]);
});
