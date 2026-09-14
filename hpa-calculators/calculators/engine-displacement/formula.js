/* ==========================================================================
   Engine displacement.

   Source: Engine_Calculators_-_Grid.xlsx, "Displacement Calculator"
   Original: D12 = (((((D8/2)^2)*(3.14159))*D9)*C10)/1000000

   Pure module. No DOM, no imports. Canonical units in and out:
     bore, stroke   mm
     displacement   cc

   Imported by index.html for the UI, by test/parity.mjs for the fixtures,
   and available to the app so the app and the site can't disagree.
   ========================================================================== */

/**
 * @param {object} input
 * @param {number} input.bore      Cylinder bore, mm
 * @param {number} input.stroke    Crank stroke, mm
 * @param {number} input.cylinders Number of cylinders
 */
export function engineDisplacement({ bore, stroke, cylinders }) {
  if (!(bore > 0)) throw new Error('Bore must be greater than zero.');
  if (!(stroke > 0)) throw new Error('Stroke must be greater than zero.');
  if (!(cylinders >= 1)) throw new Error('There must be at least one cylinder.');
  if (!Number.isInteger(cylinders)) throw new Error('Cylinders must be a whole number.');

  const boreArea = (Math.PI / 4) * bore * bore;   // mm^2
  const cylinderVolume = boreArea * stroke;       // mm^3
  const totalVolume = cylinderVolume * cylinders; // mm^3

  return {
    displacement: totalVolume / 1000,             // cc  (1 cc = 1000 mm^3)
    perCylinder: cylinderVolume / 1000,           // cc
    boreArea,                                     // mm^2
    boreStrokeRatio: bore / stroke,
  };
}

/** Steps for the "show the working" panel. Display formatting stays in the UI. */
export function explain({ bore, stroke, cylinders }, result, fmt) {
  return [
    {
      label: 'Area of the bore',
      expr: 'A = pi / 4 x bore²',
      values: `A = pi / 4 x ${fmt(bore)}²`,
      result: `${fmt(result.boreArea)} mm²`,
      note: 'The piston sweeps a circle of this area as it travels.',
    },
    {
      label: 'Swept volume of one cylinder',
      expr: 'V = A x stroke',
      values: `V = ${fmt(result.boreArea)} x ${fmt(stroke)}`,
      result: `${fmt(result.perCylinder * 1000)} mm³`,
      note: 'Stroke is the distance the piston travels between TDC and BDC.',
    },
    {
      label: 'Total displacement',
      expr: 'D = V x cylinders / 1000',
      values: `D = ${fmt(result.perCylinder * 1000)} x ${cylinders} / 1000`,
      result: `${fmt(result.displacement)} cc`,
      note: 'Divided by 1000 because a cubic centimetre is 1000 cubic millimetres.',
    },
    {
      label: 'Bore to stroke ratio',
      expr: 'R = bore / stroke',
      values: `R = ${fmt(bore)} / ${fmt(stroke)}`,
      result: fmt(result.boreStrokeRatio),
      note: 'Above 1.0 is oversquare, which favours high rpm. Below 1.0 is undersquare, which favours low-end torque.',
    },
  ];
}

/* ==========================================================================
   Reciprocating loads.

   Not in the original spreadsheet. Added because the same bore and stroke,
   plus two more numbers a builder already knows, answer the questions that
   actually decide a build: how fast is the piston moving, how hard is it
   being turned around, and what is that doing to the rod.

   Slider-crank kinematics, exact rather than the small-angle approximation.
   Canonical units:
     stroke, rodLength   mm
     rpm                 rev/min
     pistonMass          kg   (piston + rings + pin. The reciprocating mass)
   ========================================================================== */

/**
 * @param {object} input
 * @param {number} input.stroke      Crank stroke, mm
 * @param {number} input.rodLength   Centre-to-centre rod length, mm
 * @param {number} input.rpm         Engine speed to evaluate at
 * @param {number} [input.pistonMass] Reciprocating mass per cylinder, kg
 */
