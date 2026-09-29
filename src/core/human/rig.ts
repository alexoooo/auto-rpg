import fighterRig from "../../../assets/humanoid/workshop-fighter.json" with { type: "json" };
import rogueRig from "../../../assets/humanoid/workshop-rogue.json" with { type: "json" };
import type { SourceKey } from "../sources.ts";
import { derive, sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";

/**
 * **The two workshop models' rigs**, as the core reads them: bone ends from
 * `assets/humanoid/workshop-*.json`, exported from each model's Blender file by
 * `scripts/humanoid/export-workshop.py`, at the size the model was authored.
 *
 * Every point is three sourced components with the JSON pointer each came from, turned into the
 * body frame (`src/core/spec/body.ts`) by `fromBlender`. Nothing here scales: the size a model is
 * built at is the human spec's.
 */
export type WorkshopModel = "workshop-fighter" | "workshop-rogue";
export const WORKSHOP_MODELS: readonly WorkshopModel[] = Object.freeze(["workshop-fighter", "workshop-rogue"]);

interface RigBone { readonly head: readonly number[]; readonly tail: readonly number[] }
interface Rig { readonly bones: Readonly<Record<string, RigBone>> }

const RIGS: Readonly<Record<WorkshopModel, { readonly rig: Rig; readonly source: SourceKey }>> = Object.freeze({
  "workshop-fighter": { rig: fighterRig as Rig, source: "workshop-fighter-rig" },
  "workshop-rogue": { rig: rogueRig as Rig, source: "workshop-rogue-rig" },
});

/**
 * Blender's frame to the body frame. Blender is right-handed with +x the model's left, -y its
 * front and +z up; the body frame is Babylon's left-handed one with +x right, +z front and +y up.
 * The change of handedness is why one axis is negated more than a rotation would.
 */
export const fromBlender = (x: number, y: number, z: number): Vec3 => [-x, z, -y];

const cache = new Map<string, Quantity<Vec3>>();

/** The end `end` of `bone` in `model`'s rig, body frame, metres at the authored size. */
export function rigPoint(model: WorkshopModel, bone: string, end: "head" | "tail"): Quantity<Vec3> {
  const key = `${model}/${bone}/${end}`;
  let point = cache.get(key);
  if (!point) {
    const { rig, source } = RIGS[model];
    const found = rig.bones[bone]?.[end];
    if (!found || found.length !== 3) throw new Error(`${model} has no bone ${bone}`);
    const [x, y, z] = [0, 1, 2].map((i) => sourced(found[i]!, "m", source, `/bones/${bone}/${end}/${i}`));
    point = derive("m", "Blender to the body frame", [x!, y!, z!], fromBlender);
    cache.set(key, point);
  }
  return point;
}
