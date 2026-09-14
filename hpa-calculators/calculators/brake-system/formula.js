/* ==========================================================================
   Brake system: bias, pressures and pedal.

   Source: Brake_System_Calculator_-_Grid.xlsx

   Pure module. No DOM, no imports. Canonical units:
     lengths      mm
     mass         kg
     force        N
     pressure     kPa
     area         mm²
     torque       Nm

   WHAT THIS IS FOR

   Braking wants each axle to do work in proportion to the load it is
   carrying. Load moves forward as the car decelerates, so the share the
   front should take climbs with deceleration. 73% at 0.4 G on the default
   car, 92% at 1.4 G. A fixed bias bar cannot follow that, so every setting
   is a compromise and the question is which deceleration to be right at.

   That is why the required-bias sweep matters more than any single figure,
   and why the calculator reports the bias bar position a given deceleration
   needs rather than a single "correct" answer.

   THREE CORRECTIONS TO THE SPREADSHEET

   1. The proportioning valve was applied two different ways. The rear
      pressure cell multiplied the excess above the knee point by the slope;
      the bias table divided it. A valve exists to slow the rise of rear
      pressure, so dividing is right. Multiplying by a 3:1 slope trebles
      rear pressure where it should third it, which is the dangerous
      direction. Dormant while the valve was switched off, which is how it
      survived.

   2. "Disc Radius" was the pad's radial depth, not a radius. The arithmetic
      was right, since (OD - depth) / 2 is exactly the mean radius, but the name
      invites entering a radius, which would halve the answer.

   3. Front pressure was solved by a circular cell that incremented itself
      until it converged, needing Excel's iterative calculation switched on.
      It has a closed form.
   ========================================================================== */

const G = 9.81;
const KPA_PER_PSI = 6.894757;

/** Loaded radius from a tyre size. */
export function loadedRadius({ width, aspect, rimDiameter }) {
  return (2 * width * (aspect / 100) + rimDiameter * 25.4) / 2;
}

/**
 * A tyre size as it is written on the sidewall.
 *
 * Asking for a radius in millimetres looks like fewer inputs, but it is a
 * figure nobody has to hand. It has to be looked up or measured, and the
 * conversion is the calculator's job rather than the reader's. A size is
 * something people already know by heart, so it is taken as typed.
 *
 * Accepts the forms in circulation: 235/45R18, 235/45/18, 235/45 R18,
 * 235-45-18, and with or without spaces.
 */
export function parseTyre(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('Enter a tyre size, for example 235/45R18.');

  const m = raw.match(/^(\d{2,3})\s*[/\-x]\s*(\d{2,3})\s*[/\-\s]*R?\s*(\d{2}(?:\.\d)?)$/i);
  if (!m) {
    throw new Error(`"${raw}" is not a tyre size the calculator recognises. Use the sidewall form, for example 235/45R18.`);
  }

  const width = Number(m[1]);
  const aspect = Number(m[2]);
  const rimDiameter = Number(m[3]);

  /* Ranges are checked rather than trusted: a transposed size reads as a
     valid number and would quietly change every torque on the page. */
  if (width < 100 || width > 400) throw new Error(`A section width of ${width}mm is outside anything fitted to a car.`);
  if (aspect < 20 || aspect > 95) throw new Error(`An aspect ratio of ${aspect} is outside anything fitted to a car.`);
  if (rimDiameter < 10 || rimDiameter > 26) throw new Error(`A rim diameter of ${rimDiameter} inches is outside anything fitted to a car.`);

  return { width, aspect, rimDiameter, radius: loadedRadius({ width, aspect, rimDiameter }) };
}

/**
 * The geometry of one axle's brakes.
 *
 * @param {object} axle
 * @param {number} axle.rotorDiameter  mm, outer
 * @param {number} axle.padDepth       mm, radial depth of the pad
 * @param {number[]} axle.pistons      mm diameters; zeros ignored
 * @param {number} axle.padMu          coefficient of friction
 */
