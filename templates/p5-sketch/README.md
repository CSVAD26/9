# Sketch title

**Status: starter — replace this page with your sketch's documentation.**

Describe what the sketch explores and how to interact with it. Credit any examples, libraries, images, or datasets you adapt.

## Use this template

Copy it from the repository root:

```sh
cp -R templates/p5-sketch assignments/exercises/my-sketch
```

The copied sketch is one folder deeper. In its `index.html`, change:

- `../../shared/` to `../../../shared/`.
- `../../vendor/` to `../../../vendor/`, including the optional sound script.
- The home link from `href="../../"` to `href="../../../"`.

Keep the original template's paths unchanged. Update the copied page title, this README, and `sketch.js`. Add a link with `href="assignments/exercises/my-sketch/"` to the root `index.html` and open `/assignments/exercises/my-sketch/` with the local server running.

## Files

- `index.html` loads p5, `shared/p5-config.js`, and the sketch in that order.
- `sketch.js` contains the global `setup()` and `draw()` functions.
- `style.css` controls this page's layout; shared styling comes from `shared/style.css` at the repository root.
- `assets/` holds shareable images, fonts, audio, and data.
- `documentation/` holds screenshots and process images.

`setup()` runs once; `draw()` repeats. Load images with `loadImage('assets/image.png')` inside `preload()` when your sketch needs them. The optional p5.sound script is commented out in `index.html`; enable it when needed.

## Device sensors

`shared/p5-config.js` disables p5's unused device motion and orientation listeners by default, avoiding Firefox sensor deprecation warnings. Keep it after the p5 library and before `sketch.js` in `index.html`.

For a sketch that uses motion or orientation sensors, enable them on that page's opening HTML tag:

```html
<html lang="en" data-p5-device-sensors="true"></html>
```

This preserves p5's sensor behavior for `rotationX`, `accelerationX`, and related values and callbacks.

## Your notes

- **Question or idea:** What are you exploring?
- **Controls:** How does someone use it?
- **Process:** What did you change or learn?
- **Credits:** Which sources informed the sketch?

Keep private data in `local-data/` and configure local loading as needed. It is ignored by Git and excluded from the static build. Do not move private inputs into `assets/` to share the sketch.
