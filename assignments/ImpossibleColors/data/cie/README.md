# CIE reference data

The two CSVs preserve the official bytes and SHA-256 values in `provenance.json`.
The runtime imports these local files as text; it makes no network requests.
The 1 nm reference uses original rows. Selecting every fifth original observer
row provides the separate 5 nm path. Neither interpolation nor resampling is a
claim of improved measurement resolution.

The CIE tables and their derived data carry the notice in
`../notices/cie-colorimetry.txt` (also distributed in `public/notices`).
Their CC BY-SA 4.0 license is distinct from the application's code license.

The numerical engine supports two explicit representations: native/resampled
point values and finite-volume cell averages. Colorimetry receives an explicit
context, with a fixed adopted display white and reference exposure. See the
JSDoc for `integrateColor`: numerical support status does not confer calibrated
source eligibility. A strict `blocked` result contains supported-only values
for diagnostics; callers must check status before displaying a complete color.

Independent D65 fixtures were computed directly from original CSV rows using a
separate Python trapezoidal sum. CIEDE2000 test pairs are from Sharma, Wu and
Dalal (2005), https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/ . The
implementation uses their equations, not their MATLAB or spreadsheet software.