export function reciprocatingLoads({ stroke, rodLength, rpm, pistonMass }) {
  if (!(stroke > 0)) throw new Error('Stroke must be greater than zero.');
  if (!(rodLength > 0)) throw new Error('Rod length must be greater than zero.');
  if (!(rpm > 0)) throw new Error('Engine speed must be greater than zero.');

  const crankRadius = stroke / 2000;        // m
  const rod = rodLength / 1000;             // m

  // The rod has to be longer than the crank throw or the assembly can't turn.
  if (rod <= crankRadius) {
    throw new Error('Rod length must be greater than half the stroke.');
  }

  const lambda = crankRadius / rod;         // the only shape term that matters
  const omega = (2 * Math.PI * rpm) / 60;   // rad/s

  // Mean piston speed: the piston covers two strokes per revolution.
  const meanPistonSpeed = (2 * (stroke / 1000) * rpm) / 60;

  /* Peak piston speed has no tidy closed form once the rod's obliquity is
     included, so it's found numerically. Sampling every 0.05 degrees is
     more than enough. The curve is smooth and broad near its peak. */
  const velocityAt = (theta) => {
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    return crankRadius * omega * (s + (lambda * s * c) / Math.sqrt(1 - lambda * lambda * s * s));
  };

  let peakPistonSpeed = 0;
  let peakSpeedAngle = 0;
  for (let deg = 0; deg <= 180; deg += 0.05) {
    const v = Math.abs(velocityAt((deg * Math.PI) / 180));
    if (v > peakPistonSpeed) {
      peakPistonSpeed = v;
      peakSpeedAngle = deg;
    }
  }

  /* Peak acceleration is at TDC, where the crank throw and the rod's
     obliquity both act in the same direction. This closed form is exact and
     agrees with numeric differentiation of the velocity above. */
  const peakAcceleration = crankRadius * omega * omega * (1 + lambda);

  // Acceleration at BDC, for comparison. Always the smaller of the two.
  const bdcAcceleration = crankRadius * omega * omega * (1 - lambda);

  return {
    // Rod ratio in the form engine builders quote it: rod over stroke.
    rodRatio: rodLength / stroke,
    lambda,
    meanPistonSpeed,
    peakPistonSpeed,
    peakSpeedAngle,
    peakAcceleration,
    peakAccelerationG: peakAcceleration / 9.80665,
    bdcAcceleration,
    /* Tensile load in the rod at TDC. This is the load that stretches a rod
       and pulls bolts, and it peaks on the overlap between exhaust and
       intake when there's no cylinder pressure pushing back. It's what sizes
       rod bolts, not peak combustion pressure. */
    peakRodForce: Number.isFinite(pistonMass) ? pistonMass * peakAcceleration : undefined,
  };
}

