/* ==========================================================================
   Belt length and pulley ratio.

   Source: Engine_Calculators_-_Grid.xlsx, "Belt Length Calculator"
   Original: C9  = SUM(C14:E14)
             C14 = (C4+C5)*(3.14159/2)
             D14 = (C4-C5)*ASIN((C4-C5)/(2*C6))
             E14 = 2*SQRT((C6^2)-0.25*((C4-C5)^2))
             C11 = C4/C5          pulley ratio
             C12 = C7*C11         driven rpm

   That's the standard open-belt length formula and it's correct. Two things
   in the original were unfinished rather than wrong:

     - a metric/imperial toggle wired to nothing (H2/H3 were never read,
       and D4 was just =C4)
     - a "Target Output RPM" input that nothing referenced

   Units are handled at the UI boundary now, and target output rpm answers
   the obvious question: what drive speed does that need, on this ratio.

   Pure module. Canonical units:
     diameters, centre distance, belt length   mm
     speeds                                    rpm
   ========================================================================== */

/**
 * @param {object} input
 * @param {number} input.driveDiameter   Large (drive) pulley diameter, mm
 * @param {number} input.drivenDiameter  Small (driven) pulley diameter, mm
 * @param {number} input.centreDistance  Pulley centre to centre, mm
 * @param {number} [input.driveRpm]      Drive pulley speed, rpm
 * @param {number} [input.targetRpm]     Wanted driven speed, rpm
 */
export function beltLength({
  driveDiameter,
  drivenDiameter,
  centreDistance,
  driveRpm,
  targetRpm,
}) {
  if (!(driveDiameter > 0)) throw new Error('Drive pulley diameter must be greater than zero.');
  if (!(drivenDiameter > 0)) throw new Error('Driven pulley diameter must be greater than zero.');
  if (!(centreDistance > 0)) throw new Error('Centre distance must be greater than zero.');

  const difference = driveDiameter - drivenDiameter;
  const sum = driveDiameter + drivenDiameter;

  // The pulleys have to physically clear each other. Without this guard the
  // arc term goes imaginary and the sqrt returns NaN with no explanation.
  if (centreDistance <= Math.abs(difference) / 2) {
    throw new Error('Centre distance is too small for these pulley sizes. They would overlap.');
  }
  if (centreDistance < sum / 2) {
    throw new Error('Centre distance is smaller than the two pulley radii combined.');
  }

  const arcTerm = (Math.PI / 2) * sum;
  const wrapTerm = difference * Math.asin(difference / (2 * centreDistance));
  const spanTerm = 2 * Math.sqrt(centreDistance ** 2 - 0.25 * difference ** 2);

  const ratio = driveDiameter / drivenDiameter;

  return {
    length: arcTerm + wrapTerm + spanTerm,
    arcTerm,
    wrapTerm,
    spanTerm,
    ratio,
    drivenRpm: Number.isFinite(driveRpm) ? driveRpm * ratio : undefined,
    // Inverse of the above: to reach targetRpm at the driven pulley, this
    // is what the drive pulley has to turn at.
    requiredDriveRpm: Number.isFinite(targetRpm) ? targetRpm / ratio : undefined,
  };
}

/* --- Belt surface speed --------------------------------------------------
   Not in the original sheet, and a real design limit: past roughly 30 m/s
   most toothed and V belts start shedding life quickly, so it constrains
   pulley size independently of the ratio. Cheap to derive from what's
   already entered. */

export function beltSpeed({ driveDiameter, driveRpm }) {
  if (!Number.isFinite(driveRpm)) return undefined;
  // pi x D(mm) x rpm  ->  m/s
  return (Math.PI * driveDiameter * driveRpm) / 60000;
}

export function explain(input, result, fmt) {
  const difference = input.driveDiameter - input.drivenDiameter;

  return [
    {
      label: 'Wrap around both pulleys',
      expr: 'a = pi / 2 x (D + d)',
      values: `a = pi / 2 x (${fmt(input.driveDiameter)} + ${fmt(input.drivenDiameter)})`,
      result: `${fmt(result.arcTerm)} mm`,
      note: 'Together the two pulleys account for half a circumference of each, whatever their sizes.',
    },
    {
      label: 'Correction for the size difference',
      expr: 'b = (D - d) x arcsin((D - d) / 2C)',
      values: `b = ${fmt(difference)} x arcsin(${fmt(difference)} / ${fmt(2 * input.centreDistance)})`,
      result: `${fmt(result.wrapTerm)} mm`,
      note: 'The belt wraps further around the large pulley than the small one. This accounts for the difference, and falls to zero when both are the same size.',
    },
    {
      label: 'The two straight spans',
      expr: 'c = 2 x sqrt(C² - (D - d)² / 4)',
      values: `c = 2 x sqrt(${fmt(input.centreDistance)}² - ${fmt(difference)}² / 4)`,
      result: `${fmt(result.spanTerm)} mm`,
      note: 'Slightly longer than twice the centre distance, because the spans sit at an angle when the pulleys differ in size.',
    },
    {
      label: 'Total belt length',
      expr: 'L = a + b + c',
      values: `L = ${fmt(result.arcTerm)} + ${fmt(result.wrapTerm)} + ${fmt(result.spanTerm)}`,
      result: `${fmt(result.length)} mm`,
      note: 'Buy the nearest available size up, then set final tension with the centre distance.',
    },
    {
      label: 'Pulley ratio',
      expr: 'R = D / d',
      values: `R = ${fmt(input.driveDiameter)} / ${fmt(input.drivenDiameter)}`,
      result: `${fmt(result.ratio)} : 1`,
      note: 'The driven pulley turns this many times for each turn of the drive pulley.',
    },
  ];
}

