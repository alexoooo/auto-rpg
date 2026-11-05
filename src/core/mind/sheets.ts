import type { BuiltBody } from "../build/build-body.ts";
import type { HandPoseRequest } from "../build/hand-poses.ts";
import type { AssistCeiling } from "../control/assist.ts";
import { physicalBody, type PhysicalBody } from "../physical-body.ts";
import type { World } from "../world.ts";
import { embody } from "./mind.ts";
import { requireRecordingIdentity, type RecordingIdentity } from "../recording.ts";
import { clockSenses, type Senses } from "./senses.ts";

/**
 * **A body's order sheet as its mind left it at a step**: its muscles' command (`MuscleDriver.activation`,
 * `.velocity`), its assist's ask about the root's centre of mass, world, N and N m, and the hand
 * poses it asked.
 */
interface Sheet {
  readonly step: number;
  readonly activation: Float64Array;
  readonly velocity: Float64Array;
  readonly force: readonly [number, number, number];
  readonly moment: readonly [number, number, number];
  readonly hands: readonly HandPoseRequest[];
}

/**
 * **The order sheets a body's mind has written**, one a step it stepped, taken at the seam
 * (`embody`): with the bout's recipe, the whole of what its mind did to the world. A load that
 * goes back drops the sheets after it as the steps are taken again.
 */
export interface SheetLog {
  readonly identity: RecordingIdentity;
  readonly sheets: Sheet[];
}

/** An empty log, to record a body's sheets into. */
export function sheetLog(identity: RecordingIdentity): SheetLog {
  return { identity, sheets: [] };
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
 * **`built` played from `log` with no mind**: each step its mind stepped, the sheet its body took
 * is given again, before the solver's step as it was taken, under the same grants; its down is
 * the fight's reading, as every body's is. With the bout's recipe, the same bout again to the bit. A step with no sheet is refused.
 */
export function replayedBody(built: BuiltBody, world: World, log: SheetLog, grants: { readonly identity: RecordingIdentity; readonly senses?: () => Senses; readonly assist?: AssistCeiling }): PhysicalBody {
  requireRecordingIdentity(log.identity, grants.identity);
  const senses = grants.senses ?? clockSenses(world);
  const state = { steps: 0 };
  // The sheets are what its body took each step, so they are written as a motor part writes, taken at once (`Mind.act`).
  const embodied = embody(built, world, () => ({ name: "replay", has: () => "replay", dispose() {}, mind: { state, think() {}, interrupt() {}, act(control) {
    const index = sheetAt(log.sheets, world.steps);
    if (index < 0) throw new Error(`no order sheet for step ${world.steps}`);
    const sheet = log.sheets[index]!;
    control.muscles.activation.set(sheet.activation); control.muscles.velocity.set(sheet.velocity);
    control.assist.force.set(...sheet.force); control.assist.moment.set(...sheet.moment);
    for (const request of sheet.hands) control.hands.request(request.hand, request.pose);
    state.steps++;
  } } }), { senses, assist: grants.assist });
  return physicalBody(built, embodied.held, world, () => "replay", embodied.state, embodied.dispose);
}
