/* ==========================================================================
   units.js. Conversion and formatting at the UI boundary.

   The rule this file exists to enforce: formula modules never see a unit.
   They take canonical values, return canonical values, and know nothing
   about what the user has selected. Conversion happens twice only. When
   reading a field, and when writing a readout.

   That rule is what makes chaining safe. A value handed from one
   calculator to another can't carry a display unit with it, because the
   receiving calculator might be sitting in imperial while the sender was
   in metric. Everything that travels, travels canonical.

   Canonical units are automotive working units rather than strict SI, so
   we're never dealing in 0.0254 m:

     length mm · volume cc · mass kg · force N · pressure kPa
     torque Nm · stiffness N/mm · angle deg · speed rpm · velocity m/s
   ========================================================================== */

/* Factor to multiply BY to reach the canonical unit. Exact where the
   definition is exact. 25.4 mm/in and 0.45359237 kg/lb are definitions,
   not measurements, so they're written in full. */
const FACTORS = {
  // length -> mm
  'mm': 1, 'cm': 10, 'm': 1000, 'in': 25.4, 'ft': 304.8,
  // volume -> cc
  'cc': 1, 'L': 1000, 'ml': 1, 'cu in': 16.387064,
  // mass -> kg
  'kg': 1, 'g': 0.001, 'lb': 0.45359237, 'oz': 0.028349523125,
  // force -> N
  'N': 1, 'kN': 1000, 'lbf': 4.4482216152605,
  // pressure -> kPa
  'kPa': 1, 'MPa': 1000, 'bar': 100, 'psi': 6.894757293168361,
  // torque -> Nm
  'Nm': 1, 'lb-ft': 1.3558179483314004,
  // stiffness -> N/mm.  1 kgf/mm = 9.80665 N/mm exactly, since kgf is
  // defined from standard gravity.
  'N/mm': 1, 'lb/in': 0.1751268352, 'kg/mm': 9.80665,

  // pressure -> kPa
  kPa: 1, bar: 100, psi: 6.894757,
  // velocity -> m/s
  'm/s': 1, 'ft/min': 0.00508, 'ft/s': 0.3048,
  // acceleration -> m/s²
  'm/s²': 1, 'ft/s²': 0.3048,
  // passthrough
  'deg': 1, 'rpm': 1, '': 1,
};

export function toCanonical(value, unit) {
  const factor = FACTORS[unit];
  if (factor === undefined) throw new Error(`Unknown unit: ${unit}`);
  return value * factor;
}

export function fromCanonical(value, unit) {
  const factor = FACTORS[unit];
  if (factor === undefined) throw new Error(`Unknown unit: ${unit}`);
  return value / factor;
}

/* --- Formatting ----------------------------------------------------------
   Significant figures rather than fixed decimals, because these
   calculators span six orders of magnitude. 0.6 for a pad friction
   coefficient, 1,998 cc for a displacement. A fixed 2dp is wrong at both
   ends. Above 1000 we switch to thousands separators and drop the
   fraction, which is how a dyno sheet would print it.                    */

