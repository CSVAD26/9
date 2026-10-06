export type BandId = 'gamma'|'xray'|'uv'|'visible'|'infrared'|'microwave'|'radio';
export type Vec3 = readonly [number, number, number];
export type Curve = readonly number[]; // exactly 257, finite, 0..1
export type Curves = Readonly<Record<BandId, Curve>>;
export type CurvePoint = Readonly<{u:number; value:number}>;
export type BandStats = Readonly<{area:number; centroid:number; spread:number}>;
export type BrushStroke = Readonly<{mode:'add'|'erase'; radius:number; strength:number;
  points:readonly (readonly [number,number])[]}>;
export type Selection = Readonly<{kind:'whole'} | {kind:'color'; rgb:Vec3;
  tolerance:number; strokes:readonly BrushStroke[]}>;
export type Material = Readonly<{id:string; curves:Curves; baselineVisible:Curve;
  selection:Selection}>;
export type ImageRef = Readonly<{hash:string; name:string; width:number; height:number}>;
export type AudioSettings = Readonly<{mode:'radio'|'microwave'|'both'; volume:number}>;
export type PickerDocument = Readonly<{version:1; materials:readonly Material[];
  activeId:string; image:ImageRef|null; seed:number; frozenTime:number;
  audio:AudioSettings}>;
export type Snapshot = Readonly<{document:PickerDocument; revision:number}>;
export type Raster = Readonly<{width:number; height:number; rgba:Uint8ClampedArray}>;
export type DepthField = Readonly<{imageHash:string; modelHash:string; width:number;
  height:number; values:Float32Array}>; // 0 near .. 1 far
export type Appearance = Readonly<{visibleLinear:Vec3; emissionLinear:Vec3;
  bands:Readonly<Record<BandId,BandStats>>}>;
export type SceneLayer = Readonly<{materialId:string; mask:Float32Array;
  deltaOklab:Vec3; appearance:Appearance}>;
export type SceneFrame = Readonly<{revision:number; source:Raster;
  layers:readonly SceneLayer[]; depth?:DepthField;
  occlusionOverride?:Float32Array; seed:number; time:number}>;
export type RenderCapture = Readonly<{revision:number; pixels:Raster}>;
export type ScanFields = Readonly<{luminance:Float32Array; centroidY:Float32Array;
  edges:Float32Array}>; // each length 64
export type AudioProfile = Readonly<{q:Float32Array; area:number;
  centroid:number; width:number}>; // q length 64, long -> short wavelength
export type Sonification = Readonly<{mappingVersion:1; fields:ScanFields;
  radio:AudioProfile; microwave:AudioProfile; mode:AudioSettings['mode']}>;
export type StereoPCM = Readonly<{sampleRate:48000; left:Float32Array;
  right:Float32Array}>; // each length 384000
