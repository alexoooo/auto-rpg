import records from "../../../assets/entrants/riser/recovery.json" with { type: "json" };
import { recordFault } from "../../core/skills/framework/records.ts";
import { bodyKey, type BodySpec } from "../../core/spec/body.ts";
import { deepFreeze } from "../../core/state.ts";

const bodies: Readonly<Record<string, keyof typeof records.profiles>> = records.bodies as Readonly<Record<string, keyof typeof records.profiles>>;
deepFreeze(records);

/** Only bodies with an explicit experimental profile may run these movements. */
export const recoveryRecordFault = recordFault("contact recovery", Object.keys(bodies), () => false);

/** Anatomical targets and command bounds; the record states its unverified status explicitly. */
export function recoverySettings(spec: BodySpec) {
  const name = bodies[bodyKey(spec)];
  if (!name) throw new Error(`no contact recovery settings for ${bodyKey(spec)}`);
  return records.profiles[name];
}