export function axleBrakes({ rotorDiameter, padDepth, pistons, padMu }) {
  if (!(rotorDiameter > 0)) throw new Error('Rotor diameter must be greater than zero.');
  if (!(padDepth > 0)) throw new Error('Pad depth must be greater than zero.');
  if (!(padDepth * 2 < rotorDiameter)) {
    throw new Error('Pad depth is at least half the rotor diameter, which leaves no rotor. Check it is the pad\u2019s radial depth, not a radius.');
  }
  if (!(padMu > 0)) throw new Error('Pad friction coefficient must be greater than zero.');

  const live = pistons.filter((d) => d > 0);
  if (!live.length) throw new Error('At least one caliper piston diameter is needed.');

  /* Mean radius of the swept annulus. (OD - depth) / 2 is the same thing as
     (OD + ID) / 4 once ID = OD - 2 x depth, which is why the spreadsheet's
     arithmetic was right despite the label. */
  const effectiveRadius = (rotorDiameter - padDepth) / 2;
  const pistonArea = live.reduce((sum, d) => sum + Math.PI * (d / 2) ** 2, 0);

  return { effectiveRadius, pistonArea, padMu, pistonCount: live.length };
}

/** Torque one axle's brakes make per wheel at a given line pressure. */
export function torqueAt(pressureKpa, brakes) {
  // kPa x mm² = N x 1e-3; two pad faces.
  return (pressureKpa * brakes.pistonArea * 1e-3) * brakes.padMu * (brakes.effectiveRadius / 1000) * 2;
}

/** The line pressure one axle needs to make a given torque per wheel. */
export function pressureFor(torqueNm, brakes) {
  return torqueNm / (brakes.pistonArea * 1e-3 * brakes.padMu * (brakes.effectiveRadius / 1000) * 2);
}

/**
 * Axle loads and the braking share the front should take, at one
 * deceleration. No hardware involved. This is what the car asks for.
 */
export function requiredBias({
  wheelbase, totalMass, frontPercent, cogHeight,
  downforceFront = 0, downforceRear = 0,
  radiusFront, radiusRear, decel,
}) {
  if (!(wheelbase > 0)) throw new Error('Wheelbase must be greater than zero.');
  if (!(totalMass > 0)) throw new Error('Total mass must be greater than zero.');
  if (!(frontPercent > 0) || !(frontPercent < 100)) {
    throw new Error('Front weight share must be between 0 and 100 percent.');
  }
  if (!(cogHeight > 0)) throw new Error('Centre of gravity height must be greater than zero.');
  if (!(decel > 0)) throw new Error('Deceleration must be greater than zero.');

  const transfer = (decel * totalMass * cogHeight) / wheelbase;
  const frontAxle = totalMass * (frontPercent / 100) + transfer + downforceFront;
  const rearAxle = totalMass * (1 - frontPercent / 100) - transfer + downforceRear;

  /* Rear load is a static figure less the transfer, so it runs out: past
     the deceleration where it reaches zero the rear wheels are off the
     ground and none of this applies. Reported rather than clamped. */
  const rearLifting = rearAxle <= 0;

  // Torque each wheel must make for its own load to be braked at `decel`.
  const torqueFront = ((frontAxle / 2) * G * decel * radiusFront) / 1000;
  const torqueRear = ((rearAxle / 2) * G * decel * radiusRear) / 1000;
  const total = torqueFront + torqueRear;

  return {
    transfer,
    frontAxle,
    rearAxle,
    torqueFront,
    torqueRear,
    /* Share of total braking torque the front must take. Torque rather than
       force, so different front and rear tyre radii are handled. */
    frontBias: total > 0 ? (torqueFront / total) * 100 : undefined,
    rearLifting,
  };
}

/** Deceleration at which the rear axle load reaches zero. */
export function rearLiftDecel({ wheelbase, totalMass, frontPercent, cogHeight, downforceRear = 0 }) {
  const rearStatic = totalMass * (1 - frontPercent / 100) + downforceRear;
  const perG = (totalMass * cogHeight) / wheelbase;
  return perG > 0 ? rearStatic / perG : undefined;
}

/** Rear line pressure after a proportioning valve, if one is fitted. */
export function afterValve(rawKpa, { valveFitted, kneePsi, slope }) {
  if (!valveFitted) return rawKpa;
  const knee = kneePsi * KPA_PER_PSI;
  if (!(rawKpa > knee)) return rawKpa;
  if (!(slope > 0)) throw new Error('Proportioning valve slope must be greater than zero.');
  /* Divided, not multiplied. A valve slows the rise of rear pressure above
     its knee point; the spreadsheet's rear pressure cell multiplied, which
     with a 3:1 slope trebles rear pressure instead of thirding it. */
  return knee + (rawKpa - knee) / slope;
}

