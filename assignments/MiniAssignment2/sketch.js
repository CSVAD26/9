// Impossible Colors — an RGB light-curve study, made with p5.js only.
// One curve is sampled through three overlapping RGB response bands.
// This is a drawing instrument, not calibrated wavelength/color science.
// Course starting point: CSVAD26 / colorp5 / PaletteExplorer.

const IC_SAMPLES = 161;
const IC_LIMIT = 12;
const IC_HISTORY = 40;
let lightCurve, palette = [], selectedColor = -1;
let undoStates = [], redoStates = [], strokeStart = null, lastPoint = null;
let curveCanvas, graphHost, ui = {}, cursorSample = 80, activePointer = null;
let responses, responseSums;

function setup() {
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  lightCurve = initialCurve();
  // Fixed normalization: raising a curve adds light; it never auto-normalizes.
  responses = [0.84, 0.5, 0.16].map(center =>
    Array.from({length: IC_SAMPLES}, (_, i) =>
      Math.exp(-0.5 * ((i / (IC_SAMPLES - 1) - center) / 0.17) ** 2)));
  responseSums = responses.map(band => band.reduce((sum, value) => sum + value, 0));
  buildInterface();
  curveCanvas = createCanvas(graphHost.elt.clientWidth, graphHeight());
  curveCanvas.parent(graphHost);
  curveCanvas.elt.setAttribute('aria-label', 'Editable RGB light curve');
  curveCanvas.elt.setAttribute('aria-describedby', 'ic-graph-help');
  curveCanvas.elt.tabIndex = 0;
  curveCanvas.elt.style.touchAction = 'none';
  curveCanvas.elt.addEventListener('pointerdown', beginStroke);
  curveCanvas.elt.addEventListener('pointermove', moveStroke);
  curveCanvas.elt.addEventListener('pointerup', event => {
    if (event.pointerId === activePointer) finishStroke(false);
  });
  curveCanvas.elt.addEventListener('pointercancel', event => {
    if (event.pointerId === activePointer) finishStroke(true);
  });
  curveCanvas.elt.addEventListener('lostpointercapture', event => {
    if (event.pointerId === activePointer) finishStroke(false);
  });
  curveCanvas.elt.addEventListener('keydown', curveKey);
  window.addEventListener('blur', () => finishStroke(true));
  noLoop();
  syncInterface();
  describe('Draw a light curve from blue through green to red. Save its RGB mixture into a palette.');
}

function initialCurve() {
  return Array.from({length: IC_SAMPLES}, (_, i) => {
    const x = i / (IC_SAMPLES - 1);
    return 0.72 * Math.exp(-(((x - 0.52) / 0.18) ** 2))
      + 0.35 * Math.exp(-(((x - 0.15) / 0.1) ** 2));
  });
}

function mixLight(values) {
  return responses.map((band, channel) => {
    const linear = band.reduce((sum, weight, i) => sum + weight * values[i], 0) / responseSums[channel];
    const srgb = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, srgb)) * 255);
  });
}

function hexColor(rgb) {
  return '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function snapshot() {
  return {curve: lightCurve.slice(), palette: palette.map(item => ({curve: item.curve.slice()})), selected: selectedColor};
}

function restore(state) {
  lightCurve = state.curve.slice();
  palette = state.palette.map(item => ({curve: item.curve.slice()}));
  selectedColor = state.selected;
  renderPalette();
  syncInterface();
}

function remember(before) {
  if (JSON.stringify(before) === JSON.stringify(snapshot())) return;
  undoStates.push(before);
  if (undoStates.length > IC_HISTORY) undoStates.shift();
  redoStates = [];
}

function change(action, message) {
  finishStroke(false);
  const before = snapshot();
  action();
  remember(before);
  renderPalette();
  syncInterface();
  announce(message);
}

function undoChange(redo = false) {
  finishStroke(false);
  const from = redo ? redoStates : undoStates;
  const to = redo ? undoStates : redoStates;
  if (!from.length) return;
  to.push(snapshot());
  restore(from.pop());
  announce(redo ? 'Change restored.' : 'Change undone.');
}

function graphHeight() { return window.innerWidth < 600 ? 280 : 340; }
function plotBounds() { return {x: 40, y: 24, w: width - 60, h: height - 70}; }

