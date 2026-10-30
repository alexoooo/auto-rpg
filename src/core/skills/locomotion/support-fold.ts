import { cos } from "../../math/real.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../../body.ts";
import { uprightness } from "../../control/ground.ts";
import { footStatesOf, readSupport, withinSupport } from "../../control/support.ts";
import { STANCE_LOWER } from "./locomotion.ts";
import { footEnd, type LegsAsked, type LegsGoal, type Skill } from "../framework/skill.ts";

/** Supported low-combat probes and physical gates: `docs/reference/supported-root-pose.md#combat-fold-settings`. */
const COMBAT_FOLD = Object.freeze({ lower: .5, pitch: .9, response: .5, transition: 2,
  lumbar: .89, thoracic: .368, footGap: .015, clearance: .15, slow: .1, hold: .05, normal: .9 });

/** Predicted head drop combines the support translation with the requested trunk pitch. */
export function supportHeadDrop(view: BodyView, lower: number): number {
  const depth = Math.max(0, Math.min(1, (lower - STANCE_LOWER) / (COMBAT_FOLD.lower - STANCE_LOWER)));
  return (COMBAT_FOLD.lower - STANCE_LOWER) * depth
    + Math.max(0, view.head.y - view.stance.centre.y) * (1 - cos(COMBAT_FOLD.pitch * depth));
}

/** The executor's actual supported transition; policies read readiness before requesting a stroke. */
export interface SupportReport {
  readonly stage: "stand" | "wait" | "lower" | "low" | "rise";
  readonly ready: boolean;
  /** The trunk's flexion the fold asks of whatever holds the trunk, rad by channel; none while it stands. */
  readonly posture: Readonly<Record<string, number>>;
}

/**
 * **A support skill**: fighting from low support. It carries a legs goal that leaves the stance's
 * shape to the legs (`foldCarries`) down to the height that goal asks, and asks the trunk's
 * flexion of the trunk's owner (`SupportReport.posture`).
 */
export interface SupportSkill extends Skill {
  readonly state: object;
  readonly report: SupportReport;
  /** Whether the legs may walk under it as it stands: not while a fold is under way. */
  walks(): boolean;
  /** Move toward `height`, the centre of mass's over the soles, m (the legs' own where none), the body `moving` or not. */
  tick(view: BodyView, height: number | undefined, moving: boolean, dt: number): void;
  /**
   * `goal` as the fold under way carries it: folded, both feet bearing, the centre of mass over
   * their middle, at the fold's heading, height and pitch, and no halt; standing, at the legs' own
   * height.
   */
  lay(view: BodyView, goal: LegsAsked): LegsAsked;
}

/** Whether the fold carries `goal`: one that leaves the stance's shape to the legs, naming no bearing feet, footing, swing or pose. */
export const foldCarries = (goal: LegsGoal): boolean =>
  goal.feet === undefined && goal.footing === undefined && goal.swing === undefined && goal.pose === undefined;

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
  return { state, report: state, walks: () => state.stage === "stand" || state.stage === "wait", resume() {
    state.stage = "stand"; state.ready = false; state.active = false;
    state.depth = 0; state.from = 0; state.to = 0; state.time = 0; state.quiet = 0; state.posture = {};
  }, tick(view, height, moving, dt) {
    if (height !== undefined && !Number.isFinite(height)) throw new Error("supported height must be finite");
    const desired = height === undefined ? 0 : Math.max(0, Math.min(1, (view.standing - STANCE_LOWER - height) / (COMBAT_FOLD.lower - STANCE_LOWER)));
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
    return { ...goal, feet: [footEnd("left"), footEnd("right")], centre: null, heading: state.heading, halt: false,
      height: view.standing - STANCE_LOWER - (COMBAT_FOLD.lower - STANCE_LOWER) * state.depth,
      pose: { pitch: COMBAT_FOLD.pitch * state.depth, seconds: COMBAT_FOLD.response } };
  } };
}