/**
 * @param {object} input   Everything requiredBias needs, plus:
 * @param {object} input.front   axleBrakes input for the front
 * @param {object} input.rear    axleBrakes input for the rear
 * @param {number} input.pedalRatio
 * @param {number} input.targetPedalEffort  kg, what the pedal should feel like
 * @param {boolean} input.valveFitted
 * @param {number} input.kneePsi
 * @param {number} input.slope
 */
export function brakeSystem(input, options) {
  const need = requiredBias(input);
  const front = axleBrakes(input.front);
  const rear = axleBrakes(input.rear);

  if (!(input.pedalRatio > 0)) throw new Error('Pedal ratio must be greater than zero.');
  if (!(input.targetPedalEffort > 0)) throw new Error('Target pedal effort must be greater than zero.');

  // Pressure each axle needs, closed form rather than an iterated cell.
  const pressureFront = pressureFor(need.torqueFront, front);
  const rawRear = pressureFor(need.torqueRear, rear);
  const pressureRear = afterValve(rawRear, input);

  /* Bore that would put the pedal at its target effort, with the pushrod
     force split evenly. This is a starting size, not the answer. The
     bias bar below is what actually sets the split. */
  const pushrodAtTarget = input.targetPedalEffort * G * input.pedalRatio;
  const boreFor = (pressureKpa) =>
    2000 * Math.sqrt((pushrodAtTarget / 2) / (pressureKpa * 1000) / Math.PI);
  const suggestedFront = pressureFront > 0 ? boreFor(pressureFront) : undefined;
  const suggestedRear = pressureRear > 0 ? boreFor(pressureRear) : undefined;

  /* The recommendation is the answer: both source sheets computed a size
     rather than taking one, and so does the calculator.

     A pair can still be passed in, which the UI never does. It is how the
     fixtures reproduce the sheet's own pedal effort, travel and cylinder
     strokes for the bores it happened to have fitted. Evidence worth
     keeping even though the input is gone. */
  /* Ranked over every feasible pair, so "the best effort available" means
     exactly that rather than the best of the six shown. */
  const ranked = options ?? masterCylinderOptions(input, { limit: 999 });
  const recommended = ranked[0];
  const given = input.masterFront > 0 && input.masterRear > 0;
  const boreFrontUsed = given ? input.masterFront : recommended?.front.bore;
  const boreRearUsed = given ? input.masterRear : recommended?.rear.bore;

  const areaFront = Math.PI * (boreFrontUsed / 2000) ** 2;   // m²
  const areaRear = Math.PI * (boreRearUsed / 2000) ** 2;
  const forceFront = pressureFront * 1000 * areaFront;           // N at the pushrod
  const forceRear = pressureRear * 1000 * areaRear;
  const pushrod = forceFront + forceRear;

  const fitted = boreFrontUsed > 0 && boreRearUsed > 0;
  const pedalEffort = fitted ? pushrod / (G * input.pedalRatio) : undefined;
  const biasBar = fitted && pushrod > 0 ? (forceFront / pushrod) * 100 : undefined;

  /* Fluid displaced per mm of caliper piston travel, as a length of master
     cylinder stroke. A big mismatch between ends migrates the bias as the
     pedal moves. */
  const strokeFront = fitted ? front.pistonArea / (Math.PI * (boreFrontUsed / 2) ** 2) : undefined;
  const strokeRear = fitted ? rear.pistonArea / (Math.PI * (boreRearUsed / 2) ** 2) : undefined;
  const pedalTravel = fitted ? ((strokeFront + strokeRear) / 2) * input.pedalRatio : undefined;

  /* What the bar could still reach with these bores, and the pedal ratio
     that would put the effort on target. The target is often simply out of
     reach with the calipers fitted, and the ratio is the lever for it. */
  const ctx = {
    pressureFront, torqueFront: need.torqueFront, rear,
    masterFront: boreFrontUsed, masterRear: boreRearUsed,
    valve: { valveFitted: input.valveFitted, kneePsi: input.kneePsi, slope: input.slope },
  };
  const windowLow = fitted ? biasAtBar(BAR_RANGE.min, ctx) : undefined;
  const windowHigh = fitted ? biasAtBar(BAR_RANGE.max, ctx) : undefined;

  return {
    ...need,
    front,
    rear,
    options: ranked.slice(0, 4),
    feasibleCount: recommended ? recommended.feasibleCount : 0,
    recommended,
    boreFront: boreFrontUsed,
    boreRear: boreRearUsed,
    windowLow,
    windowHigh,
    bestEffort: ranked.length ? Math.max(...ranked.map((o) => o.pedalEffort)) : undefined,
    pressureFront,
    pressureRear,
    rawRear,
    valveActive: Boolean(input.valveFitted) && rawRear > input.kneePsi * KPA_PER_PSI,
    suggestedFront,
    suggestedRear,
    pedalEffort,
    biasBar,
    strokeFront,
    strokeRear,
    strokeMismatch: fitted ? Math.abs(strokeFront - strokeRear) : undefined,
    strokeRatio: fitted
      ? Math.max(strokeFront, strokeRear) / Math.min(strokeFront, strokeRear)
      : undefined,
    bestStrokeRatio: ranked.length ? ranked[0].bestStrokeRatio : undefined,
    pedalTravel,
    liftDecel: rearLiftDecel(input),
    /* Pedal effort times pedal travel is fixed by the required torque, the
       pad friction and the rotor's effective radius. It survives any change
       of master cylinder bore or pedal ratio, because both scale the two
       terms in opposite directions. So a pair of targets whose product
       exceeds it cannot be met by choosing cylinders: bigger rotors, grippier
       pads or less required torque are the only levers. */
    pedalWork: pedalEffort !== undefined && pedalTravel !== undefined
      ? pedalEffort * pedalTravel : undefined,
    pedalWorkWanted: input.targetPedalEffort
      * (input.targetPedalTravel > 0 ? input.targetPedalTravel : 35),
    /* Effort scales inversely with pedal ratio, so if the target cannot be
       reached with any bore pair this is the ratio that would reach it. */
    ratioForTarget: pedalEffort !== undefined && pedalEffort > 0
      ? (input.pedalRatio * pedalEffort) / input.targetPedalEffort
      : undefined,
    /* How much the required bias moves for 10mm of centre of gravity height
      . The input people are least sure of, and the one that drives the
       whole transfer term. */
    biasPerTenMm: (() => {
      const a = requiredBias(input).frontBias;
      const b = requiredBias({ ...input, cogHeight: input.cogHeight + 10 }).frontBias;
      return a === undefined || b === undefined ? undefined : b - a;
    })(),
  };
}

