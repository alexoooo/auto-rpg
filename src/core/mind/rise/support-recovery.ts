import poses from "../../../../assets/research/posture-holds.json" with { type: "json" };
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../../build/build-body.ts";
import type { MotionModel } from "../../control/tasks.ts";
import type { BodyView } from "../../body.ts";
import { supportEntry } from "../../control/support-entry.ts";
import { motorControl } from "../../control/motor.ts";
import { footStatesOf, readSupport } from "../../control/support.ts";
import { recoveryReady } from "../../control/recovery-ready.ts";
import { guardPosture } from "../../skills/guard.ts";
import { locomotion } from "../../skills/locomotion.ts";
import { SERVO_SECONDS } from "../../body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { deepFreeze } from "../../state.ts";
import { observeBody } from "../../observation.ts";
import type { World } from "../../world.ts";
import type { OwnBody } from "../mind.ts";
import type { SubMind } from "../sub-mind.ts";
import { RISE } from "./stages.ts";
import { stagedRise } from "./staged.ts";
import { DOWN } from "./limbs.ts";

/** Hand/shin acquisition settings from `docs/reference/support-entry.md#fixture-and-acceptance`. */
export const SUPPORT_ENTRY = deepFreeze({ root: "lowerTrunk", facing: .5,
  required: ["hand.left", "hand.right", "shank.left", "shank.right"],
  forbidden: ["head", "upperTrunk", "middleTrunk", "lowerTrunk"], slow: .1, stillSeconds: .5,
  settleLimit: 3, holdLimit: 6, response: .01, speed: 10 });

/** Upright handover thresholds and retry deadline, validated in `docs/reference/recovery-cycle.md#handover-settings`. */
const RECOVERY_VERIFY = Object.freeze({ slow: .1, minUpNormal: .9, hold: .5, limit: 6 });

/** Acquisition policy and support-reading settings for the shared research task. */
export function supportEntryPolicy(built: BuiltBody, model: Pick<MotionModel, "channels">) {
  const pose = poses.find((p) => p.model === built.spec.model && p.id === "fours");
  if (!pose) return null;
  const reference = built.segments.get(SUPPORT_ENTRY.root)!.rest;
  const reading = { ...SUPPORT_ENTRY, reference: [reference.x, reference.y, reference.z, reference.w] as const };
  const bind = Object.fromEntries(built.spec.joints.flatMap((j) => j.dofs.map((d) => [`${j.name} ${d.positive}`, d.bind.value])));
  const targets = Object.fromEntries([...built.joints].flatMap(([name, j]) => j.dofs.map((d, i) =>
    [`${name} ${d.spec.positive}`, (pose.placement.joints as Record<string, number[]>)[name]![i]!] as const)));
  const convert = (stage: { readonly posture: Readonly<Record<string, number>>; readonly seconds: number }) => ({ seconds: stage.seconds,
    targets: Object.fromEntries(model.channels.map((c) => [c.name, Math.max(c.min, Math.min(c.max, (stage.posture[c.name] ?? 0) - bind[c.name]!))])) });
  const policy = supportEntry(model, { ...reading, targets,
    roll: { back: RISE.roll.back.map(convert), left: RISE.roll.left.map(convert), right: RISE.roll.right.map(convert) },
    prepare: RISE.rise.slice(0, 3).map((stage) => {
      if (stage.kind !== "pose") throw new Error("support entry preparation requires poses");
      return convert(stage);
    }) });
  return { policy, reading };
}

/** Rise with the reference policy, then verify quiet foot support before returning control. */
export function supportRecovery(own: OwnBody, view: BodyView, world: World): SubMind {
  const { built, muscles } = own;
  const rise = stagedRise(own, view), feet = footStatesOf(built), legs = locomotion(null);
  const motor = motorControl(built, SERVO_SECONDS, guardPosture(built), undefined, own.assist);
  const observe = observeBody(built, muscles, world, () => view.senses);
  const state = { phase: "complete" as "rise" | "stabilize" | "complete", rise: rise.state, motor: motor.state, legs: legs.state,
    time: 0, ready: 0, retries: 0, completed: 0 };
  const middle = new Vector3();
  const beginRise = () => { rise.begin(); motor.reset(); state.phase = "rise"; state.time = 0; state.ready = 0; };
  return { get name() { return `recovery: ${state.phase}`; }, state,
    wants() {
      if (legs.reference === null) legs.goal(view, null, 0, world.dt);
      return state.phase !== "complete" || view.down;
    },
    begin() { beginRise(); state.retries = 0; },
    end() { rise.end(); motor.reset(); state.phase = "complete"; },
    step(senses, dt) {
      if (state.phase === "rise") {
        if (rise.wants(senses)) { rise.step(senses, dt); return; }
        rise.end(); state.phase = "stabilize"; state.time = 0; state.ready = 0;
        motor.stance.read();
        legs.resume({ ...view, stance: motor.stance.reading });
      }
      if (state.phase !== "stabilize") return;
      state.time += dt;
      readSupport(feet, feet, middle);
      const supports = feet.map((f) => ({ segment: f.segment.spec.name,
        corners: f.corners.filter((c) => c.y - Math.min(...f.corners.map((p) => p.y)) < DOWN).map((c): Vec3 => [c.x, c.y, c.z]) }));
      state.ready = recoveryReady(observe(), supports, RECOVERY_VERIFY) ? state.ready + dt : 0;
      motor.stance.read();
      motor.setStance(legs.goal({ ...view, stance: motor.stance.reading }, null, legs.heading, dt));
      motor.control(muscles, dt);
      if (state.ready >= RECOVERY_VERIFY.hold) { state.phase = "complete"; state.completed++; }
      else if (state.time >= RECOVERY_VERIFY.limit) { state.retries++; beginRise(); }
    } };
}
