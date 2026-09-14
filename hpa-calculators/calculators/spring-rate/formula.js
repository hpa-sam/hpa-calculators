/* ==========================================================================
   Spring rate from a target ride frequency.

   Source: Anti-Roll_Bar_Stiffness_Calculator_Grid_is.xlsx,
           "Spring Stiffness v Natural Freq"

   Pure module. No DOM, no imports. Canonical units:
     mass        kg
     stiffness   N/mm
     frequency   Hz

   The maths in the sheet is right, and this reproduces it exactly. Two
   things about it were limitations rather than errors:

   1. One target frequency was applied to both ends. Ride quality depends on
      the front-to-rear split, not just the absolute figure, so front and
      rear targets are separate here and the resulting split is reported.

   2. "Unsprung Weight Front (kg)" was subtracted whole from a single corner,
      so it meant per corner, but the label didn't say so, and per axle is
      the other obvious reading. Now stated explicitly.

   Both sensitivities are squared laws, which is the practical point:
   rate goes as frequency squared and as motion ratio squared, so 0.1 Hz is
   worth about 10% and a motion ratio measured 0.05 out is worth about 7%.
   ========================================================================== */

const TWO_PI_SQ = 4 * Math.PI * Math.PI;

/**
 * Wheel rate needed to give a sprung corner mass a chosen ride frequency.
 * From f = (1/2pi) x sqrt(k/m), so k = m (2 pi f)².
 */
export function wheelRateFor(sprungCornerMass, frequency) {
  return (sprungCornerMass * TWO_PI_SQ * frequency * frequency) / 1000;   // N/mm
}

/**
 * @param {object} input
 * @param {number} input.totalMass        kg, as weighed
 * @param {number} input.frontPercent     % of total on the front axle
 * @param {number} input.unsprungFront    kg per corner
 * @param {number} input.unsprungRear     kg per corner
 * @param {number} input.motionRatioFront wheel travel / spring travel
 * @param {number} input.motionRatioRear  wheel travel / spring travel
 * @param {number} input.frequencyFront   Hz
 * @param {number} input.frequencyRear    Hz
 */
export function springRate({
  totalMass, frontPercent, unsprungFront, unsprungRear,
  motionRatioFront, motionRatioRear, frequencyFront, frequencyRear,
}) {
  if (!(totalMass > 0)) throw new Error('Total mass must be greater than zero.');
  if (!(frontPercent > 0) || !(frontPercent < 100)) {
    throw new Error('Front weight share must be between 0 and 100 percent.');
  }
  if (!(motionRatioFront > 0) || !(motionRatioRear > 0)) {
    throw new Error('Both motion ratios must be greater than zero.');
  }
  if (!(frequencyFront > 0) || !(frequencyRear > 0)) {
    throw new Error('Both target ride frequencies must be greater than zero.');
  }

  const frontAxle = totalMass * (frontPercent / 100);
  const rearAxle = totalMass - frontAxle;

  const end = (axleMass, unsprung, motionRatio, frequency) => {
    const corner = axleMass / 2;
    const sprung = corner - unsprung;
    if (!(sprung > 0)) {
      throw new Error('Unsprung mass is at least the whole corner weight. Check it is per corner, not per axle.');
    }
    const wheelRate = wheelRateFor(sprung, frequency);
    const springRate = wheelRate * motionRatio * motionRatio;

    /* Squared-law sensitivities, stated because both are things people
       estimate rather than measure. Motion ratio especially: it is taken off
       a suspension drawing or a tape measure and 0.05 is easy to be out by. */
    return {
      cornerMass: corner,
      sprungMass: sprung,
      unsprungShare: unsprung / corner,
      wheelRate,
      springRate,
      perHundredthRatio: wheelRateFor(sprung, frequency) * ((motionRatio + 0.01) ** 2 - motionRatio ** 2),
      perTenthHz: (wheelRateFor(sprung, frequency + 0.1) - wheelRate) * motionRatio * motionRatio,
      perKgUnsprung: wheelRateFor(1, frequency) * motionRatio * motionRatio,
    };
  };

  const front = end(frontAxle, unsprungFront, motionRatioFront, frequencyFront);
  const rear = end(rearAxle, unsprungRear, motionRatioRear, frequencyRear);

  return {
    frontAxle,
    rearAxle,
    front,
    rear,
    /* Rear over front. The front meets a bump first, so a rear a little
       stiffer catches up in phase and the pitching dies away instead of
       building; downforce cars often run it the other way. Either way it is a deliberate choice, which is
       why one shared target was worth splitting. */
    frequencySplit: frequencyRear / frequencyFront,
  };
}

/** Spring rate at a range of target frequencies, for choosing one. */
export function frequencySweep(input, { from = 1.0, to = 3.0, step = 0.25 } = {}) {
  const rows = [];
  for (let f = from; f <= to + 1e-9; f += step) {
    const at = Number(f.toFixed(3));
    const r = springRate({ ...input, frequencyFront: at, frequencyRear: at });
    rows.push({
      frequency: at,
      front: r.front.springRate,
      rear: r.rear.springRate,
      current: Math.abs(at - input.frequencyFront) < step / 2,
    });
  }
  return rows;
}

