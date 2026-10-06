import type { Vec3 } from '../domain/types';
import { validateVec3, xyzToLinearRgb } from './srgb';
// W3C CSS Color 4 section 19, D65 matrices and sign-preserving cube roots:
// https://www.w3.org/TR/css-color-4/#color-conversion-code
const multiply = (matrix: number[][], vector: Vec3): Vec3 => matrix.map(row =>
  row.reduce((sum, value, i) => sum + value * vector[i], 0)) as unknown as Vec3;
export function linearRgbToOklab(rgb: Vec3): Vec3 {
  validateVec3(rgb);
  const xyz = multiply([[506752 / 1228815, 87881 / 245763, 12673 / 70218],
    [87098 / 409605, 175762 / 245763, 12673 / 175545],
    [7918 / 409605, 87881 / 737289, 1001167 / 1053270]], rgb);
  const lms = multiply([[.819022437996703, .3619062600528904, -.1288737815209879],
    [.0329836539323885, .9292868615863434, .0361446663506424],
    [.0481771893596242, .2642395317527308, .6335478284694309]], xyz).map(Math.cbrt) as unknown as Vec3;
  return multiply([[.210454268309314, .7936177747023054, -.0040720430116193],
    [1.9779985324311684, -2.42859224204858, .450593709617411],
    [.0259040424655478, .7827717124575296, -.8086757549230774]], lms);
}
export function oklabToLinearRgb(lab: Vec3): Vec3 {
  validateVec3(lab);
  const lms = multiply([[1, .3963377773761749, .2158037573099136],
    [1, -.1055613458156586, -.0638541728258133],
    [1, -.0894841775298119, -1.2914855480194092]], lab).map(v => v ** 3) as unknown as Vec3;
  return xyzToLinearRgb(multiply([[1.2268798758459243, -.5578149944602171, .2813910456659647],
    [-.0405757452148008, 1.112286803280317, -.0717110580655164],
    [-.0763729366746601, -.4214933324022432, 1.5869240198367816]], lms));
}
/** Appearance interpolation preserves linear HDR/signed values until the display boundary. */
export function interpolateOklab(a: Vec3, b: Vec3, t: number): Vec3 {
  validateVec3(a); validateVec3(b);
  if (!Number.isFinite(t) || t < 0 || t > 1) throw Error('Interpolation position must be within 0–1');
  if (t === 0) return [...a]; if (t === 1) return [...b];
  const left = linearRgbToOklab(a), right = linearRgbToOklab(b);
  return oklabToLinearRgb(left.map((v, i) => v + t * (right[i] - v)) as unknown as Vec3);
}
