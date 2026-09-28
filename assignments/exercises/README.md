# Exercises

Use this folder for small experiments, in-class practice, and sketches that are not yet assignments.

From the repository root, create a new sketch:

```sh
cp -R templates/p5-sketch assignments/exercises/my-sketch
```

Choose a short folder name without spaces. The copy is one folder deeper than the template, so update its `index.html`:

- Change `../../shared/` to `../../../shared/`.
- Change `../../vendor/` to `../../../vendor/`, including the optional sound script.
- Change the home link from `href="../../"` to `href="../../../"`.

Keep the original template's paths unchanged. Edit the copied `sketch.js`, page title, and README, then open `/assignments/exercises/my-sketch/` while the local server is running. Add a link with `href="assignments/exercises/my-sketch/"` to the root `index.html` when you want it listed on the home page.

Record the question you explored, any source you adapted, and what you learned. Put inputs in `assets/` and screenshots in `documentation/`. Keep assignment submissions in their designated folders.
