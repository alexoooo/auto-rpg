import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyCommand, BodyView } from "../body.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { Hand, HandGoal, Pose } from "../control/motor.ts";
import { hypot } from "../math/real.ts";
import { validArmExtension, type CombatAction } from "../mind/intent.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { attackPath, ATTACK_PATH, validAttackTuning, type AttackTuning } from "./attack-path.ts";
import { GUARD, guardSkill } from "./guard.ts";
import { supportFold } from "./support-fold.ts";
import { locomotion, STANCE_LOWER, type TurnStartup } from "./locomotion.ts";
import type { SkillReport, Skills } from "./skills.ts";
import { placedReach, type StrikeReport } from "./strike.ts";
import { aimOf } from "./strikes.ts";
import { contactResponse } from "../control/hand-feedback.ts";

/** Experimental execution limits, independent of anatomy: `docs/reference/punch-foundation.md#execution-limits`. */
export const PUNCH_EXECUTION = Object.freeze({ physicalFists: true, impactSeconds: .04, impactTravel: .04, normalAlignment: .5 });
export interface CombatExecution { readonly physicalFists: boolean; readonly impactSeconds: number; readonly impactTravel: number; readonly normalAlignment: number }
export function validCombatExecution(execution: CombatExecution): boolean {
  return typeof execution.physicalFists === "boolean" && [execution.impactSeconds, execution.impactTravel, execution.normalAlignment]
    .every(v => Number.isFinite(v) && v >= 0) && execution.normalAlignment <= 1;
}

