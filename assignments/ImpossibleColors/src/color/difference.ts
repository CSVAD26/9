import type { Vec3 } from '../domain/types';
import { validateVec3 } from './srgb';
export function xyzToLab(xyz: Vec3, white: Vec3): Vec3 {
    validateVec3(xyz);
    validateVec3(white);
    if (white.some(v => v <= 0))
        throw Error('Lab requires a positive reference white');
    const f = (t: number) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
    const [x, y, z] = xyz.map((v, i) => f(v / white[i]));
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const degrees = (r: number) => r * 180 / Math.PI;
const radians = (d: number) => d * Math.PI / 180;
const cos = (d: number) => Math.cos(radians(d));
const sin = (d: number) => Math.sin(radians(d));
const hue = (a: number, b: number) => a === 0 && b === 0 ? 0 : (degrees(Math.atan2(b, a)) + 360) % 360;
/** CIEDE2000, kL=kC=kH=1; equations independently implemented from Sharma/Wu/Dalal (2005). */
export function deltaE00(first: Vec3, second: Vec3): number {
    validateVec3(first);
    validateVec3(second);
    const [l1, a1, b1] = first, [l2, a2, b2] = second;
    const cMean = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
    const seventh = cMean ** 7;
    const g = .5 * (1 - Math.sqrt(seventh / (seventh + 25 ** 7)));
    const ap1 = (1 + g) * a1, ap2 = (1 + g) * a2;
    const cp1 = Math.hypot(ap1, b1), cp2 = Math.hypot(ap2, b2);
    const hp1 = hue(ap1, b1), hp2 = hue(ap2, b2);
    const dl = l2 - l1, dc = cp2 - cp1;
    let dh = hp2 - hp1;
    if (cp1 * cp2 === 0)
        dh = 0;
    else if (dh > 180)
        dh -= 360;
    else if (dh < -180)
        dh += 360;
    const dH = 2 * Math.sqrt(cp1 * cp2) * sin(dh / 2);
    const lMean = (l1 + l2) / 2, cPrimeMean = (cp1 + cp2) / 2;
    let hMean = (hp1 + hp2) / 2;
    if (cp1 * cp2 === 0)
        hMean = hp1 + hp2;
    else if (Math.abs(hp1 - hp2) > 180)
        hMean += (hp1 + hp2 < 360 ? 180 : -180);
    const t = 1 - .17 * cos(hMean - 30) + .24 * cos(2 * hMean) + .32 * cos(3 * hMean + 6) - .20 * cos(4 * hMean - 63);
    const sl = 1 + .015 * (lMean - 50) ** 2 / Math.sqrt(20 + (lMean - 50) ** 2);
    const sc = 1 + .045 * cPrimeMean, sh = 1 + .015 * cPrimeMean * t;
    const angle = 30 * Math.exp(-(((hMean - 275) / 25) ** 2));
    const cp7 = cPrimeMean ** 7;
    const rt = -2 * Math.sqrt(cp7 / (cp7 + 25 ** 7)) * sin(2 * angle);
    const ll = dl / sl, cc = dc / sc, hh = dH / sh;
    return Math.sqrt(Math.max(0, ll * ll + cc * cc + hh * hh + rt * cc * hh));
}
