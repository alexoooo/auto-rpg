import walkRunMeasured from "../../../../assets/skills/locomotion/walk-run/walk-run-envelope.json" with { type: "json" };
import { type BodySpec } from "../../../core/bodies/spec/body.ts";
import type { StanceEnvelope } from "../../../control/stance/stance-envelope.ts";
import { envelopeIn } from "../envelope-table.ts";

/**
 * The measured envelope of `spec`'s model walking by the walk and run (`src/skills/locomotion/walk-run.ts`)
 * free to run: `assets/skills/locomotion/walk-run/walk-run-envelope.json`, each way's walks by the rule
 * (`research/skills/locomotion/stance/core-stance-envelope.mjs --legs walk-run`), and its turns.
 */
export function walkRunEnvelope(spec: BodySpec): StanceEnvelope {
  return envelopeIn(walkRunMeasured, "walk-run-envelope", spec, "the walk and run");
}
