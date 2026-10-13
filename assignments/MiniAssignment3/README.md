# Mini Assignment 3 · Live Engraving

[Assignment brief](https://csvad26.github.io/course_site/assignments/mini-assignment-3) · [Course examples](https://github.com/CSVAD26/code_samples/tree/main/layoutp5)

A live webcam engraving made with p5.js 1.10.0, ml5.js 1.4.0, and D3 7.9.0. [Open the artwork](https://csvad26.github.io/9/assignments/MiniAssignment3/).

## Use

Press **Start camera** and allow webcam access. Adjust stroke density, length, line weight, direction smoothing, and temporal smoothing. The checkboxes enable extra face detail, colored ink, mirroring, and the original camera view. **Pause artwork** freezes processing while keeping the camera on; **Stop camera** releases it. **Save PNG** downloads the displayed canvas.

Use HTTPS or localhost for camera access. The external libraries and pretrained FaceMesh model require an internet connection. Engraving continues if the face model is unavailable.

## Method and credits

The sketch samples a frame at 96 × 72 pixels and computes average RGB brightness, Sobel gradients, and a smoothed structure tensor. Short curved paths follow the edge-tangent field; dark areas and image edges receive more strokes. D3 supplies blur and polygon helpers. ml5's pretrained FaceMesh supplies a face hull for optional additional detail. Stable random seeds and temporal smoothing reduce flicker, and processing is divided into short batches.

The original engraving helpers and their library references are documented inline in `sketch.js`. The input is the viewer's webcam. Brightness is an RGB average, not physical luminance; frames update after each processing cycle rather than at the camera's full frame rate.
