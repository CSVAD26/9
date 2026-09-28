# MAT 236 · Computational Systems for Visual Art and Design

**Luc Freiburg**, a student in the **UCSB Media Arts and Technology Program**. This repository contains assignments, projects, and experiments for [MAT 236: Computational Systems for Visual Art and Design](https://csvad26.github.io/course_site/).

[View the coursework site](https://csvad26.github.io/9/) · [01 / Faces](https://csvad26.github.io/9/assignments/assignment1/)

## Repository map

```text
.github/workflows/            GitHub Pages deployment
.vscode/                      Editor settings
assignments/
├── assignment1/              Faces
├── MiniAssignment2/          Color picker
├── MiniAssignment3/          Image annotation
├── MiniAssignment4/          Data visualization
├── MiniAssignment5/          Sensor integration
├── FinalProject/             Final project
├── exercises/                Practice sketches
├── projects/
│   ├── project1/             Drawing tool
│   └── project2/             Data portrait
└── reflections/              Reading notes and reflections
scripts/                      Development and build tools
shared/                       Shared styles and p5 configuration
templates/
└── p5-sketch/                Reusable sketch starter
```

Each sketch folder also includes `assets/` for media and `documentation/` for screenshots and process images. Git-ignored folders are omitted from this map.

The site publishes automatically from `main` through GitHub Actions. For local editing, run `npm ci` and `npm run dev`. `npm run build` prepares the public site in `dist/`.
