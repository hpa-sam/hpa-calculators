/* ==========================================================================
   Centre of gravity, from corner weights and an axle lift.

   Source: CoG_Calculator_-_Grid.xlsx (MAIN / CALCULATIONS sheets)

   Pure module. No DOM, no imports. Canonical units:
     lengths   mm
     weights   kg
     angles    degrees

   Two things worth knowing before changing anything here.

   The height formula is exact, not an approximation. Taking moments about
   the front contact patch with the car tilted through theta:

       W_ground_lifted x WB cos(theta) = W x (a cos(theta) + (h - R) sin(theta))

   the cos(theta) terms cancel, leaving h = R + dW x WB / (W tan(theta)) with
   the *level* wheelbase. An earlier review of the spreadsheet suggested
   correcting the wheelbase for lift angle; that was wrong, and would have
   introduced a 2% error at 20 degrees and 5% at 30.

   The accuracy limit is the weight delta, which is a difference of two
   comparable readings and so amplifies scale error. Unlike deck clearance
   in the engine calculator there is no way to restructure that away. The
   delta *is* the measurement. What can be controlled is the leverage, and
   lift angle sets it: at 5 degrees one kilogram of scale error is 21mm of
   CoG height, at 20 degrees it is 5mm. So sensitivity is reported as a
   first-class output rather than buried.
   ========================================================================== */

/**
 * Static weight distribution. Needs no lift, so it answers on its own.
 *
 * @param {object} input
 * @param {number} input.frontLeft    kg
 * @param {number} input.frontRight   kg
 * @param {number} input.rearLeft     kg
 * @param {number} input.rearRight    kg
 * @param {number} input.wheelbase    mm
 * @param {number} input.trackFront   mm
 * @param {number} input.trackRear    mm
 */
export function weightDistribution({
  frontLeft, frontRight, rearLeft, rearRight, wheelbase, trackFront, trackRear,
}) {
  for (const [name, v] of Object.entries({ frontLeft, frontRight, rearLeft, rearRight })) {
    if (!(v >= 0) || !Number.isFinite(v)) throw new Error(`${name} corner weight is missing.`);
  }
  if (!(wheelbase > 0)) throw new Error('Wheelbase must be greater than zero.');
  if (!(trackFront > 0) || !(trackRear > 0)) throw new Error('Both track widths are needed.');

  const total = frontLeft + frontRight + rearLeft + rearRight;
  if (!(total > 0)) throw new Error('Total weight works out at zero. Check the corner weights.');

  const frontAxle = frontLeft + frontRight;
  const rearAxle = rearLeft + rearRight;
  const leftSide = frontLeft + rearLeft;

  const frontRatio = frontAxle / total;
  const leftRatio = leftSide / total;
  const averageTrack = (trackFront + trackRear) / 2;

  /* Cross weight: the diagonal pair as a share of the total. 50% means the
     car sits square on its springs, which is what matters on an oval or a
     circuit with one dominant corner direction. */
  const crossWeight = (frontLeft + rearRight) / total;

  return {
    total,
    frontAxle,
    rearAxle,
    frontRatio,
    leftRatio,
    crossWeight,
    // Longitudinal position, measured back from the front axle centreline.
    cgFromFrontAxle: wheelbase * (1 - frontRatio),
    /* Lateral offset from the car's centreline, positive to the right.
       Uses the average track, because the CoG sits between the axles. */
    cgLateralOffset: averageTrack * (0.5 - leftRatio),
    averageTrack,
  };
}

/**
 * CoG height, from re-weighing with one axle raised.
 *
 * @param {object} input                All of weightDistribution's inputs, plus:
 * @param {number} input.tyreRadius     mm, loaded radius at the axle on the ground
 * @param {number} input.liftHeight     mm, how far the raised axle centre went up
 * @param {'front'|'rear'} input.raisedAxle
 * @param {number} input.liftedGroundWeight  kg, total on the axle still down
 */
