import type { Vec3 } from '../domain/types';
export function validateVec3(values: Vec3): void {
    if (!Array.isArray(values) || values.length !== 3 || ![values[0], values[1], values[2]].every(Number.isFinite))
        throw Error('Expected three finite color channels');
}
/** Extended sign-reflected transfer functions, W3C CSS Color 4 section 19. */
export function decodeSrgb(rgb: Vec3): Vec3 {
    validateVec3(rgb);
    return rgb.map(v => Math.abs(v) <= .04045 ? v / 12.92 : Math.sign(v) * ((Math.abs(v) + .055) / 1.055) ** 2.4) as unknown as Vec3;
}
export function encodeSrgb(rgb: Vec3): Vec3 {
    validateVec3(rgb);
    return rgb.map(v => Math.abs(v) <= .0031308 ? 12.92 * v : Math.sign(v) * (1.055 * Math.abs(v) ** (1 / 2.4) - .055)) as unknown as Vec3;
}
/** XYZ is on a Y=1 scale; no clipping, tone mapping or chromatic adaptation. */
export function xyzToLinearRgb(xyz: Vec3): Vec3 {
    validateVec3(xyz);
    const [x, y, z] = xyz;
    return [12831 / 3959 * x - 329 / 214 * y - 1974 / 3959 * z, -851781 / 878810 * x + 1648619 / 878810 * y + 36519 / 878810 * z, 705 / 12673 * x - 2585 / 12673 * y + 705 / 667 * z];
}
