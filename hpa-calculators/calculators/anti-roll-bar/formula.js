/* ==========================================================================
   Anti-roll bar stiffness.

   Source: Anti-Roll_Bar_Stiffness_Calculator_Grid_is.xlsx, "ARB Stiffness"

   A U-shaped bar is two lever arms in bending, in series with the torsion
   bar itself. Compliances add, so the softest element dominates, which is
   the practical point of the whole calculation.

   Pure module. No DOM, no imports. Canonical units:
     lengths     mm
     stiffness   N/mm

   THREE CORRECTIONS TO THE SPREADSHEET, all documented in the working panel.

   1. Tube inner diameter. The sheet used `ID = OD - wall`, but a wall sits
      on both sides of a bore: `ID = OD - 2 x wall`. Because section
      modulus goes as diameter to the fourth power, that single missing
      factor of two understated total stiffness by about 40%. The sheet
      returns 9.20 N/mm for its own default bar where the answer is 15.26.
      This is the largest error found in any of the source sheets.

   2. Swapped material selectors. The torsion bar's material dropdown drove
      the lever arm's Young's modulus, and the lever arm's dropdown drove
      the bar's shear modulus. Invisible while both were set to Steel.

   3. Adjustment positions were collected and never used. The whole point of
      an adjustable bar is knowing what each hole gives you, so stiffness is
      now reported per position.
   ========================================================================== */

/* Moduli in Pa. Worth knowing that chromoly is barely stiffer than mild
   steel. It is stronger, not stiffer, and swapping material changes bar
   rate by under 3%. People expect much more. */
export const MATERIALS = {
  steel:    { label: 'Steel',    youngs: 200e9, shear: 78e9 },
  chromoly: { label: 'Chromoly', youngs: 205e9, shear: 80e9 },
};

/** Bore of a tube from its outside diameter and wall. Zero wall means solid. */
function innerDiameter(outerDiameter, wallThickness) {
  if (!(wallThickness > 0)) return 0;
  if (wallThickness * 2 >= outerDiameter) {
    throw new Error('Wall thickness is at least half the outside diameter, so the tube has no bore. Enter zero for a solid bar.');
  }
  return outerDiameter - 2 * wallThickness;
}

/**
 * Vertical stiffness at the tip of one lever arm, treated as a cantilever
 * in bending: k = 3EI / L³.
 */
export function armStiffness({ length, outerDiameter, wallThickness, material }) {
  const mat = MATERIALS[material];
  if (!mat) throw new Error('Choose a lever arm material.');
  if (!(length > 0)) throw new Error('Lever arm length must be greater than zero.');
  if (!(outerDiameter > 0)) throw new Error('Lever arm diameter must be greater than zero.');

  const d1 = outerDiameter / 1000;                                  // m
  const d2 = innerDiameter(outerDiameter, wallThickness) / 1000;
  const L = length / 1000;

  const second = (Math.PI * (d1 ** 4 - d2 ** 4)) / 64;              // I, m⁴
  return {
    stiffness: (3 * mat.youngs * second) / L ** 3 / 1000,           // N/mm
    secondMoment: second,
    innerDiameter: d2 * 1000,
  };
}

/**
 * Vertical stiffness at the arm tip from twisting the bar:
 * k = G·J / (r²·L), where r is the arm length and L the bar length.
 */
export function barStiffness({ length, outerDiameter, wallThickness, armLength, material }) {
  const mat = MATERIALS[material];
  if (!mat) throw new Error('Choose a torsion bar material.');
  if (!(length > 0)) throw new Error('Torsion bar length must be greater than zero.');
  if (!(outerDiameter > 0)) throw new Error('Torsion bar diameter must be greater than zero.');
  if (!(armLength > 0)) throw new Error('Lever arm length must be greater than zero.');

  const d1 = outerDiameter / 1000;
  const d2 = innerDiameter(outerDiameter, wallThickness) / 1000;
  const L = length / 1000;
  const r = armLength / 1000;

  const polar = (Math.PI * (d1 ** 4 - d2 ** 4)) / 32;               // J, m⁴
  return {
    stiffness: (mat.shear * polar) / (r * r * L) / 1000,            // N/mm
    polarMoment: polar,
    innerDiameter: d2 * 1000,
  };
}

/**
 * @param {object} input
 * @param {number} input.barLength        mm
 * @param {number} input.barDiameter      mm, outside
 * @param {number} input.barWall          mm, 0 for solid
 * @param {string} input.barMaterial      key of MATERIALS
 * @param {number} input.armLength        mm, effective, pivot to link
 * @param {number} input.armDiameter      mm, outside
 * @param {number} input.armWall          mm, 0 for solid
 * @param {string} input.armMaterial      key of MATERIALS
 * @param {number} [input.adjustSpacing]  mm between adjustment holes
 * @param {number} [input.adjustPositions] how many holes
 */
