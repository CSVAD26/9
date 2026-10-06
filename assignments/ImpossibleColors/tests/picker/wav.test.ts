import {it,expect} from 'vitest';
import {encodeWav} from '../../src/picker/audio/wav';
it('encodes one deterministic 8 second stereo 48kHz 16-bit scan at current volume',()=>{
 const left=new Float32Array(384000),right=new Float32Array(384000);left[0]=.5;right[0]=-.5;
 const pcm={sampleRate:48000 as const,left,right},a=encodeWav(pcm,.5),b=encodeWav(pcm,.5);
 expect(a.length).toBe(1536044);expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
 const view=new DataView(a.buffer);expect(new TextDecoder().decode(a.slice(0,4))).toBe('RIFF');
 expect(view.getUint32(24,true)).toBe(48000);expect(view.getUint16(22,true)).toBe(2);expect(view.getUint16(34,true)).toBe(16);
 expect(view.getInt16(44,true)).toBe(8192);expect(view.getInt16(46,true)).toBe(-8192);
});
it('rejects invalid PCM rather than writing malformed or nonfinite sound',()=>{
 expect(()=>encodeWav({sampleRate:48000,left:new Float32Array(1),right:new Float32Array(1)},.5)).toThrow();
 const left=new Float32Array(384000);left[0]=NaN;
 expect(()=>encodeWav({sampleRate:48000,left,right:new Float32Array(384000)},.5)).toThrow();
});
