import { supportHeight } from "../../control/support-reference.ts";
import { Vector3 } from "../../core/math/vector.ts";
import type { Body, BodyView } from "../../control/body.ts";
import { uprightness } from "../../control/ground.ts";
import { footStatesOf, readSupport, withinSupport } from "../../control/support.ts";
import { STANCE_LOWER } from "./locomotion.ts";
import type { LegsGoal } from "../framework/skill.ts";
import type { LowSupportSkill } from "../framework/low-support.ts";

/**
 * The fold and its gates: `lower`, m, the deepest the centre of mass goes under its standing
 * height; `pitch`, rad, and `response`, s, the root's supported pose at that depth; `transition`,
 * s, a fold's time; `lumbar` and `thoracic`, rad, the trunk's flexion asked at full depth; it is
 * supported where both soles are flat within `footGap`, m, and bear on ground whose normal's upward
 * share is at least `normal`, the rest of the body `clearance`, m, clear of it and the centre
 * slower than `slow`, m/s, and ready once supported low for `hold`, s.
 */
const COMBAT_FOLD = Object.freeze({ lower: .5, pitch: .9, response: .5, transition: 2,
  lumbar: .89, thoracic: .368, footGap: .015, clearance: .15, slow: .1, hold: .05, normal: .9 });

/** The planted fold's transition stages. */
type FoldStage = "stand" | "wait" | "lower" | "low" | "rise";

/** Whether the fold carries `goal`: one that leaves the stance's shape to the legs, naming no bearing feet, footing, swing or pose. */
const foldCarries = (goal: LegsGoal): boolean =>
  goal.feet === undefined && goal.footing === undefined && goal.swing === undefined && goal.pose === undefined;

/** A planted-foot fold behind the neutral requested lowering, using the common body and muscle limits. */
export function supportFold(body: Body): LowSupportSkill {
  const feet = footStatesOf(body.built), names = feet.map((foot) => foot.name), upright = uprightness(body.built), middle = new Vector3();
  const others = new Set([...body.built.segments.values()].filter(p => !/^(head|.*Trunk)$/.test(p.spec.name)));
  const clamp = (name: string, goal: number) => {
    const dof = body.muscles.channels.find(c => c.name === name)?.dof.spec;
    return dof ? Math.max(dof.min.value, Math.min(dof.max.value, goal)) : 0;
  };
  const flexion = { "lumbar flexion": clamp("lumbar flexion", COMBAT_FOLD.lumbar),
    "thoracic flexion": clamp("thoracic flexion", COMBAT_FOLD.thoracic) };
  const state = { stage: "stand" as FoldStage, ready: false, active: false,
    depth: 0, from: 0, to: 0, time: 0, quiet: 0, heading: 0, posture: {} as Record<string, number> };
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
  return { state, report: state, carries: foldCarries, walks: () => state.stage === "stand" || state.stage === "wait", resume() {
    state.stage = "stand"; state.ready = false; state.active = false;
    state.depth = 0; state.from = 0; state.to = 0; state.time = 0; state.quiet = 0; state.posture = {};
  }, tick(view, height, moving, dt) {
    if (height !== undefined && !Number.isFinite(height)) throw new Error("supported height must be finite");
    const desired = height === undefined ? 0 : Math.max(0, Math.min(1, (supportHeight(view) - STANCE_LOWER - height) / (COMBAT_FOLD.lower - STANCE_LOWER)));
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
    state.posture = state.active ? { "lumbar flexion": flexion["lumbar flexion"] * state.depth, "thoracic flexion": flexion["thoracic flexion"] * state.depth } : {};
  }, lay(view, goal) {
    if (!state.active) return { ...goal, height: undefined };
    return { ...goal, feet: names, centre: null, heading: state.heading, halt: false,
      height: supportHeight(view) - STANCE_LOWER - (COMBAT_FOLD.lower - STANCE_LOWER) * state.depth,
      pose: { pitch: COMBAT_FOLD.pitch * state.depth, seconds: COMBAT_FOLD.response } };
  } };
}
