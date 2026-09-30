import type { ForceVelocitySpec } from "../spec/body.ts";
import { derive, si, type Quantity } from "../spec/quantity.ts";
import type { HumanFigure } from "./figure.ts";
import type { Sex } from "./tables/de-leva-1996.ts";
import {
  ANDERSON_C4_SHARE, ANDERSON_C5_SHARE, andersonPoints, freyLawColumn, THELEN_CURVATURE, THELEN_ECCENTRIC_CEILING,
  THELEN_ECCENTRIC_SLOPE_RATIO, type AndersonDirection, type FreyLawDirection,
} from "./tables/force-velocity.ts";
import type { Exertion } from "./tables/joint-torques.ts";

/**
 * **How a model's joint torque falls with speed**: each exertion's Hill curve, shortening, and
 * its rise when stretched (`src/core/muscle/force-velocity.ts` has the forms).
 *
 * Hill's curve f = (1 - w/w0) / (1 + w/(k w0)) is linear in w0 and 1/k at any one point (w, f):
 *
 *     (1 - f) w0 - f w (1/k) = w
 *
 * - **Hip and knee, both ways, and the ankle's dorsiflexion:** Anderson 2007 prints two points on
 *   each curve for each sex, so the two equations give w0 and k.
 * - **The elbow, both ways:** Frey-Law 2012 prints five speeds for each sex. They fix the curve's
 *   bend near rest but hardly its end: fitted freely, curvatures from 0.05 to 0.8 fit about as
 *   well, with w0 from 80 down to 11 rad/s. Thelen's curvature is taken, and w0 is fitted by least
 *   squares on the linear form, w0 = sum((1 - f)(w + f w / k)) / sum((1 - f)^2).
 * - **Everything else** has no curve read. It takes a measured exertion's, named in `BORROWED`, a
 *   stated assumption (`ASSUMPTIONS`).
 * - **Lengthening** is Thelen's everywhere: a ceiling of 1.4 isometric, and a slope at rest twice
 *   the shortening one. It is the stimulated muscle's ceiling; a voluntary one is 1.0-1.3, and the
 *   owner chose 1.4 for fighters.
 *
 * The figure's column is its sex's. Speed is not scaled to size: a geometrically similar body turns
 * its joints at the same rate.
 */
export function jointSpeed(figure: HumanFigure, exertion: Exertion): ForceVelocitySpec {
  const { sex } = figure;
  const measured = measuredFor(exertion);
  const own = shortening(measured, sex);
  const borrowed = (q: Quantity<number>) => measured === exertion ? q
    : derive(q.unit, `${measured}'s, taken for ${exertion} by the stage 2 assumptions (${ASSUMPTIONS})`, [q], (v) => v);
  const unloadedSpeed = borrowed(own.unloadedSpeed), curvature = borrowed(own.curvature);
  return {
    unloadedSpeed, curvature,
    eccentricCeiling: THELEN_ECCENTRIC_CEILING, eccentricSlopeRatio: THELEN_ECCENTRIC_SLOPE_RATIO,
  };
}

const ASSUMPTIONS = "docs/plans/2026-09-28-core-foundation.md, stage 2";

type Measured = AndersonDirection | FreyLawDirection;

function measuredFor(exertion: Exertion): Measured {
  switch (exertion) {
    case "hipExtension": case "hipFlexion": case "kneeExtension": case "kneeFlexion": case "ankleDorsiflexion":
    case "elbowFlexion": case "elbowExtension":
      return exertion;
    default:
      return BORROWED[exertion];
  }
}

function shortening(direction: Measured, sex: Sex): Pick<ForceVelocitySpec, "unloadedSpeed" | "curvature"> {
  switch (direction) {
    case "hipExtension": case "hipFlexion": case "kneeExtension": case "kneeFlexion": case "ankleDorsiflexion":
      return throughTwoPoints(direction, sex);
    case "elbowFlexion": case "elbowExtension":
      return fittedAtCurvature(direction, sex);
    default: { const never: never = direction; throw new Error(`no curve for ${String(never)}`); }
  }
}

