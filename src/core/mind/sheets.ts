import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import type { HandPoseRequest } from "../build/hand-poses.ts";
import type { AssistCeiling } from "../control/assist.ts";
import { physicalBody, type PhysicalBody } from "../physical-body.ts";
import type { World } from "../world.ts";
import { embody } from "./mind.ts";
import { clockSenses, type Senses } from "./senses.ts";

/**
 * **A body's order sheet as its mind left it at a step**: its muscles' command (`MuscleDriver.activation`,
 * `.velocity`), its assist's ask about the root's centre of mass, world, N and N m, the hand poses
 * it asked, and whether its mind read it down, which a fight reads of a hosted body (`hostedBody`);
 * null where the body's down is the fight's own reading.
 */
interface Sheet {
  readonly step: number;
  readonly activation: Float64Array;
  readonly velocity: Float64Array;
  readonly force: readonly [number, number, number];
  readonly moment: readonly [number, number, number];
  readonly hands: readonly HandPoseRequest[];
  readonly down: boolean | null;
}

/**
 * **The order sheets a body's mind has written**, one a step it stepped, taken at the seam
 * (`embody`): with the bout's recipe, the whole of what its mind did to the world. A load that
 * goes back drops the sheets after it as the steps are taken again.
 */
export interface SheetLog {
  readonly sheets: Sheet[];
  /** Whether the mind read its body down as it was made; null where the fight reads it. */
  initial: boolean | null;
  /** What the mind reads of the body's down, which the seam writes in each sheet; set by the adapter that hosts it. */
  status: (() => boolean) | null;
}

/** An empty log, to record a body's sheets into. */
export function sheetLog(): SheetLog {
  return { sheets: [], initial: null, status: null };
}

/** The index of the sheet of `step` in `sheets`, by their steps; -1 if there is none. */
function sheetAt(sheets: readonly Sheet[], step: number): number {
  let low = 0, high = sheets.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1, at = sheets[middle]!.step;
    if (at === step) return middle;
    if (at < step) low = middle + 1; else high = middle - 1;
  }
  return -1;
}

/**
 * **`built` played from `log` with no mind**: each step its mind stepped, the sheet it wrote is
 * written again, before the solver's step as the mind wrote it, under the same grants; its down is
 * the one the sheets carry, or the fight's own reading where they carry none. With the bout's
 * recipe, the same bout again to the bit. A step with no sheet is refused.
 */
export function replayedBody(built: BuiltBody, world: World, log: SheetLog, grants: { readonly senses?: () => Senses; readonly assist?: AssistCeiling }): PhysicalBody {
  const senses = grants.senses ?? clockSenses(world), force = new Vector3(), moment = new Vector3();
  const state = { down: log.initial ?? false, steps: 0 };
  const embodied = embody(built, world, (own) => ({ name: "replay", state, step() {
    const index = sheetAt(log.sheets, world.steps);
    if (index < 0) throw new Error(`no order sheet for step ${world.steps}`);
    const sheet = log.sheets[index]!;
    own.muscles.activation.set(sheet.activation); own.muscles.velocity.set(sheet.velocity);
    own.assist.ask(force.set(...sheet.force), moment.set(...sheet.moment));
    if (sheet.hands.length > 0) own.requestHandPoses(sheet.hands);
    if (sheet.down !== null) state.down = sheet.down;
    state.steps++;
  } }), senses, grants.assist);
  return physicalBody(built, embodied.own, world, senses, () => "replay", embodied.state, embodied.dispose,
    log.initial === null ? undefined : () => state.down);
}
