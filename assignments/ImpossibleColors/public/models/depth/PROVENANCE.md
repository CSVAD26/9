# FastDepth 320 × 256

The local model is 5,420,454 bytes with SHA-256
`dfc532a08f0ee34283d890d845e3824973f17240ad1d7eb617d9959ec8dc23c9`.
Downloaded on 2026-10-06 from the official vgpu example's
https://vgpu.sh/models/depth/fastdepth-320x256.onnx and independently hashed.

The official vgpu audit at immutable commit
`91b66a6f6d7b9e0e92933a3122ade651b5e456a1`,
[CANDIDATES.md](https://github.com/vercel-labs/vgpu/blob/91b66a6f6d7b9e0e92933a3122ade651b5e456a1/tools/models/depth-candidates/CANDIDATES.md),
identifies these bytes as archive member
`saved_model_256x320/fast_depth_256x320.onnx` in PINTO Model Zoo #146's
`resources.tar.gz`, SHA-256
`f708a5bf9e405cacce565081a811a9edf5cd4bcde1f5cb0e7ab097662a97ef13`.
The archive was not downloaded for this application; the small official mirror
was checked against the published member digest instead.

The [PINTO directory at its recorded commit](https://github.com/PINTO0309/PINTO_model_zoo/tree/c6abe1a21c95771462c72bbfa700e837fa13cf73/146_FastDepth)
restates the MIT license, Copyright (c) 2019 Diana Wofk. Its source is the
final pruned MobileNet-NNConv5 depthwise skip-add checkpoint from
[dwofk/fast-depth](https://github.com/dwofk/fast-depth/tree/e68492011609c9bfb7de6d402da5d1d201d95bd9),
trained on NYU Depth V2. The applicable MIT notice is in `LICENSE`.
The exact PyTorch export invocation and onnxsim version are not published;
the redistributed bytes are reproducible by digest, not by a recorded export command.

The graph contract recorded by the official example is float32 NCHW
`input.1` of shape `[1,3,256,320]` and float32 `424` output of shape
`[1,1,256,320]`. Input is sRGB bytes divided by 255 with no ImageNet
normalization. Output is metric visible-surface depth, larger values farther
away, not inverse depth. The application validates output shape and model digest.

This application keeps the entire image using a bilinear aspect-preserving
contain resize and neutral sRGB 0.5 padding rather than the gallery's center crop.
Transparency is composited against the same neutral background. EXIF orientation
has already been applied by image import. The output is remapped through that
rectangle to source preview coordinates and normalized at its 2nd and 98th
percentiles to 0 near, 1 far. Constant depth maps become 0.5.

The model estimates visible-surface depth from an indoor training domain;
it does not reveal hidden objects or measured internal anatomy.

ONNX Runtime Web is pinned to 1.27.0, the version used by the official example.
Its local asyncify runtime assets and their hashes are in `runtime/manifest.json`;
the ONNX Runtime MIT notice is in `runtime/LICENSE`. All application inference
is local, with no source image upload or remote model inference.
