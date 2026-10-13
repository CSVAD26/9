/*
LIVE EDGE-DIRECTED ENGRAVING — p5.js + ml5.js + D3
Keep the editor's default HTML/CSS; add the two imports supplied separately.

Per-line references:
[P:name] https://p5js.org/reference/p5/name/
[E:name] https://p5js.org/reference/p5.Element/name/
[G]      https://p5js.org/reference/p5/p5.Graphics/
[M]      https://docs.ml5js.org/#/reference/facemesh
[MA]     https://ml5js.org/blog/using-ml5-with-p5-2/
[DB]     https://d3js.org/d3-array/blur#blur2
[DH]     https://d3js.org/d3-polygon#polygonHull
[DC]     https://d3js.org/d3-polygon#polygonContains
[J]      https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide
[A]      Original helper/algorithm defined in this file, not a library API.

Analysis and rendering run in short batches. No loop protection is disabled.
Brightness is an RGB average, not physical luminance. FaceMesh is pretrained.
*/

const EW = 640, EH = 480, SW = 96, SH = 72, NN = SW * SH; // [J]
let cam, smallFrame, cameraFrame, modelFrame, draftInk, finishedInk; // [J]
let controls = {}, statusLine, modelLine, pauseButton; // [J]
let detector = null, loadingModel = false, detecting = false; // [J]
let faceHull = null, hullStamp = 0, lastDetect = -9999, cameraSession = 0; // [J]
let stage = 0, analysisIndex = 0, paused = false, historyReady = false, completed = false; // [J]
let rgba, tone, smoothed, txx, tyy, txy, flowX, flowY, edgePower; // [J]
let settings = {}, seedIndex = 0, drawnCount = 0, cycleHull = null; // [J]
let lastStatus = ''; // [J]

function setup() { // [P:setup]
  pixelDensity(1); frameRate(60); // [P:pixelDensity, P:frameRate]
  createCanvas(EW, EH).parent('sketch'); // [P:createCanvas, E:parent]

  smallFrame = makeBuffer(SW, SH); // [A]
  cameraFrame = makeBuffer(EW, EH); // [A]
  modelFrame = makeBuffer(320, 240); // [A]
  draftInk = makeBuffer(EW, EH); // [A]
  finishedInk = makeBuffer(EW, EH); // [A]

  finishedInk.background(246, 242, 231); // [G, P:background]
  tone = new Float32Array(NN); // [J]

  const buttons = createDiv().parent('engraving-controls').class('camera-buttons'); // [P:createDiv, E:parent, E:class]

  createButton('Start camera')
    .parent(buttons)
    .mousePressed(startCamera); // [P:createButton, E:parent, E:mousePressed]

  createButton('Stop camera')
    .parent(buttons)
    .mousePressed(stopCamera); // [P:createButton, E:parent, E:mousePressed]

  pauseButton = createButton('Pause artwork').parent(buttons); // [P:createButton, E:parent]

  pauseButton.mousePressed(() => { // [E:mousePressed]
    paused = !paused; // [J]
    pauseButton.html(paused ? 'Resume artwork' : 'Pause artwork'); // [E:html]
  }); // [J]

  createButton('Save PNG')
    .parent(buttons)
    .mousePressed(() => saveCanvas('engraving', 'png')); // [P:createButton, E:parent, E:mousePressed, P:saveCanvas]

  controls.density = addSlider('Stroke density', 200, 1600, 800, 100); // [A]
  controls.length = addSlider('Stroke length', 3, 18, 10, 1); // [A]
  controls.weight = addSlider('Line weight', 0.4, 1.8, 0.8, 0.1); // [A]
  controls.smooth = addSlider('Direction smoothing', 0.5, 3, 1.2, 0.1); // [A]
  controls.memory = addSlider('Temporal smoothing', 0, 0.8, 0.35, 0.05); // [A]

  const options = createDiv().parent('engraving-controls').class('engraving-options'); // [P:createDiv, E:parent, E:class]
  controls.face = createCheckbox('Extra detail around faces', true).parent(options); // [P:createCheckbox, E:parent]
  controls.color = createCheckbox('Use webcam colors as ink', false).parent(options); // [P:createCheckbox, E:parent]
  controls.mirror = createCheckbox('Mirror display', true).parent(options); // [P:createCheckbox, E:parent]
  controls.original = createCheckbox('Show original webcam', false).parent(options); // [P:createCheckbox, E:parent]

  const status = createDiv().parent('engraving-controls').class('engraving-status'); // [P:createDiv, E:parent, E:class]
  statusLine = createP('Press Start camera and allow camera access.').parent(status).id('artwork-status'); // [P:createP, E:parent, E:id]
  modelLine = createP('FaceMesh has not loaded yet.').parent(status).id('model-status'); // [P:createP, E:parent, E:id]

  describe('Webcam engraving with curved strokes guided by image edges.'); // [P:describe]

  if (typeof d3 === 'undefined' || typeof ml5 === 'undefined') { // [J]
    say('Missing imports: add the ml5 and D3 script tags to index.html.'); // [A]
    noLoop(); // [P:noLoop]
  } // [J]
} // [J]

