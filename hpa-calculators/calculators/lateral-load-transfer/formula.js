/* ==========================================================================
   Lateral load transfer distribution (LLTD).

   Source: HPA_LLTD_Calculator_-_Grid.xlsx (MAIN / CALCS)

   Pure module. No DOM, no imports. Canonical units:
     lengths     mm
     mass        kg
     stiffness   N/mm
     roll rate   Nm per degree
     angle       degrees

   WHAT THIS NUMBER IS FOR
   -----------------------
   In a corner, load moves from the inside wheels to the outside ones. LLTD
   is the share of that movement taken by the front axle. It is the single
   most useful figure for balance, because a tyre loses grip faster than it
   gains it: an axle asked to carry a bigger share of the transfer loses
   relatively more grip, so the car turns away from it.

   The comparison that matters is LLTD against static front weight
   distribution:

     LLTD % front  >  front mass %   ->  front works harder  ->  understeer
     LLTD % front  <  front mass %   ->  rear works harder   ->  oversteer

   Three mechanisms move load, and they behave very differently:

     unsprung   acts straight through the hubs, no roll involved. Essentially
                fixed once the car is built.
     elastic    through the springs and bars as the body rolls. The main
                tuning lever.
     geometric  through the suspension links, set by roll centre heights.
                Instant. It doesn't wait for the body to roll.

   Knowing the split tells you which lever will actually work.

   ONE RESULT THAT SURPRISES PEOPLE
   --------------------------------
   LLTD does not change with lateral g. The model is linear, so more g means
   more transfer at both ends in the same proportion. Cornering load changes
   the wheel loads and whether a wheel lifts; it does not change the balance.
   The g input is there for the wheel loads, not for the distribution.

   The source sheet expressed roll rates as `tan(1 degree)` where radians
   belong. That cancels out of LLTD entirely. Every roll rate scales by the
   same factor, and shifts roll angle and gradient by 0.01%. Radians are
   used here.
   ========================================================================== */

const DEG = Math.PI / 180;
const G = 9.81;

