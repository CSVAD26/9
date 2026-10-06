/** Admitted bytes traced to PINTO #146 and dwofk/fast-depth; local assets only. */
export const DEPTH_MANIFEST=Object.freeze({
  id:'fastdepth-320x256',file:'models/depth/fastdepth-320x256.onnx',
  sha256:'dfc532a08f0ee34283d890d845e3824973f17240ad1d7eb617d9959ec8dc23c9',bytes:5_420_454,
  runtime:{name:'onnxruntime-web',version:'1.27.0',directory:'models/depth/runtime/'},
  input:{name:'input.1',shape:[1,3,256,320],layout:'NCHW',type:'float32',normalization:'rgb/255'},
  output:{name:'424',shape:[1,1,256,320],type:'float32',semantics:'metric-depth-metres'},
  preprocessing:'EXIF applied by source decoder once; bilinear contain resize to 320×256; padding and alpha composite sRGB 0.5; rgb/255; no ImageNet normalization',
  remapping:'Remove padding at original source coordinates; bilinear depth resample; 2nd/98th percentile normalization; 0 near, 1 far; constant 0.5',
  license:'MIT',copyright:'Copyright (c) 2019 Diana Wofk',
  upstream:{weights:'https://github.com/dwofk/fast-depth/tree/e68492011609c9bfb7de6d402da5d1d201d95bd9',
    export:'https://github.com/PINTO0309/PINTO_model_zoo/tree/c6abe1a21c95771462c72bbfa700e837fa13cf73/146_FastDepth',
    archive:'https://s3.ap-northeast-2.wasabisys.com/pinto-model-zoo/146_FastDepth/resources.tar.gz',
    archiveSha256:'f708a5bf9e405cacce565081a811a9edf5cd4bcde1f5cb0e7ab097662a97ef13',
    archiveMember:'saved_model_256x320/fast_depth_256x320.onnx',
    acquiredFrom:'https://vgpu.sh/models/depth/fastdepth-320x256.onnx',
    audit:'https://github.com/vercel-labs/vgpu/blob/91b66a6f6d7b9e0e92933a3122ade651b5e456a1/tools/models/depth-candidates/CANDIDATES.md'},
});