// ------------------------------------------------------------
// Interface helpers
// ------------------------------------------------------------

function makeBuffer(w, h) { // [A]
  const graphic = createGraphics(w, h); // [P:createGraphics]
  graphic.pixelDensity(1); // [P:pixelDensity]
  return graphic; // [J]
} // [J]

function addSlider(label, low, high, initial, step) { // [A]
  const row = createDiv().parent('engraving-controls').class('control-row'); // [P:createDiv, E:parent, E:class]
  const labelId = 'control-' + label.toLowerCase().replaceAll(' ', '-'); // [J]
  const labelElement = createSpan(label + ': ' + initial).parent(row).class('control-label').id(labelId); // [P:createSpan, E:parent, E:class, E:id]
  const sliderElement = createSlider(low, high, initial, step).parent(row); // [P:createSlider, E:parent]
  sliderElement.attribute('aria-labelledby', labelId); // [E:attribute]

  sliderElement.input(() => { // [E:input]
    labelElement.html(label + ': ' + sliderElement.value() + ' '); // [E:html, E:value]
  }); // [J]

  return sliderElement; // [J]
} // [J]

function say(message) { // [A]
  if (message !== lastStatus) { // [J]
    statusLine.html(message); // [E:html]
    lastStatus = message; // [J]
  } // [J]
} // [J]

// ------------------------------------------------------------
// Camera
// ------------------------------------------------------------

function startCamera() { // [A]
  if (cam || typeof d3 === 'undefined' || typeof ml5 === 'undefined') return; // [J]

  cameraSession++; // [J]
  stage = 0; paused = false; historyReady = false; faceHull = null; // [J]
  pauseButton.html('Pause artwork'); // [E:html]

  try { // [J]
    // One argument avoids the callback-overload mismatch.
    cam = createCapture(VIDEO); // [P:createCapture]
    const video = cam.elt, token = cameraSession; // [E:elt, J]
    video.addEventListener('loadedmetadata', () => { // [J]
      // Stop a stream granted after this camera session was already stopped.
      if (token !== cameraSession && video.srcObject) { // [J]
        for (const track of video.srcObject.getTracks()) track.stop(); // [J]
      } // [J]
    }, { once: true }); // [J]
    cam.size(320, 240); // [E:size]
    cam.hide(); // [E:hide]

    say('Waiting for webcam frames. Allow camera access in your browser.'); // [A]
    loadFaceModel(); // [A]
  } catch (error) { // [J]
    if (cam) cam.remove(); // [E:remove]
    cam = null; // [J]
    say('Camera could not start: ' + error.message); // [A]
  } // [J]
} // [J]

function stopCamera() { // [A]
  cameraSession++; // [J]
  stage = 0; faceHull = null; cycleHull = null; // [J]

  if (cam) cam.remove(); // [E:remove]
  cam = null; // [J]

  say('Camera stopped.'); // [A]
} // [J]

// ------------------------------------------------------------
// Pretrained FaceMesh
// Callback loading handles the p5 1.x model form.
// Promise loading handles the p5 2.x model form.
// ------------------------------------------------------------

function loadFaceModel() { // [A]
  if (detector || loadingModel) return; // [J]

  loadingModel = true; // [J]
  modelLine.html('Loading FaceMesh; pixel engraving runs independently.'); // [E:html]

  try { // [J]
    const result = ml5.faceMesh(
      { maxFaces: 1, refineLandmarks: false },
      faceModelReady
    ); // [M, MA]

    if (result && typeof result.then === 'function') { // [J]
      result.then(faceModelReady).catch(faceModelFailed); // [J]
    } // [J]
  } catch (error) { // [J]
    faceModelFailed(error); // [A]
  } // [J]
} // [J]

