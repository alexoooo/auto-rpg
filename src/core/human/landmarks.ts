import { derive, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { lerp, midpoint } from "../spec/vec.ts";
import { skinTop, WORKSHOP_SEX } from "./model.ts";
import { rigPoint, type WorkshopModel } from "./rig.ts";
import { DE_LEVA_1996 } from "./tables/de-leva-1996.ts";

/**
 * **de Leva's landmarks, found on a workshop rig**: body frame, metres at the authored size.
 *
 * - Joint centres are the rig's bone heads: SJC the upper arm's, EJC the forearm's, WJC the hand's,
 *   HJC the thigh's, KJC the calf's, AJC the foot's, and CERV (the cervicale, where the head and
 *   neck meet the trunk) the neck's.
 * - DAC3, the tip of the middle finger, is that finger's last bone's tail; MET3, the head of the
 *   third metacarpal (the middle finger's knuckle), is its first bone's head.
 * - VERT, the vertex, is the top of the skin above the head bone's tail.
 * - MIDH is between the hip joint centres, where de Leva ends the trunk.
 * - XYPH (the xiphoid) and OMPH (the navel) have no bone. They divide the rig's CERV-MIDH line in
 *   the proportions of de Leva's upper, middle and lower trunk lengths for the model's sex.
 *
 * HEEL and TTIP come from the boot's footprint (`segments.ts`).
 */
export type Side = "left" | "right";
export const SIDES: readonly Side[] = Object.freeze(["left", "right"]);

/** The rig's side suffix. The rig's `_l` is the model's own left, the body frame's -x. */
const SUFFIX: Readonly<Record<Side, string>> = Object.freeze({ left: "_l", right: "_r" });

export interface TrunkLandmarks {
  readonly VERT: Quantity<Vec3>;
  readonly CERV: Quantity<Vec3>;
  readonly XYPH: Quantity<Vec3>;
  readonly OMPH: Quantity<Vec3>;
  readonly MIDH: Quantity<Vec3>;
}

export interface LimbLandmarks {
  readonly SJC: Quantity<Vec3>;
  readonly EJC: Quantity<Vec3>;
  readonly WJC: Quantity<Vec3>;
  readonly DAC3: Quantity<Vec3>;
  readonly MET3: Quantity<Vec3>;
  readonly HJC: Quantity<Vec3>;
  readonly KJC: Quantity<Vec3>;
  readonly AJC: Quantity<Vec3>;
}

export function trunkLandmarks(model: WorkshopModel): TrunkLandmarks {
  const table = DE_LEVA_1996[WORKSHOP_SEX[model]];
  const CERV = rigPoint(model, "neck_01", "head");
  const VERT = derive("m", "the head bone's tail, raised to the skin top", [rigPoint(model, "head", "tail"), skinTop(model)],
    (tail, top) => [tail[0], top, tail[2]]);
  const MIDH = derive("m", "between the hip joint centres", [rigPoint(model, "thigh_l", "head"), rigPoint(model, "thigh_r", "head")],
    (left, right) => midpoint(left, right));
  const lengths = [table.upperTrunk.length, table.middleTrunk.length, table.lowerTrunk.length] as const;
  const XYPH = derive("m", "CERV-MIDH, divided in de Leva's trunk lengths: the end of the upper trunk", [CERV, MIDH, ...lengths],
    (cerv, midh, upper, middle, lower) => lerp(cerv, midh, upper / (upper + middle + lower)));
  const OMPH = derive("m", "CERV-MIDH, divided in de Leva's trunk lengths: the end of the middle trunk", [CERV, MIDH, ...lengths],
    (cerv, midh, upper, middle, lower) => lerp(cerv, midh, (upper + middle) / (upper + middle + lower)));
  return { VERT, CERV, XYPH, OMPH, MIDH };
}

export function limbLandmarks(model: WorkshopModel, side: Side): LimbLandmarks {
  const s = SUFFIX[side];
  return {
    SJC: rigPoint(model, `upperarm${s}`, "head"),
    EJC: rigPoint(model, `lowerarm${s}`, "head"),
    WJC: rigPoint(model, `hand${s}`, "head"),
    DAC3: rigPoint(model, `middle_03${s}`, "tail"),
    MET3: rigPoint(model, `middle_01${s}`, "head"),
    HJC: rigPoint(model, `thigh${s}`, "head"),
    KJC: rigPoint(model, `calf${s}`, "head"),
    AJC: rigPoint(model, `foot${s}`, "head"),
  };
}

/** The rig's side suffix, for the bones a caller names itself. */
export const rigSuffix = (side: Side): string => SUFFIX[side];