/** Things worth being told before building the system. */
export function warnings(input, r) {
  const out = [];

  if (r.rearLifting) {
    out.push(`Rear wheels lift at ${r.liftDecel?.toFixed(2)} G, below your ${input.decel} G design point.`);
  }
  if (r.biasBar !== undefined && (r.biasBar < BAR_RANGE.min || r.biasBar > BAR_RANGE.max)) {
    out.push(`Bias bar needs ${r.biasBar.toFixed(0)}% front, outside the ${BAR_RANGE.min}\u2013${BAR_RANGE.max}% a bar can reach.`);
  }
  if (r.pedalWork !== undefined && r.pedalWork > r.pedalWorkWanted * 1.15) {
    out.push(`Pedal cannot be both ${input.targetPedalEffort.toFixed(0)} kg and ${input.targetPedalTravel.toFixed(0)}mm: these brakes need ${(r.pedalWork / input.targetPedalEffort).toFixed(0)}mm at that effort.`);
  }
  if (input.front.padMu !== input.rear.padMu) {
    out.push('Front and rear pad compounds differ, so the balance will move as the brakes heat.');
  }
  for (const [end, p] of [['Front', r.pressureFront], ['Rear', r.pressureRear]]) {
    if (p / KPA_PER_PSI >= 1000) {
      out.push(`${end} line pressure ${(p / KPA_PER_PSI).toFixed(0)} psi, at or past most hardware ratings.`);
    }
  }
  return out;
}

/**
 * Whether the hardware can be made to work at all, as distinct from a list
 * of things to watch. Some faults cannot be fixed by any master cylinder —
 * a bias bar that will not reach, a rear axle already off the ground, line
 * pressure past what hoses take. Those mean the brakes themselves are the
 * problem, and the calculator should say so rather than quietly serving up
 * the least bad pair.
 */
