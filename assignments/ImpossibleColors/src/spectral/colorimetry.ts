import type { ColorimetryContext, ColorResult, PartialSpectrumSupport, SpectrumRecord, Vec3 } from '../domain/types';
import { deltaE00, xyzToLab } from '../color/difference';
import { validateVec3, xyzToLinearRgb } from '../color/srgb';
import { SPECTRAL_UNITS } from './illuminants';
import { cellIndex, samplePoint, supportBreaks, validateDense, validateGrid, validateSpectrum } from './resample';
function validateContext(context: ColorimetryContext): void {
    validateGrid(context.grid);
    const { startNm, stepNm, count } = context.grid;
    if (startNm !== 360 || (stepNm !== 1 && stepNm !== 5) || startNm + stepNm * (count - 1) !== 830)
        throw Error('Observer integration grid must cover 360–830 nm at 1 or 5 nm');
    for (const array of [context.observer.x, context.observer.y, context.observer.z])
        validateDense(array, count, v => Number.isFinite(v) && v >= 0, 'observer values');
    validateDense(context.observer.valid, count, v => typeof v === 'boolean', 'observer mask');
    if (!Number.isFinite(context.normalization) || context.normalization <= 0 || !Number.isFinite(context.referenceExposure) || context.referenceExposure < 0)
        throw Error('Invalid colorimetry normalization/exposure');
    validateVec3(context.adoptedWhite);
    if (context.adoptedWhite.some(v => v <= 0))
        throw Error('Invalid adopted white');
    if (context.comparison !== 'strict' && context.comparison !== 'creative')
        throw Error('Invalid comparison mode');
}
function validatePartial(source: SpectrumRecord, partial?: PartialSpectrumSupport): void {
    if (!partial)
        return;
    if (source.sampling !== 'cell-average' || partial.spectrumId !== source.id || partial.grid.startNm !== source.grid.startNm || partial.grid.stepNm !== source.grid.stepNm || partial.grid.count !== source.grid.count)
        throw Error('Partial support must match the cell-average spectrum ID and grid');
    const n = source.grid.count;
    for (const array of [partial.knownValues, partial.knownPreimageNm, partial.missingPreimageNm])
        validateDense(array, n, v => Number.isFinite(v) && v >= 0, 'partial contribution');
    validateDense(partial.unknownInfluence, n, v => typeof v === 'boolean', 'partial unknown influence');
    for (let i = 0; i < n; i++) {
        if (partial.unknownInfluence[i] !== !source.valid[i] || partial.unknownInfluence[i] !== (partial.missingPreimageNm[i] > 0))
            throw Error('Inconsistent partial coverage mask');
        if (source.valid[i] && partial.knownValues[i] !== source.values[i])
            throw Error('Partial contribution disagrees with complete spectrum value');
        if (partial.knownValues[i] > 0 && partial.knownPreimageNm[i] === 0)
            throw Error('Partial contribution has no known preimage');
    }
}
function validateUnits(source: SpectrumRecord): void {
    const units = source.kind === 'reflectance' ? SPECTRAL_UNITS.reflectance : source.kind === 'radiance' ? SPECTRAL_UNITS.radiance : source.kind === 'relative-radiance' ? SPECTRAL_UNITS.relativeRadiance : null;
    if (!units || source.units !== units)
        throw Error('Color integration requires reflectance or explicit per-nm radiance units');
}
function validateIlluminant(source: SpectrumRecord): void {
    validateSpectrum(source);
    if (source.kind !== 'illuminant' || ![SPECTRAL_UNITS.relativeIrradiance, SPECTRAL_UNITS.irradiance].some(unit => unit === source.units))
        throw Error('Illuminant requires explicit per-nm irradiance units');
}
interface IntervalSamples {
    values: [
        number,
        number,
        number
    ];
    complete: boolean;
}
function spectrumInterval(source: SpectrumRecord, a: number, b: number, partial?: PartialSpectrumSupport): IntervalSamples {
    const midpoint = (a + b) / 2;
    if (source.sampling === 'cell-average') {
        const index = cellIndex(source.grid, midpoint);
        if (index < 0)
            return { values: [0, 0, 0], complete: false };
        const value = source.valid[index] ? source.values[index] : (partial?.knownValues[index] ?? 0);
        return { values: [value, value, value], complete: source.valid[index] };
    }
    // The midpoint lies in one support segment because unavailable boundaries were inserted as knots.
    if (!samplePoint(source, midpoint).valid)
        return { values: [0, 0, 0], complete: false };
    const samples = [samplePoint(source, a), samplePoint(source, midpoint), samplePoint(source, b)];
    if (samples.some(s => !s.valid))
        return { values: [0, 0, 0], complete: false };
    return { values: samples.map(s => s.value) as [
            number,
            number,
            number
        ], complete: true };
}
function observerAt(context: ColorimetryContext, nm: number): {
    value: Vec3;
    valid: boolean;
} {
    const p = (nm - context.grid.startNm) / context.grid.stepNm;
    if (p < 0 || p > context.grid.count - 1)
        return { value: [0, 0, 0], valid: false };
    const left = Math.floor(p), fraction = p - left;
    const valid = context.observer.valid[left] && (fraction === 0 || context.observer.valid[left + 1]);
    if (!valid)
        return { value: [0, 0, 0], valid: false };
    const value = [context.observer.x, context.observer.y, context.observer.z].map(array => fraction === 0 ? array[left] : array[left] + fraction * (array[left + 1] - array[left])) as unknown as Vec3;
    return { value, valid: true };
}
function pointSupport(source: SpectrumRecord, nm: number): boolean {
    if (source.sampling === 'point')
        return samplePoint(source, nm).valid;
    const index = cellIndex(source.grid, nm);
    return index >= 0 && source.valid[index];
}
/**
 * Float64 CPU color integration. A blocked result retains supported-only numbers for diagnostics;
 * strict callers MUST check status before using them as a complete comparison color.
 * Numerical completeness is not source-manifest calibrated-color eligibility.
 */
