import { BANDS } from './bands';

export function createWorkspace(host:HTMLElement) {
  host.innerHTML=`
    <div class="instrument">
      <header class="masthead">
        <a class="wordmark" href="../../" aria-label="Back to coursework"><span class="prism-mark" aria-hidden="true"></span><span>LUC FREIBURG <span class="muted">/ MAT 236</span></span></a>
        <a class="edition" href="../MiniAssignment2/">THE ORIGINAL RGB STUDY <span aria-hidden="true">↗</span></a>
      </header>
      <section class="intro">
        <div><div class="eyebrow">02 / AN EXPERIMENT IN PERCEPTION</div><h1>Impossible <span>colors.</span></h1></div>
        <p>Draw beyond the visible.<br> Turn a spectrum into color, light, and sound.</p>
      </section>
      <div class="actionbar">
        <div class="action-group"><button id="open-image" class="primary"><span aria-hidden="true">＋</span> Open image</button><button id="load-material">Open material</button><button id="use-sample" hidden>Use sample</button></div>
        <div class="action-group"><button id="undo" aria-label="Undo" title="Undo (⌘/Ctrl Z)" disabled>↶ <span>Undo</span></button><button id="redo" aria-label="Redo" title="Redo (⌘/Ctrl Shift Z)" disabled>↷ <span>Redo</span></button><span class="divider"></span><button id="reset">Reset material</button><details class="export-menu" id="export-menu"><summary>Export <span aria-hidden="true">↗</span></summary><div class="export-options"><button id="export-png">Save appearance PNG</button><button id="export-json">Save material JSON</button><button id="export-wav">Save sound WAV</button><button id="copy-hex">Copy base HEX</button></div></details></div>
      </div>
      <input type="file" id="image-input" accept="image/png,image/jpeg" hidden><input type="file" id="material-input" accept="application/json,.json" hidden>
      <div class="studio">
        <section class="preview-panel panel" aria-label="Material preview">
          <div class="panel-heading"><span class="eyebrow">01 / APPEARANCE</span><button id="compare" aria-pressed="false" title="Toggle original image">Compare original <span aria-hidden="true">◐</span></button></div>
          <div class="preview-stage" id="preview-stage">
            <div class="stage-corner top-left"></div><div class="stage-corner bottom-right"></div>
            <canvas id="preview" data-testid="material-preview" width="512" height="384" tabindex="0" aria-label="Image preview. Click a color to select it." role="img"></canvas>
            <div id="scan-line" class="scan-line" hidden></div>
            <span class="stage-label" id="view-label">LIVE MATERIAL</span>
            <span class="stage-caption" id="stage-caption">A surface for your spectrum</span>
          </div>
          <div class="source-row"><span class="source-dot"></span><span id="source-name">Sculpted light / sample surface</span><span id="resolution">512 × 384</span></div>
          <div class="material-row"><span class="eyebrow">MATERIALS</span><div id="materials" class="materials" data-count="1"></div><button id="remove-material" aria-label="Remove selected material" title="Remove selected material" hidden>−</button></div>
          <div class="selection-controls" id="selection-controls" hidden>
            <div class="selection-tools"><button id="select-color" aria-pressed="true">Select color</button><button id="mask-add" aria-pressed="false">Add mask</button><button id="mask-erase" aria-pressed="false">Erase mask</button></div>
            <label id="tolerance-label">Color range <input id="tolerance" type="range" min="0.01" max="0.4" step="0.01" value="0.1"><output id="tolerance-value">0.10</output></label>
            <label id="brush-label" hidden>Brush size <input id="brush-size" type="range" min="0.01" max="0.3" step="0.01" value="0.04"></label>
          </div>
          <div class="preview-status"><span class="status-dot"></span><span id="render-status">Preparing preview…</span><button id="animate" aria-pressed="false" hidden>Animate</button></div>
          <div id="depth-row" class="depth-row" hidden><span id="depth-status"></span><button id="retry-depth" hidden>Retry depth</button></div>
        </section>
        <section class="spectrum-panel panel" aria-label="Spectrum controls">
          <div class="panel-heading"><span class="eyebrow">02 / DRAW THE SPECTRUM</span><span class="live-label"><i></i> LIVE RESPONSE</span></div>
          <div class="band-nav" role="group" aria-label="Electromagnetic bands">${BANDS.map(b=>`<button data-band="${b.id}" aria-label="${b.label}" aria-pressed="${b.id==='visible'}" style="--band-color:${b.color}"><span class="band-symbol">${b.short}</span><span>${b.label==='Ultraviolet'?'UV':b.label==='Infrared'?'IR':b.label==='Microwave'?'Micro':b.label}</span><i></i></button>`).join('')}</div>
          <div class="band-description"><div><span id="band-title">The optical window</span><span id="band-range">200 – 1100 nm</span></div><button id="optical-view" title="Show ultraviolet, visible and near infrared together">Optical view <span aria-hidden="true">↔</span></button></div>
          <p id="band-description">Shape visible color. Reach left for neon, right for warmth.</p>
          <div id="curve-editor"></div>
          <div class="color-result"><div class="color-chip" id="color-chip"></div><div><span class="eyebrow">BASE VISIBLE COLOR</span><button id="color-value" aria-label="Copy base color HEX">#000000</button></div><div class="color-note">One color is only<br>part of the story.</div></div>
          <section class="sound-strip" id="sound-strip" aria-label="Sonification" hidden>
            <div class="sound-heading"><span class="eyebrow">03 / HEAR THE SPECTRUM</span><span id="sound-position">8 SECOND SCAN</span></div>
            <div class="sound-controls"><select id="sound-mode" aria-label="Sound mode"><option value="radio">Radio · string</option><option value="microwave">Microwave · pulsar</option><option value="both">Both voices</option></select><button id="play" aria-label="Play sound">▶ Play</button><button id="stop" aria-label="Stop sound" disabled>■ Stop</button><label class="volume-label">Volume<input id="volume" type="range" min="0" max="1" step="0.01" value="0.5"></label></div>
            <p id="sound-status">Draw in Radio or Microwave to give the image a voice.</p>
          </section>
        </section>
      </div>
      <div class="footnote-row"><p><span aria-hidden="true">✧</span> Draw a peak. Move it. See what changes.</p><span id="message" role="status" aria-live="polite"></span></div>
      <footer><span class="eyebrow">VISIBLE IS JUST THE BEGINNING.</span><details id="about"><summary>About this instrument <span aria-hidden="true">＋</span></summary><div class="about-copy"><p>A curve-led material experiment across seven electromagnetic bands. Visible light uses CIE color matching under daylight. The invisible bands are artistic mappings: UV emits neon, infrared adds false-color heat, X-ray uses estimated surface depth, and gamma introduces selective sensor glitches. These effects do not reveal physical heat or hidden structures.</p><p>Radio excites a modelled string; microwave uses pulsar synthesis. Both scan the original image left to right for eight seconds. Photos and generated sound stay on your device. Depth assets load locally on demand (about 28 MiB).</p><p>Draw, edit points, erase, or smooth a curve. Focus the graph for arrow-key editing; Escape cancels a gesture. Select a photo color to create a material, then refine it with the mask brush. PNG saves the preview appearance; JSON saves curves and settings and asks you to reattach the same photo; WAV saves the current sound.</p><p>Inspired by CSVAD26 PaletteExplorer, vgpu radiance cascades and depth estimation, Glitchy Structure, and NASA Hearing Hubble. <a href="./notices/THIRD_PARTY_NOTICES.md">Source acknowledgments</a>.</p></div></details></footer>
    </div>`;
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>host.querySelector<T>(`#${id}`)!;
  return { el, host, destroy(){host.replaceChildren();} };
}
export type Workspace=ReturnType<typeof createWorkspace>;