/** Shared strike executor: measured hand trajectories and supported locomotion with independent tactics. */
export function combatSkills(body: Body, tuning: AttackTuning = ATTACK_PATH, tactics: object | null = null,
  engagement?: { readonly phase: string }, lowCombat = false, turnLimit?: number, turnStartup?: TurnStartup, overlap = false,
  execution?: CombatExecution): Skills {
  if (execution && !validCombatExecution(execution)) throw new Error("invalid combat execution settings");
  if (!validAttackTuning(tuning)) throw new Error("combat path settings need finite nonnegative values, positive durations and elbowExtension in [0,1]");
  const spec = body.built.spec, legs = locomotion(body.envelope, turnLimit, turnStartup), guard = guardSkill(spec);
  const elbowRange = (hand: Hand) => spec.joints.find(j => j.name === `elbow.${hand}`)?.dofs.find(d => d.positive === "flexion");
  const elbows = { left: elbowRange("left"), right: elbowRange("right") };
  const fold = lowCombat ? supportFold(body) : null;
  const all = [legs, guard, ...(fold ? [fold] : [])];
  const bare = { left: !!spec.segments.find(s => s.name === "hand.left")?.handPoses && !spec.held?.some(h => h.segment === "hand.left"),
    right: !!spec.segments.find(s => s.name === "hand.right")?.handPoses && !spec.held?.some(h => h.segment === "hand.right") };
  const aims = { left: execution?.physicalFists && bare.left ? "strike" : aimOf(spec, "left"),
    right: execution?.physicalFists && bare.right ? "strike" : aimOf(spec, "right") };
  const state = { command: { posture: GUARD, hands: { left: null, right: null }, pushes: [], stance: null } as BodyCommand,
    legs: legs.state, ...(fold ? { support: fold.state } : {}), lower: STANCE_LOWER, tactics, hand: null as Hand | null, phase: null as "chamber" | "swing" | "return" | null,
    action: null as CombatAction | null, home: null as Vec3 | null, chamber: null as Vec3 | null,
    velocity: [0, 0, 0] as Vec3, previous: { left: null as Vec3 | null, right: null as Vec3 | null },
    elbow: 0, initialElbow: 0, time: 0, ready: 0, sequence: 0, touching: false, thrown: { left: 0, right: 0 },
    outcomes: { returned: { left: 0, right: 0 }, failed: 0, interrupted: 0 }, cooldown: 0,
    returning: null as { hand: Hand; home: Vec3; velocity: Vec3; sequence: number; time: number; ready: number; initialElbow: number; elbow: number } | null,
    canOverlap: false, impact: null as { origin: Vec3; finish: Vec3; elapsed: number } | null,
    impacts: { admitted: 0, aborted: 0 } };
  const target = new Vector3(), direction = new Vector3(), inverse = new Quaternion();
  const alignedContact = (view: BodyView, hand: Hand, velocity: Vec3) => {
    const normal = view.handFeedback?.[hand].contact?.normal, unit = hypot(...velocity);
    const worldDirection = direction.set(...velocity).applyRotationQuaternionToRef(view.root.rotation, direction);
    return !!normal && unit > 0 && Math.abs(worldDirection.x * normal[0] + worldDirection.y * normal[1] + worldDirection.z * normal[2]) / unit >= execution!.normalAlignment;
  };
  const transition = (phase: typeof state.phase, velocity: Vec3) => {
    state.impact = null;
    state.initialElbow = state.elbow; state.phase = phase; state.time = 0; state.ready = 0; state.sequence++; state.velocity = velocity;
  };
  const report: StrikeReport = {
    physicalHands: execution?.physicalFists ?? false,
    get impact() { return state.impact !== null; },
    get hand() { return state.hand ?? state.returning?.hand ?? null; }, get phase() { return state.phase ?? (state.returning ? "return" : null); },
    get blow() { return state.hand || state.returning ? "placed" : null; },
    get returning() { return state.returning?.hand ?? null; },
    get overlapHand() { return state.canOverlap && state.hand && state.phase === "return" && !state.returning ? state.hand === "right" ? "left" as const : "right" as const : null; },
    chosen: null, distance: null, get since() { return state.hand ? state.time : state.returning?.time ?? state.time; }, thrown: state.thrown, pointCycle: state.outcomes,
    get still() { return state.cooldown; },
    rangeAt(hand, up) { return { reach: placedReach(spec, hand, up), along: [-tuning.near, tuning.near] }; },
    nets: Object.freeze({ left: Object.freeze({ high: null, middle: null, low: null }), right: Object.freeze({ high: null, middle: null, low: null }) }),
  };
  const skillReport: SkillReport = { strike: report, get heading() { return legs.heading; }, get pace() { return legs.pace; },
    get reference() { return legs.reference; }, ...(fold ? { support: fold.report } : {}), ...(engagement ? { engagement } : {}) };
  const resume = (view: BodyView) => {
    if (state.hand) state.outcomes.interrupted++;
    if (state.returning) state.outcomes.interrupted++;
    state.returning = null; state.canOverlap = false; state.impact = null;
    if (execution?.physicalFists) body.built.handPoses.request((["left", "right"] as const)
      .filter(h => bare[h]).map(hand => ({ hand, pose: "open" as const })));
    state.hand = null; state.phase = null; state.action = null; state.home = null; state.chamber = null;
    state.previous.left = null; state.previous.right = null; state.cooldown = 0; state.touching = false;
    state.elbow = 0; state.initialElbow = 0; state.time = 0; state.ready = 0; state.velocity = [0, 0, 0];
    for (const skill of all) skill.resume(view);
  };
  return { state, report: skillReport, resume, command(view, intent, dt) {
    const velocities = { left: [0, 0, 0] as Vec3, right: [0, 0, 0] as Vec3 };
    for (const hand of ["left", "right"] as const) {
      const p = view.points[hand][aims[hand]]!, now: Vec3 = [p.x, p.y, p.z], was = state.previous[hand];
      if (was) velocities[hand] = [(p.x - was[0]) / dt, (p.y - was[1]) / dt, (p.z - was[2]) / dt];
      state.previous[hand] = now;
    }
    state.cooldown += dt;
    const requested = intent.combat;
    if (requested && !validArmExtension(requested.armExtension)) throw new Error("combat armExtension must be finite and in [0,1]");
    fold?.tick(view, state.hand || state.returning ? state.lower : intent.lower ?? STANCE_LOWER, !!intent.move, dt);
    const mayOverlap = () => {
      const h = state.hand, home = state.home;
      if (!overlap || !h || !home || state.phase !== "return" || state.returning || view.down
        || (fold && fold.report.stage !== "stand") || state.lower !== STANCE_LOWER
        || (intent.lower ?? STANCE_LOWER) !== STANCE_LOWER || (view.handFeedback?.[h].impulse ?? 0) > 0) return false;
      const at = state.previous[h]!, velocity = velocities[h];
      return velocity[0] * (home[0] - at[0]) + velocity[1] * (home[1] - at[1]) + velocity[2] * (home[2] - at[2]) > 0;
    };
    if (requested && requested.hand !== state.hand && mayOverlap()) {
      state.returning = { hand: state.hand!, home: state.home!, velocity: state.velocity, sequence: state.sequence,
        time: state.time, ready: state.ready, initialElbow: state.initialElbow, elbow: state.elbow };
      state.hand = null; state.phase = null; state.action = null; state.elbow = 0; state.initialElbow = 0;
    }
    if (!state.hand && requested && requested.hand !== state.returning?.hand && view.time >= tuning.startup && state.cooldown >= tuning.hold && (!fold || fold.report.stage === "stand" || fold.report.ready)) {
      state.action = { ...requested, target: [...requested.target], ...(requested.direction ? { direction: [...requested.direction] as Vec3 } : {}) }; state.hand = requested.hand; state.lower = intent.lower ?? STANCE_LOWER;
      state.home = [...state.previous[requested.hand]!];
      intoFrameToRef(view.root, requested.target, target);
      state.chamber = attackPath(state.home, [target.x, target.y, target.z], requested.hand, requested.family, tuning).chamber;
      state.touching = (view.handFeedback?.[requested.hand].impulse ?? 0) > 0;
      transition("chamber", velocities[requested.hand]);
    }
    let posture: Pose = GUARD, goal: HandGoal | null = null;
    const hand = state.hand;
    if (hand) {
      state.time += dt;
      const at = state.previous[hand]!, action = state.action!, home = state.home!, chamber = state.chamber!;
      intoFrameToRef(view.root, action.target, target);
      const contactDirection = action.direction ? direction.set(...action.direction)
        .applyRotationQuaternionToRef(Quaternion.InverseToRef(view.root.rotation, inverse), direction) : null;
      const path = attackPath(home, [target.x, target.y, target.z], hand, action.family, tuning,
        contactDirection ? [contactDirection.x, contactDirection.y, contactDirection.z] : undefined);
      const touching = (view.handFeedback?.[hand].impulse ?? 0) > 0;
      const speed = hypot(...velocities[hand]);
      const distance = (to: Vec3) => hypot(at[0] - to[0], at[1] - to[1], at[2] - to[2]);
      switch (state.phase) {
        case "chamber":
          if (!requested) transition("return", velocities[hand]);
          else {
            const closed = !execution?.physicalFists || !bare[hand] || view.handPoses[hand]?.applied === "fist";
            state.ready = closed && distance(chamber) <= tuning.near && speed <= tuning.slow ? state.ready + dt : 0;
            if (state.ready >= tuning.hold) transition("swing", velocities[hand]);
            else if (state.time >= tuning.prepareLimit) { state.outcomes.failed++; transition("return", velocities[hand]); }
          }
          break;
        case "swing":
          if (execution && state.impact) {
            state.impact.elapsed += dt;
            const response = action.targetId ? contactResponse(view.handFeedback?.[hand], action.targetId) : null;
            const failed = view.down || !requested || (touching && (response !== "target" || !alignedContact(view, hand, path.contactVelocity)));
            if (failed || state.impact.elapsed >= execution.impactSeconds || distance(state.impact.origin) >= execution.impactTravel) {
              if (failed) state.impacts.aborted++;
              state.thrown[hand]++; transition("return", velocities[hand]);
            }
          } else if (execution && touching && !state.touching && action.targetId && !view.down && requested
            && execution.impactSeconds > 0 && execution.impactTravel > 0
            && contactResponse(view.handFeedback?.[hand], action.targetId) === "target") {
            const velocity = path.contactVelocity;
            const unit = hypot(...velocity);
            if (alignedContact(view, hand, velocity)) {
              state.impact = { origin: [...at], finish: at.map((v, k) => v + velocity[k]! / unit * execution.impactTravel) as unknown as Vec3, elapsed: 0 };
              state.impacts.admitted++; state.sequence++; state.velocity = velocities[hand];
            } else { state.impacts.aborted++; state.thrown[hand]++; transition("return", velocities[hand]); }
          } else if (!requested || (execution && view.down) || (touching && !state.touching) || state.time >= path.seconds + tuning.followSeconds) {
            state.thrown[hand]++; transition("return", velocities[hand]);
          }
          break;
        case "return":
          state.ready = distance(home) <= tuning.near && speed <= tuning.slow && !view.down ? state.ready + dt : 0;
          if (state.ready >= tuning.hold || state.time >= tuning.returnLimit) {
            if (state.ready >= tuning.hold) state.outcomes.returned[hand]++; else state.outcomes.failed++;
            state.hand = null; state.phase = null; state.action = null; state.cooldown = 0; state.elbow = 0; state.initialElbow = 0;
          }
          break;
        case null: break;
        default: { const never: never = state.phase; throw new Error(`unknown combat phase ${never}`); }
      }
      state.touching = touching;
      if (state.phase) {
        const place: Vec3 = state.phase === "chamber" ? chamber : state.phase === "return" ? home : [target.x, target.y, target.z];
        const seconds = state.phase === "chamber" ? tuning.chamberSeconds : state.phase === "return" ? tuning.returnSeconds : path.seconds;
        goal = { places: [{ point: aims[hand], position: place }], seconds, follows: true,
          initialVelocity: state.velocity, sequence: state.sequence,
          ...(state.phase === "swing" ? { terminalVelocity: path.contactVelocity, ...(path.curve ? { curve: path.curve } : {}) } : {}) };
        if (state.impact && execution) goal = { places: [{ point: aims[hand], position: state.impact.finish }],
          seconds: execution.impactSeconds, follows: true, initialVelocity: state.velocity,
          terminalVelocity: [0, 0, 0], sequence: state.sequence };
        const extension = action.armExtension ?? tuning.elbowExtension;
        if (extension || state.elbow) {
          const u = Math.min(1, state.time / seconds), amount = state.phase === "swing" ? extension : 0;
          state.elbow = state.initialElbow + (amount - state.initialElbow) * u * u * (3 - 2 * u);
          const dof = elbows[hand], name = `elbow.${hand} flexion`, preferred = (1 - state.elbow) * GUARD[name]!;
          if (dof) posture = { ...posture, [name]: Math.max(dof.min.value, Math.min(dof.max.value, preferred)) };
        }
        const rotation = state.phase === "chamber" ? -path.torso : state.phase === "swing" ? path.torso : 0;
        if (rotation) {
          const dof = spec.joints.find(j => j.name === "thoracic")?.dofs.find(d => d.positive === "rotation right");
          posture = { ...posture, "thoracic rotation right": dof ? Math.max(dof.min.value, Math.min(dof.max.value, rotation)) : 0 };
        }
      }
    }
    let returningGoal: HandGoal | null = null;
    const returning = state.returning;
    if (returning) {
      returning.time += dt;
      const at = state.previous[returning.hand]!, home = returning.home;
      returning.ready = hypot(at[0] - home[0], at[1] - home[1], at[2] - home[2]) <= tuning.near
        && hypot(...velocities[returning.hand]) <= tuning.slow && !view.down ? returning.ready + dt : 0;
      if (returning.ready >= tuning.hold || returning.time >= tuning.returnLimit) {
        if (returning.ready >= tuning.hold) state.outcomes.returned[returning.hand]++; else state.outcomes.failed++;
        state.returning = null;
      } else {
        returningGoal = { places: [{ point: aims[returning.hand], position: home }], seconds: tuning.returnSeconds,
          follows: true, initialVelocity: returning.velocity, sequence: returning.sequence };
        if (returning.elbow) {
          const u = Math.min(1, returning.time / tuning.returnSeconds);
          returning.elbow = returning.initialElbow * (1 - u * u * (3 - 2 * u));
          const dof = elbows[returning.hand], name = `elbow.${returning.hand} flexion`, preferred = (1 - returning.elbow) * GUARD[name]!;
          if (dof) posture = { ...posture, [name]: Math.max(dof.min.value, Math.min(dof.max.value, preferred)) };
        }
      }
    }
    state.canOverlap = mayOverlap();
    const covers = guard.command(view, intent.hands, state.hand);
    const baseStance = legs.goal(view, (state.phase === "swing" || (fold && fold.report.stage !== "stand" && fold.report.stage !== "wait")) ? null : intent.move, intent.face, dt, fold ? STANCE_LOWER : intent.lower);
    const supported = fold?.apply(baseStance, posture) ?? { stance: baseStance, posture };
    let hands = goal && state.hand ? { ...covers, [state.hand]: goal } : covers;
    if (returningGoal && state.returning) hands = { ...hands, [state.returning.hand]: returningGoal };
    state.command = { posture: supported.posture, pushes: [], hands, stance: supported.stance,
      ...(execution?.physicalFists ? { handPoses: { ...(bare.left ? { left: "fist" as const } : {}), ...(bare.right ? { right: "fist" as const } : {}) } } : {}) };
    return state.command;
  } };
}