export function explain(input, r, fmt) {
  return [
    {
      label: 'Sprung mass at one corner',
      expr: 'sprung = axle mass / 2 - unsprung per corner',
      values: `front: ${fmt(r.frontAxle)} / 2 - ${fmt(input.unsprungFront)} = ${fmt(r.front.sprungMass)} kg`,
      result: `rear: ${fmt(r.rear.sprungMass)} kg`,
      note: `Unsprung mass is per corner. Wheel, tyre, hub, brake and roughly half the arms. It is ${fmt(r.front.unsprungShare * 100)}% of the front corner here, and a figure people estimate, so it is worth weighing if you can.`,
    },
    {
      label: 'Wheel rate for the target frequency',
      expr: 'k = m (2 pi f)²',
      values: `front: ${fmt(r.front.sprungMass)} x (2 pi x ${fmt(input.frequencyFront)})²`,
      result: `${fmt(r.front.wheelRate)} N/mm at the wheel`,
      note: 'Ride frequency is the undamped natural frequency of that corner on its spring. It is the figure that makes cars of different weights feel alike, which is why setups are specified in Hz rather than in spring rate.',
    },
    {
      label: 'Spring rate from wheel rate',
      expr: 'spring rate = wheel rate x motion ratio²',
      values: `front: ${fmt(r.front.wheelRate)} x ${fmt(input.motionRatioFront)}²`,
      result: `${fmt(r.front.springRate)} N/mm at the spring`,
      note: 'Motion ratio here is wheel travel divided by spring travel, so it is 1.0 or more for almost every suspension. The square is why it matters so much: a rocker or inboard spring with a ratio of 1.5 needs a spring more than twice the wheel rate.',
    },
    {
      label: 'How accurate that is',
      expr: 'rate goes as f² and as motion ratio²',
      values: `0.01 of motion ratio moves the rear spring by ${fmt(r.rear.perHundredthRatio)} N/mm`,
      result: `0.1 Hz moves it by ${fmt(r.rear.perTenthHz)} N/mm`,
      note: 'Both are squared laws. Measure the motion ratio properly. Through the full travel, not just at ride height, since it changes as the suspension moves.',
    },
    {
      label: 'Front to rear frequency split',
      expr: 'split = rear frequency / front frequency',
      values: `${fmt(input.frequencyRear)} / ${fmt(input.frequencyFront)}`,
      result: `${fmt(r.frequencySplit)}`,
      note: 'The front wheels meet a bump first, so the ends start out of step. A rear a little stiffer catches up in phase and the pitching dies away; at equal frequencies it does not, and the car see-saws. Downforce cars often invert it, running the front stiffer to keep the platform under aero load.',
    },
  ];
}

/* --- The other direction ------------------------------------------------
   Spring rate to ride frequency, for the spring already on the car.

   A target frequency on its own is hard to judge: 2.0 Hz means little until
   you know the car is currently at 1.6. So the calculator works both ways —
   what rate a target needs, and what frequency the current rate gives. The
   gap between them is the size of the change being considered.
   ========================================================================== */

/** Ride frequency of a sprung corner mass on a given wheel rate. */
export function frequencyFor(sprungCornerMass, wheelRate) {
  if (!(sprungCornerMass > 0)) throw new Error('Sprung mass must be greater than zero.');
  if (!(wheelRate > 0)) throw new Error('Wheel rate must be greater than zero.');
  // k in N/mm -> N/m, so the result is in Hz.
  return Math.sqrt((wheelRate * 1000) / sprungCornerMass) / (2 * Math.PI);
}

/**
 * What the springs currently fitted are giving.
 *
 * @param {object} input        The same inputs springRate() takes, plus:
 * @param {number} input.currentSpringFront  N/mm at the spring, 0 or blank to skip
 * @param {number} input.currentSpringRear   N/mm at the spring
 */
export function currentFrequency(input) {
  const r = springRate(input);
  const end = (side, rate, motionRatio, target) => {
    if (!(rate > 0)) return undefined;
    const wheelRate = rate / (motionRatio * motionRatio);
    const frequency = frequencyFor(side.sprungMass, wheelRate);
    return {
      springRate: rate,
      wheelRate,
      frequency,
      // Signed against the target, so the direction of the change is plain.
      change: frequency - target,
      /* Rate ratio to reach the target. Frequency goes as the square root of
         rate, so a 10% frequency change needs about 21% more spring, which
         is the part people misjudge. */
      rateFactor: (target / frequency) ** 2,
    };
  };

  return {
    ...r,
    currentFront: end(r.front, input.currentSpringFront, input.motionRatioFront, input.frequencyFront),
    currentRear: end(r.rear, input.currentSpringRear, input.motionRatioRear, input.frequencyRear),
  };
}

export function explainCurrent(input, c, fmt) {
  const rows = [];
  for (const [label, cur, target] of [
    ['Front', c.currentFront, input.frequencyFront],
    ['Rear', c.currentRear, input.frequencyRear],
  ]) {
    if (!cur) continue;
    rows.push({
      label: `${label}: what the spring fitted is giving`,
      expr: 'f = sqrt(k / m) / 2 pi,  k = spring rate / motion ratio²',
      values: `${fmt(cur.springRate)} N/mm at the spring is ${fmt(cur.wheelRate)} N/mm at the wheel`,
      result: `${fmt(cur.frequency)} Hz against a ${fmt(target)} Hz target`,
      note: `Frequency goes as the square root of rate, so closing that gap needs ${fmt(cur.rateFactor * 100)}% of the current spring. About ${fmt(Math.abs(cur.rateFactor - 1) * 100)}% ${cur.rateFactor > 1 ? 'stiffer' : 'softer'}. A 10% change in frequency is roughly 21% of spring, which is the part most people underestimate.`,
    });
  }
  return rows;
}
