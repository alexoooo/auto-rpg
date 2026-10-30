import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../src/core/body.ts";
import { bearLimbs, carryRoot, limbMotion, makeBearing } from "../../src/core/control/bearing.ts";
import { uprightness } from "../../src/core/control/ground.ts";
import { servoAsk, servoSolve } from "../../src/core/control/servo.ts";
import { turnOfToRef } from "../../src/core/control/support.ts";
import { atan2 } from "../../src/core/math/real.ts";
import { spinBetweenToRef, turnAboutToRef } from "../../src/core/math/turn.ts";
import type { OwnBody } from "../../src/core/mind/mind.ts";
import { riseLimbs } from "../../src/core/mind/rise/limbs.ts";

import { quietOnFeet, type GroundReading, type Position } from "../../src/core/mind/ground/reading.ts";
import { poseDrive, REACHED_SECONDS, type TechniqueEnd, type TechniqueRun } from "../../src/core/mind/ground/technique.ts";

/** A posture by channel, the pose drive's values (each freedom's angle with its bind). */
type Posture = Readonly<Record<string, number>>;

/** **An open-loop phase**: `posture` held by the pose drive at rate `top`, rad/s, and `activation`, for `duration` s. */
export interface PosePhase { readonly kind: "pose"; readonly posture: Posture; readonly duration: number; readonly top: number; readonly activation: number }

/**
 * **A closed-loop phase**: the bearing solve (`makeBearing`, plant-up's) on the limbs given shares
 * of the body's weight, each side's (`shin`, `hand`, `foot`), for `duration` s: the centre of mass
 * carried toward a place `toward` m from the bearing limbs' centre toward the feet and `height` of
 * standing high, at `along` m/s toward the feet and `up` m/s, the pelvis to `pitch` rad, at time
 * constant `response` s; every freedom the limbs do not take servoed to `posture`.
 */
export interface BearPhase {
  readonly kind: "bear"; readonly posture: Posture; readonly duration: number; readonly response: number; readonly pitch: number;
  readonly toward: number; readonly height: number; readonly along: number; readonly up: number;
  readonly shin: number; readonly hand: number; readonly foot: number;
}

export type RisePhase = PosePhase | BearPhase;

/**
 * **A phased rise** (`docs/reference/rising.md#the-fast-edges`): from position `from`, its phases
 * in turn, then `hold`, a closed-loop phase on the feet, until the body is quiet on both feet
 * (`quietOnFeet`) in a crouch, where Stand up's steady climbs (`CLIMB`, `standUp`).
 */
export interface PhasedRise { readonly from: Position; readonly phases: readonly RisePhase[]; readonly hold: BearPhase }

/** How far a goal may be from where a freedom is before it is asked the full rate, rad. */
const WITHIN = .2;
/** How long the hold may take to quiet the body, s; a crouch is lower than this share of standing (`CLIMB.below`). */
const HOLD_LIMIT = 2, CROUCH = .9;

/**
 * **A phased rise's run**: begun on the left; each phase for its time, the heading and the way to the
 * feet fixed as it is begun, then the hold. Done once quiet on both feet in a crouch for
 * `REACHED_SECONDS`; failed where the hold finds the body lying; timed out after `HOLD_LIMIT` s of hold.
 */
