/* ==========================================================================
   3D printing filament guide.

   Source: HPA_3D_Printing_Material_Guide.xlsx, Thermoplastic Filament sheet.

   Pure module. No DOM, no imports beyond the dataset. Canonical units:
     strength, modulus   MPa
     impact strength     kJ/m²
     elongation          %
     temperatures        °C

   WHAT THIS IS FOR

   Not a calculation. A reference you compare across: nineteen filaments,
   each with published mechanical figures and the print settings that go
   with them. The question it answers is "which of these should I print
   this part in", and that is always a comparison rather than a sum.

   ON THE RATING BARS

   The source sheet carried a 0 to 1 rating beside each property, and those
   ratings did not follow one rule. Strength, stiffness and temperature were
   the value over a fixed divisor; ductility used a different divisor again,
   and was capped at the top end. One figure was simply wrong: PEKK scored
   full marks for ductility on 40% elongation while PA11 scored 0.38 on 30%.

   So the bars here are computed rather than copied, by one stated rule:
   each property is scaled against the highest value among all nineteen
   materials. That makes a bar mean the same thing in every row.

   The bars are scaled against the whole guide, never against the current
   selection. Otherwise comparing three mid-range materials would fill every
   bar and suggest they were all excellent, and the picture would change
   whenever a material was added or removed.

   Ductility is the exception and is scaled logarithmically. Elongation runs
   from 2% to 400%, a spread of two hundred to one; on a linear scale every
   rigid material sits within a pixel of zero and the bar tells you nothing
   about the difference between PLA and nylon.
   ========================================================================== */

import { MATERIALS } from './data.js';

export { MATERIALS };

/** The four headline properties, in the order they are shown. */
export const RATED = [
  { key: 'strength', label: 'Strength' },
  { key: 'stiffness', label: 'Stiffness' },
  { key: 'ductility', label: 'Ductility' },
  { key: 'heat', label: 'Heat resistance' },
];

/* The radar carries one more axis than the table's bars: how easy the
   material is to print.

   It has to be inverted first. Every other axis means "more is better", and
   the plot says so at the bottom: outer edge is best in the guide. Plotting
   difficulty outward would draw the hardest material as the biggest shape,
   which is exactly backwards, and a reader takes that in before any label.
   So the axis is ease, not difficulty.

   Five axes is still a shape rather than a score. The caution about radar
   plots is that enclosed area grows with the square of the values and with
   whatever order the axes sit in, so a reader who reads area is misled. At
   four or five, with a fixed order, the shape stays legible as a profile.
   Past about six it stops being one. */
export const RADAR_AXES = [...RATED, { key: 'ease', label: 'Easy to print' }];

export const FAMILIES = [
  'Standard', 'Engineering', 'Nylon', 'Carbon filled', 'Flexible', 'High performance',
];

/* The measured figures each rating is built from. Strength and stiffness
   average the tensile and bending numbers, because a printed part is loaded
   both ways and neither alone represents it. */
function measures(m) {
  const mean = (a, b) => (a != null && b != null ? (a + b) / 2 : (a ?? b));
  return {
    strength: mean(m.tensileStrength, m.bendingStrength),
    stiffness: mean(m.tensileModulus, m.bendingModulus),
    ductility: m.elongation,
    /* Heat resistance is the glass transition, not the deflection
       temperature. HDT looks like the better figure, since it is the
       temperature a loaded part stops holding its shape, but it is measured
       at two different loads and datasheets do not agree on which. The
       nylons here are quoted at 0.45 MPa and the high performance materials
       at 1.8 MPa, and a bar built on the mix ranks PA66 above PEEK, which
       nobody who has printed both would accept.

       Glass transition is one test, reported the same way for all nineteen,
       and it is the point at which any printed part starts losing stiffness.
       It reads true: PEI, then PEKK, then PC, then PEEK. HDT and melting
       point are still in the table underneath. */
    heat: m.glassTransition,
  };
}

const CEILING = (() => {
  const top = {};
  for (const key of RATED.map((r) => r.key)) {
    top[key] = Math.max(...MATERIALS.map((m) => measures(m)[key] ?? 0));
  }
  return top;
})();

/**
 * Ratings from 0 to 1 for one material, against the whole guide.
 * @returns {object} one entry per key in RATED
 */
export function ratings(material) {
  const v = measures(material);
  const out = {};
  // Ease is not a measured property, so it is added rather than scaled.
  if (material.drying !== undefined) {
    out.ease = ease(material);
    out.easeUndefined = false;
  }
  for (const { key } of RATED) {
    const value = v[key];
    if (value == null) { out[key] = undefined; out[key + 'Undefined'] = true; continue; }
    /* Surfaced as a flag as well, so a fixture can assert that a gap in the
       source stays a gap rather than silently becoming a zero. */
    out[key + 'Undefined'] = false;
    out[key] = key === 'ductility'
      // Log scale: 2% to 400% is two hundred to one, and a linear bar would
      // put every rigid material at zero.
      ? Math.log(value) / Math.log(CEILING[key])
      : value / CEILING[key];
  }
  return out;
}