function pointFromEvent(event) {
  const rect = curveCanvas.elt.getBoundingClientRect(), plot = plotBounds();
  const x = (event.clientX - rect.left) * width / rect.width;
  const y = (event.clientY - rect.top) * height / rect.height;
  return {index: Math.round(constrain((x - plot.x) / plot.w, 0, 1) * (IC_SAMPLES - 1)),
    value: constrain(1 - (y - plot.y) / plot.h, 0, 1),
    inside: x >= plot.x && x <= plot.x + plot.w && y >= plot.y && y <= plot.y + plot.h};
}

function beginStroke(event) {
  if (activePointer !== null || event.button !== 0) return;
  const point = pointFromEvent(event);
  if (!point.inside) return;
  event.preventDefault();
  curveCanvas.elt.focus({preventScroll: true});
  activePointer = event.pointerId;
  strokeStart = snapshot();
  lastPoint = point;
  curveCanvas.elt.setPointerCapture(event.pointerId);
  paintSegment(point);
}

function moveStroke(event) {
  if (activePointer !== event.pointerId) return;
  event.preventDefault();
  paintSegment(pointFromEvent(event));
}

function paintSegment(point) {
  // Fill every crossed sample, including fast strokes with sparse pointer events.
  const start = lastPoint || point, span = Math.abs(point.index - start.index);
  for (let step = 0; step <= span; step++) {
    const fraction = span ? step / span : 1;
    const index = Math.round(start.index + (point.index - start.index) * fraction);
    lightCurve[index] = start.value + (point.value - start.value) * fraction;
  }
  lastPoint = point;
  cursorSample = point.index;
  syncInterface();
}

function finishStroke(cancel) {
  if (activePointer === null) return;
  const pointer = activePointer, before = strokeStart;
  activePointer = null; strokeStart = null; lastPoint = null;
  if (curveCanvas.elt.hasPointerCapture(pointer)) curveCanvas.elt.releasePointerCapture(pointer);
  if (cancel) restore(before); else { remember(before); syncInterface(); }
  announce(cancel ? 'Stroke cancelled.' : `Color ${hexColor(mixLight(lightCurve))}.`);
}

function curveKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); finishStroke(true); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); undoChange(event.shiftKey); return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    cursorSample = constrain(cursorSample + (event.key === 'ArrowLeft' ? -1 : 1), 0, IC_SAMPLES - 1);
    syncInterface();
  } else {
    change(() => { lightCurve[cursorSample] = constrain(lightCurve[cursorSample]
      + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 0.1 : 0.02), 0, 1); }, 'Light adjusted.');
  }
  announce(`Curve position ${Math.round(cursorSample / (IC_SAMPLES - 1) * 100)}% from blue to red; ${Math.round(lightCurve[cursorSample] * 100)}% light.`);
}

function draw() {
  background('#141921');
  const p = plotBounds();
  noStroke();
  // The colored floor shows the RGB response at each position, not real wavelengths.
  for (let x = 0; x < p.w; x += 2) {
    const i = Math.round(x / p.w * (IC_SAMPLES - 1));
    const tint = responses.map(band => band[i]);
    const maximum = Math.max(...tint);
    fill(tint[0] / maximum * 255, tint[1] / maximum * 255, tint[2] / maximum * 255, 17);
    rect(p.x + x, p.y, 2, p.h);
    fill(tint[0] / maximum * 255, tint[1] / maximum * 255, tint[2] / maximum * 255, 65);
    rect(p.x + x, p.y + p.h * (1 - lightCurve[i]), 2, p.h * lightCurve[i]);
  }
  stroke('#323945'); strokeWeight(1);
  for (let row = 0; row <= 4; row++) line(p.x, p.y + p.h * row / 4, p.x + p.w, p.y + p.h * row / 4);
  noStroke(); fill('#929eae'); textSize(10); textAlign(RIGHT, CENTER);
  for (let row = 0; row <= 4; row++) text(`${100 - row * 25}`, p.x - 10, p.y + p.h * row / 4);
  textAlign(CENTER, TOP); textSize(11);
  ['BLUE', 'GREEN', 'RED'].forEach((label, i) => {
    fill(['#91b0ff', '#83e5a4', '#ff9c9c'][i]);
    text(label, p.x + p.w * [0.16, 0.5, 0.84][i], p.y + p.h + 16);
  });
  noFill(); stroke('#f5f8fa'); strokeWeight(2.5); strokeJoin(ROUND);
  beginShape();
  lightCurve.forEach((value, i) => vertex(p.x + i / (IC_SAMPLES - 1) * p.w, p.y + (1 - value) * p.h));
  endShape();
  const cx = p.x + cursorSample / (IC_SAMPLES - 1) * p.w;
  const cy = p.y + (1 - lightCurve[cursorSample]) * p.h;
  stroke(255, 255, 255, 45); strokeWeight(1); line(cx, p.y, cx, p.y + p.h);
  fill('#141921'); stroke('#ffffff'); strokeWeight(2); circle(cx, cy, 9);
}

