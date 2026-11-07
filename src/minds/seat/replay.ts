import type { Sheet, SheetLog } from "./sheets.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import type { World } from "../../core/world/world.ts";
import { requireRecordingIdentity, type RecordingIdentity } from "../../core/world/recording.ts";
import type { Senses } from "../../core/bodies/senses.ts";
import type { AssistCeiling } from "../../core/bodies/assist.ts";
import { physicalBody, type PhysicalBody } from "./physical-body.ts";
import { clockSenses } from "../../core/world/senses.ts";
import { embody } from "./embodiment.ts";

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
    for (const request of sheet.configurations) control.configurations.request(request.segment, request.configuration);
    state.steps++;
  } } }), { senses, assist: grants.assist });
  return physicalBody(built, embodied.held, world, () => "replay", embodied.state, embodied.dispose);
}