export function cgHeight(input) {
  const { tyreRadius, liftHeight, raisedAxle, liftedGroundWeight, wheelbase } = input;
  const dist = weightDistribution(input);

  if (!(tyreRadius > 0)) throw new Error('Tyre radius must be greater than zero.');
  if (!(liftHeight > 0)) throw new Error('Lift height must be greater than zero.');
  if (!(liftHeight < wheelbase)) throw new Error('Lift height must be less than the wheelbase.');
  if (raisedAxle !== 'front' && raisedAxle !== 'rear') {
    throw new Error('Say which axle was raised.');
  }
  if (!(liftedGroundWeight > 0)) throw new Error('Weight on the axle still on the ground is needed.');

  /* Lift height is the input rather than lift angle, because height is what
     someone measures with a tape against the hub. The angle follows. */
  const sinTheta = liftHeight / wheelbase;
  const liftAngle = (Math.asin(sinTheta) * 180) / Math.PI;
  const tanTheta = sinTheta / Math.sqrt(1 - sinTheta * sinTheta);

  const groundAxleLevel = raisedAxle === 'front' ? dist.rearAxle : dist.frontAxle;
  const weightTransferred = liftedGroundWeight - groundAxleLevel;

  /* mm of CoG height per kg of scale error. Closed form, so it needs no
     differencing of its own. This is the number that decides whether a
     measurement was worth taking. */
  const mmPerKg = wheelbase / (dist.total * tanTheta);

  return {
    ...dist,
    liftAngle,
    groundAxleLevel,
    weightTransferred,
    height: tyreRadius + weightTransferred * mmPerKg,
    mmPerKg,
    /* Weight always moves onto the axle still on the ground, so a delta of
       zero or less means the wrong axle was named, the scales drifted, or
       the suspension is binding on the jack. */
    transferLooksWrong: weightTransferred <= 0,
  };
}

export function explainDistribution(input, r, fmt) {
  return [
    {
      label: 'Total weight',
      expr: 'W = FL + FR + RL + RR',
      values: `W = ${fmt(input.frontLeft)} + ${fmt(input.frontRight)} + ${fmt(input.rearLeft)} + ${fmt(input.rearRight)}`,
      result: `${fmt(r.total)} kg`,
    },
    {
      label: 'Longitudinal position',
      expr: 'distance back from front axle = WB x rear weight share',
      values: `= ${fmt(input.wheelbase)} x ${fmt(1 - r.frontRatio)}`,
      result: `${fmt(r.cgFromFrontAxle)} mm behind the front axle`,
      note: 'Follows straight from the axle weights. No lift needed. A front-engined rear-drive car usually lands between 52 and 58 percent front.',
    },
    {
      label: 'Lateral offset',
      expr: 'offset = average track x (0.5 - left weight share)',
      values: `= ${fmt(r.averageTrack)} x (0.5 - ${fmt(r.leftRatio)})`,
      result: `${fmt(Math.abs(r.cgLateralOffset))} mm to the ${r.cgLateralOffset >= 0 ? 'right' : 'left'}`,
      note: 'Average track is used because the centre of gravity sits between the axles, not at one of them.',
    },
    {
      label: 'Cross weight',
      expr: 'cross = (FL + RR) / W',
      values: `= (${fmt(input.frontLeft)} + ${fmt(input.rearRight)}) / ${fmt(r.total)}`,
      result: `${fmt(r.crossWeight * 100)} %`,
      note: 'Fifty percent means the car sits square on its springs. Deliberate offsets are used on ovals and on circuits with one dominant corner direction.',
    },
  ];
}

export function explainHeight(input, r, fmt) {
  return [
    {
      label: 'Lift angle, from the height you measured',
      expr: 'sin(theta) = lift height / wheelbase',
      values: `sin(theta) = ${fmt(input.liftHeight)} / ${fmt(input.wheelbase)}`,
      result: `${fmt(r.liftAngle)}°`,
      note: 'Height is the input because that is what a tape measure gives you at the hub. The angle follows from it.',
    },
    {
      label: 'Weight moved onto the axle still down',
      expr: 'dW = lifted reading - level reading',
      values: `dW = ${fmt(input.liftedGroundWeight)} - ${fmt(r.groundAxleLevel)}`,
      result: `${fmt(r.weightTransferred)} kg`,
      note: 'Raising one end tips weight onto the other, and how much depends on how high the centre of gravity is. That is the whole measurement.',
    },
    {
      label: 'Centre of gravity height',
      expr: 'h = tyre radius + dW x WB / (W x tan(theta))',
      values: `h = ${fmt(input.tyreRadius)} + ${fmt(r.weightTransferred)} x ${fmt(input.wheelbase)} / (${fmt(r.total)} x tan ${fmt(r.liftAngle)}°)`,
      result: `${fmt(r.height)} mm above the ground`,
      note: 'Exact for a rigid car, using the level wheelbase. The lift-angle terms cancel in the derivation, so no correction for them is needed.',
    },
    {
      label: 'How much a scale error costs you',
      expr: 'mm per kg = WB / (W x tan(theta))',
      values: `= ${fmt(input.wheelbase)} / (${fmt(r.total)} x tan ${fmt(r.liftAngle)}°)`,
      result: `${fmt(r.mmPerKg)} mm per kg`,
      note: `Lift angle sets this, and it moves fast: around 5° a kilogram of error is over 20mm of height, by 20° it is nearer 5mm. Raise the car as far as you safely can, and settle the suspension before reading the scales.`,
    },
  ];
}