function windowResized() {
  if (!curveCanvas) return;
  finishStroke(true);
  resizeCanvas(graphHost.elt.clientWidth, graphHeight());
  redraw();
}

// All interface elements, including their styles, are created from this sketch.
function element(tag, text, parent, className = '') {
  const item = createElement(tag, text).parent(parent);
  if (className) item.class(className);
  return item;
}

function button(label, parent, action, className = '') {
  const item = createButton(label).parent(parent).class(className);
  item.attribute('type', 'button'); item.mouseClicked(action);
  return item;
}

function buildInterface() {
  createElement('style', `
    #sketch{font-family:Inter,system-ui,sans-serif;color:#edf2f7}
    #sketch *{box-sizing:border-box}
    #sketch h1{font-size:clamp(30px,5vw,48px);letter-spacing:-.045em;line-height:1.1;margin:8px 0 12px;color:#f6f8fa}
    #sketch h2{font-size:17px;letter-spacing:-.02em;margin:0;color:#edf2f7}
    #sketch p{margin:0}
    .ic-kicker{font-size:11px;letter-spacing:.17em;text-transform:uppercase;color:#99a7ba}
    .ic-intro{color:#aeb9c9;font-size:15px;line-height:1.6;margin-bottom:26px!important}
    .ic-workspace{display:grid;grid-template-columns:minmax(0,1fr) 235px;gap:18px}
    .ic-card{border:1px solid #303947;border-radius:16px;background:#141921;overflow:hidden}
    .ic-card-top,.ic-tools,.ic-palette-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .ic-card-top{padding:18px 20px 0;font-size:11px;letter-spacing:.11em;color:#aeb9c9}
    .ic-dot{display:inline-block;width:6px;height:6px;background:#96e6b0;border-radius:50%;margin-right:7px}
    .ic-graph canvas{display:block;width:100%!important;outline-offset:-3px}
    .ic-tools{padding:0 18px 14px;justify-content:flex-start;gap:7px}
    #sketch button{font:inherit;font-size:12px;line-height:1.2;border:1px solid #3b4554;background:#202733;color:#e5ebf5;border-radius:7px;padding:9px 12px;cursor:pointer;min-height:36px;transition:background .12s}
    #sketch button:hover:not(:disabled){background:#303b4b;border-color:#748399}
    #sketch button:disabled{opacity:.36;cursor:default}
    #sketch :focus-visible{outline:2px solid #afd3ff;outline-offset:3px}
    #sketch .ic-primary{background:#edf4ff;color:#17212d;border-color:#edf4ff;font-weight:650}
    #sketch .ic-primary:hover:not(:disabled){background:#cddff5}
    .ic-note{color:#8997aa;font-size:11px;line-height:1.6}
    .ic-graph-help{padding:0 20px 17px}
    .ic-live{padding:16px;display:flex;flex-direction:column;gap:12px}
    .ic-preview{height:126px;border-radius:10px;border:1px solid #ffffff18;display:flex;align-items:center;justify-content:center}
    .ic-preview span{font-size:11px;letter-spacing:.16em;font-weight:600;opacity:.8}
    #sketch input{width:100%;font:14px ui-monospace,SFMono-Regular,monospace;padding:9px 10px;border:1px solid #364152;border-radius:6px;background:#10151d;color:#edf2f7;min-width:0}
    #ic-hex{font-size:22px!important;letter-spacing:.07em;text-align:center}
    .ic-rgb{display:flex;justify-content:space-between;gap:8px;font:12px ui-monospace,monospace;color:#b2bdcc}
    .ic-rgb span:nth-child(1){color:#ffaaaa}.ic-rgb span:nth-child(2){color:#9be6b4}.ic-rgb span:nth-child(3){color:#9fbfff}
    .ic-live .ic-note{min-height:18px;text-align:center}
    .ic-palette{margin-top:26px}
    .ic-palette-head{margin-bottom:13px}
    .ic-palette-heading{display:flex;align-items:center;gap:12px}
    .ic-count{font:11px ui-monospace,monospace;color:#8f9fb3}
    .ic-swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;min-height:97px}
    #sketch .ic-swatch{padding:0;min-height:94px;overflow:hidden;display:flex;flex-direction:column;text-align:left;border-radius:10px}
    #sketch .ic-swatch[aria-pressed=true]{border-color:#dceaff;box-shadow:0 0 0 1px #dceaff}
    .ic-swatch-paint{height:59px;width:100%;border-bottom:1px solid #ffffff10}
    .ic-swatch-label{padding:9px 10px;display:flex;justify-content:space-between;width:100%;font:11px ui-monospace,monospace}
    .ic-empty{grid-column:1/-1;border:1px dashed #364152;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:22px;color:#8e9caf;font-size:13px;text-align:center}
    .ic-palette-bottom{margin-top:12px;display:flex;align-items:center;gap:10px}
    .ic-palette-bottom button{white-space:nowrap}
    #ic-palette-values{font-size:12px!important;color:#9caabd!important}
    .ic-status{min-height:28px;margin-top:15px!important;font-size:12px;color:#b2c7de}
    .ic-footnote{padding-top:14px;border-top:1px solid #293240;margin-top:5px!important}
    @media(max-width:680px){.ic-workspace{grid-template-columns:1fr}.ic-live{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px;align-items:center}.ic-preview{grid-row:1/4;height:126px}.ic-live>.ic-kicker{display:none}.ic-live>.ic-note{grid-column:1/-1;text-align:left}#ic-hex{font-size:19px!important}.ic-palette-bottom{flex-wrap:wrap}.ic-palette-bottom input{flex-basis:100%}.ic-swatches{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}}
    @media(prefers-reduced-motion:reduce){#sketch *{transition:none!important}}
  `).parent('sketch');
  const root = select('#sketch');
  element('p', '02 / RGB LIGHT STUDY', root, 'ic-kicker');
  element('h1', 'Impossible Colors', root);
  element('p', 'Draw light. Mix a color. Build a palette.', root, 'ic-intro');
  const work = element('div', '', root, 'ic-workspace');
  const graph = element('section', '', work, 'ic-card');
  const top = element('div', '', graph, 'ic-card-top');
  element('span', 'RGB LIGHT CURVE', top);
  ui.cursor = element('span', '', top);
  graphHost = element('div', '', graph, 'ic-graph');
  const tools = element('div', '', graph, 'ic-tools');
  ui.undo = button('Undo', tools, () => undoChange());
  ui.redo = button('Redo', tools, () => undoChange(true));
  button('Smooth', tools, () => change(() => {
    const before = lightCurve.slice();
    lightCurve = before.map((value, i) => (before[Math.max(0, i - 1)] + 2 * value + before[Math.min(IC_SAMPLES - 1, i + 1)]) / 4);
  }, 'Curve smoothed.'));
  button('Clear curve', tools, () => change(() => { lightCurve.fill(0); }, 'Curve cleared.'));
  button('Reset curve', tools, () => change(() => { lightCurve = initialCurve(); }, 'Starting curve restored.'));
  element('p', 'Draw across the graph. Keyboard: ← → choose a point; ↑ ↓ change its light. Esc cancels a stroke.', graph, 'ic-note ic-graph-help').id('ic-graph-help');
  const live = element('section', '', work, 'ic-card ic-live');
  element('p', 'YOUR COLOR', live, 'ic-kicker');
  ui.preview = element('div', '', live, 'ic-preview');
  element('span', 'LIVE COLOR', ui.preview);
  ui.hex = createInput('').parent(live).id('ic-hex');
  ui.hex.attribute('readonly', ''); ui.hex.attribute('aria-label', 'Current HEX color');
  const rgb = element('div', '', live, 'ic-rgb');
  ui.rgb = ['R', 'G', 'B'].map(channel => element('span', channel, rgb));
  ui.add = button('Add color', live, () => {
    if (palette.length === IC_LIMIT) return;
    change(() => { palette.push({curve: lightCurve.slice()}); selectedColor = palette.length - 1; }, 'Color added to palette.');
  }, 'ic-primary');
  ui.update = button('Update selected', live, () => {
    if (selectedColor < 0) return;
    change(() => { palette[selectedColor] = {curve: lightCurve.slice()}; }, 'Saved color updated.');
  });
  ui.selection = element('p', '', live, 'ic-note');
  const paletteSection = element('section', '', root, 'ic-palette');
  const heading = element('div', '', paletteSection, 'ic-palette-head');
  const headingText = element('div', '', heading, 'ic-palette-heading');
  element('h2', 'Your palette', headingText);
  ui.count = element('span', '', headingText, 'ic-count');
  ui.remove = button('Remove selected', heading, () => {
    if (selectedColor < 0) return;
    change(() => { palette.splice(selectedColor, 1); selectedColor = -1; }, 'Saved color removed.');
  });
  ui.swatches = element('div', '', paletteSection, 'ic-swatches');
  const bottom = element('div', '', paletteSection, 'ic-palette-bottom');
  ui.values = createInput('').parent(bottom).id('ic-palette-values');
  ui.values.attribute('readonly', ''); ui.values.attribute('aria-label', 'Palette HEX values');
  ui.values.attribute('placeholder', 'Your saved HEX colors will appear here');
  ui.copy = button('Copy HEX', bottom, copyPalette);
  ui.status = element('p', 'Start with the curve, then add a color you like.', root, 'ic-status');
  ui.status.attribute('role', 'status');
  element('p', 'An RGB approximation of light, made with p5.js. Colors are kept for this session; copy your HEX palette before leaving.', root, 'ic-note ic-footnote');
  renderPalette();
}

