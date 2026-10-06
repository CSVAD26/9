import observerCsv from '../../data/cie/CIE_xyz_1931_2deg.csv?raw';
import d65Csv from '../../data/cie/CIE_std_illum_D65.csv?raw';
import type { ColorimetryContext, SpectrumRecord, Vec3 } from '../domain/types';
import { resamplePointSpectrum, validateSpectrum, samplePoint } from './resample';
/** D65 display white, fixed across source illumination; no automatic chromatic adaptation. */
export const D65_DISPLAY_WHITE: Vec3 = Object.freeze([3127 / 3290, 1, 3583 / 3290]);
export const SPECTRAL_UNITS = Object.freeze({ reflectance: 'dimensionless', relativeIrradiance: 'relative nm^-1', irradiance: 'W m^-2 nm^-1', relativeRadiance: 'relative nm^-1 sr^-1', radiance: 'W m^-2 sr^-1 nm^-1' });
function parseCsv(text: string, start: number, count: number, columns: number): number[][] {
    const rows = text.trim().split(/\r?\n/).map(line => line.split(',').map(Number));
    if (rows.length !== count || rows.some((row, i) => row.length !== columns || row[0] !== start + i || row.some(v => !Number.isFinite(v) || v < 0)))
        throw Error('Invalid bundled official CIE table');
    return rows;
}
// Private immutable source data only; every context receives its own resolved arrays.
const observerRows = parseCsv(observerCsv, 360, 471, 4);
const d65Rows = parseCsv(d65Csv, 300, 531, 2);
export interface ContextOptions {
    stepNm?: 1 | 5;
    illuminant?: SpectrumRecord;
    comparison?: 'strict' | 'creative';
    /** Explicit relative or calibrated radiance exposure. Defaults to pi*k for this illuminant. */
    referenceExposure?: number;
}
export function makeD65Illuminant(): SpectrumRecord {
    return { id: 'cie-d65-1nm', kind: 'illuminant', sampling: 'point', grid: { startNm: 300, stepNm: 1, count: 531 }, values: d65Rows.map(row => row[1]), valid: Array(531).fill(true), origin: Array(531).fill('authored'), units: SPECTRAL_UNITS.relativeIrradiance, sourceId: 'cie:std-illuminant-d65', processing: ['Official tabulation, unmodified values; relative spectral density; no extension beyond 830 nm'] };
}
export function makeEqualEnergyIlluminant(): SpectrumRecord {
    let visibleY = 0;
    observerRows.forEach((row, i) => { visibleY += row[2] * (i === 0 || i === 470 ? .5 : 1); });
    return { id: 'authored-equal-energy-300-1000-v1', kind: 'illuminant', sampling: 'point', grid: { startNm: 300, stepNm: 5, count: 141 }, values: Array(141).fill(1 / visibleY), valid: Array(141).fill(true), origin: Array(141).fill('authored'), units: SPECTRAL_UNITS.relativeIrradiance, sourceId: 'authored:equal-energy-v1', processing: ['Authored constant per-nm source over 300–1000 nm; normalized by 1 nm CIE visible Y; not an extension of D65'] };
}
export function createColorimetryContext(options: ContextOptions = {}): ColorimetryContext {
    const step = options.stepNm ?? 1;
    if (step !== 1 && step !== 5)
        throw Error('Colorimetry grid must be 1 or 5 nm');
    const illuminant = structuredClone(options.illuminant ?? makeD65Illuminant());
    validateSpectrum(illuminant);
    if (illuminant.kind !== 'illuminant' || illuminant.sampling !== 'point' || ![SPECTRAL_UNITS.relativeIrradiance, SPECTRAL_UNITS.irradiance].some(unit => unit === illuminant.units))
        throw Error('Context normalization requires point irradiance with explicit units');
    // Never normalize a partly supplied illuminant; inspect native support, including gaps between grid nodes.
    if (!samplePoint(illuminant, 360).valid || !samplePoint(illuminant, 830).valid)
        throw Error('Illuminant has incomplete observer support');
    for (let i = 0; i < illuminant.grid.count - 1; i++) {
        const a = illuminant.grid.startNm + i * illuminant.grid.stepNm, b = a + illuminant.grid.stepNm;
        if (a < 830 && b > 360 && (!illuminant.valid[i] || !illuminant.valid[i + 1] || illuminant.grid.stepNm > 10))
            throw Error('Illuminant has incomplete observer support');
    }
    const grid = { startNm: 360, stepNm: step, count: 470 / step + 1 };
    const sampled = resamplePointSpectrum(illuminant, grid);
    const rows = observerRows.filter((_, i) => i % step === 0);
    let denominator = 0;
    rows.forEach((row, i) => { denominator += sampled.values[i] * row[2] * step * (i === 0 || i === rows.length - 1 ? .5 : 1); });
    if (!Number.isFinite(denominator) || denominator <= 0)
        throw Error('Illuminant normalization requires positive visible Y');
    const normalization = 1 / denominator;
    const referenceExposure = options.referenceExposure ?? Math.PI * normalization;
    if (!Number.isFinite(referenceExposure) || referenceExposure < 0)
        throw Error('Invalid reference exposure');
    const comparison = options.comparison ?? 'strict';
    if (comparison !== 'strict' && comparison !== 'creative')
        throw Error('Invalid comparison mode');
    return { comparison, observer: { id: 'cie-1931-2deg-1nm', x: rows.map(r => r[1]), y: rows.map(r => r[2]), z: rows.map(r => r[3]), valid: rows.map(() => true) }, illuminant, grid, normalization, referenceExposure, adoptedWhite: [...D65_DISPLAY_WHITE] };
}