/** The measured figures behind the bars, for the detail rows. */
export function figures(material) {
  return measures(material);
}

/**
 * Materials ordered by one property, best first. Anything without a figure
 * for that property sorts last rather than being dropped, so a gap in the
 * source never hides a material.
 */
export function rankedBy(key, pool = MATERIALS) {
  const score = (m) => measures(m)[key];
  return [...pool].sort((a, b) => {
    const x = score(a);
    const y = score(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x;
  });
}

/** Look up by name, for restoring a selection from a link. */
export function byName(name) {
  return MATERIALS.find((m) => m.name === name);
}

/**
 * How demanding a material is to print, from the settings the guide gives.
 * Not in the source: it is the question behind "can I print this on what I
 * have", which the settings answer between them but none states outright.
 */
export function difficulty(m) {
  let score = 0;
  const notes = [];
  if (m.drying === 'Required') { score += 2; notes.push('must be dried'); }
  if (m.enclosure === 'Required') { score += 3; notes.push('needs an enclosure'); }
  else if (m.enclosure === 'Recommended') { score += 1; notes.push('enclosure recommended'); }

  const nozzle = Number(String(m.nozzle).split('-').pop());
  if (nozzle >= 320) { score += 3; notes.push(`${nozzle}\u00B0C hotend`); }
  else if (nozzle >= 280) { score += 1; notes.push(`${nozzle}\u00B0C hotend`); }

  const bed = Number(String(m.bed).split('-').pop());
  if (bed >= 110) { score += 1; notes.push(`${bed}\u00B0C bed`); }

  if (m.family === 'Carbon filled') { score += 1; notes.push('abrasive, needs a hardened nozzle'); }

  const level = score >= 7 ? 'Specialist' : score >= 4 ? 'Demanding' : score >= 2 ? 'Manageable' : 'Easy';
  return { score, level, notes };
}

/* The hardest material in the guide, used to put ease on the same 0 to 1
   footing as the measured properties. Computed once from the data rather
   than hard-coded, so adding a more demanding filament rescales the axis
   instead of pushing a shape past the outer ring. */
const HARDEST = Math.max(...MATERIALS.map((m) => difficulty(m).score));

/**
 * How easy a material is to print, 0 to 1, where 1 is the easiest in the
 * guide. The inverse of the difficulty score, so that outward means better
 * on this axis as it does on every other.
 */
export function ease(material) {
  return 1 - difficulty(material).score / HARDEST;
}

/* The table is split in two.

   KEY_ROWS are what decides a choice: what the material is known for, what
   the printer needs to run it. They are always on screen.

   DETAIL_ROWS are the numbers behind the bars. They matter when you are
   checking a figure rather than choosing, so they sit behind a toggle. On a
   phone the full table was twenty-three rows deep and needed 248 pixels of
   sideways scrolling before the radar was even reached. */
export const KEY_ROWS = [
  { key: 'summary', label: 'Known for', kind: 'text' },
  { key: 'nozzle', label: 'Nozzle temperature', unit: '\u00B0C', kind: 'text' },
  { key: 'bed', label: 'Bed temperature', unit: '\u00B0C', kind: 'text' },
  { key: 'enclosure', label: 'Enclosure', kind: 'text' },
  { key: 'drying', label: 'Drying before use', kind: 'text' },
];

/** Everything else, behind a toggle. */
export const DETAIL_ROWS = [
  { key: 'family', label: 'Family', kind: 'text' },
  { key: 'tensileStrength', label: 'Tensile strength', unit: 'MPa' },
  { key: 'bendingStrength', label: 'Bending strength', unit: 'MPa' },
  { key: 'tensileModulus', label: 'Tensile modulus', unit: 'MPa' },
  { key: 'bendingModulus', label: 'Bending modulus', unit: 'MPa' },
  { key: 'impactStrength', label: 'Impact strength', unit: 'kJ/m\u00B2' },
  { key: 'elongation', label: 'Elongation at break', unit: '%' },
  { key: 'hdt', label: 'Heat deflection', unit: '\u00B0C' },
  { key: 'glassTransition', label: 'Glass transition', unit: '\u00B0C' },
  { key: 'meltingPoint', label: 'Melting point', unit: '\u00B0C' },
  { key: 'speed', label: 'Print speed', unit: 'mm/s', kind: 'text' },
  { key: 'fan', label: 'Part cooling fan', kind: 'text' },
  { key: 'desiccant', label: 'Store with desiccant', kind: 'text' },
];

/** Both sets, for anything that wants the whole list. */
export const ROWS = [...KEY_ROWS, ...DETAIL_ROWS];
