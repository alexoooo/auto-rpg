import { TORSO_PLAIN } from "../config.ts";
import { torsoModule, type TorsoModuleDefinition } from "./torso.ts";

/**
 * `torso.plain`: the lighter trunk, wider at the waist and barely armoured.
 *
 * There is no code here and that is the design rather than an omission. What a torso option is
 * allowed to differ in is a `TorsoTuning` block -- a size, a mass, an armour fraction, three
 * socket frames and a waist range -- and every one of those is mechanical. A file that added a
 * silhouette, a material choice or a mesh would be adding a shell rather than a module, and the
 * session plan puts that out of scope in as many words.
 *
 * Against `torso.plated`: 97 kg lighter on the same waist motor, half again as much lean and two
 * thirds again as much twist, and it keeps only a tenth of a scored blow off its own core.
 * `src/golem/config.ts` carries the numbers and how each was chosen.
 */
export const torsoPlain: TorsoModuleDefinition =
  torsoModule("torso.plain", "plain trunk", TORSO_PLAIN);