function setDisabled(control, disabled) { control.elt.disabled = disabled; }
function announce(message) { ui.status.html(message); }

function syncInterface() {
  const rgb = mixLight(lightCurve), hex = hexColor(rgb);
  ui.hex.value(hex);
  ui.preview.style('background-color', hex);
  ui.preview.style('color', (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) > 155 ? '#15232a' : '#ffffff');
  ui.rgb.forEach((node, i) => node.html(`${['R', 'G', 'B'][i]} ${rgb[i]}`));
  ui.cursor.html(`${Math.round(lightCurve[cursorSample] * 100)}% LIGHT`);
  const changed = selectedColor >= 0 && JSON.stringify(lightCurve) !== JSON.stringify(palette[selectedColor].curve);
  ui.selection.html(selectedColor < 0 ? 'Not saved yet' : `Color ${selectedColor + 1}${changed ? ' · unsaved changes' : ' · saved'}`);
  setDisabled(ui.add, palette.length >= IC_LIMIT);
  setDisabled(ui.update, !changed);
  setDisabled(ui.remove, selectedColor < 0);
  setDisabled(ui.undo, !undoStates.length);
  setDisabled(ui.redo, !redoStates.length);
  setDisabled(ui.copy, !palette.length);
  if (curveCanvas) redraw();
}