export function integrateColor(source: SpectrumRecord, context: ColorimetryContext): ColorResult {
    validateSpectrum(source);
    validateUnits(source);
    validateContext(context);
    validatePartial(source, context.partial);
    const material = source.kind === 'reflectance';
    if (material)
        validateIlluminant(context.illuminant);
    // Resolve the reference operator BEFORE inserting material cell/support boundaries.
    // Its E*CMF endpoint products have the same trapezoidal white integral as k.
    // Refining a cell must subdivide this linear kernel, not multiply separately
    // interpolated E and CMF values and thereby change the white operator.
    const referenceKnots = new Set<number>(Array.from({ length: context.grid.count }, (_, i) => 360 + i * context.grid.stepNm));
    if (material)
        for (const value of supportBreaks(context.illuminant))
            if (value > 360 && value < 830)
                referenceKnots.add(value);
    const referenceWavelengths = [...referenceKnots].sort((a, b) => a - b);
    const kernels = referenceWavelengths.slice(0, -1).map((a, i) => {
        const b = referenceWavelengths[i + 1];
        const light = material ? spectrumInterval(context.illuminant, a, b) : { values: [1, 1, 1], complete: true };
        const left = observerAt(context, a), right = observerAt(context, b);
        return {
            a, b,
            left: left.value.map(v => v * light.values[0]),
            right: right.value.map(v => v * light.values[2]),
            complete: light.complete && left.valid && right.valid,
        };
    });
    const knots = new Set(referenceKnots);
    for (const value of supportBreaks(source))
        if (value > 360 && value < 830)
            knots.add(value);
    const wavelengths = [...knots].sort((a, b) => a - b);
    const total = [0, 0, 0];
    let incomplete = false, kernelIndex = 0;
    for (let i = 0; i < wavelengths.length - 1; i++) {
        const a = wavelengths[i], b = wavelengths[i + 1];
        while (kernelIndex + 1 < kernels.length && kernels[kernelIndex].b <= a)
            kernelIndex++;
        const kernel = kernels[kernelIndex];
        const signal = spectrumInterval(source, a, b, context.partial);
        if (!signal.complete || !kernel.complete)
            incomplete = true;
        if (!kernel.complete)
            continue;
        const leftFraction = (a - kernel.a) / (kernel.b - kernel.a);
        const rightFraction = (b - kernel.a) / (kernel.b - kernel.a);
        for (let channel = 0; channel < 3; channel++) {
            const difference = kernel.right[channel] - kernel.left[channel];
            const left = kernel.left[channel] + leftFraction * difference;
            const right = kernel.left[channel] + rightFraction * difference;
            // Point samples retain trapezoidal quadrature. For a constant cell density
            // this exactly integrates the clipped linear kernel. Radiance uses CMFs alone.
            total[channel] += (b - a) * (signal.values[0] * left + signal.values[2] * right) / 2;
        }
    }
    const observerSupport = Array.from({ length: context.grid.count }, (_, i) => {
        const nm = 360 + i * context.grid.stepNm;
        return context.observer.valid[i] && pointSupport(source, nm) && (!material || pointSupport(context.illuminant, nm));
    });
    incomplete ||= observerSupport.some(v => !v);
    const factor = material ? context.normalization : context.referenceExposure;
    const xyz = total.map(v => v * factor) as unknown as Vec3;
    validateVec3(xyz);
    const linearRgb = xyzToLinearRgb(xyz);
    validateVec3(linearRgb);
    const status = incomplete ? (context.comparison === 'strict' ? 'blocked' : 'partial') : 'complete';
    const diagnostics = incomplete ? ['Incomplete numerical observer support; supported contributions only; no missing-band renormalization'] : [];
    if (status === 'blocked')
        diagnostics.push('Strict comparison blocked; these diagnostic values are not a complete color');
    return { status, xyz, linearRgb, observerSupport, normalization: { factor: context.normalization, referenceExposure: context.referenceExposure }, diagnostics };
}
export interface QualifiedColorResult {
    result: ColorResult;
    path: 'reference' | 'fast';
    deltaE00: number | null;
}
/** Qualification is per source/context. Callers may cache by content + observer/engine versions. */
export function integrateColorQualified(source: SpectrumRecord, reference: ColorimetryContext): QualifiedColorResult {
    if (reference.grid.stepNm !== 1)
        throw Error('Fast-path qualification requires the 1 nm reference context');
    const exact = integrateColor(source, reference);
    if (exact.status !== 'complete')
        return { result: exact, path: 'reference', deltaE00: null };
    const take = (array: number[]) => array.filter((_, i) => i % 5 === 0);
    const fast: ColorimetryContext = { ...reference, grid: { startNm: 360, stepNm: 5, count: 95 }, observer: { id: reference.observer.id, x: take(reference.observer.x), y: take(reference.observer.y), z: take(reference.observer.z), valid: reference.observer.valid.filter((_, i) => i % 5 === 0) } };
    if (source.kind === 'reflectance') {
        // Keep relative material white normalization consistent on each quadrature grid.
        const denominator = (context: ColorimetryContext) => context.observer.y.reduce((sum, y, i) => sum + y * samplePoint(context.illuminant, 360 + i * context.grid.stepNm).value * context.grid.stepNm * (i === 0 || i === context.grid.count - 1 ? .5 : 1), 0);
        const fineY = denominator(reference), coarseY = denominator(fast);
        if (!(fineY > 0 && coarseY > 0))
            return { result: exact, path: 'reference', deltaE00: null };
        fast.normalization = reference.normalization * fineY / coarseY;
    }
    // Reference exposure and adopted white remain exactly the same, including radiance inputs.
    const candidate = integrateColor(source, fast);
    if (candidate.status !== 'complete')
        return { result: exact, path: 'reference', deltaE00: null };
    const difference = deltaE00(xyzToLab(exact.xyz, reference.adoptedWhite), xyzToLab(candidate.xyz, reference.adoptedWhite));
    if (!Number.isFinite(difference))
        return { result: exact, path: 'reference', deltaE00: null };
    return difference <= 1 ? { result: candidate, path: 'fast', deltaE00: difference } : { result: exact, path: 'reference', deltaE00: difference };
}