function solve({
  wheelbase, trackFront, trackRear,
  totalMass, frontMassPercent, unsprungFront, unsprungRear,
  cogHeight, unsprungCogFront, unsprungCogRear,
  springFront, springRear, arbFront, arbRear,
  springMrFront, springMrRear, arbMrFront, arbMrRear,
  rollCentreFront, rollCentreRear, lateralG,
}) {
  const sprungMass = totalMass - 2 * (unsprungFront + unsprungRear);
  if (!(sprungMass > 0)) {
    throw new Error('Unsprung mass adds up to the whole car. Check both figures are per corner, not per axle.');
  }

  // Sprung mass distribution, and where its centre of gravity sits.
  const sprungFrontPercent =
    ((totalMass * frontMassPercent) / 100 - unsprungFront * 2) / sprungMass * 100;
  const sprungCogX = ((100 - sprungFrontPercent) / 100) * wheelbase;
  const sprungCogZ =
    (totalMass * cogHeight
      - (2 * unsprungFront * unsprungCogFront + 2 * unsprungRear * unsprungCogRear))
    / sprungMass;

  // Rates at the wheel. Motion ratio is wheel travel over component travel,
  // so it divides out squared. The same convention as the spring and bar
  // calculators, which is what lets their outputs feed straight in here.
  const wheelSpringFront = springFront / springMrFront ** 2;
  const wheelSpringRear = springRear / springMrRear ** 2;
  const wheelArbFront = arbFront / arbMrFront ** 2;
  const wheelArbRear = arbRear / arbMrRear ** 2;

  /* Axle roll rate, Nm per degree.

     Springs get a factor of one half and the bar does not, and that is not
     an error. Rolling by theta moves each wheel by half the track times
     theta, so a pair of independent springs gives k t² / 2. A roll bar
     resists the two wheels moving oppositely, which is exactly what roll
     is, so its full wheel rate acts across the whole track: k t². The
     difference rests on the bar rate being quoted per wheel with the other
     side held, which is what the anti-roll bar calculator produces. */
  const rollSpringFront = ((trackFront / 1000) ** 2 * DEG * wheelSpringFront * 1000) / 2;
  const rollSpringRear = ((trackRear / 1000) ** 2 * DEG * wheelSpringRear * 1000) / 2;
  const rollArbFront = wheelArbFront * 1000 * (trackFront / 1000) ** 2 * DEG;
  const rollArbRear = wheelArbRear * 1000 * (trackRear / 1000) ** 2 * DEG;
  const rollTotal = rollSpringFront + rollSpringRear + rollArbFront + rollArbRear;
  if (!(rollTotal > 0)) throw new Error('Total roll stiffness is zero. Check the spring and bar rates.');

  /* Roll moment arm: sprung CoG height above the roll axis, measured where
     the CoG sits along the car. The roll axis is the line between the front
     and rear roll centres, so it is interpolated, not averaged. */
  const rollAxisAtCog = ((rollCentreRear - rollCentreFront) / wheelbase) * sprungCogX + rollCentreFront;
  const rollMomentArm = sprungCogZ - rollAxisAtCog;
  const rollMoment = (sprungMass * G * lateralG * rollMomentArm) / 1000;   // Nm

  const rollAngle = rollMoment / rollTotal;                                 // degrees
  const rollGradient = lateralG === 0 ? 0 : rollAngle / lateralG;           // deg per G

  // The three mechanisms, per axle, in kg of transferred load.
  const unsprungLltFront = (2 * unsprungFront * lateralG * unsprungCogFront) / trackFront;
  const unsprungLltRear = (2 * unsprungRear * lateralG * unsprungCogRear) / trackRear;

  const elasticFront =
    (sprungMass * lateralG * rollMomentArm * ((rollSpringFront + rollArbFront) / rollTotal)) / trackFront;
  const elasticRear =
    (sprungMass * lateralG * rollMomentArm * ((rollSpringRear + rollArbRear) / rollTotal)) / trackRear;

  const geometricFront =
    (sprungMass * (sprungFrontPercent / 100) * lateralG * rollCentreFront) / trackFront;
  const geometricRear =
    (sprungMass * ((100 - sprungFrontPercent) / 100) * lateralG * rollCentreRear) / trackRear;

  const transferFront = unsprungLltFront + elasticFront + geometricFront;
  const transferRear = unsprungLltRear + elasticRear + geometricRear;
  const transferTotal = transferFront + transferRear;

  // Static axle loads per wheel, before transfer.
  const staticFront = (totalMass * frontMassPercent) / 100 / 2;
  const staticRear = (totalMass * (1 - frontMassPercent / 100)) / 2;

  const wheelLoads = {
    frontInner: staticFront - transferFront,
    frontOuter: staticFront + transferFront,
    rearInner: staticRear - transferRear,
    rearOuter: staticRear + transferRear,
  };

  const lltd = transferTotal === 0 ? 50 : (transferFront / transferTotal) * 100;

  return {
    sprungMass,
    sprungFrontPercent,
    sprungCogX,
    sprungCogZ,
    wheelSpringFront, wheelSpringRear, wheelArbFront, wheelArbRear,
    rollSpringFront, rollSpringRear, rollArbFront, rollArbRear, rollTotal,
    rollAxisAtCog, rollMomentArm, rollMoment, rollAngle, rollGradient,
    unsprungLltFront, unsprungLltRear,
    elasticFront, elasticRear,
    geometricFront, geometricRear,
    transferFront, transferRear, transferTotal,
    wheelLoads,

    // Share of all transfer taken by each mechanism.
    shareUnsprung: ((unsprungLltFront + unsprungLltRear) / transferTotal) * 100,
    shareElastic: ((elasticFront + elasticRear) / transferTotal) * 100,
    shareGeometric: ((geometricFront + geometricRear) / transferTotal) * 100,

    // And how each mechanism splits front to rear.
    lltdUnsprung: (unsprungLltFront / (unsprungLltFront + unsprungLltRear)) * 100,
    lltdElastic: (elasticFront / (elasticFront + elasticRear)) * 100,
    lltdGeometric: (geometricFront / (geometricFront + geometricRear)) * 100,
    lltd,

    /* The interpretation. A tyre loses grip faster than it gains it, so the
       axle carrying more than its share of transfer loses relatively more
       grip and the car turns away from it. */
    balanceBias: lltd - frontMassPercent,

    /* Validity: the model assumes all four wheels are loaded. The axle that
       lifts is the one whose inner load is lower. Checking front first
       reported the wrong end whenever both were airborne, and it is the
       rear that goes light first on this car.

       liftG is the more useful figure: the lateral g at which the first
       inner wheel reaches zero. Transfer is linear in g, so it scales
       directly, and beyond it every number here is meaningless. */
    liftedWheel:
      Math.min(wheelLoads.frontInner, wheelLoads.rearInner) > 0
        ? null
        : wheelLoads.rearInner <= wheelLoads.frontInner ? 'rear inner' : 'front inner',

    liftG: lateralG === 0 ? undefined : Math.min(
      (staticFront / transferFront) * lateralG,
      (staticRear / transferRear) * lateralG,
    ),
  };
}