export function explainLoads(input, result, fmt) {
  const steps = [
    {
      label: 'Rod:Stroke ratio',
      expr: 'rod ratio = rod length / stroke',
      values: `= ${fmt(input.rodLength)} / ${fmt(input.stroke)}`,
      result: fmt(result.rodRatio),
      note: 'Most engines land between 1.5 and 2.0. A longer rod dwells the piston nearer TDC and reduces peak acceleration for the same stroke.',
    },
    {
      label: 'Mean piston speed',
      expr: 'Vmean = 2 x stroke x rpm / 60',
      values: `Vmean = 2 x ${fmt(input.stroke / 1000)} x ${input.rpm} / 60`,
      result: `${fmt(result.meanPistonSpeed)} m/s`,
      note: 'The piston covers two strokes per revolution. Production engines are usually held under about 20 m/s; race engines run to 25 and beyond, with the ring and bore life to match.',
    },
    {
      label: 'Peak piston speed',
      expr: 'V(θ) = r·ω·[sin θ + λ·sin θ·cos θ / sqrt(1 - λ²sin²θ)]',
      values: `maximum at ${fmt(result.peakSpeedAngle)}° after TDC, λ = ${fmt(result.lambda)}`,
      result: `${fmt(result.peakPistonSpeed)} m/s`,
      note: 'Peak speed occurs before mid-stroke, not at it, because the rod swings. Shorter rods move the peak earlier and raise it.',
    },
    {
      label: 'Peak acceleration, at TDC',
      expr: 'a = r·ω²·(1 + λ)',
      values: `a = ${fmt(input.stroke / 2000)} x ${fmt((2 * Math.PI * input.rpm) / 60)}² x (1 + ${fmt(result.lambda)})`,
      result: `${fmt(result.peakAcceleration)} m/s²  (${fmt(result.peakAccelerationG)} G)`,
      note: `At BDC it is lower, ${fmt(result.bdcAcceleration)} m/s², because the rod's obliquity there works against the crank throw instead of with it.`,
    },
  ];

  if (result.peakRodForce !== undefined) {
    steps.push({
      label: 'Peak rod tensile force',
      expr: 'F = reciprocating mass x a',
      values: `F = ${fmt(input.pistonMass)} x ${fmt(result.peakAcceleration)}`,
      result: `${fmt(result.peakRodForce / 1000)} kN`,
      note: 'This is the load trying to stretch the rod and pull its bolts apart, and it is highest at TDC on the overlap, when no cylinder pressure is pushing back. It sizes rod bolts. Peak combustion pressure does not.',
    });
  }

  return steps;
}

/* ==========================================================================
   Crank geometry.

   Piston and rod positions at a given crank angle, in mm above the crank
   centreline. This is what the animated diagram draws, and it's exported as
   a pure function so the drawing can't invent its own kinematics. The
   fixtures assert the two boundary conditions that matter: at 0° the piston
   is at TDC, and at 180° it has travelled exactly one stroke.
   ========================================================================== */

/**
 * @param {object} input
 * @param {number} input.stroke      mm
 * @param {number} input.rodLength   mm, centre to centre
 * @param {number} input.compHeight  mm, wrist pin centre to piston crown
 * @param {number} input.deckHeight  mm, crank centreline to block deck
 * @param {number} input.angle       degrees after TDC
 */
export function crankGeometry({ stroke, rodLength, compHeight, deckHeight, angle }) {
  const r = stroke / 2;
  const L = rodLength;

  if (!(L > r)) throw new Error('Rod length must be greater than half the stroke.');

  const theta = (angle * Math.PI) / 180;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);

  // Rod obliquity term. Real geometry, not the small-angle approximation.
  const rodVertical = Math.sqrt(L * L - r * r * sin * sin);

  const crankPin = { x: r * sin, y: r * cos };      // relative to crank centre
  const pinHeight = r * cos + rodVertical;          // wrist pin above centreline
  const crownHeight = pinHeight + compHeight;

  return {
    crankPin,
    crankRadius: r,
    pinHeight,
    crownHeight,
    // Distance travelled down from TDC. Zero at 0°, exactly `stroke` at 180°.
    pistonFromTdc: r + L + compHeight - crownHeight,
    // Gap between crown and deck at this angle. Smallest at TDC.
    crownToDeck: deckHeight - crownHeight,
    // Rod angle from vertical, which is what makes the rod visibly swing.
    rodAngle: (Math.atan2(r * sin, rodVertical) * 180) / Math.PI,
  };
}

/* ==========================================================================
   Compression ratio.

   The arithmetic here is deliberately flat. An earlier version took block
   deck height and derived deck clearance from it:

       deckClearance = deckHeight - (stroke/2 + rodLength + compHeight)
       0.5 = 216.5 - (43 + 143 + 30)

   That is catastrophic cancellation. A half-millimetre answer produced by
   subtracting one ~216mm quantity from another. A 0.1mm error in any of the
   four inputs became a 20% error in the clearance and moved the ratio by
   0.2:1; 0.25mm moved it half a point. And since no factory spec sheet
   quotes block deck height, that input was usually a guess, which is why
   results wandered away from stated figures.

   So deck clearance is now measured and entered directly. It's a small
   number a builder reads off a dial indicator at TDC, it enters the sum as
   itself rather than as a difference of large numbers, and deck height is
   derived from it in the forward direction (exactly) purely so the diagram
   can place the deck line.

   Nothing here needs more than plain double arithmetic. Every term is a
   product or a sum of same-signed quantities; there is no subtraction of
   comparable magnitudes left to lose precision to.
   ========================================================================== */

