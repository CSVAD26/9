# Impossible Colors — Assignment 2

The first stage is a simple color picker and palette creator built with p5.js. Draw a light curve and see an approximate RGB mixture, then collect colors into a palette. The project title remains **Impossible Colors**.

[Assignment brief](https://csvad26.github.io/course_site/assignments/mini-assignment-2) · [Course color examples](https://github.com/CSVAD26/code_samples/tree/main/colorp5)

From the repository root, using Node.js 24:

```sh
npm --prefix scripts ci
npm --prefix scripts run dev:assignment2
```

Open `http://127.0.0.1:5173/assignments/MiniAssignment2/`. The server runs from the repository root, and the page loads only local p5.js 1.10.0, the shared p5 configuration and `sketch.js`. No separate Assignment 2 package install is needed.

## Use the picker

1. Draw or drag across the graph to shape the light curve. Its height represents relative light intensity; the preview and RGB/HEX values respond to your edits.
2. Choose **Add color** to save one of up to 12 palette swatches. Select a swatch to restore its curve and edit it.
3. Update a selected swatch with your current color, or remove it from the palette.
4. Choose **Copy HEX** to copy the saved palette values for another drawing or design tool. Colors last for the current page session.

Undo/Redo applies to curve gestures and palette changes. Smooth softens the curve, Clear removes its light, and Reset restores the starting curve. Focus the graph and use Left/Right to choose a point and Up/Down to change its height; hold Shift for larger changes. Escape cancels an active stroke.

The curve is interpreted through approximate red, green and blue response bands. This is an intuitive RGB light-mixing sketch, not a calibrated spectrum-to-color calculation. A curve can produce an ordinary displayable RGB color; the current stage does not reproduce colors outside the display gamut.

## Scope and next stage

The working interface and interaction logic live in `sketch.js`, using p5 drawing and DOM controls. This smaller first stage establishes drawing, color feedback and palette editing before implementing the saved full-spectrum plan. Measured spectra, spectral material behavior and more advanced transformations belong to that later stage.

```sh
npm --prefix scripts run build
```

The static site is written to `dist/`. Only the live page, sketch, stylesheet, README, assets and documentation are published for this assignment. The ignored legacy studio files remain local and are excluded from the build. This command does not deploy the site.