export function formatValue(value, { decimals, sig = 4, locale = 'en-NZ' } = {}) {
  if (!Number.isFinite(value)) return '—';

  let dp = decimals;
  if (dp === undefined) {
    const magnitude = Math.abs(value);
    if (magnitude === 0) dp = 0;
    else if (magnitude >= 1000) dp = 0;
    else dp = Math.max(0, sig - 1 - Math.floor(Math.log10(magnitude)));
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(value);
}

/* --- Switching the whole form --------------------------------------------
   Converts every editable field on unit change, discovered from the markup
   rather than a list in the calculator.

   This exists because the list approach failed exactly as you'd expect it
   to: `['bore', 'stroke', 'rodLength']` was correct when it was written,
   then compression height, deck height and gasket thickness were added as
   fields and nobody remembered the array. Those three kept their
   millimetre values and were then read as inches, so a 30mm compression
   height became 762mm and static compression ratio collapsed to 1.02:1.

   A field declares its quantity through the unit label already sitting
   beside it (`<span class="field__unit" data-unit="length">`), which the UI
   needs anyway. So a new field is converted correctly the moment it's
   labelled, and there is no second place to keep in sync.

   Read-only fields are skipped: they're outputs, rewritten from canonical
   values on the next render.
   ========================================================================== */

/* Keyed by the `data-unit` value on a field's unit label. Two mass entries,
   because a piston weighs grams and a corner weighs kilograms. Sharing one
   `mass` quantity converted the centre-of-gravity corner weights as though
   they were grams, turning 413 kg into 15 lb. A field's declared quantity
   has to name the actual unit pair, not just the dimension. */
const SWITCHABLE = {
  length:    { metric: 'mm', imperial: 'in', decimals: { mm: 2, in: 4 } },
  mass:      { metric: 'kg', imperial: 'lb', decimals: { kg: 1, lb: 1 } },
  massSmall: { metric: 'g',  imperial: 'oz', decimals: { g: 0, oz: 2 } },
};

/**
 * @param {'metric'|'imperial'} from
 * @param {'metric'|'imperial'} to
 * @param {ParentNode} [root]
 * @returns {number} how many fields were converted
 */
export function convertEditableFields(from, to, root = document) {
  if (from === to) return 0;
  let converted = 0;

  for (const [quantity, spec] of Object.entries(SWITCHABLE)) {
    const fromUnit = spec[from];
    const toUnit = spec[to];
    if (!fromUnit || !toUnit || fromUnit === toUnit) continue;

    for (const label of root.querySelectorAll(`[data-unit="${quantity}"]`)) {
      const input = label.closest('.field__control')?.querySelector('input:not([readonly])');
      if (!input || input.value === '') continue;

      const value = Number(input.value);
      if (!Number.isFinite(value)) continue;

      const next = fromCanonical(toCanonical(value, fromUnit), toUnit);
      input.value = String(Number(next.toFixed(spec.decimals[toUnit] ?? 3)));
      converted++;
    }
  }

  return converted;
}

/* --- Rate units ----------------------------------------------------------
   Spring and bar rates are bought in three different units and two of them
   are metric, so the choice can't ride on a metric/imperial switch and
   needs a control of its own.

   N/mm is the reference. It's what the physics is in, and what every
   formula module returns. It is also the one nobody orders parts in, so
   whichever unit is on screen, the other two are shown alongside it.
   Converting in your head is the step that puts the wrong spring in the car.

   1 kgf/mm = 9.80665 N/mm exactly, since kgf is defined from standard
   gravity rather than measured.
   ========================================================================== */

export const RATE_UNITS = ['N/mm', 'kg/mm', 'lb/in'];

/** The two rate units not currently selected, formatted for a caption. */
export function otherRateUnits(canonicalValue, selected) {
  return RATE_UNITS
    .filter((unit) => unit !== selected)
    .map((unit) => {
      const decimals = unit === 'lb/in' ? 0 : 2;
      return `${formatValue(fromCanonical(canonicalValue, unit), { decimals })} ${unit}`;
    })
    .join(' \u00B7 ');
}

/* --- Rate steps and field conversion ------------------------------------
   Springs and bars are bought in whole catalogue steps, not arbitrary
   decimals: half a kgf/mm, five N/mm, twenty-five lb/in. A what-if control
   that moves in those steps proposes a spring you can actually order, which
   an unrounded slider does not.
   ========================================================================== */

export const RATE_STEPS = { 'N/mm': 5, 'kg/mm': 0.5, 'lb/in': 25 };

/**
 * Convert the editable fields of one quantity between units of that
 * quantity. Rates were the first to need a control of their own; pressures
 * are the second, and the mechanism is the same, so it is written once.
 *
 * @param {string} quantity  the data-unit value, e.g. 'rate' or 'pressure'
 */
export function convertUnitFields(quantity, from, to, root = document) {
  if (from === to) return 0;
  let converted = 0;
  for (const label of root.querySelectorAll(`[data-unit="${quantity}"]`)) {
    const input = label.closest('.field__control')?.querySelector('input:not([readonly])');
    if (!input || input.value === '') continue;
    const value = Number(input.value);
    if (!Number.isFinite(value)) continue;
    const next = fromCanonical(toCanonical(value, from), to);
    input.value = String(Number(next.toFixed(to === 'lb/in' || to === 'kPa' ? 0 : 2)));
    converted++;
  }
  return converted;
}

export const PRESSURE_UNITS = ['kPa', 'bar', 'psi'];

/** The pressure units not currently selected, formatted for a caption. */
export function otherPressureUnits(canonicalValue, selected) {
  return PRESSURE_UNITS
    .filter((unit) => unit !== selected)
    .map((unit) => `${formatValue(fromCanonical(canonicalValue, unit), { decimals: unit === 'bar' ? 1 : 0 })} ${unit}`)
    .join(' \u00B7 ');
}

/** Rate fields specifically. A thin wrapper kept for the calculators using it. */
export function convertRateFields(from, to, root = document) {
  /* Fields declare themselves with data-unit="rate". The same name the
     calculators use to write their unit labels. Using one name for the
     label and another for the conversion is how a spring rate came to be
     converted from N/mm to kgf/mm while the label beside it still said
     N/mm. */
  if (from === to) return 0;
  let converted = 0;
  for (const label of root.querySelectorAll('[data-unit="rate"]')) {
    const input = label.closest('.field__control')?.querySelector('input:not([readonly])');
    if (!input || input.value === '') continue;
    const value = Number(input.value);
    if (!Number.isFinite(value)) continue;
    const next = fromCanonical(toCanonical(value, from), to);
    input.value = String(Number(next.toFixed(to === 'lb/in' ? 0 : 2)));
    converted++;
  }
  return converted;
}
