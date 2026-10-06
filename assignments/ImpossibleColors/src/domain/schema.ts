import type { RecipeV1, SourceManifest, SpectrumRecord } from './types';
/** Reject before copying: bounded JSON only, no getters, exotic objects or external asset URLs. */
function fail(path: string): never {
    throw Error(`Invalid recipe field: ${path}`);
}
function object(v: unknown, path: string, required: string[], optional: string[] = []): Record<string, any> {
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
        fail(path);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    const keys = Object.keys(descriptors);
    if (keys.some(k => !required.includes(k) && !optional.includes(k)) || required.some(k => !Object.hasOwn(v, k)) || keys.some(k => !Object.hasOwn(descriptors[k], 'value')))
        fail(path);
    return v as Record<string, any>;
}
function num(v: unknown, p: string, min = -1e9, max = 1e9, integer = false): number {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isSafeInteger(v)))
        fail(p);
    return v;
}
function str(v: unknown, p: string, max = 2048): string {
    if (typeof v !== 'string' || v.length < 1 || v.length > max)
        fail(p);
    return v;
}
function id(v: unknown, p: string): string {
    const s = str(v, p, 128);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(s))
        fail(p);
    return s;
}
function bool(v: unknown, p: string): void {
    if (typeof v !== 'boolean')
        fail(p);
}
function choice(v: unknown, p: string, choices: readonly unknown[]): void {
    if (!choices.includes(v))
        fail(p);
}
function array(v: unknown, p: string, min: number, max: number): any[] {
    if (!Array.isArray(v) || v.length < min || v.length > max)
        fail(p);
    for (let i = 0; i < v.length; i++)
        if (!Object.hasOwn(v, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v, String(i))!, 'value'))
            fail(p);
    return v;
}
function texts(v: unknown, p: string, max = 100): void {
    array(v, p, 0, max).forEach(x => str(x, p));
}
function pair(v: unknown, p: string, min: number, max: number, ordered = true): void {
    const a = array(v, p, 2, 2);
    a.forEach(x => num(x, p, min, max));
    if (ordered && a[1] <= a[0])
        fail(p);
}
function hash(v: unknown, p: string): void {
    if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v))
        fail(p);
}
export function validateSourceManifest(v: unknown): SourceManifest {
    const p = 'source';
    const s = object(v, p, ['id', 'datasetId', 'upstreamVersion', 'sourceUrl', 'sampleId', 'specimenGroup', 'nativeWavelengthUnits', 'nativeValueUnits', 'nativeCoverageNm', 'opticalBandpass', 'acquisition', 'processing', 'checksum', 'rights', 'eligibility'], ['doi', 'archive']);
    ['id', 'datasetId', 'upstreamVersion', 'sampleId', 'specimenGroup'].forEach(k => id(s[k], `${p}.${k}`));
    str(s.sourceUrl, p);
    if (!/^https:\/\//.test(s.sourceUrl) && !/^urn:impossible-colors:(?:authored|model):[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(s.sourceUrl))
        fail(p);
    if (s.doi !== undefined)
        str(s.doi, p);
    choice(s.nativeWavelengthUnits, p, ['nm', 'um', 'm']);
    str(s.nativeValueUnits, p, 128);
    pair(s.nativeCoverageNm, p, 0, 1e9);
    texts(s.processing, p);
    const b = s.opticalBandpass;
    if (b?.status === 'unavailable')
        object(b, p, ['status']);
    else {
        object(b, p, ['status', 'units', 'values', 'sourceMember']);
        choice(b.status, p, ['documented']);
        choice(b.units, p, ['nm', 'um', 'm']);
        array(b.values, p, 1, 100000).forEach(x => num(x, p, Number.MIN_VALUE, 1e9));
        str(b.sourceMember, p);
    }
    const a = s.acquisition;
    if (a?.status === 'unavailable')
        object(a, p, ['status']);
    else {
        object(a, p, ['status', 'geometry', 'conditions'], ['date']);
        choice(a.status, p, ['documented']);
        str(a.geometry, p);
        str(a.conditions, p);
        if (a.date !== undefined)
            str(a.date, p);
    }
    const c = object(s.checksum, p, ['algorithm', 'value']);
    choice(c.algorithm, p, ['sha256']);
    hash(c.value, p);
    const r = object(s.rights, p, ['licenseId', 'licenseText', 'attribution']);
    str(r.licenseId, p, 128);
    str(r.licenseText, p, 20000);
    str(r.attribution, p);
    const e = object(s.eligibility, p, ['preview', 'training', 'calibratedColor', 'reasons']);
    ['preview', 'training', 'calibratedColor'].forEach(k => bool(e[k], p));
    texts(e.reasons, p);
    if (a.status === 'unavailable' && (e.training || e.calibratedColor))
        fail('source.eligibility');
    if (s.archive !== undefined) {
        const x = object(s.archive, p, ['url', 'member', 'sha256']);
        str(x.url, p);
        if (!/^https:\/\//.test(x.url))
            fail(p);
        str(x.member, p);
        hash(x.sha256, p);
    }
    return structuredClone(s) as SourceManifest;
}
export function validateSpectrum(v: unknown): SpectrumRecord {
    const p = 'spectrum';
    const s = object(v, p, ['id', 'kind', 'sampling', 'grid', 'values', 'valid', 'origin', 'units', 'sourceId', 'processing'], ['parentId']);
    choice(s.sampling, p, ['point', 'cell-average']);
    id(s.id, p);
    id(s.sourceId, p);
    if (s.parentId !== undefined)
        id(s.parentId, p);
    choice(s.kind, p, ['reflectance', 'radiance', 'relative-radiance', 'illuminant', 'excitation', 'emission']);
    str(s.units, p, 128);
    texts(s.processing, p);
    const g = object(s.grid, p, ['startNm', 'stepNm', 'count']);
    num(g.startNm, p, 1, 100000);
    num(g.stepNm, p, Number.MIN_VALUE, 100000);
    const count = num(g.count, p, 1, 10000, true);
    num(g.startNm + g.stepNm * (count - 1), p, 1, 1e6);
    const values = array(s.values, p, count, count), valid = array(s.valid, p, count, count), origin = array(s.origin, p, count, count);
    values.forEach((x, i) => {
        num(x, p);
        bool(valid[i], p);
        choice(origin[i], p, ['measured', 'estimated', 'authored', 'missing']);
        if (!valid[i] && (x !== 0 || origin[i] !== 'missing'))
            fail(p);
        if (valid[i] && origin[i] === 'missing')
            fail(p);
        if (s.kind === 'reflectance' && valid[i])
            num(x, p, 0, 1);
    });
    return structuredClone(s) as SpectrumRecord;
}
function assertBoundedJson(input: unknown): void {
    let nodes = 0;
    const ancestors = new Set<object>();
    function walk(value: unknown, depth: number): void {
        if (++nodes > 200000 || depth > 32)
            fail('JSON allocation limit');
        if (value === null || typeof value === 'boolean' || typeof value === 'number')
            return;
        if (typeof value === 'string') {
            if (value.length > 20000)
                fail('string limit');
            return;
        }
        if (typeof value !== 'object')
            fail('non-JSON value');
        if (ancestors.has(value))
            fail('cyclic JSON');
        ancestors.add(value);
        const arrayValue = Array.isArray(value);
        if (!arrayValue && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
            fail('JSON prototype');
        const keys = Reflect.ownKeys(value);
        if (keys.some(k => typeof k !== 'string'))
            fail('JSON symbol');
        if (arrayValue && (value.length > 100000 || keys.some(k => k !== 'length' && !/^(0|[1-9][0-9]*)$/.test(k as string))))
            fail('JSON array');
        for (const key of keys) {
            if (arrayValue && key === 'length')
                continue;
            const d = Object.getOwnPropertyDescriptor(value, key)!;
            if (!Object.hasOwn(d, 'value') || !d.enumerable)
                fail('JSON property');
            walk(d.value, depth + 1);
        }
        ancestors.delete(value);
    }
    walk(input, 0);
}
export function validateRecipe(input: unknown): RecipeV1 {
    assertBoundedJson(input);
    const r = object(input, 'recipe', ['schemaVersion', 'engineVersion', 'id', 'revision', 'observerId', 'baselineIlluminantId', 'transportIlluminantId', 'palette', 'stops', 'gradient', 'view', 'lamp', 'glow', 'sources'], ['imageRef', 'regionAssignments', 'imageSourcePalette']);
    choice(r.schemaVersion, 'schemaVersion', [1]);
    ['engineVersion', 'id', 'observerId', 'baselineIlluminantId', 'transportIlluminantId'].forEach(k => id(r[k], k));
    num(r.revision, 'revision', 0, Number.MAX_SAFE_INTEGER, true);
    if (r.imageRef !== undefined)
        id(r.imageRef, 'imageRef');
    const sources = array(r.sources, 'sources', 0, 128);
    sources.forEach(validateSourceManifest);
    const sourceIds = new Set(sources.map(s => s.id));
    if (sourceIds.size !== sources.length)
        fail('sources duplicate record IDs');
    let totalBands = 0;
    const checkSpectrum = (s: unknown) => {
        const validated = validateSpectrum(s);
        totalBands += validated.grid.count;
        if (totalBands > 100000)
            fail('total spectral bands');
        if (!sourceIds.has(validated.sourceId))
            fail('spectrum.sourceId');
    };
    const entries = array(r.palette, 'palette', 2, 12), ids = new Set<string>();
    entries.forEach((e, i) => {
        const p = `palette.${i}`;
        object(e, p, ['id', 'sourceLinearRgb', 'spectrum', 'originalSpectrum', 'transform', 'locked'], ['fluorescence', 'modelId', 'basisId', 'input']);
        if (e.input !== undefined) {
            const input = object(e.input, `${p}.input`, ['materialHint', 'estimation']);
            if (input.materialHint !== null) id(input.materialHint, `${p}.input.materialHint`);
            choice(input.estimation, `${p}.input.estimation`, ['eligible', 'manual']);
        }
        id(e.id, p);
        if (ids.has(e.id))
            fail(p);
        ids.add(e.id);
        array(e.sourceLinearRgb, p, 3, 3).forEach(x => num(x, p, 0, 1));
        bool(e.locked, p);
        checkSpectrum(e.spectrum);
        checkSpectrum(e.originalSpectrum);
        ['modelId', 'basisId'].forEach(k => {
            if (e[k] !== undefined)
                id(e[k], p);
        });
        if ((e.modelId === undefined) !== (e.basisId === undefined))
            fail(p);
        const t = object(e.transform, p, ['mode', 'sourceIntervalNm', 'destinationIntervalNm', 'octaves', 'hiddenGain', 'brightnessLock', 'transportVersion']);
        choice(t.mode, p, ['identity', 'window', 'transpose', 'fold', 'hidden-overlay']);
        pair(t.sourceIntervalNm, p, 300, 1000);
        pair(t.destinationIntervalNm, p, 360, 830);
        num(t.octaves, p, -2, 2);
        num(t.hiddenGain, p, 0, 4);
        bool(t.brightnessLock, p);
        id(t.transportVersion, p);
        if (e.fluorescence !== undefined) {
            const f = object(e.fluorescence, p, ['id', 'version', 'excitation', 'emission', 'gain', 'origin', 'conditions', 'source']);
            id(f.id, p);
            id(f.version, p);
            checkSpectrum(f.excitation);
            checkSpectrum(f.emission);
            if (f.excitation.kind !== 'excitation' || f.emission.kind !== 'emission')
                fail(p);
            num(f.gain, p, 0, 100);
            choice(f.origin, p, ['authored', 'measured']);
            str(f.conditions, p);
            validateSourceManifest(f.source);
        }
    });
    if (r.imageSourcePalette !== undefined) {
        if (!r.imageRef) fail('imageSourcePalette.imageRef');
        const p = object(r.imageSourcePalette, 'imageSourcePalette', ['entryIds', 'oklabCenters']);
        const slots = array(p.entryIds, 'imageSourcePalette.entryIds', 2, 12);
        if (new Set(slots).size !== slots.length || slots.some(slot => !ids.has(slot))) fail('imageSourcePalette.entryIds');
        array(p.oklabCenters, 'imageSourcePalette.oklabCenters', slots.length, slots.length).forEach(center => {
            array(center, 'imageSourcePalette.center', 3, 3).forEach(value => num(value, 'imageSourcePalette.center', -2, 2));
        });
    }
    if (r.regionAssignments !== undefined) {
        const regions = r.regionAssignments;
        if (!regions || typeof regions !== 'object' || Array.isArray(regions) || ![Object.prototype, null].includes(Object.getPrototypeOf(regions))) fail('regionAssignments');
        const keys = Object.keys(regions);
        if (keys.length > 256) fail('regionAssignments');
        keys.forEach(key => {
            id(key, 'regionAssignments');
            if (!Object.hasOwn(Object.getOwnPropertyDescriptor(regions, key)!, 'value')) fail('regionAssignments');
            if (!ids.has(regions[key])) fail('regionAssignments.entryId');
            if (r.imageSourcePalette && !r.imageSourcePalette.entryIds.some((_: string, i: number) => key === `${r.imageRef}:region:${i}`)) fail('regionAssignments.regionId');
        });
    }
    const gradient = r.gradient;
    if (gradient?.mode === 'visible') {
        object(gradient, 'gradient', ['mode', 'interpolation']);
        choice(gradient.interpolation, 'gradient', ['oklab']);
    }
    else {
        object(gradient, 'gradient', ['mode', 'sourceEntryId', 'parameter', 'from', 'to', 'sampleCount'], ['windowWidthNm']);
        choice(gradient.mode, 'gradient', ['spectral-sweep']);
        if (!ids.has(gradient.sourceEntryId))
            fail('gradient.sourceEntryId');
        choice(gradient.parameter, 'gradient', ['octaves', 'windowCenterNm', 'hiddenGain']);
        const [lo, hi] = gradient.parameter === 'octaves' ? [-2, 2] : gradient.parameter === 'hiddenGain' ? [0, 4] : [300, 1000];
        num(gradient.from, 'gradient', lo, hi);
        num(gradient.to, 'gradient', lo, hi);
        num(gradient.sampleCount, 'gradient', 2, 16, true);
        if (gradient.parameter === 'windowCenterNm') {
            num(gradient.windowWidthNm, 'gradient', Number.MIN_VALUE, 700);
            if (Math.min(gradient.from, gradient.to) - gradient.windowWidthNm / 2 < 300 || Math.max(gradient.from, gradient.to) + gradient.windowWidthNm / 2 > 1000)
                fail('gradient.windowWidthNm');
        }
        else if (gradient.windowWidthNm !== undefined)
            fail('gradient.windowWidthNm');
    }
    const stopIds = new Set<string>();
    array(r.stops, 'stops', 2, 16).forEach((s, i) => {
        const p = 'stops';
        const isEntry = Object.hasOwn(s, 'entryId');
        object(s, p, ['id', 'position', isEntry ? 'entryId' : 'sweepSample']);
        id(s.id, p);
        if (stopIds.has(s.id))
            fail(p);
        stopIds.add(s.id);
        num(s.position, p, 0, 1);
        if (i && s.position <= r.stops[i - 1].position)
            fail(p);
        if (isEntry) {
            if (!ids.has(s.entryId))
                fail(p);
        }
        else {
            if (gradient.mode !== 'spectral-sweep')
                fail(p);
            num(s.sweepSample, p, 0, gradient.sampleCount - 1, true);
        }
    });
    const view = object(r.view, 'view', ['exposureEv', 'toneMap', 'gamut', 'outputSpace', 'comparison']);
    num(view.exposureEv, 'view', -20, 20);
    choice(view.toneMap, 'view', ['off', 'reinhard']);
    choice(view.gamut, 'view', ['clip']);
    choice(view.outputSpace, 'view', ['srgb']);
    choice(view.comparison, 'view', ['before', 'after', 'split']);
    const lamp = object(r.lamp, 'lamp', ['enabled', 'centerNm', 'fwhmNm', 'intensity'], ['maskRef', 'spatialMask']);
    bool(lamp.enabled, 'lamp');
    num(lamp.centerNm, 'lamp', 300, 1000);
    num(lamp.fwhmNm, 'lamp', Number.MIN_VALUE, 700);
    num(lamp.intensity, 'lamp', 0, 100);
    if (lamp.maskRef !== undefined)
        id(lamp.maskRef, 'lamp.maskRef');
    if (lamp.spatialMask !== undefined) {
        if (lamp.maskRef !== undefined) fail('lamp.spatialMask conflicts with maskRef');
        const mask = lamp.spatialMask, p = 'lamp.spatialMask';
        if (mask?.kind === 'full') object(mask, p, ['kind']);
        else if (mask?.kind === 'region') {
            object(mask, p, ['kind', 'clusterIndex']); num(mask.clusterIndex, p, 0, (r.imageSourcePalette?.entryIds.length ?? 12) - 1, true);
        } else {
            object(mask, p, ['kind', 'center', 'radius', 'feather']); choice(mask.kind, p, ['spotlight']);
            pair(mask.center, p, 0, 1, false); num(mask.radius, p, 0, 1); num(mask.feather, p, 0, 1);
        }
    }
    const glow = object(r.glow, 'glow', ['enabled', 'threshold', 'gain', 'radiusCssPx', 'quality']);
    bool(glow.enabled, 'glow');
    num(glow.threshold, 'glow', 0, 100);
    num(glow.gain, 'glow', 0, 100);
    num(glow.radiusCssPx, 'glow', 0, 256);
    choice(glow.quality, 'glow', ['standard', 'low']);
    return structuredClone(r) as RecipeV1;
}
