import measured from "../../../../../assets/skills/locomotion/stance/stance-envelope.json" with { type: "json" };
import type { BodySpec } from "../../../../core/bodies/spec/body.ts";
import type { StanceEnvelope } from "../../../../control/stance/stance-envelope.ts";
import { envelopeIn } from "../envelope-table.ts";

/**
 * **What the stance can do with a body**, measured, so that a caller asks for "your fastest walk"
 * and not for a number that held on one engine. The numbers are
 * `assets/skills/locomotion/stance/stance-envelope.json`, which `research/skills/locomotion/stance/stance-envelope.mjs --write` writes from
 * the gait battery (`research/skills/locomotion/stance/stance-trials.mjs`' walk, five ways at each speed) and the turn
 * battery (its turn: half round each way at each rate, walking at each of the gait battery's speeds
 * up to the fastest walk, from the walk's setting off and through its first strides as well as
 * under way; and a quarter round onto a way to the side asked from the turn's start, as a fight
 * walks to a place beside where the body faces), and which names the harness and rate it was measured on. It is a parent-axis Rapier reference at that harness and rate; it does not validate another gameplay engine or a reduced balance allowance.
 *
 * A turn is read at each speed because it depends on it: a body may turn several times faster a
 * little below its fastest walk than at it, so one turn for all speeds would make a run crawl round
 * a bend.
 *
 * Measured on the body as a fight plays it, at the rate the asset names: in the guard, under its
 * character's balance, with each thing a fight puts in its right hand. A body holding one of them
 * reads that loadout's own envelope where the asset measured it, and the least of them where not.
 * Another rate, or another thing held, is a body the table did not see. A walk may apply a lower
 * turn ceiling (`turnLimit`), never a higher one.
 */

/** The measured envelope of `spec`'s model, walking by the stance's own walk (`stance-walk`). */
export function stanceEnvelope(spec: BodySpec): StanceEnvelope {
  return envelopeIn(measured, "stance-envelope", spec, "the stance");
}

/** The measured envelope of `spec`'s body (`stanceEnvelope`), or null where the stance's envelope was not measured on it. */
export const stanceEnvelopeOf = (spec: BodySpec): StanceEnvelope | null => Object.hasOwn(measured.models, spec.model) ? stanceEnvelope(spec) : null;
