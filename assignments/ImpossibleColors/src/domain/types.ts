/** Application-owned contracts. JSON records carry ordinary finite arrays; runtime views may use typed arrays. */
export type Vec3 = readonly [
    number,
    number,
    number
];
export type Origin = 'measured' | 'estimated' | 'authored' | 'missing';
export type SpectrumKind = 'reflectance' | 'radiance' | 'relative-radiance' | 'illuminant' | 'excitation' | 'emission';
export type WavelengthUnits = 'nm' | 'um' | 'm';
export interface SpectralGrid {
    startNm: number;
    stepNm: number;
    count: number;
}
export interface SpectrumRecord {
    id: string;
    kind: SpectrumKind;
    /** Nodal native/resampled data versus finite-volume transported density. */
    sampling: 'point' | 'cell-average';
    grid: SpectralGrid;
    values: number[];
    valid: boolean[];
    origin: Origin[];
    units: string;
    sourceId: string;
    parentId?: string;
    processing: string[];
}
export interface SourceManifest {
    /** Stable source-record reference; sample and specimen identities are independent. */
    id: string;
    datasetId: string;
    upstreamVersion: string;
    sourceUrl: string;
    doi?: string;
    sampleId: string;
    specimenGroup: string;
    nativeWavelengthUnits: WavelengthUnits;
    nativeValueUnits: string;
    nativeCoverageNm: readonly [
        number,
        number
    ];
    opticalBandpass: {
        status: 'documented';
        units: WavelengthUnits;
        values: number[];
        sourceMember: string;
    } | {
        status: 'unavailable';
    };
    acquisition: {
        status: 'documented';
        geometry: string;
        conditions: string;
        date?: string;
    } | {
        status: 'unavailable';
    };
    processing: string[];
    checksum: {
        algorithm: 'sha256';
        value: string;
    };
    rights: {
        licenseId: string;
        licenseText: string;
        attribution: string;
    };
    eligibility: {
        preview: boolean;
        training: boolean;
        calibratedColor: boolean;
        reasons: string[];
    };
    archive?: {
        url: string;
        member: string;
        sha256: string;
    };
}
export interface RawSpectrum {
    id: string;
    kind: SpectrumKind;
    category: 'measured' | 'authored';
    wavelengths: number[];
    values: number[];
    valid?: boolean[];
    wavelengthUnits: WavelengthUnits;
    valueUnits: string;
    source: SourceManifest;
    contamination?: 'none' | 'fluorescence' | 'unknown';
    computedMixture?: boolean;
}
export interface AdmissionRejection {
    id: string;
    reasons: string[];
}
export type AdmissionResult = {
    status: 'admitted';
    record: SpectrumRecord;
    original: RawSpectrum;
    source: SourceManifest;
} | {
    status: 'rejected';
    id: string;
    reasons: string[];
};
export interface PreparedCorpus {
    bundle: Extract<AdmissionResult, {
        status: 'admitted';
    }>[];
    rejections: AdmissionRejection[];
    groups: Record<string, string[]>;
}
export interface TransformSpec {
    mode: 'identity' | 'window' | 'transpose' | 'fold' | 'hidden-overlay';
    sourceIntervalNm: readonly [
        number,
        number
    ];
    destinationIntervalNm: readonly [
        number,
        number
    ];
    octaves: number;
    hiddenGain: number;
    brightnessLock: boolean;
    transportVersion: string;
}
export interface PaletteEntry {
    /** Optional for older recipes; absent means no hint and eligible for explicit estimation. */
    input?: { materialHint: string | null; estimation: 'eligible' | 'manual' };
    /** Immutable source restored by reset; current spectrum may have a different id/parent. */
    originalSpectrum: SpectrumRecord;
    id: string;
    sourceLinearRgb: Vec3;
    spectrum: SpectrumRecord;
    transform: TransformSpec;
    fluorescence?: FluorescencePreset;
    locked: boolean;
    modelId?: string;
    basisId?: string;
}
export interface ViewConfig {
    exposureEv: number;
    toneMap: 'off' | 'reinhard';
    gamut: 'clip';
    outputSpace: 'srgb';
    comparison: 'before' | 'after' | 'split';
}
export type LampMaskSpec = { kind: 'full' } | { kind: 'region'; clusterIndex: number }
    | { kind: 'spotlight'; center: readonly [number, number]; radius: number; feather: number };