/**
 * Full model plus the tuning sensitivities, which are what make the number
 * usable: knowing LLTD is 52% only helps if you know what moves it.
 */
export function lateralLoadTransfer(input) {
  const base = solve(input);

  const shift = (changes) => {
    try {
      return solve({ ...input, ...changes }).lltd - base.lltd;
    } catch {
      return undefined;
    }
  };

  return {
    ...base,
    levers: {
      arbFrontTenPercent: shift({ arbFront: input.arbFront * 1.1 }),
      arbRearTenPercent: shift({ arbRear: input.arbRear * 1.1 }),
      springFrontTenPercent: shift({ springFront: input.springFront * 1.1 }),
      rollCentreFrontTenMm: shift({ rollCentreFront: input.rollCentreFront + 10 }),
      rollCentreRearTenMm: shift({ rollCentreRear: input.rollCentreRear + 10 }),
    },
  };
}

export function explain(input, r, fmt) {
  const dominant = r.shareElastic >= r.shareGeometric && r.shareElastic >= r.shareUnsprung
    ? 'elastic'
    : r.shareGeometric >= r.shareUnsprung ? 'geometric' : 'unsprung';

  return [
    {
      label: 'Sprung mass and where its centre of gravity sits',
      expr: 'sprung = total - 2 x (front unsprung + rear unsprung)',
      values: `${fmt(input.totalMass)} - 2 x (${fmt(input.unsprungFront)} + ${fmt(input.unsprungRear)})`,
      result: `${fmt(r.sprungMass)} kg, CoG ${fmt(r.sprungCogZ)} mm up`,
      note: 'Unsprung figures are per corner. Taking the unsprung mass out raises the sprung CoG, because wheels and hubs sit low.',
    },
    {
      label: 'Roll moment arm',
      expr: 'arm = sprung CoG height - roll axis height beneath it',
      values: `${fmt(r.sprungCogZ)} - ${fmt(r.rollAxisAtCog)}`,
      result: `${fmt(r.rollMomentArm)} mm`,
      note: 'The roll axis runs between the front and rear roll centres, so its height is interpolated at the point the CoG sits along the car, not averaged between the ends.',
    },
    {
      label: 'Axle roll stiffness',
      expr: 'springs: k t² / 2 per axle   bar: k t²',
      values: `front ${fmt(r.rollSpringFront)} + ${fmt(r.rollArbFront)}, rear ${fmt(r.rollSpringRear)} + ${fmt(r.rollArbRear)}`,
      result: `${fmt(r.rollTotal)} Nm per degree`,
      note: 'Springs carry a factor of one half and the bar does not. Rolling moves each wheel half a track, so a pair of springs gives k t² / 2; a bar resists the wheels moving oppositely, which is what roll is, so its full wheel rate acts across the track.',
    },
    {
      label: 'Load transfer by mechanism',
      expr: 'unsprung + elastic + geometric, per axle',
      values: `front ${fmt(r.unsprungLltFront)} + ${fmt(r.elasticFront)} + ${fmt(r.geometricFront)} kg`,
      result: `${fmt(r.transferFront)} kg front, ${fmt(r.transferRear)} kg rear`,
      note: `The ${dominant} path carries most of it here. Unsprung transfer goes straight through the hubs and is fixed once the car is built; geometric goes through the links and is set by roll centre height; only elastic responds to springs and bars.`,
    },
    {
      label: 'Distribution',
      expr: 'LLTD = front transfer / total transfer',
      values: `${fmt(r.transferFront)} / ${fmt(r.transferTotal)}`,
      result: `${fmt(r.lltd)} % front`,
      note: `Static front weight is ${fmt(input.frontMassPercent)}%, so the front is carrying ${fmt(Math.abs(r.balanceBias))} points ${r.balanceBias >= 0 ? 'more' : 'less'} of the transfer than of the weight. A bias toward ${r.balanceBias >= 0 ? 'understeer' : 'oversteer'}.`,
    },
    {
      label: 'Roll gradient',
      expr: 'gradient = roll moment / total roll stiffness / lateral G',
      values: `${fmt(r.rollMoment)} / ${fmt(r.rollTotal)} / ${fmt(input.lateralG)}`,
      result: `${fmt(r.rollGradient)} degrees per G`,
      note: 'Road cars sit around 3 to 5 degrees per G, fast road 2 to 3, circuit cars 1 to 1.5, and downforce cars below 1. Unlike LLTD this does depend on how stiff the car is overall, not just on the front-to-rear split.',
    },
  ];
}