export function verdict(input, r) {
  const blocking = [];
  if (!r.recommended) blocking.push('no master cylinder pair puts the bias bar in range');
  if (r.rearLifting) blocking.push('the rear axle is already unloaded at this deceleration');
  if (r.biasBar !== undefined && (r.biasBar < BAR_RANGE.min || r.biasBar > BAR_RANGE.max)) {
    blocking.push('the bias bar cannot reach the split the car needs');
  }
  if (r.pressureFront / KPA_PER_PSI >= 1000 || r.pressureRear / KPA_PER_PSI >= 1000) {
    blocking.push('line pressure is past what the hardware is rated for');
  }
  const count = warnings(input, r).length;
  return {
    blocking,
    // Either something unfixable, or enough smaller faults to say the same.
    revise: blocking.length > 0 || count >= 3,
    count,
  };
}

export function explain(input, r, fmt) {
  const steps = [
    {
      label: 'Load moved forward by braking',
      expr: 'transfer = decel x mass x CoG height / wheelbase',
      values: `${fmt(input.decel)} x ${fmt(input.totalMass)} x ${fmt(input.cogHeight)} / ${fmt(input.wheelbase)}`,
      result: `${fmt(r.transfer)} kg onto the front axle`,
      note: `This is why bias is a compromise: the front axle carries ${fmt(r.frontAxle)} kg at this deceleration against ${fmt(input.totalMass * input.frontPercent / 100)} kg standing still. Ten millimetres of centre of gravity height moves the required bias by ${fmt(r.biasPerTenMm)} points, so it is worth measuring rather than guessing. The rear axle load reaches zero at about ${fmt(r.liftDecel)} G, past which the rear wheels are off the ground and none of this applies.`,
    },
    {
      label: 'Loaded radius from the tyre size',
      expr: 'radius = (2 x width x aspect/100 + rim x 25.4) / 2',
      values: `front ${fmt(input.radiusFront)} mm, rear ${fmt(input.radiusRear)} mm`,
      result: 'the lever the brakes work against',
      note: 'Worth a glance: a transposed aspect ratio parses cleanly and quietly changes every torque below. 45 against 55 on a 235/17 is 24mm of radius.',
    },
    {
      label: 'Torque each wheel has to make',
      expr: 'torque = axle load / 2 x 9.81 x decel x loaded radius',
      values: `front: ${fmt(r.frontAxle / 2)} kg x ${fmt(input.decel)} G x ${fmt(input.radiusFront)} mm`,
      result: `${fmt(r.torqueFront)} Nm front, ${fmt(r.torqueRear)} Nm rear`,
    },
    {
      label: 'Required front bias',
      expr: 'bias = front torque / total torque',
      values: `${fmt(r.torqueFront)} / (${fmt(r.torqueFront)} + ${fmt(r.torqueRear)})`,
      result: `${fmt(r.frontBias)}% front`,
      note: 'Taken on torque rather than force so that different front and rear tyre radii are handled. With equal radii the two are the same number.',
    },
    {
      label: 'Rotor effective radius and piston area',
      expr: 'effective radius = (rotor OD - pad depth) / 2',
      values: `front: (${fmt(input.front.rotorDiameter)} - ${fmt(input.front.padDepth)}) / 2 = ${fmt(r.front.effectiveRadius)} mm`,
      result: `piston area ${fmt(r.front.pistonArea)} mm² front, ${fmt(r.rear.pistonArea)} mm² rear`,
      note: 'Pad depth is the radial depth of the pad, not a radius. The effective radius is the mean of the swept annulus, which (OD - depth) / 2 gives exactly.',
    },
    {
      label: 'Line pressure needed',
      expr: 'pressure = torque / (2 x mu x effective radius x piston area)',
      values: `front ${fmt(r.pressureFront)} kPa (${fmt(r.pressureFront / KPA_PER_PSI)} psi)`,
      result: `rear ${fmt(r.pressureRear)} kPa (${fmt(r.pressureRear / KPA_PER_PSI)} psi)`,
      note: r.valveActive
        ? `The proportioning valve is above its knee point here, so rear pressure is held to ${fmt(r.pressureRear)} kPa instead of the ${fmt(r.rawRear)} kPa the rear brakes would otherwise see.`
        : 'Two pad faces, hence the factor of two. No proportioning valve is acting at this pressure.',
    },
  ];

  if (r.pedalEffort !== undefined) {
    steps.push({
      label: 'Pedal and bias bar',
      expr: 'pushrod force = pressure x master cylinder area, each end',
      values: `${fmt(r.pressureFront * 1000 * Math.PI * (r.boreFront / 2000) ** 2)} N front + ${fmt(r.pressureRear * 1000 * Math.PI * (r.boreRear / 2000) ** 2)} N rear`,
      result: `${fmt(r.pedalEffort)} kg at the pedal, bias bar ${fmt(r.biasBar)}% front`,
      note: 'The bias bar position is the practical output: it is what you actually adjust, and it has to land inside the 35 to 65% a bar can reach. If it does not, the master cylinder bores are the thing to change.',
    });
  }

  return steps;
}

