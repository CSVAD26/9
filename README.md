# MAT 236 · Computational Systems for Visual Art and Design

**Luc Freiburg**, a student in the **UCSB Media Arts and Technology Program**. This repository contains assignments, projects, and experiments for [MAT 236: Computational Systems for Visual Art and Design](https://csvad26.github.io/course_site/).

[View the coursework site](https://csvad26.github.io/9/) · [01 / Faces](https://csvad26.github.io/9/assignments/assignment1/) · [02 / Impossible Colors](https://csvad26.github.io/9/assignments/MiniAssignment2/) · [Full spectrum](https://csvad26.github.io/9/assignments/ImpossibleColors/)

## Repository map

```text
.github/workflows/            GitHub Pages deployment
.vscode/                      Editor settings
assignments/
├── assignment1/              Faces
├── MiniAssignment2/          Impossible Colors — RGB light curve & palettes
├── ImpossibleColors/        Full spectrum — material curves, images & sound
├── MiniAssignment3/          Image annotation
├── MiniAssignment4/          Data visualization
├── MiniAssignment5/          Sensor integration
├── FinalProject/             Final project
├── exercises/                Practice sketches
├── projects/
│   ├── project1/             Drawing tool
│   └── project2/             Data portrait
└── reflections/              Reading notes and reflections
scripts/                      Dependencies, development, and build tools
shared/                       Shared styles and p5 configuration
templates/
└── p5-sketch/                Reusable sketch starter
```

Each sketch folder also includes `assets/` for media and `documentation/` for screenshots and process images. Git-ignored folders are omitted from this map.

The site publishes automatically from `main` through GitHub Actions. Use Node.js 24. From a fresh checkout:

```sh
npm --prefix scripts ci
npm --prefix assignments/ImpossibleColors ci
npm --prefix scripts run dev
```

Open `http://127.0.0.1:5173/assignments/MiniAssignment2/` for **Impossible Colors**. `npm --prefix scripts run dev:assignment2` serves the same repository root so shared scripts and the local p5.js 1.10.0 library resolve correctly.

The p5.js RGB light-curve color picker and palette creator remains at its original Assignment 2 route. Draw a curve, inspect the approximate mixed color, save and edit swatches, and copy HEX values. [Assignment 2 usage](assignments/MiniAssignment2/README.md) explains the controls.

The separate [full spectrum version](assignments/ImpossibleColors/README.md) adds seven authored bands, local photo recoloring, estimated depth and opt-in sound. Run `npm --prefix scripts run dev:spectrum` and open `http://127.0.0.1:5180/` to develop it.

`npm --prefix scripts run build` compiles the full spectrum app with Vite and assembles the public coursework site into `dist/`. The classic Assignment 2 files publish unchanged; the full app publishes only its compiled bundle, local model/runtime assets and notices. Run `npm --prefix scripts run test:site` to verify both routes. Development files and planning stay local. The build does not deploy the site.