function faceModelReady(loadedModel, error) { // [A]
  if (error) { faceModelFailed(error); return; } // [A]
  if (!loadedModel || typeof loadedModel.detect !== 'function') return; // [J]

  detector = loadedModel; // [J]
  loadingModel = false; // [J]
  modelLine.html('FaceMesh ready.'); // [E:html]
} // [J]

function faceModelFailed(error) { // [A]
  loadingModel = false; detector = null; faceHull = null; // [J]
  modelLine.html('FaceMesh unavailable; pixel engraving remains active. Stop/Start to retry.'); // [E:html]
} // [J]

async function updateFace() { // [A]
  if (!detector || detecting || millis() - lastDetect < 400 || !controls.face.checked()) return; // [P:millis, P:createCheckbox]

  detecting = true; // [J]
  lastDetect = millis(); // [P:millis]
  const token = cameraSession; // [J]

  try { // [J]
    modelFrame.image(cameraFrame, 0, 0, 320, 240); // [G, P:image]

    const results = await detector.detect(modelFrame.get()); // [M, P:get]

    // Ignore results belonging to a camera session that was stopped.
    if (token !== cameraSession || !cam) return; // [J]

    const points = []; // [J]

    if (results.length) { // [J]
      for (const keypoint of results[0].keypoints) { // [M]
        if (Number.isFinite(keypoint.x) && Number.isFinite(keypoint.y)) { // [J]
          points.push([keypoint.x * SW / 320, keypoint.y * SH / 240]); // [J]
        } // [J]
      } // [J]
    } // [J]

    faceHull = points.length >= 3 ? d3.polygonHull(points) : null; // [DH]
    hullStamp = millis(); // [P:millis]

    modelLine.html(faceHull ? 'Face detected.' : 'FaceMesh ready; no face detected.'); // [E:html]
  } catch (error) { // [J]
    if (token === cameraSession) faceModelFailed(error); // [A]
  } finally { // [J]
    detecting = false; // [J]
  } // [J]
} // [J]

// ------------------------------------------------------------
// Main animation loop
// Each draw call does only one small processing batch.
// ------------------------------------------------------------

function draw() { // [P:draw]
  if (cam && !paused) { // [J]
    if (stage === 0) beginFrame(); // [A]
    else if (stage <= 3) analyzeBatch(); // [A]
    else drawBatch(); // [A]
  } // [J]

  background(246, 242, 231); // [P:background]
  push(); // [P:push]

  if (controls.mirror.checked()) { // [P:createCheckbox]
    translate(EW, 0); scale(-1, 1); // [P:translate, P:scale]
  } // [J]

  image(controls.original.checked() && cam ? cameraFrame : finishedInk, 0, 0); // [P:createCheckbox, P:image]

  pop(); // [P:pop]

  if (!completed) { // [J]
    push(); // [P:push]
    noStroke(); fill(75, 70, 60); // [P:noStroke, P:fill]
    textAlign(CENTER, CENTER); textSize(26); // [P:textAlign, P:textSize]
    text('Your camera, drawn in lines.', EW / 2, EH / 2 - 18); // [P:text]
    textSize(16); // [P:textSize]
    text(cam ? 'Preparing your first engraving…' : 'Press Start camera to begin.', EW / 2, EH / 2 + 20); // [P:text]
    pop(); // [P:pop]
  } // [J]

  if (cam && paused) { // [J]
    say('Artwork paused. CAMERA IS STILL ON. Use Stop camera to release it.'); // [A]
  } // [J]
} // [J]

function controlNumber(control, fallback) { // [A]
  const value = +control.value(); // [E:value]
  return Number.isFinite(value) ? value : fallback; // [J]
} // [J]

// ------------------------------------------------------------
// Capture one complete frame before processing it.
// ------------------------------------------------------------

function beginFrame() { // [A]
  cam.loadPixels(); // [P:loadPixels]

  // Wait until the camera actually supplies pixel data.
  if (!cam.pixels || cam.pixels.length < 4) return; // [P:pixels]

  cameraFrame.image(cam, 0, 0, EW, EH); // [G, P:image]
  smallFrame.image(cameraFrame, 0, 0, SW, SH); // [G, P:image]
  smallFrame.loadPixels(); // [G, P:loadPixels]

  if (smallFrame.pixels.length !== NN * 4) { // [P:pixels]
    say('Waiting for a complete pixel buffer.'); // [A]
    return; // [J]
  } // [J]

  // Copy the data so it stays unchanged while batches are processed.
  // No local variable is named "pixels".
  rgba = new Uint8ClampedArray(smallFrame.pixels); // [P:pixels, J]

  settings = { // [J]
    density: controlNumber(controls.density, 800), // [A]
    steps: controlNumber(controls.length, 10), // [A]
    weight: controlNumber(controls.weight, 0.8), // [A]
    smooth: controlNumber(controls.smooth, 1.2), // [A]
    memory: controlNumber(controls.memory, 0.35), // [A]
    colored: controls.color.checked() // [P:createCheckbox]
  }; // [J]

  cycleHull = controls.face.checked() && millis() - hullStamp < 1500 ? faceHull : null; // [P:createCheckbox, P:millis]

  updateFace(); // [A]
  analysisIndex = 0; stage = 1; // [J]
  say('Processing webcam frames in small batches.'); // [A]
} // [J]