/* --- Choosing master cylinders ------------------------------------------
   The question a brake system actually poses is which pair of master
   cylinders to buy. Everything else follows from that choice: the pedal
   effort, the pedal travel, and. Most importantly. Where the bias bar
   has to sit to deliver the bias the car wants.

   A bar that ends up near one end of its travel is a bar with no
   adjustment left in the direction you will want it. So the pair to pick is
   the one that puts the bar near the middle of its range while landing the
   pedal near its target, not the one that merely works.

   Bores are the sizes actually sold, in fractional inch and round metric,
   because a recommendation of 18.5mm is not a part anyone can order.
   ========================================================================== */

export const MASTER_CYLINDERS = [
  { bore: 12.7, label: '1/2"' },
  { bore: 15.875, label: '5/8"' },
  { bore: 17.4625, label: '11/16"' },
  { bore: 17.78, label: '17.8 mm' },
  { bore: 18.9992, label: '19.0 mm' },
  { bore: 19.05, label: '3/4"' },
  { bore: 20.0, label: '20.0 mm' },
  { bore: 20.6375, label: '13/16"' },
  { bore: 21.0007, label: '21.0 mm' },
  { bore: 21.9989, label: '22.0 mm' },
  { bore: 22.1996, label: '22.2 mm' },
  { bore: 22.225, label: '7/8"' },
  { bore: 22.9997, label: '23.0 mm' },
  { bore: 23.02, label: '29/32"' },
  { bore: 23.8125, label: '15/16"' },
  { bore: 24.0005, label: '24.0 mm' },
  { bore: 25.4, label: '1"' },
  { bore: 26.195, label: '1-1/32"' },
  { bore: 26.5989, label: '26.6 mm' },
  { bore: 26.9875, label: '1-1/16"' },
  { bore: 28.575, label: '1-1/8"' },
  { bore: 28.6004, label: '28.6 mm' },
  { bore: 31.75, label: '1-1/4"' },
  { bore: 31.8008, label: '31.8 mm' },
  { bore: 33.3375, label: '1-5/16"' },
  { bore: 34.1325, label: '1-11/32"' },
  { bore: 38.1, label: '1-1/2"' },
  { bore: 44.45, label: '1-3/4"' },
];

/** Bias bar travel a bar can realistically cover, as a front fraction. */
export const BAR_RANGE = { min: 35, max: 65 };

/**
 * Front bias delivered with the bar at a given position.
 *
 * Anchored on the front: the pushrod force is whatever makes the front
 * torque the car needs, and the bar then decides what the rear gets. That
 * keeps the proportioning valve in the picture, which a straight ratio of
 * cylinder areas would not.
 */
export function biasAtBar(bar, { pressureFront, torqueFront, rear, masterFront, masterRear, valve }) {
  const b = bar / 100;
  if (!(b > 0) || !(b < 1)) return undefined;
  const areaFront = Math.PI * (masterFront / 2000) ** 2;
  const areaRear = Math.PI * (masterRear / 2000) ** 2;

  const pushrod = (pressureFront * 1000 * areaFront) / b;
  const rawRear = (pushrod * (1 - b)) / areaRear / 1000;          // kPa
  const torqueRear = torqueAt(afterValve(rawRear, valve), rear);
  const total = torqueFront + torqueRear;
  return total > 0 ? (torqueFront / total) * 100 : undefined;
}