export interface LampSpec {
    enabled: boolean;
    centerNm: number;
    fwhmNm: number;
    intensity: number;
    maskRef?: string;
    spatialMask?: LampMaskSpec;
}
export interface GlowSettings {
    enabled: boolean;
    threshold: number;
    gain: number;
    radiusCssPx: number;
    quality: 'standard' | 'low';
}
export interface FluorescencePreset {
    id: string;
    version: string;
    excitation: SpectrumRecord;
    emission: SpectrumRecord;
    gain: number;
    origin: 'authored' | 'measured';
    conditions: string;
    source: SourceManifest;
}
export type GradientSpec = {
    mode: 'visible';
    interpolation: 'oklab';
} | {
    mode: 'spectral-sweep';
    sourceEntryId: string;
    parameter: 'octaves' | 'windowCenterNm' | 'hiddenGain';
    from: number;
    to: number;
    sampleCount: number;
    windowWidthNm?: number;
};
export type GradientStop = {
    id: string;
    position: number;
    entryId: string;
} | {
    id: string;
    position: number;
    sweepSample: number;
};
export interface RecipeV1 {
    /** Immutable extracted centers/order, portable without runtime pixel buffers. */
    imageSourcePalette?: SourcePalette;
    regionAssignments?: Record<string, string>;
    schemaVersion: 1;
    engineVersion: string;
    id: string;
    revision: number;
    observerId: string;
    baselineIlluminantId: string;
    transportIlluminantId: string;
    palette: PaletteEntry[];
    stops: GradientStop[];
    gradient: GradientSpec;
    view: ViewConfig;
    lamp: LampSpec;
    glow: GlowSettings;
    imageRef?: string;
    sources: SourceManifest[];
}
export interface SourcePalette {
    entryIds: string[];
    oklabCenters: Vec3[];
}
export interface SpatialMask {
    id: string;
    revision: number;
    width: number;
    height: number;
    weights: Float32Array;
}
export interface ImageMapping {
    sourcePalette: SourcePalette;
    width: number;
    height: number;
    revision: number;
    labels: Uint8Array;
    residuals: Float32Array;
    alpha: Float32Array;
    regionOverrides?: Uint8Array;
}
export interface ImageAsset {
    id: string;
    hash: string;
    width: number;
    height: number;
    orientation: number;
    colorProcessing: string[];
    sourceBytes: Readonly<Uint8Array>;
    bitmap: ImageBitmap;
}
export interface Capabilities {
    webgpu: boolean;
    floatTargets: boolean;
    renderer: 'cpu' | 'webgpu';
    mlBackend: 'cpu' | 'webgl' | 'webgpu' | 'unavailable';
    limits: {
        maxTextureDimension: number;
        maxPreviewPixels: number;
    };
}
export interface CaptureOptions {
    /** Runtime-only asynchronous export progress, from 0 through 1. */
    onProgress?: (fraction: number) => void;
    type: 'png';
    width: number;
    height: number;
    includeEffects: boolean;
    revision: number;
}
export interface ExportRequest {
    type: 'recipe' | 'css' | 'hex' | 'png';
    width: number;
    height: number;
    includeEffects: boolean;
    revision: number;
    includeSourceImage?: boolean;
}
export interface ImportLimits {
    maxBytes: number;
    maxPixels: number;
    previewLongEdge: number;
    sampleLongEdge: number;
}
export interface RenderPacket {
    lampMaskSpec?: LampMaskSpec;
    revision: number;
    linearPalette: Float32Array;
    emissionPalette: Float32Array;
    gradientLut: Float32Array;
    gradientEmissionLut: Float32Array;
    mapping?: ImageMapping;
    lampMask?: SpatialMask;
    view: ViewConfig;
    glow: GlowSettings;
}
export interface Renderer {
    mount(canvas: HTMLCanvasElement, caps: Capabilities): Promise<void>;
    update(packet: RenderPacket): void;
    resize(width: number, height: number, dpr: number): void;
    capture(options: CaptureOptions): Promise<Blob>;
    dispose(): void;
}
export interface PartialSpectrumSupport {
    spectrumId: string;
    grid: SpectralGrid;
    knownValues: number[];
    unknownInfluence: boolean[];
    knownPreimageNm: number[];
    missingPreimageNm: number[];
}
export interface ColorimetryContext {
    comparison: 'strict' | 'creative';
    partial?: PartialSpectrumSupport;
    observer: {
        id: string;
        x: number[];
        y: number[];
        z: number[];
        valid: boolean[];
    };
    illuminant: SpectrumRecord;
    grid: SpectralGrid;
    normalization: number;
    referenceExposure: number;
    adoptedWhite: Vec3;
}
export interface TransportContext {
    /** Output observer and fixed radiance exposure; required for radiance inputs. */
    colorimetry?: ColorimetryContext;
    /** Hidden-overlay baseline; defaults to the official D65 reference. */
    baselineColorimetry?: ColorimetryContext;
    illumination: SpectrumRecord;
    sourceKind: SpectrumKind;
    referenceY: number;
    destinationGrid: SpectralGrid;
    units: string;
    gain: number;
    missingSupport: 'strict' | 'partial';
}
export interface ColorResult {
    /** Numerical support only. Strict callers must not treat blocked values as a complete color. */
    status: 'complete' | 'partial' | 'blocked';
    xyz: Vec3;
    linearRgb: Vec3;
    observerSupport: boolean[];
    normalization: {
        factor: number;
        referenceExposure: number;
    };
    diagnostics: string[];
}
export interface Transport {
    /** Destination-major coefficients for cell-average sources only. */
    matrix: Float64Array;
    sourceGrid: SpectralGrid;
    destinationGrid: SpectralGrid;
    operationVersion: string;
    /** Exact source intervals per destination cell. Gate point segments before accumulation. */
    preimages: { destinationIndex: number; sourceStartNm: number; sourceEndNm: number }[];
}
export interface TransformResult {
    /** Authoritative engine color; hidden-overlay sums the exact baseline and hidden branch XYZ. */
    color: ColorResult;
    /** Known supported source energy before gains; unknown energy is not zero. */
    inputEnergy: number;
    /** Supported energy in the final finite-volume preview after gains/lock. */
    compositeEnergy: number;
    normalization: { referenceExposure: number; appliedGain: number; brightnessScale: number };
    /** For hidden-overlay this is a finite-volume composite preview, not exact color reconstruction. */
    partial?: PartialSpectrumSupport;
    spectrum: SpectrumRecord;
    retainedEnergy: number;
    discardedEnergy: number;
    coverage: boolean[];
    diagnostics: string[];
}
export interface EmissionResult {
    spectrum: SpectrumRecord;
    excitationResponse: number;
    units: string;
    origin: 'measured' | 'authored';
    sourceId: string;
}
export interface PaletteInput {
    revision: number;
    linearRgb: Vec3[];
    materialHints: (string | null)[];
    modelId: string;
    basisId: string;
}
export interface InferenceResult {
    revision: number;
    spectra: SpectrumRecord[];
    method: 'retrieval' | 'model';
    modelHash: string | null;
    basisHash: string | null;
    sources: SourceManifest[];
    support: { nearestDeltaE00: number; weak: boolean; population: 'measured-preview' | 'training' }[];
    alternatives: string[][];
    diagnostics: string[];
}
export interface AssetRegistry {
    masks?: ReadonlyMap<string, SpatialMask>;
    mappings?: ReadonlyMap<string, ImageMapping>;
    spectra: ReadonlyMap<string, SpectrumRecord>;
    images: ReadonlyMap<string, ImageAsset>;
    models: ReadonlyMap<string, Readonly<Uint8Array>>;
    bytes: ReadonlyMap<string, Readonly<Uint8Array>>;
}
export interface DerivedState {
    /** Stable entry identity; plot below remains a legacy selected-plot view. */
    entries?: Record<string, { entryId: string; color: ColorResult; transformedSpectrum?: SpectrumRecord; emissionLinearRgb?: Vec3 }>;
    packet: RenderPacket;
    plot: SpectrumRecord;
    diagnostics: string[];
    revision: number;
}
export type ImportResult = {
    status: 'valid';
    recipe: RecipeV1;
    unresolvedAssets: string[];
    notices: string[];
} | {
    status: 'invalid';
    errors: {
        path: string;
        message: string;
    }[];
};
export type RecipeCommand = {
    type: 'set-lock'; id: string; locked: boolean;
} | {
    type: 'reorder-swatches'; ids: string[];
} | {
    type: 'reset-spectrum'; id: string;
} | {
    type: 'set-view'; view: ViewConfig;
} | {
    type: 'set-input'; id: string; linearRgb?: Vec3; materialHint?: string | null;
    modelId?: string; basisId?: string; reestimate?: boolean;
} | {
    type: 'add-swatch';
    entry: PaletteEntry;
} | {
    type: 'remove-swatch' | 'select-swatch';
    id: string;
} | {
    type: 'set-source';
    id: string;
    spectrum: SpectrumRecord;
    /** Explicit material assignment may replace its input RGB atomically; inference omits this. */
    sourceLinearRgb?: Vec3;
    /** Register prediction lineage in the same validated transaction. */
    sources?: SourceManifest[];
} | {
    type: 'set-transform';
    id: string;
    transform: TransformSpec;
} | {
    type: 'set-fluorescence';
    id: string;
    /** Omission removes only the independently authored/measured fluorescence branch. */
    fluorescence?: FluorescencePreset;
} | {
    type: 'set-lamp';
    lamp: LampSpec;
} | {
    type: 'set-glow';
    glow: GlowSettings;
} | {
    type: 'edit-spectrum';
    id: string;
    spectrum: SpectrumRecord;
} | {
    type: 'set-stops';
    stops: GradientStop[];
    gradient: GradientSpec;
} | {
    type: 'replace-image';
    imageRef?: string;
    sourcePalette?: SourcePalette;
} | {
    type: 'set-region';
    regionId: string;
    /** Omission restores the original extracted image color. */
    entryId?: string;
} | {
    type: 'undo' | 'redo';
};