function blurCopy(values, radius) { // [A]
  const matrix = { // [J]
    data: new Float32Array(values), // [J]
    width: SW, // [J]
    height: SH // [J]
  }; // [J]

  d3.blur2(matrix, radius); // [DB]
  return matrix.data; // [J]
} // [J]

// ------------------------------------------------------------
// Analysis stages:
// 1. Brightness and temporal smoothing.
// 2. Sobel gradients and structure tensor.
// 3. Edge-tangent directions.
//
// Drawing starts only after all three stages are complete.
// ------------------------------------------------------------

function analyzeBatch() { // [A]
  const started = millis(); // [P:millis]

  for (
    let batch = 0;
    analysisIndex < NN && batch < 4096;
    batch++, analysisIndex++
  ) { // [J]
    const i = analysisIndex; // [J]

    if (stage === 1) { // [J]
      const offset = i * 4; // [J]
      const grey = (rgba[offset] + rgba[offset + 1] + rgba[offset + 2]) / 765; // [J]

      tone[i] = historyReady
        ? grey * (1 - settings.memory) + tone[i] * settings.memory
        : grey; // [J]

    } else if (stage === 2) { // [J]
      const xx = i % SW, yy = floor(i / SW); // [P:floor]

      if (xx > 0 && xx < SW - 1 && yy > 0 && yy < SH - 1) { // [J]
        const a = smoothed; // [J]

        const gx = (
          -a[i-SW-1] - 2*a[i-1] - a[i+SW-1]
          + a[i-SW+1] + 2*a[i+1] + a[i+SW+1]
        ) / 8; // [J]

        const gy = (
          -a[i-SW-1] - 2*a[i-SW] - a[i-SW+1]
          + a[i+SW-1] + 2*a[i+SW] + a[i+SW+1]
        ) / 8; // [J]

        txx[i] = gx * gx; // [J]
        tyy[i] = gy * gy; // [J]
        txy[i] = gx * gy; // [J]
      } // [J]

    } else { // [J]
      const total = txx[i] + tyy[i]; // [J]
      const difference = txx[i] - tyy[i]; // [J]

      // Avoid taking a square root of negative rounding error or NaN.
      const energy = Number.isFinite(total) && total > 0 ? total : 0; // [J]

      let angle = energy > 1e-8
        && Number.isFinite(txy[i])
        && Number.isFinite(difference)
        ? 0.5 * atan2(2 * txy[i], difference) + HALF_PI
        : -PI / 4; // [P:atan2, P:HALF_PI, P:PI, J]

      if (!Number.isFinite(angle)) angle = -PI / 4; // [J, P:PI]

      flowX[i] = cos(angle); // [P:cos]
      flowY[i] = sin(angle); // [P:sin]
      edgePower[i] = Number.isFinite(energy)
        ? constrain(8 * sqrt(energy), 0, 1)
        : 0; // [P:constrain, P:sqrt, J]
    } // [J]

    // Yield back to draw() instead of monopolizing the browser.
    if (batch % 64 === 63 && millis() - started > 5) { // [P:millis]
      analysisIndex++; // [J]
      return; // [J]
    } // [J]
  } // [J]

  if (analysisIndex < NN) return; // [J]
  analysisIndex = 0; // [J]

  if (stage === 1) { // [J]
    historyReady = true; // [J]
    smoothed = blurCopy(tone, settings.smooth); // [A]

    txx = new Float32Array(NN); // [J]
    tyy = new Float32Array(NN); // [J]
    txy = new Float32Array(NN); // [J]
    stage = 2; // [J]

  } else if (stage === 2) { // [J]
    txx = blurCopy(txx, 2); // [A]
    tyy = blurCopy(tyy, 2); // [A]
    txy = blurCopy(txy, 2); // [A]

    flowX = new Float32Array(NN); // [J]
    flowY = new Float32Array(NN); // [J]
    edgePower = new Float32Array(NN); // [J]
    stage = 3; // [J]

  } else { // [J]
    draftInk.background(246, 242, 231); // [G, P:background]
    draftInk.noFill(); // [G, P:noFill]
    draftInk.strokeWeight(settings.weight); // [G, P:strokeWeight]

    randomSeed(219); // [P:randomSeed]
    seedIndex = 0; drawnCount = 0; stage = 4; // [J]
  } // [J]
} // [J]