/**
 * Every standard pair, scored on how well it suits the car.
 *
 * @returns {object[]} sorted best first, infeasible pairs dropped
 */
export function masterCylinderOptions(input, { limit = 6 } = {}) {
  const base = requiredBias(input);
  const front = axleBrakes(input.front);
  const rear = axleBrakes(input.rear);
  if (base.frontBias === undefined) return [];

  const pressureFront = pressureFor(base.torqueFront, front);
  const valve = { valveFitted: input.valveFitted, kneePsi: input.kneePsi, slope: input.slope };
  const target = input.targetPedalEffort;
  const targetTravel = input.targetPedalTravel > 0 ? input.targetPedalTravel : 35;

  const out = [];
  for (const f of MASTER_CYLINDERS) {
    for (const r of MASTER_CYLINDERS) {
      const ctx = {
        pressureFront,
        torqueFront: base.torqueFront,
        rear,
        masterFront: f.bore,
        masterRear: r.bore,
        valve,
      };

      /* Bar position that delivers the required bias. Solved by bisection on
         biasAtBar rather than algebraically, so a proportioning valve is
         handled without a separate case. */
      let lo = 1;
      let hi = 99;
      const at = (x) => biasAtBar(x, ctx);
      if (at(lo) === undefined || at(hi) === undefined) continue;
      // bias rises with bar position, so the bracket is ordered
      if (base.frontBias < at(lo) || base.frontBias > at(hi)) continue;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid) < base.frontBias) lo = mid; else hi = mid;
      }
      const barNeeded = (lo + hi) / 2;
      if (barNeeded < BAR_RANGE.min || barNeeded > BAR_RANGE.max) continue;

      // What the bar could still reach from here, at each end of its travel.
      const windowLow = at(BAR_RANGE.min);
      const windowHigh = at(BAR_RANGE.max);

      const areaFront = Math.PI * (f.bore / 2000) ** 2;
      const areaRear = Math.PI * (r.bore / 2000) ** 2;
      const pushrod = (pressureFront * 1000 * areaFront) / (barNeeded / 100);
      const pedalEffort = pushrod / (G * input.pedalRatio);

      const strokeFront = front.pistonArea / (Math.PI * (f.bore / 2) ** 2);
      const strokeRear = rear.pistonArea / (Math.PI * (r.bore / 2) ** 2);
      const pedalTravel = ((strokeFront + strokeRear) / 2) * input.pedalRatio;
      const strokeMismatch = Math.abs(strokeFront - strokeRear);

      /* Penalties, kept separate so the ranking can be explained rather than
         just asserted. Bar centring leads because adjustment headroom is the
         point of choosing carefully; pedal effort is what you feel. */
      const strokeRatio = Math.max(strokeFront, strokeRear) / Math.min(strokeFront, strokeRear);

      /* Squared, so approaching the ends of the bar's travel is punished far
         harder than drifting off centre. A bar at 64% technically works and
         has almost nothing left in the direction you will want it, which is
         worse than a slightly heavy pedal. */
      const barPenalty = (Math.abs(barNeeded - 50) / 15) ** 2;

      /* Effort and travel are scored the same way and weighted the same,
         because they are not independent: for given rotors and pads their
         product is fixed, so a bore choice only slides along that curve.
         Penalising both symmetrically lands on the balanced compromise
         rather than satisfying one target at the other's expense. */
      const effortPenalty = Math.abs(pedalEffort - target) / target;
      const travelPenalty = Math.abs(pedalTravel - targetTravel) / targetTravel;

      out.push({
        front: f,
        rear: r,
        barNeeded,
        windowLow,
        windowHigh,
        pedalEffort,
        pedalTravel,
        strokeMismatch,
        strokeRatio,
        barPenalty,
        effortPenalty,
        travelPenalty,
      });
    }
  }

  /* Stroke balance is scored against the best this car can actually do, not
     against a matched pair. Delivering a high front bias through a balance
     bar forces a small front bore against a large rear one, so the two
     circuits can never displace equal strokes. On the default car nothing
     beats 2.1 to 1. Scoring against an unreachable ideal would penalise
     every pair equally and tell you nothing; scoring against the achievable
     minimum says "you could do better than this", which is actionable. */
  const bestStroke = out.length ? Math.min(...out.map((o) => o.strokeRatio)) : 1;
  for (const o of out) {
    o.strokePenalty = o.strokeRatio / bestStroke - 1;
    o.bestStrokeRatio = bestStroke;
    // How many pairs are workable, before near-identical bores are collapsed.
    o.feasibleCount = out.length;
    o.score = 1.2 * o.barPenalty + o.effortPenalty
      + o.travelPenalty + 0.8 * o.strokePenalty;
  }

  out.sort((a, b) => a.score - b.score);

  /* The supplied table carries sizes a few hundredths apart. 3/4 inch and
     19.0mm, 1-1/4 inch and 31.8mm, because both the imperial and metric
     designations are sold. Ranked straight, the shortlist fills with four
     spellings of one answer. Near-identical bores are collapsed so the list
     shows genuinely different choices; the kept one is the better-scoring,
     and its label says which designation to ask for. */
  const shortlist = [];
  for (const option of out) {
    const near = shortlist.some((kept) =>
      Math.abs(kept.front.bore - option.front.bore) < 0.25
      && Math.abs(kept.rear.bore - option.rear.bore) < 0.25);
    if (near) continue;
    shortlist.push(option);
    if (shortlist.length >= limit) break;
  }
  return shortlist;
}

