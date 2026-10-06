import { describe, expect, it } from 'vitest';
import { createDocument } from '../../src/picker/document';
import { curveLocation, editStroke, viewWavelength, wavelengthPosition } from '../../src/picker/editor-math';

describe('spectrum editor coordinates and strokes', () => {
  it('keeps visible wavelengths readable and log-band coordinates reversible', () => {
    expect(wavelengthPosition('optical', 650e-9)).toBeCloseTo(.5, 10);
    expect(viewWavelength('optical', 0)).toBeCloseTo(200e-9, 15);
    expect(viewWavelength('optical', 1)).toBeCloseTo(1100e-9, 15);
    expect(viewWavelength('radio', .5)).toBeCloseTo(Math.sqrt(1e5), 8);
    expect(wavelengthPosition('radio', 100)).toBeCloseTo(.4, 10);
    expect(curveLocation('optical', .2, .3).band).toBe('visible');
    expect(curveLocation('optical', .2, .3).u).toBeCloseTo(0, 8);
  });

  it('fills all visible bins during a fast optical stroke crossing UV and IR', () => {
    const source = createDocument().materials[0].curves;
    const changed = editStroke(source, 'optical', {x: 0, value: 0}, {x: 1, value: 1}, 'draw');
    expect(Object.keys(changed).sort()).toEqual(['infrared', 'uv', 'visible']);
    expect(changed.visible![0]).toBeCloseTo(.2, 6);
    expect(changed.visible![128]).toBeCloseTo(380/900, 6);
    expect(changed.visible![256]).toBeCloseTo(580/900, 6);
    expect(changed.visible!.every(v => v > 0)).toBe(true);
    expect(source.uv.every(v => v === 0)).toBe(true);
    expect(changed).not.toHaveProperty('radio');
  });

  it('clips reverse strokes at band boundaries and erases only visited samples', () => {
    const source = createDocument().materials[0].curves;
    const forward = editStroke(source, 'optical', {x: 0, value: .3}, {x: 1, value: .8}, 'draw');
    const reverse = editStroke(source, 'optical', {x: 1, value: .8}, {x: 0, value: .3}, 'draw');
    for(const band of ['uv','visible','infrared'] as const)
      reverse[band]!.forEach((value,i) => expect(value).toBeCloseTo(forward[band]![i], 12));
    const changed = editStroke(source, 'visible', {x: .25, value: 1}, {x: .75, value: 0}, 'erase');
    expect(Object.keys(changed)).toEqual(['visible']);
    expect(changed.visible!.slice(64,193).every(v => v === 0)).toBe(true);
    expect(changed.visible![63]).toBe(source.visible[63]);
    expect(changed.visible![193]).toBe(source.visible[193]);
  });
});
