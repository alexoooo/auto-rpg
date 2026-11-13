import manRig from "../../../../assets/humanoid/man.json" with { type: "json" };
import womanRig from "../../../../assets/humanoid/woman.json" with { type: "json" };
import type { SourceKey } from "../../sources.ts";
import { derive, sourced, type Quantity, type Vec3 } from "../../quantity.ts";

/**
 * **The two human models' rigs**, as the core reads them: bone ends from
 * `assets/humanoid/man.json` and `woman.json`, exported from each model's Blender file by
 * `scripts/humanoid/export-rig.py`, at the size the model was authored.
 *
 * Every point is three sourced components with the JSON pointer each came from, turned into the
 * body frame (`src/core/bodies/spec/body.ts`) by `fromBlender`. Nothing here scales: the size a model is
 * built at is the human spec's.
 */
export type HumanModel = "man" | "woman";
export const HUMAN_MODELS: readonly HumanModel[] = Object.freeze(["man", "woman"]);

interface RigBone { readonly head: readonly number[]; readonly tail: readonly number[] }
interface Rig { readonly bones: Readonly<Record<string, RigBone>> }

const RIGS: Readonly<Record<HumanModel, { readonly rig: Rig; readonly source: SourceKey }>> = Object.freeze({
  man: { rig: manRig as Rig, source: "man-rig" },
  woman: { rig: womanRig as Rig, source: "woman-rig" },
});

/**
 * Blender's frame to the body frame. Blender is right-handed with +x the model's left, -y its
 * front and +z up; the body frame is Babylon's left-handed one with +x right, +z front and +y up.
 * The change of handedness is why one axis is negated more than a rotation would.
 */
const fromBlender = (x: number, y: number, z: number): Vec3 => [-x, z, -y];

const cache = new Map<string, Quantity<Vec3>>();

/** The end `end` of `bone` in `model`'s rig, body frame, metres at the authored size. */
export function rigPoint(model: HumanModel, bone: string, end: "head" | "tail"): Quantity<Vec3> {
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