/* --- Diagram geometry ----------------------------------------------------
   The drawn belt path and the calculated length come from the same angle,
   so the picture can't drift out of agreement with the number. The parity
   suite asserts that: `pathLength` here must equal `length` above.

   Returned in SVG coordinates (y increasing downward), with the large
   pulley's leftmost point at x = 0 and both centres on y = maxRadius.   */

export function beltGeometry({ driveDiameter, drivenDiameter, centreDistance }) {
  const R = driveDiameter / 2;
  const r = drivenDiameter / 2;
  const C = centreDistance;

  // Unit normal of the external tangent. nx is fixed by the radii and the
  // centre distance; it's the sine of the tangent's angle to the centre line.
  const nx = (R - r) / C;
  const ny = Math.sqrt(Math.max(0, 1 - nx * nx));
  const alpha = Math.asin(Math.max(-1, Math.min(1, nx)));

  const maxR = Math.max(R, r);
  const drive = { cx: R, cy: maxR, r: R };
  const driven = { cx: R + C, cy: maxR, r };

  // Tangent points: centre + radius x normal, mirrored about the centre line.
  const p = (circle, sign) => ({
    x: circle.cx + circle.r * nx,
    y: circle.cy + sign * circle.r * ny,
  });

  const driveTop = p(drive, -1);
  const driveBottom = p(drive, 1);
  const drivenTop = p(driven, -1);
  const drivenBottom = p(driven, 1);

  // Wrap angles. The belt covers more than half of the larger pulley and
  // less than half of the smaller one; at equal sizes both are exactly half.
  const wrapDrive = Math.PI + 2 * alpha;
  const wrapDriven = Math.PI - 2 * alpha;
  const span = C * ny;

  const n = (v) => Number(v.toFixed(3));
  const arc = (radius, wrap, to) =>
    `A ${n(radius)} ${n(radius)} 0 ${wrap > Math.PI ? 1 : 0} 1 ${n(to.x)} ${n(to.y)}`;

  // One clockwise loop: along the top, round the driven pulley, back along
  // the bottom, round the drive pulley.
  const path = [
    `M ${n(driveTop.x)} ${n(driveTop.y)}`,
    `L ${n(drivenTop.x)} ${n(drivenTop.y)}`,
    arc(r, wrapDriven, drivenBottom),
    `L ${n(driveBottom.x)} ${n(driveBottom.y)}`,
    arc(R, wrapDrive, driveTop),
    'Z',
  ].join(' ');

  return {
    path,
    drive,
    driven,
    width: R + C + r,
    height: 2 * maxR,
    alpha,
    wrapDrive,
    wrapDriven,
    // Same quantity as `length` from beltLength(), derived from the drawing.
    pathLength: R * wrapDrive + r * wrapDriven + 2 * span,
  };
}

/* --- Pulley sizing suggestions -------------------------------------------
   The calculator answers "what does this setup do". This answers the
   opposite question, "what setup do I need." Given a drive speed and a
   target driven speed, there are two independent ways to get there: resize
   the driven pulley (the usual case. The drive pulley is often a fixed
   crank pulley) or resize the drive pulley (when the driven component's
   pulley is the one that's fixed). Both fall out of the same equal-surface-
   speed relationship the length formula already uses, so nothing new is
   being modelled. Just solved for a different unknown.

   Returns undefined when there's nothing to solve. No target set, or the
   target already equals the current setup. Rather than throwing, since
   this is a secondary panel that should disappear quietly, not produce an
   error banner over an otherwise valid calculation.                       */

export function pulleySuggestion({ driveDiameter, drivenDiameter, driveRpm, targetRpm }) {
  if (!Number.isFinite(driveRpm) || !(driveRpm > 0)) return undefined;
  if (!Number.isFinite(targetRpm) || !(targetRpm > 0)) return undefined;

  // The ratio (drive:driven) that would put the driven pulley exactly on
  // target at the drive speed already entered.
  const neededRatio = targetRpm / driveRpm;

  return {
    neededRatio,
    // Resize the driven pulley, keep the drive pulley as entered.
    suggestedDrivenDiameter: driveDiameter / neededRatio,
    // Resize the drive pulley, keep the driven pulley as entered.
    suggestedDriveDiameter: drivenDiameter * neededRatio,
  };
}

export function explainSuggestion(input, result, fmt) {
  if (!result) return [];
  return [
    {
      label: 'Ratio needed to hit the target',
      expr: 'needed ratio = target rpm / drive rpm',
      values: `= ${fmt(input.targetRpm)} / ${fmt(input.driveRpm)}`,
      result: `${fmt(result.neededRatio)} : 1`,
    },
    {
      label: 'Driven pulley, if the drive pulley stays as entered',
      expr: 'driven = drive diameter / needed ratio',
      values: `= ${fmt(input.driveDiameter)} / ${fmt(result.neededRatio)}`,
      result: `${fmt(result.suggestedDrivenDiameter)} mm`,
      note: "This is the usual case: the drive pulley is often a fixed crank pulley, so the driven pulley is what you'd change.",
    },
    {
      label: 'Drive pulley, if the driven pulley stays as entered',
      expr: 'drive = driven diameter x needed ratio',
      values: `= ${fmt(input.drivenDiameter)} x ${fmt(result.neededRatio)}`,
      result: `${fmt(result.suggestedDriveDiameter)} mm`,
      note: "Useful when the driven component's pulley is the fixed one instead. A supercharger or alternator pulley you can't easily change.",
    },
  ];
}
