import type { Origin, SpectralGrid, SpectrumRecord } from '../domain/types';
export const MAX_INTERPOLATION_GAP_NM = 10;
export function validateGrid(grid: SpectralGrid): void {
    if (!grid || !Number.isFinite(grid.startNm) || grid.startNm <= 0 || !Number.isFinite(grid.stepNm) || grid.stepNm <= 0 || !Number.isSafeInteger(grid.count) || grid.count < 2 || grid.count > 10000 || !Number.isFinite(grid.startNm + grid.stepNm * (grid.count - 1))) {
        throw Error('Invalid bounded spectral grid');
    }
}
export function validateDense<T>(values: T[], count: number, check: (value: T) => boolean, label: string): void {
    if (!Array.isArray(values) || values.length !== count)
        throw Error(`Invalid ${label} length`);
    for (let i = 0; i < count; i++) {
        if (!Object.hasOwn(values, i) || !check(values[i]))
            throw Error(`Invalid ${label} at ${i}`);
    }
}
export function validateSpectrum(source: SpectrumRecord): void {
    validateGrid(source.grid);
    const n = source.grid.count;
    if (source.sampling !== 'point' && source.sampling !== 'cell-average')
        throw Error('Invalid sampling semantics');
    validateDense(source.values, n, v => Number.isFinite(v) && v >= 0, 'spectrum values');
    validateDense(source.valid, n, v => typeof v === 'boolean', 'spectrum mask');
    validateDense(source.origin, n, v => ['measured', 'estimated', 'authored', 'missing'].includes(v), 'spectrum origin');
    for (let i = 0; i < n; i++) {
        if (!source.valid[i] && (source.values[i] !== 0 || source.origin[i] !== 'missing'))
            throw Error('Missing bands require zero placeholders and missing origin');
        if (source.valid[i] && source.origin[i] === 'missing')
            throw Error('Valid band cannot have missing origin');
        if (source.kind === 'reflectance' && source.valid[i] && source.values[i] > 1)
            throw Error('Reflectance outside [0,1]');
    }
}
export interface Sample {
    value: number;
    valid: boolean;
    origin: Origin;
}
const unavailable = (): Sample => ({ value: 0, valid: false, origin: 'missing' });
/** No extrapolation, epsilon expansion or interpolation across unavailable nodes. */
export function samplePoint(source: SpectrumRecord, nm: number): Sample {
    const { startNm, stepNm, count } = source.grid;
    const position = (nm - startNm) / stepNm;
    if (position < 0 || position > count - 1)
        return unavailable();
    const left = Math.floor(position), fraction = position - left;
    if (fraction === 0)
        return source.valid[left] ? { value: source.values[left], valid: true, origin: source.origin[left] } : unavailable();
    if (stepNm > MAX_INTERPOLATION_GAP_NM || !source.valid[left] || !source.valid[left + 1])
        return unavailable();
    const origins = [source.origin[left], source.origin[left + 1]];
    const origin: Origin = origins.includes('authored') ? 'authored' : origins.includes('estimated') ? 'estimated' : 'measured';
    return { value: source.values[left] + fraction * (source.values[left + 1] - source.values[left]), valid: true, origin };
}
/** Physical domain endpoints stay at first/last nodes; endpoint cells have half widths. */
export function cellEdges(grid: SpectralGrid): number[] {
    const edges = [grid.startNm];
    for (let i = 0; i < grid.count - 1; i++)
        edges.push(grid.startNm + (i + .5) * grid.stepNm);
    edges.push(grid.startNm + (grid.count - 1) * grid.stepNm);
    return edges;
}
export function cellIndex(grid: SpectralGrid, nm: number): number {
    const p = (nm - grid.startNm) / grid.stepNm;
    return p < 0 || p > grid.count - 1 ? -1 : Math.min(grid.count - 1, Math.floor(p + .5));
}
/** Knots that prevent numerical quadrature from crossing unknown support or a cell jump. */
export function supportBreaks(source: SpectrumRecord): number[] {
    if (source.sampling === 'cell-average')
        return cellEdges(source.grid);
    const { startNm, stepNm, count } = source.grid;
    const out = [startNm, startNm + (count - 1) * stepNm];
    for (let i = 0; i < count - 1; i++) {
        if (stepNm > MAX_INTERPOLATION_GAP_NM || !source.valid[i] || !source.valid[i + 1])
            out.push(startNm + i * stepNm, startNm + (i + 1) * stepNm);
    }
    return out;
}
export function resamplePointSpectrum(source: SpectrumRecord, grid: SpectralGrid): SpectrumRecord {
    validateSpectrum(source);
    validateGrid(grid);
    if (source.sampling !== 'point')
        throw Error('Resampling requires point data; cell averages need conservative transport');
    const samples = Array.from({ length: grid.count }, (_, i) => samplePoint(source, grid.startNm + i * grid.stepNm));
    return { ...source, grid: { ...grid }, values: samples.map(s => s.value), valid: samples.map(s => s.valid), origin: samples.map(s => s.origin), processing: [...source.processing, 'Linear point resampling; adjacent valid samples <=10 nm; native resolution unchanged'] };
}