function renderPalette() {
  const focused = (ui.swatchElements || []).findIndex(item => item.elt === document.activeElement);
  // remove() also releases p5's DOM listeners; innerHTML replacement would retain them.
  if (ui.swatchElements) ui.swatchElements.forEach(item => item.remove());
  ui.swatchElements = [];
  if (!palette.length) ui.swatchElements.push(element('div', 'Your palette starts here. Add a color from the curve.', ui.swatches, 'ic-empty'));
  palette.forEach((item, index) => {
    const hex = hexColor(mixLight(item.curve));
    const swatch = button('', ui.swatches, () => change(() => {
      selectedColor = index; lightCurve = palette[index].curve.slice();
    }, `Loaded color ${index + 1}, ${hex}.`), 'ic-swatch');
    swatch.attribute('aria-label', `Load color ${index + 1}, ${hex}`);
    swatch.attribute('aria-pressed', String(index === selectedColor));
    // Static internal markup: no user-provided HTML.
    swatch.html(`<span class="ic-swatch-paint" style="background:${hex}"></span><span class="ic-swatch-label"><span>${hex}</span><span>${String(index + 1).padStart(2, '0')}</span></span>`);
    ui.swatchElements.push(swatch);
  });
  ui.count.html(`${palette.length} / ${IC_LIMIT}`);
  ui.values.value(palette.map(item => hexColor(mixLight(item.curve))).join(', '));
  if (focused >= 0 && ui.swatchElements[focused]) ui.swatchElements[focused].elt.focus({preventScroll: true});
}

async function copyPalette() {
  if (!palette.length) return;
  const values = ui.values.value();
  try {
    await navigator.clipboard.writeText(values);
    announce(`Copied ${palette.length} HEX color${palette.length === 1 ? '' : 's'}.`);
  } catch {
    ui.values.elt.focus(); ui.values.elt.select();
    announce('HEX values selected. Press ⌘C or Ctrl+C to copy.');
  }
}
