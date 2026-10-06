import type { Vec3, ViewConfig } from '../domain/types';
import { encodeSrgb, validateVec3 } from './srgb';
/** Linear display appearance before clipping: exposure, then optional luminance Reinhard. */
export function mapDisplayLinearRgb(rgb: Vec3, view: ViewConfig): Vec3 {
    validateVec3(rgb);
    const exposure = 2 ** view.exposureEv;
    if (!Number.isFinite(view.exposureEv) || !Number.isFinite(exposure) || exposure <= 0 || !['off', 'reinhard'].includes(view.toneMap) || view.gamut !== 'clip' || view.outputSpace !== 'srgb')
        throw Error('Invalid display mapping');
    const exposed = rgb.map(v => v * exposure);
    if (!exposed.every(Number.isFinite)) throw Error('Display exposure overflow');
    const luminance = .2126 * exposed[0] + .7152 * exposed[1] + .0722 * exposed[2];
    const divisor = view.toneMap === 'reinhard' && luminance > 0 ? 1 + luminance : 1;
    return exposed.map(v => v / divisor) as unknown as Vec3;
}

export function mapDisplayRgb(rgb: Vec3, view: ViewConfig): Vec3 {
    const mapped = mapDisplayLinearRgb(rgb, view).map(v => Math.max(0, Math.min(1, v))) as unknown as Vec3;
    return encodeSrgb(mapped);
}