export function antiRollBar(input) {
  const arm = armStiffness({
    length: input.armLength,
    outerDiameter: input.armDiameter,
    wallThickness: input.armWall,
    material: input.armMaterial,
  });

  const bar = barStiffness({
    length: input.barLength,
    outerDiameter: input.barDiameter,
    wallThickness: input.barWall,
    armLength: input.armLength,
    material: input.barMaterial,
  });

  /* Two arms in series with the bar, so compliances add. Kept as compliances
     rather than summing stiffnesses, because the share of total compliance is
     what tells you which part is worth changing. */
  const armCompliance = 2 / arm.stiffness;
  const barCompliance = 1 / bar.stiffness;
  const totalCompliance = armCompliance + barCompliance;
  const stiffness = 1 / totalCompliance;

  /* How much the answer moves for 1mm more bar outside diameter. Section
     goes as the fourth power, so this is always a big number and is the
     reason bar OD must be measured rather than assumed. */
  const thicker = barStiffness({
    length: input.barLength,
    outerDiameter: input.barDiameter + 1,
    wallThickness: input.barWall,
    armLength: input.armLength,
    material: input.barMaterial,
  });
  const perMm = 1 / (armCompliance + 1 / thicker.stiffness) - stiffness;

  /* Stiffness at each adjustment hole. Holes shorten the effective arm, so
     each step inboard is stiffer. Both terms improve, the arm as 1/L³ and
     the bar as 1/r². The sheet collected spacing and positions but never
     used them, and its own table added length to a figure it labelled
     "max"; moving inboard from the longest setting is the physical reading. */
  const positions = [];
  const count = Number.isFinite(input.adjustPositions) ? Math.floor(input.adjustPositions) : 0;
  const spacing = Number.isFinite(input.adjustSpacing) ? input.adjustSpacing : 0;
  if (count > 0 && spacing > 0) {
    for (let i = 0; i < count; i++) {
      const length = input.armLength - i * spacing;
      if (!(length > 0)) break;
      const a = armStiffness({
        length, outerDiameter: input.armDiameter,
        wallThickness: input.armWall, material: input.armMaterial,
      });
      const b = barStiffness({
        length: input.barLength, outerDiameter: input.barDiameter,
        wallThickness: input.barWall, armLength: length, material: input.barMaterial,
      });
      positions.push({
        index: i,
        armLength: length,
        stiffness: 1 / (2 / a.stiffness + 1 / b.stiffness),
      });
    }
  }

  return {
    stiffness,
    armStiffness: arm.stiffness,
    barStiffness: bar.stiffness,
    armInnerDiameter: arm.innerDiameter,
    barInnerDiameter: bar.innerDiameter,
    barComplianceShare: barCompliance / totalCompliance,
    armComplianceShare: armCompliance / totalCompliance,
    stiffnessPerMmDiameter: perMm,
    positions,
  };
}

export function explain(input, r, fmt) {
  const dominant = r.barComplianceShare >= r.armComplianceShare ? 'torsion bar' : 'lever arms';
  const steps = [
    {
      label: 'Tube bores',
      expr: 'ID = OD - 2 x wall',
      values: `bar: ${fmt(input.barDiameter)} - 2 x ${fmt(input.barWall)} = ${fmt(r.barInnerDiameter)} mm`,
      result: `arms: ${fmt(r.armInnerDiameter)} mm`,
      note: 'A wall sits on both sides of a bore, so it comes off the diameter twice. Section goes as diameter to the fourth power, which makes this worth getting exactly right.',
    },
    {
      label: 'One lever arm, bending as a cantilever',
      expr: 'kArm = 3 E I / L³,  I = pi (d1⁴ - d2⁴) / 64',
      values: `L = ${fmt(input.armLength)} mm, d1 = ${fmt(input.armDiameter)} mm`,
      result: `${fmt(r.armStiffness)} N/mm`,
    },
    {
      label: 'Torsion bar, twisting',
      expr: 'kBar = G J / (r² L),  J = pi (d1⁴ - d2⁴) / 32',
      values: `L = ${fmt(input.barLength)} mm, r = ${fmt(input.armLength)} mm, d1 = ${fmt(input.barDiameter)} mm`,
      result: `${fmt(r.barStiffness)} N/mm`,
      note: 'r is the lever arm length: the arm sets how much twist a given wheel movement puts into the bar, so it appears here as well as in its own bending term.',
    },
    {
      label: 'Two arms in series with the bar',
      expr: '1/kTotal = 1/kArm + 1/kArm + 1/kBar',
      values: `1/${fmt(r.armStiffness)} + 1/${fmt(r.armStiffness)} + 1/${fmt(r.barStiffness)}`,
      result: `${fmt(r.stiffness)} N/mm`,
      note: `Compliances add, so the softest part governs. Here the ${dominant} accounts for ${fmt(Math.max(r.barComplianceShare, r.armComplianceShare) * 100)}% of the total give. Stiffening anything else will barely move the result.`,
    },
    {
      label: 'Sensitivity to bar diameter',
      expr: 'section goes as d⁴, so stiffness climbs steeply with OD',
      values: `${fmt(input.barDiameter)} mm to ${fmt(input.barDiameter + 1)} mm`,
      result: `${fmt(r.stiffnessPerMmDiameter)} N/mm per mm`,
      note: 'Measure the bar rather than trusting a catalogue figure. One millimetre of diameter is worth more than a change of material.',
    },
  ];

  if (r.positions.length > 1) {
    const soft = r.positions[0];
    const hard = r.positions[r.positions.length - 1];
    steps.push({
      label: 'Adjustment range',
      expr: 'each hole inboard shortens the arm: kArm as 1/L³, kBar as 1/r²',
      values: `${fmt(soft.armLength)} mm to ${fmt(hard.armLength)} mm of effective arm`,
      result: `${fmt(soft.stiffness)} to ${fmt(hard.stiffness)} N/mm`,
      note: 'Each hole inboard shortens the effective arm, which stiffens the bar twice over. The arm gets stiffer in bending and puts more twist into the bar for the same wheel travel.',
    });
  }

  return steps;
}
