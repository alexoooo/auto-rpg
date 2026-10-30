import type { BodyView } from "../../core/body.ts";
import type { Orders } from "../../core/mind/orders.ts";
import { regionSegments, sensedActionTarget } from "../../core/mind/action-aim.ts";
import { highestSurface } from "../../core/mind/openings.ts";
import { lowOpponent } from "../../core/mind/sensed-bounds.ts";
import { atan2, cos } from "../../core/math/real.ts";
import { engagementWithDetails, type Sight, type TacticalDecision, type Tactics } from "../../core/mind/tactics.ts";
import type { Skills } from "../../core/skills/skills.ts";
import { STANCE_LOWER } from "../../core/skills/locomotion.ts";
import type { TargetRef } from "../../core/skills/action.ts";
import { holdsNothing } from "../../core/skills/strikes.ts";
import { handsOf } from "../../core/skills/guard.ts";
import type { BodySpec } from "../../core/spec/body.ts";
import type { Vec3 } from "../../core/spec/quantity.ts";
import { limitPace } from "./pace.ts";

/** The support fold's crouch depth, asked before a low opponent reaches the hands. */
const LOWER = .5;
/** Begin the planted fold near the target, facing within 0.3 rad; rise before a longer chase. */
const NEAR = .7, FAR = 1.25, FACING = cos(.3);
/** A slow backward step lets the stance turn its feet before planting the fold. */
const TURN_PACE = .2;
/** Unready support is abandoned within six seconds, including when a fall hides behind the crouch's height. */
const PREPARE_LIMIT = 6;
/** A ready planted fold needing another entry for six seconds rises so the legs can reposition. */
const REPOSITION_WAIT = 6;

/**
 * **Where a punch aims at a low foe**: the highest surface point of the target region's segments of
 * the foe `target` names, where that foe is low (`lowOpponent`); null for any other target.
 */
export function lowAim(view: BodyView, target: TargetRef): Vec3 | null {
  if (target.kind !== "body") return null;
  const foe = sensedActionTarget(view, target);
  if (!foe || !lowOpponent(view, foe)) return null;
  let chosen: Vec3 | null = null;
  for (const name of regionSegments(foe.spec, target.region)) {
    const point = highestSurface(foe, name);
    if (point && (!chosen || point[1] > chosen[1])) chosen = point;
  }
  return chosen;
}

/** The selected low opponent, resolved through the body's current senses. */
const lowFocus = (view: BodyView, decision: TacticalDecision | undefined) =>
  view.senses.others.find(foe => foe.id === decision?.focus && !foe.out && lowOpponent(view, foe));

const freeHands = (spec: BodySpec) => handsOf(spec).filter(hand => holdsNothing(spec, hand));

/** Prepare low support and closed-hand cover, optionally holding a standing guard while the low target is down. */
export function lowGuard(base: Tactics, spec: BodySpec, orders: (sight: Sight) => Orders | null, replant = false, waitFallen = false): Tactics {
  const state = { base: base.state ?? null, unready: null as number | null, misplaced: null as number | null,
    rising: false, riseReason: "rising after support timeout", time: 0, decision: "no low target" };
  const hands = freeHands(spec);
  const engagement = engagementWithDetails(() => base.engagement, () => [
    { label: "Low guard", value: state.decision },
    ...state.unready !== null ? [{ label: "Support wait", value: `${(state.time - state.unready).toFixed(2)} s` }] : [],
  ]);
  return {
    ...base, state, engagement, get decision() { return base.decision; },
    decide(sight, dt) {
      const intent = base.decide(sight, dt), foe = lowFocus(sight.view, base.decision), ordered = orders(sight);
      state.time = sight.view.time;
      if (!foe || ordered?.move !== undefined || sight.view.down) {
        state.decision = !foe ? "no low target" : sight.view.down ? "body down" : "movement ordered";
        state.unready = null; state.misplaced = null; state.rising = false;
        return intent;
      }
      const head = foe.segments.get(foe.spec.marks.high)!.centre, centre = sight.view.stance.centre;
      const dx = head.x - centre.x, dz = head.z - centre.z, distance = Math.sqrt(dx * dx + dz * dz);
      const face = atan2(dx, dz);
      const stage = sight.report.support?.stage, begun = stage === "lower" || stage === "low" || stage === "rise";
      if (waitFallen && foe.down) {
        if (sight.report.actions.length) {
          state.decision = "waiting for stroke release";
          return { ...intent, actions: intent.actions.filter(request => sight.report.actions.some(action => action.id === request.id)) };
        }
        state.decision = "waiting for fallen target";
        state.unready = null; state.misplaced = null;
        state.rising = stage !== "stand"; state.riseReason = "rising while target is down";
        return { ...intent, face: sight.report.heading, lower: STANCE_LOWER, move: null, movement: undefined, actions: [] };
      }
      if (state.rising) {
        state.decision = state.riseReason;
        if (stage === "stand") state.rising = false;
        return { ...intent, lower: STANCE_LOWER, move: null, movement: undefined, actions: [] };
      }
      if (distance > FAR || !begun && distance > NEAR) {
        state.decision = "approaching low target";
        state.unready = null;
        return limitPace({ ...intent, face, actions: [], movement: { kind: "range", focus: foe.id, near: .5, far: NEAR } }, ordered, .8);
      }
      if (!begun && cos(face - sight.view.stance.facing) < FACING) {
        state.decision = "turning before support";
        return limitPace({ ...intent, face, move: [-TURN_PACE, 0], movement: undefined, actions: [] }, ordered, TURN_PACE);
      }
      const threat: Vec3 = [head.x, head.y, head.z], guarded: Vec3 = [centre.x, head.y, centre.z];
      const guard = { ...intent.guard };
      for (const hand of hands) guard[hand] = { threat, guarded };
      state.misplaced = replant && sight.report.support?.ready && base.decision?.approach && !sight.report.actions.length && !intent.actions.length
        ? state.misplaced ?? sight.view.time : null;
      if (state.misplaced !== null && sight.view.time - state.misplaced >= REPOSITION_WAIT) {
        state.misplaced = null; state.rising = true; state.riseReason = "rising to reposition low attack"; state.decision = state.riseReason;
        return { ...intent, lower: STANCE_LOWER, move: null, movement: undefined, actions: [] };
      }
      state.unready = sight.report.support?.ready ? null : state.unready ?? sight.view.time;
      if (state.unready !== null && sight.view.time - state.unready >= PREPARE_LIMIT) {
        state.decision = "rising after support timeout";
        state.unready = null; state.rising = true; state.riseReason = "rising after support timeout";
        return { ...intent, lower: STANCE_LOWER, move: null, movement: undefined, actions: [] };
      }
      state.decision = sight.report.support?.ready ? "covering from ready support" : "preparing support";
      return { ...intent, face, lower: LOWER, guard,
        ...!sight.report.support?.ready ? { move: null, movement: undefined, actions: [] } : {} };
    },
  };
}

/** Close free covering hands in low support, using the active planner's live operational context. */
export function lowGuardSkills(base: Skills, spec: BodySpec, decision: () => TacticalDecision | undefined): Skills {
  const hands = freeHands(spec);
  return { ...base, get envelope() { return base.envelope; }, get report() { return base.report; },
    command(view, intent, dt) {
      const command = base.command(view, intent, dt);
      if (!lowFocus(view, decision()) || intent.lower !== LOWER) return command;
      const handPoses = { ...command.handPoses };
      for (const hand of hands) if (base.report.reservations[`pose:${hand}`] === undefined && intent.guard[hand]) handPoses[hand] = "fist";
      return { ...command, handPoses };
    },
  };
}