// ------------------------------------------------------------
// Draw a bounded batch of strokes.
// Stable random seeds reduce frame-to-frame flicker.
// ------------------------------------------------------------

function drawBatch() { // [A]
  const started = millis(); // [P:millis]

  for (
    let batch = 0;
    batch < 120 && seedIndex < settings.density;
    batch++, seedIndex++
  ) { // [J]
    const sx = random(2, SW - 2); // [P:random]
    const sy = random(2, SH - 2); // [P:random]
    const chance = random(); // [P:random]

    const i = floor(sx) + floor(sy) * SW; // [P:floor]
    const darkness = 1 - tone[i]; // [J]

    const boost = cycleHull && d3.polygonContains(cycleHull, [sx, sy])
      ? 0.22 : 0; // [DC]

    const probability =
      0.8 * darkness * darkness + 0.18 * edgePower[i] + boost; // [J]

    if (Number.isFinite(probability) && chance < probability) { // [J]
      if (settings.colored) { // [J]
        const offset = i * 4; // [J]

        draftInk.stroke(
          rgba[offset] * 0.7,
          rgba[offset + 1] * 0.7,
          rgba[offset + 2] * 0.7,
          190
        ); // [G, P:stroke]

      } else { // [J]
        draftInk.stroke(25, 32, 39, 90 + darkness * 140); // [G, P:stroke]
      } // [J]

      traceStroke(sx, sy, 1); // [A]
      traceStroke(sx, sy, -1); // [A]
      drawnCount++; // [J]
    } // [J]

    if (millis() - started > 5) { // [P:millis]
      seedIndex++; // [J]
      return; // [J]
    } // [J]
  } // [J]

  if (seedIndex >= settings.density) { // [J]
    finishedInk.image(draftInk, 0, 0); // [G, P:image]
    completed = true; stage = 0; // [J]

    say('Live engraving: ' + drawnCount + ' strokes. Controls apply to the next frame.'); // [A]
  } // [J]
} // [J]

// ------------------------------------------------------------
// Trace a short path along the edge-tangent field.
// ------------------------------------------------------------

function traceStroke(sx, sy, direction) { // [A]
  if (!Number.isFinite(sx + sy)) return; // [J]

  const initial = floor(sx) + floor(sy) * SW; // [P:floor]
  let dx = flowX[initial] * direction; // [J]
  let dy = flowY[initial] * direction; // [J]

  draftInk.beginShape(); // [G, P:beginShape]

  for (let step = 0; step <= settings.steps; step++) { // [J]
    if (
      !Number.isFinite(sx + sy + dx + dy)
      || sx < 1 || sy < 1
      || sx >= SW - 1 || sy >= SH - 1
    ) break; // [J]

    const i = floor(sx) + floor(sy) * SW; // [P:floor]

    if (
      !Number.isFinite(tone[i] + tone[initial])
      || abs(tone[i] - tone[initial]) > 0.3
    ) break; // [P:abs, J]

    draftInk.vertex(sx * EW / SW, sy * EH / SH); // [G, P:vertex]

    let fx = flowX[i], fy = flowY[i]; // [J]

    // An orientation and its negative describe the same edge direction.
    if (fx * dx + fy * dy < 0) { fx = -fx; fy = -fy; } // [J]

    dx = dx * 0.45 + fx * 0.55; // [J]
    dy = dy * 0.45 + fy * 0.55; // [J]

    const magnitudeSquared = dx * dx + dy * dy; // [J]

    if (
      !Number.isFinite(magnitudeSquared)
      || magnitudeSquared < 1e-12
    ) break; // [J]

    const magnitude = sqrt(magnitudeSquared); // [P:sqrt]
    dx /= magnitude; dy /= magnitude; // [J]

    sx += dx * 0.6; // [J]
    sy += dy * 0.6; // [J]
  } // [J]

  draftInk.endShape(); // [G, P:endShape]
} // [J]
