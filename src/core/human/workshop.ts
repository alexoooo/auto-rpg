import { derive, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { normalize, sub } from "../spec/vec.ts";
import { workshopEnvelope, type Extents } from "./envelope.ts";
import type { HumanFigure, LimbFigure } from "./figure.ts";
import { limbLandmarks, rigSuffix, trunkLandmarks, type Side } from "./landmarks.ts";
import { bodyMass, FIT_SCALE, stature, WORKSHOP_SEX } from "./model.ts";
import { rigPoint, type WorkshopModel } from "./rig.ts";
import { workshopBalance } from "./attributes.ts";
import { workshopHitPoints } from "./wounds.ts";

/**
 * **A workshop model as a human figure**: its rig's landmarks (`landmarks.ts`), its clothed
 * envelope's trunk hulls and boots (`envelope.ts`), its sex, size and mass (`model.ts`), and the
 * owner's hit points and balance, all at the authored size with the fit scale to take them to x1.
 *
 * The rig's feet end in a boot, so the foot runs from the boot's heel to its toe, at the height of
 * the rig's ball. The rig holds each hand thumb up, a quarter turn from the anatomical position's
 * palm forward, so the hand's right is read across its knuckles.
 */
export function workshopFigure(model: WorkshopModel): HumanFigure {
  const envelope = workshopEnvelope(model);
  const limbs = { left: limb(model, "left", envelope.feet.left), right: limb(model, "right", envelope.feet.right) };
  return {
    model, substance: "flesh", sex: WORKSHOP_SEX[model], scale: FIT_SCALE, mass: bodyMass(model), stature: stature(model),
    trunk: trunkLandmarks(model), limbs, hulls: envelope.trunk, feet: envelope.feet, hp: workshopHitPoints(model),
    balance: workshopBalance(model),
  };
}

function limb(model: WorkshopModel, side: Side, foot: Extents): LimbFigure {
  const ball = rigPoint(model, `ball${rigSuffix(side)}`, "tail");
  const HEEL = derive("m", "the boot's heel: across, the footprint's middle; its back; the ball's height",
    [foot.x.min, foot.x.max, foot.z.min, ball], (left, right, back, b) => [(left + right) / 2, b[1], back]);
  const TTIP = derive("m", "the boot's toe: across, the footprint's middle; its front; the ball's height",
    [foot.x.min, foot.x.max, foot.z.max, ball], (left, right, front, b) => [(left + right) / 2, b[1], front]);
  return {
    ...limbLandmarks(model, side), HEEL, TTIP, handRight: handRight(model, side),
    little: rigPoint(model, `pinky_01${rigSuffix(side)}`, "head"),
  };
}

/** A hand's right in the anatomical position: across its knuckles, thumb side on the right hand. */
function handRight(model: WorkshopModel, side: Side): Quantity<Vec3> {
  const index = rigPoint(model, `index_01${rigSuffix(side)}`, "head");
  const little = rigPoint(model, `pinky_01${rigSuffix(side)}`, "head");
  return side === "right"
    ? derive("1", "from the little finger's knuckle to the index finger's", [little, index], (l, i) => normalize(sub(i, l)))
    : derive("1", "from the index finger's knuckle to the little finger's", [index, little], (i, l) => normalize(sub(l, i)));
}