/** Hill's curve through Anderson's two points, solving the linear form for w0 and 1/k. */
function throughTwoPoints(direction: AndersonDirection, sex: Sex): Pick<ForceVelocitySpec, "unloadedSpeed" | "curvature"> {
  const { threeQuarters, half } = andersonPoints(direction, sex);
  const inputs = [threeQuarters, si(ANDERSON_C4_SHARE), half, si(ANDERSON_C5_SHARE)] as const;
  return {
    unloadedSpeed: derive("rad/s", "Hill's curve through two points of it: the unloaded speed", inputs,
      (w1, f1, w2, f2) => {
        const det = (1 - f1) * (-f2 * w2) - (1 - f2) * (-f1 * w1);
        return (w1 * (-f2 * w2) - w2 * (-f1 * w1)) / det;
      }),
    curvature: derive("1", "Hill's curve through two points of it: the curvature", inputs,
      (w1, f1, w2, f2) => {
        const det = (1 - f1) * (-f2 * w2) - (1 - f2) * (-f1 * w1);
        return det / ((1 - f1) * w2 - (1 - f2) * w1);
      }),
  };
}

/** Hill's curve of Thelen's curvature, its unloaded speed fitted to Frey-Law's column by least squares. */
function fittedAtCurvature(direction: FreyLawDirection, sex: Sex): Pick<ForceVelocitySpec, "unloadedSpeed" | "curvature"> {
  const column = freyLawColumn(direction, sex);
  const inputs = [THELEN_CURVATURE, ...column.flatMap(({ speed, torque }) => [si(speed), torque])];
  return {
    unloadedSpeed: derive("rad/s", "Hill's curve of a given curvature: its unloaded speed, fitted by least squares on "
      + "the linear form to a column of torques at speeds, the first isometric", inputs,
    (k: number, ...pairs: number[]) => {
      const isometric = pairs[1];
      let num = 0, den = 0;
      for (let i = 2; i < pairs.length; i += 2) {
        const w = pairs[i], f = pairs[i + 1] / isometric;
        num += (1 - f) * (w + f * w / k);
        den += (1 - f) * (1 - f);
      }
      return num / den;
    }),
    curvature: THELEN_CURVATURE,
  };
}

/**
 * Which measured exertion's curve each unmeasured one takes (a stated assumption): the rest of
 * the arm the elbow flexors', whose fibre length over moment arm is like theirs (Holzbaur 2005);
 * the hip's other freedoms, the trunk and the neck the hip flexors'; the foot's the dorsiflexors'.
 */
const BORROWED: Readonly<Record<Exclude<Exertion, Measured>, Measured>> = Object.freeze({
  shoulderFlexion: "elbowFlexion", shoulderExtension: "elbowFlexion", shoulderAbduction: "elbowFlexion",
  shoulderAdduction: "elbowFlexion", shoulderExternalRotation: "elbowFlexion", shoulderInternalRotation: "elbowFlexion",
  forearmSupination: "elbowFlexion", forearmPronation: "elbowFlexion",
  wristFlexion: "elbowFlexion", wristExtension: "elbowFlexion", wristUlnarDeviation: "elbowFlexion",
  wristRadialDeviation: "elbowFlexion",
  hipAbduction: "hipFlexion", hipAdduction: "hipFlexion", hipExternalRotation: "hipFlexion", hipInternalRotation: "hipFlexion",
  anklePlantarflexion: "ankleDorsiflexion", footInversion: "ankleDorsiflexion", footEversion: "ankleDorsiflexion",
  trunkFlexion: "hipFlexion", trunkExtension: "hipFlexion", trunkLateralFlexionRight: "hipFlexion",
  trunkLateralFlexionLeft: "hipFlexion", trunkRotationRight: "hipFlexion", trunkRotationLeft: "hipFlexion",
  neckFlexion: "hipFlexion", neckExtension: "hipFlexion", neckLateralFlexion: "hipFlexion", neckRotation: "hipFlexion",
});