export function phasedRun(own: OwnBody, view: BodyView, rise: PhasedRise, admits: TechniqueRun["admits"]): TechniqueRun {
  const muscles = own.muscles, root = muscles.dynamics.root.segment, low = uprightness(own.built), made = riseLimbs(own), drive = poseDrive(muscles);
  const kinds = (own.spec.ends ?? []).map(end => end.name.split(".")[0] as "shin" | "hand" | "foot");
  const timed = rise.phases.reduce((sum, phase) => sum + phase.duration, 0);
  const state = { ended: null as TechniqueEnd | null, elapsed: 0, phase: -1, heading: 0, reached: 0, toward: [0, 1],
    bearing: { tasks: made.tasks, memory: made.limbs.map(limb => limb.memory), root: new Float64Array(6),
      helped: { force: new Vector3(), moment: new Vector3() }, held: { channels: [] as number[], z0: [] as number[], Z: [] as number[][] },
      shortfall: { force: new Vector3(), moment: new Vector3() } } };
  // It asks no external force, whatever the body's Balance allows.
  const solve = makeBearing(null, made.limbs, state.bearing, { effort: true });
  const work = { place: new Vector3(), spin: new Vector3(), rootSpin: new Vector3(), turn: new Quaternion(), yaw: new Quaternion(), pitch: new Quaternion(),
    across: new Vector3(), right: new Vector3(1, 0, 0), moved: new Uint8Array(muscles.channels.length),
    aim: { centre: new Vector3(), spin: new Vector3() }, goal: new Float64Array(muscles.channels.length) };
  const finish = (end: TechniqueEnd) => { state.ended = end; return end; };
  /** One step of the bearing solve toward `phase`'s aims. */
  const bear = (phase: BearPhase, g: GroundReading, dt: number) => {
    for (let i = 0; i < muscles.channels.length; i++) {
      const spec = muscles.channels[i]!.dof.spec;
      work.goal[i] = Math.max(spec.min.value, Math.min(spec.max.value, (phase.posture[muscles.channels[i]!.name] ?? 0) - spec.bind.value));
    }
    const ground = low.lowest(), n = 1 / phase.response;
    made.read(ground, true); work.place.setAll(0);
    let total = 0;
    for (let l = 0; l < made.limbs.length; l++) {
      const weight = phase[kinds[l]!];
      if (weight > 0 && made.bear(l, work.goal, n, ground, weight, true)) { work.place.addInPlaceFromFloats(made.over[l]!.x * weight, 0, made.over[l]!.z * weight); total += weight; }
      else made.rest(l);
    }
    if (total > 0) work.place.scaleInPlace(1 / total); else work.place.set(g.centre.x, 0, g.centre.z);
    const [tx, tz] = state.toward as [number, number];
    work.place.addInPlaceFromFloats(tx * phase.toward, 0, tz * phase.toward);
    const height = ground + view.standing * phase.height;
    work.aim.centre.set(n * n * (work.place.x - g.centre.x) + 2 * n * (tx * phase.along - g.velocity.x),
      n * n * (height - g.centre.y) + 2 * n * (phase.up - g.velocity.y),
      n * n * (work.place.z - g.centre.z) + 2 * n * (tz * phase.along - g.velocity.z));
    root.body.angularVelocityToRef(work.rootSpin);
    turnAboutToRef(Vector3.UpReadOnly, state.heading, work.yaw);
    turnAboutToRef(work.right, phase.pitch, work.pitch);
    work.yaw.multiplyToRef(work.pitch, work.turn).multiplyInPlace(root.rest);
    spinBetweenToRef(root.node.rotationQuaternion!, work.turn, phase.response, work.spin);
    work.aim.spin.copyFrom(work.spin).scaleInPlace(n).subtractInPlace(work.rootSpin.scaleInPlace(2 * n));
    const asked = servoAsk(muscles, i => work.goal[i]!, WITHIN, dt), lever = muscles.dynamics.root.centre[1]! - ground;
    const carried = carryRoot(solve, muscles, asked, work.aim, lever);
    limbMotion(solve, asked, work.moved); servoSolve(muscles, asked, carried, work.moved); bearLimbs(solve, muscles, asked, lever, true);
  };
  const quietCrouch = (g: GroundReading) => quietOnFeet(g) && g.height < CROUCH;
  return {
    state, get phase() { return state.ended !== null ? "ended" : state.phase < 0 ? "begin" : state.phase < rise.phases.length ? `phase ${state.phase}` : "hold"; },
    get yields() { return state.ended !== null; },
    admits,
    reached: (g, to) => to === "crouch" && quietCrouch(g),
    begin(side) {
      state.ended = side === "left" ? null : "failed"; state.elapsed = 0; state.phase = -1; state.reached = 0;
      turnOfToRef(root, work.turn); work.across.set(1, 0, 0).applyRotationQuaternionToRef(work.turn, work.across);
      state.heading = atan2(-work.across.z, work.across.x);
      const left = own.built.segments.get("foot.left")!.node.position, right = own.built.segments.get("foot.right")!.node.position;
      const g = view.ground, cx = g ? g.centre.x : root.node.position.x, cz = g ? g.centre.z : root.node.position.z;
      const x = (left.x + right.x) / 2 - cx, z = (left.z + right.z) / 2 - cz, length = Math.sqrt(x * x + z * z);
      state.toward[0] = length > 1e-6 ? x / length : 0; state.toward[1] = length > 1e-6 ? z / length : 1;
    },
    end() { if (state.ended === null) finish("interrupted"); },
    step(g, _senses, dt) {
      if (state.ended !== null) return state.ended;
      let at = state.elapsed, k = 0;
      while (k < rise.phases.length && at >= rise.phases[k]!.duration) { at -= rise.phases[k]!.duration; k++; }
      state.phase = k;
      state.elapsed += dt;
      if (k < rise.phases.length) {
        const phase = rise.phases[k]!;
        if (phase.kind === "pose") drive(phase.posture, WITHIN, phase.top, phase.activation); else bear(phase, g, dt);
        return null;
      }
      bear(rise.hold, g, dt);
      if (g.position === "front" || g.position === "back" || g.position === "left" || g.position === "right") return finish("failed");
      state.reached = quietCrouch(g) ? state.reached + dt : 0;
      if (state.reached + 1e-9 >= REACHED_SECONDS) return finish("done");
      return state.elapsed - timed > HOLD_LIMIT + 1e-9 ? finish("timed-out") : null;
    },
  };
}
