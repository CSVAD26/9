# Impossible Colors · Full spectrum

Draw a material response across gamma, X-ray, ultraviolet, visible light, infrared, microwave and radio. The visible band determines the base color. Nonvisible bands are artistic mappings: UV adds emission, infrared adds a heat palette, X-ray uses estimated visible-surface depth, and gamma adds seeded events and contours. These effects are interpretations rather than measurements of invisible radiation.

This app lives at `/9/assignments/ImpossibleColors/`. The original [p5.js RGB picker and palette creator](../MiniAssignment2/) remains at `/9/assignments/MiniAssignment2/`.

Use the spectrum editor to draw, erase, smooth and adjust samples. Undo treats one pointer stroke as one edit. Import a local JPEG or PNG to recolor it, select original image colors and refine their masks. Up to six material assignments can coexist. An untouched imported image retains its original appearance. New image imports start a new undo history.

Radio, Microwave and Both offer an eight-second stereo scan. Radio excites an eight-mode damped string; Microwave uses windowed pulsarets separated by silence. Playback requires Play, never starts on import or restores automatically after hiding the page. Volume starts at 0.5. Sound is an authored image-to-synthesis mapping, not recorded radio or microwave radiation.

Export PNG saves the After preview at its displayed source resolution, with a maximum 512-pixel long edge and frozen effect time. Material JSON saves curves, fixed selections, seed, frozen time and sound settings. It does not embed the image, depth, audio or playing state: retain the original image and reattach its matching SHA-256 hash to restore image-dependent results. JSON is version 1, limited to 1,000,000 UTF-8 bytes, and deliberately excludes older studio recipes. WAV exports the full eight-second scan at the selected volume. Base HEX describes the visible material color before the other effects.

All image decoding, inference, rendering, synthesis and exports run locally. Only application files and the pinned local depth model/runtime are fetched; images and audio are not uploaded. Still-image imports allow at most 20,000,000 bytes and 24,000,000 decoded pixels. FastDepth uses a 320 × 256 input and a 5,420,454-byte model. Its local runtime is distributed with the app. Estimated visible-surface depth can be inaccurate, particularly outside the model's indoor training domain. It does not reveal hidden anatomy or objects.

WebGPU enables the shared UV/gamma radiance cascades. If it is unavailable or lost, editing remains usable with a labeled CPU preview supporting bloom, infrared and image-edge contours. Depth and audio report their own availability independently. A model or sound failure preserves authored material data.

Use Node.js 24:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run shaders:check
npx playwright install chromium
npm run test:e2e -- --project headless
npm run test:e2e:headed
npm run build
```

The dev server runs at `http://127.0.0.1:5180/`. From the repository root, `npm --prefix scripts run build` builds the complete course site and `npm --prefix scripts run test:site` verifies publication routes. Vite emits relative asset URLs for the course path. Raw source, reference datasets, tests and node_modules are excluded from publication.

See [third-party credits](THIRD_PARTY_NOTICES.md), [CIE provenance](data/cie/provenance.json), and [depth provenance](public/models/depth/PROVENANCE.md). The production bundle includes its dependency license notices.

Verification on 2026-10-06: 86 unit tests and 52 browser cases passed (26 headless, 26 headed), along with TypeScript, the production build and three site-publication checks. Real Apple Metal shader checks cover compilation, occluded light, GPU/CPU composition parity, frozen exports and device-loss fallback. Real depth inference was checked with both WASM and a native-adapter browser. The built `/9/` path is exercised by `node tests/production-smoke.mjs` after the repository site build. Headed checks require a graphical session.

The preview keeps its source image to a maximum 512-pixel long edge; the radiance solve uses a 256-pixel long edge. Depth downloads about 28 MiB on demand. The current Vite output also includes a duplicate default runtime WASM asset, so the full static app directory is about 55 MiB, although the local runtime override downloads one runtime for inference. Animation performance varies by device; the curve editor and rendering schedule coalesce updates.
