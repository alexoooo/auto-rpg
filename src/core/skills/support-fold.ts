import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../body.ts";
import { uprightness } from "../control/ground.ts";
import type { Pose } from "../control/motor.ts";
import type { StanceGoal } from "../control/stance.ts";
import { footStatesOf, readSupport, withinSupport } from "../control/support.ts";
import { STANCE_LOWER } from "./locomotion.ts";
import type { Skill } from "./skill.ts";

/** Supported low-combat probes and physical gates: `docs/reference/supported-root-pose.md#combat-fold-settings`. */
const COMBAT_FOLD = Object.freeze({ lower: .5, pitch: .9, response: .5, transition: 2,
  lumbar: .89, thoracic: .368, footGap: .015, clearance: .15, slow: .1, hold: .05, normal: .9 });

/** The executor's actual supported transition; policies read readiness before requesting a stroke. */
export interface SupportReport {
  readonly stage: "stand" | "wait" | "lower" | "low" | "rise";
  readonly ready: boolean;
}

/** **A support skill**: fighting from low support, the stance and the trunk lowered under what the other skills ask. */
export interface SupportSkill extends Skill {
  readonly state: object;
  readonly report: SupportReport;
  /** Move toward `lower` (`Intent.lower`), the body `moving` or not. */
  tick(view: BodyView, lower: number, moving: boolean, dt: number): void;
  /** `stance` and `posture` as the support under way leaves them. */
  apply(stance: StanceGoal | null, posture: Pose): { stance: StanceGoal | null; posture: Pose };
}

/** A planted-foot fold behind the neutral requested lowering, using the common body and muscle limits. */
export function supportFold(body: Body): SupportSkill {
  const feet = footStatesOf(body.built), upright = uprightness(body.built), middle = new Vector3();
  const others = new Set([...body.built.segments.values()].filter(p => !/^(head|.*Trunk)$/.test(p.spec.name)));
  const clamp = (name: string, goal: number) => {
    const dof = body.muscles.channels.find(c => c.name === name)?.dof.spec;
    return dof ? Math.max(dof.min.value, Math.min(dof.max.value, goal)) : 0;
  };
  const flexion = { "lumbar flexion": clamp("lumbar flexion", COMBAT_FOLD.lumbar),
    "thoracic flexion": clamp("thoracic flexion", COMBAT_FOLD.thoracic) };
  const state = { stage: "stand" as SupportReport["stage"], ready: false, active: false,
    depth: 0, from: 0, to: 0, time: 0, quiet: 0, heading: 0 };
  const supported = (view: BodyView) => {
    readSupport(feet, feet, middle);
    if (view.down || view.stance.velocity.lengthSquared() > COMBAT_FOLD.slow * COMBAT_FOLD.slow
      || upright.clearance(others) < COMBAT_FOLD.clearance) return false;
    const ground = upright.lowest();
    if (feet.some(f => f.corners.some(c => c.y - ground > COMBAT_FOLD.footGap)
      || !body.built.physics.contactsOf(f.segment.body, other => other === null).some(c => c.impulse > 0 && c.normal[1] <= -COMBAT_FOLD.normal))) return false;
    const c = view.stance.centre, nearest = withinSupport(feet, c.x, c.z);
    return nearest[0] === c.x && nearest[1] === c.z;
  };
  return { state, report: state, resume() {
    state.stage = "stand"; state.ready = false; state.active = false;
    state.depth = 0; state.from = 0; state.to = 0; state.time = 0; state.quiet = 0;
  }, tick(view, lower, moving, dt) {
    if (!Number.isFinite(lower)) throw new Error("supported lowering must be finite");
    const desired = Math.max(0, Math.min(1, (lower - STANCE_LOWER) / (COMBAT_FOLD.lower - STANCE_LOWER)));
    if (!state.active) {
      state.ready = false;
      if (!desired) { state.stage = "stand"; return; }
      state.stage = "wait";
      if (moving || view.stance.phase !== "stand" || !supported(view)) return;
      state.active = true; state.heading = view.stance.facing;
    }
    if (desired !== state.to) { state.from = state.depth; state.to = desired; state.time = 0; state.quiet = 0; }
    state.time += dt;
    const u = Math.min(1, state.time / COMBAT_FOLD.transition);
    state.depth = state.from + (state.to - state.from) * u * u * (3 - 2 * u);
    state.stage = u < 1 ? state.to > state.from ? "lower" : "rise" : state.to > 0 ? "low" : "rise";
    state.quiet = u === 1 && supported(view) ? state.quiet + dt : 0;
    state.ready = state.stage === "low" && state.quiet >= COMBAT_FOLD.hold;
    if (u === 1 && state.to === 0 && state.quiet >= COMBAT_FOLD.hold) { state.active = false; state.stage = "stand"; }
  }, apply(stance, posture) {
    if (!state.active || !stance) return { stance, posture };
    return { posture: { ...posture, "lumbar flexion": flexion["lumbar flexion"] * state.depth,
      "thoracic flexion": flexion["thoracic flexion"] * state.depth },
      stance: { feet: ["left", "right"], centre: null, heading: state.heading,
        height: stance.height - (COMBAT_FOLD.lower - STANCE_LOWER) * state.depth,
        pose: { pitch: COMBAT_FOLD.pitch * state.depth, seconds: COMBAT_FOLD.response } } };
  } };
}