/**
 * @param {object} input
 * @param {number} input.bore             mm
 * @param {number} input.stroke           mm
 * @param {number} input.rodLength        mm
 * @param {number} input.compHeight       mm, wrist pin to crown
 * @param {number} input.deckClearance    mm, crown below the deck at TDC.
 *                                        Negative if the crown stands proud.
 * @param {number} input.chamberVolume    cc
 * @param {number} [input.dishVolume]     cc, positive dish, negative dome
 * @param {number} [input.gasketThickness] mm, compressed
 * @param {number} [input.gasketBore]     mm, defaults to the cylinder bore
 * @param {number} [input.ivcAbdc]        degrees after BDC. Omit to skip DCR
 * @param {number} [input.targetRatio]    a published figure to reconcile against
 */
export function compressionRatio({
  bore, stroke, rodLength, compHeight, deckClearance,
  chamberVolume, dishVolume = 0, gasketThickness = 0, gasketBore,
  ivcAbdc, targetRatio,
}) {
  if (!(bore > 0)) throw new Error('Bore must be greater than zero.');
  if (!(stroke > 0)) throw new Error('Stroke must be greater than zero.');
  if (!(rodLength > stroke / 2)) throw new Error('Rod length must be greater than half the stroke.');
  if (!(compHeight > 0)) throw new Error('Compression height must be greater than zero.');
  if (!Number.isFinite(deckClearance)) throw new Error('Deck clearance is needed.');
  if (!(chamberVolume > 0)) throw new Error('Chamber volume must be greater than zero.');

  const boreArea = (Math.PI / 4) * bore * bore;              // mm²
  const sweptVolume = (boreArea * stroke) / 1000;            // cc

  const deckVolume = (boreArea * deckClearance) / 1000;

  // Gaskets are bored larger than the cylinder, so this is its own input.
  const gasketArea = (Math.PI / 4) * (gasketBore || bore) ** 2;
  const gasketVolume = (gasketArea * gasketThickness) / 1000;

  const clearanceVolume = chamberVolume + deckVolume + gasketVolume + dishVolume;

  if (!(clearanceVolume > 0)) {
    throw new Error('Clearance volume works out at zero or less. Check the chamber, dish and deck figures.');
  }

  const staticRatio = (sweptVolume + clearanceVolume) / clearanceVolume;

  // Derived forward, exactly, for the diagram only. Never fed back into the
  // volumes above.
  const deckHeight = stroke / 2 + rodLength + compHeight + deckClearance;

  // Dynamic CR: volume above the piston at intake closing, not at BDC.
  let dynamicRatio;
  let pistonAtIvc;
  if (Number.isFinite(ivcAbdc)) {
    const { pistonFromTdc } = crankGeometry({
      stroke, rodLength, compHeight, deckHeight, angle: 180 + ivcAbdc,
    });
    pistonAtIvc = pistonFromTdc;
    dynamicRatio = (clearanceVolume + (boreArea * pistonAtIvc) / 1000) / clearanceVolume;
  }

  /* Reconciling against a published figure. If the calculated ratio doesn't
     match the one on the spec sheet, one of the inputs is wrong, and the
     chamber volume is both the least often measured and the easiest to get
     from a head. So this says what chamber volume the published ratio
     implies, given everything else as entered. */
  let impliedChamberVolume;
  let ratioDifference;
  if (Number.isFinite(targetRatio) && targetRatio > 1) {
    const requiredClearance = sweptVolume / (targetRatio - 1);
    impliedChamberVolume = requiredClearance - deckVolume - gasketVolume - dishVolume;
    ratioDifference = staticRatio - targetRatio;
  }

  /* How much the ratio moves per 0.1mm of deck clearance. Deck clearance is
     the input people are least sure of, so stating its leverage explains why
     two people measuring the same engine can disagree. */
  const perTenthMm = (() => {
    const shifted = clearanceVolume + (boreArea * 0.1) / 1000;
    return Math.abs(staticRatio - (sweptVolume + shifted) / shifted);
  })();

  return {
    sweptVolume,
    deckVolume,
    gasketVolume,
    clearanceVolume,
    staticRatio,
    dynamicRatio,
    pistonAtIvc,
    deckHeight,
    impliedChamberVolume,
    ratioDifference,
    ratioPerTenthMmDeck: perTenthMm,
  };
}