/* --- The bias plot -------------------------------------------------------
   Front bias against deceleration, with the safe region shaded.

   The asymmetry is the whole point. Being a little front-biased is safe: the
   front locks first, the car ploughs straight on and the driver lifts. Being
   rear-biased is not: the rear locks first, the car spins, and there is no
   recovery from it at speed. So the target is a band that sits ABOVE the
   optimal line, never below it.

     below optimal            rear locks first. Unstable, avoid
     optimal to optimal + 7   the target: safely front-biased
     above optimal + 7        safe but wasteful, the front is doing too much

   Against that, three delivered curves: what the hardware gives at each end
   of the bias bar's travel, and what it gives at the setting in use. A
   selection of components is confirmed when the middle curve sits inside the
   green band across the deceleration range the car actually brakes over —
   which is a thing you can see at a glance and cannot read off any single
   number.
   ========================================================================== */

/* Points of front bias above optimal that still counts as a good target.
   From the source workbook, and it matches the usual advice: aim a few
   points front of neutral and leave the rear a margin. */
export const TARGET_MARGIN = 7;

export function biasPlot(input, { bar, from = 0.4, to = 1.6, steps = 25 } = {}) {
  const front = axleBrakes(input.front);
  const rear = axleBrakes(input.rear);
  const valve = { valveFitted: input.valveFitted, kneePsi: input.kneePsi, slope: input.slope };
  const lift = rearLiftDecel(input);

  const rows = [];
  for (let i = 0; i < steps; i++) {
    const decel = from + ((to - from) * i) / (steps - 1);
    const need = requiredBias({ ...input, decel });
    if (need.frontBias === undefined || need.rearAxle <= 0) break;

    const ctx = {
      pressureFront: pressureFor(need.torqueFront, front),
      torqueFront: need.torqueFront,
      rear,
      masterFront: input.boreFront,
      masterRear: input.boreRear,
      valve,
    };

    rows.push({
      decel,
      optimal: need.frontBias,
      targetHigh: Math.min(100, need.frontBias + TARGET_MARGIN),
      low: biasAtBar(BAR_RANGE.min, ctx),
      high: biasAtBar(BAR_RANGE.max, ctx),
      delivered: bar === undefined ? undefined : biasAtBar(bar, ctx),
      beyondLift: lift !== undefined && decel > lift,
    });
  }

  /* Where the delivered curve is inside the green band. The answer to
     "do these components suit the car". */
  const inBand = rows.filter((r) => r.delivered !== undefined
    && r.delivered >= r.optimal && r.delivered <= r.targetHigh && !r.beyondLift);

  /* And where it is below optimal, which is the condition to avoid. */
  const rearward = rows.filter((r) => r.delivered !== undefined
    && r.delivered < r.optimal && !r.beyondLift);

  return {
    rows,
    margin: TARGET_MARGIN,
    lift,
    inBand: inBand.length
      ? { from: inBand[0].decel, to: inBand[inBand.length - 1].decel }
      : undefined,
    rearBiased: rearward.length
      ? { from: rearward[0].decel, to: rearward[rearward.length - 1].decel }
      : undefined,
  };
}