export function explainCompression(input, result, fmt) {
  if (!result) return [];

  const steps = [
    {
      label: 'Clearance volume',
      expr: 'Vc = chamber + deck + gasket + dish',
      values: `Vc = ${fmt(input.chamberVolume)} + ${fmt(result.deckVolume)} + ${fmt(result.gasketVolume)} + ${fmt(input.dishVolume || 0)}`,
      result: `${fmt(result.clearanceVolume)} cc`,
      note: 'This is where compression ratios go wrong. The chamber is the number people remember; the deck and gasket are the ones they forget, and together they are usually worth most of a point of ratio.',
    },
    {
      label: 'Deck volume, from the clearance you measured',
      expr: 'deck volume = pi/4 x bore² x deck clearance',
      values: `= pi/4 x ${fmt(input.bore)}² x ${fmt(input.deckClearance)}`,
      result: `${fmt(result.deckVolume)} cc`,
      note: `Deck clearance is entered rather than derived, because deriving it means subtracting one ~200mm figure from another to get a fraction of a millimetre. Measured directly, ${fmt(input.bore)}mm of bore turns each 0.1mm into ${fmt((Math.PI / 4) * input.bore * input.bore * 0.1 / 1000)} cc.`,
    },
    {
      label: 'Static compression ratio',
      expr: 'SCR = (swept + Vc) / Vc',
      values: `= (${fmt(result.sweptVolume)} + ${fmt(result.clearanceVolume)}) / ${fmt(result.clearanceVolume)}`,
      result: `${fmt(result.staticRatio)} : 1`,
      note: `The figure on the box. It assumes the intake valve shuts at BDC, which no cam actually does. Note how sensitive it is: every 0.1mm of deck clearance moves it by about ${fmt(result.ratioPerTenthMmDeck)}:1, so a quarter-millimetre of uncertainty is half a ratio point.`,
    },
  ];

  if (result.dynamicRatio !== undefined) {
    steps.push({
      label: 'Dynamic compression ratio',
      expr: 'DCR = (Vc + area x piston travel at IVC) / Vc',
      values: `piston is ${fmt(result.pistonAtIvc)} mm down the bore at ${fmt(input.ivcAbdc)}° after BDC`,
      result: `${fmt(result.dynamicRatio)} : 1`,
      note: 'The cylinder only starts compressing once the intake valve shuts, so the piston has already given back part of its stroke. This is why a big cam softens cylinder pressure and lets an engine tolerate more static ratio or more boost, with the static number unchanged.',
    });
  }

  if (result.impliedChamberVolume !== undefined) {
    steps.push({
      label: 'Reconciling with the published figure',
      expr: 'chamber implied = swept / (published ratio - 1) - deck - gasket - dish',
      values: `for ${fmt(input.targetRatio)}:1 with everything else as entered`,
      result: `${fmt(result.impliedChamberVolume)} cc chamber`,
      note: `Entered chamber volume is ${fmt(input.chamberVolume)} cc, so the published ratio implies ${fmt(Math.abs(result.impliedChamberVolume - input.chamberVolume))} cc ${result.impliedChamberVolume > input.chamberVolume ? 'more' : 'less'} than that. Published figures are nominal and often assume zero deck clearance and a nominal gasket, so a gap here usually means one of those two rather than a wrong chamber.`,
    });
  }

  return steps;
}
