import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { stanceFeetOf } from "../../skills/framework/skill.ts";
import { carrying } from "../../control/motor.ts";
import type { StanceGoal } from "../../control/stance.ts";
import { turnOfToRef } from "../../read-motion.ts";
import { atan2, cos, sin } from "../../math/real.ts";
import { SERVO_SECONDS, type BodyView } from "../../body.ts";
import { locomotion, STANCE_LOWER, stanceOf } from "../../skills/locomotion/locomotion.ts";
import type { Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { MindKit } from "../../mind/kit.ts";
import type { OwnBody } from "../../mind/mind.ts";
import { quietOnFeet } from "./reading.ts";
import { poseDrive } from "./technique.ts";

/** Protective flexion keeps the chin tucked and the forearms before the face while falling. */
const BRACE = deepFreeze({ "cervical flexion": .3, "shoulder.left flexion": .8, "shoulder.right flexion": .8,
  "elbow.left flexion": 1.7, "elbow.right flexion": 1.7, "hip.left flexion": .8, "hip.right flexion": .8,
  "knee.left flexion": 1.2, "knee.right flexion": 1.2 });

/**
 * How the brace is driven (`poseDrive`: the seconds a gap closes in, the top rate, rad/s, and the
 * activation): falling, firmly; backing off after no route stood the body, softly.
 */
const BRACINGS = deepFreeze({ falling: [.3, 2, .4], "backing off": [.4, 1, .2] } as const);
type Bracing = keyof typeof BRACINGS;

/** Drive the brace (`BRACE`) as `how` says, with `drive` (`poseDrive`). */
export const brace = (drive: ReturnType<typeof poseDrive>, how: Bracing): void => { const [within, top, activation] = BRACINGS[how]; drive(BRACE, within, top, activation); };

/**
 * **The climb** from a crouch quiet on both feet (`quietOnFeet`, lower than `below` of standing
 * height): the centre of mass carried from where it is, at its speed, to standing height over the
 * feet's middle at rest on a quintic over `seconds`, the pelvis from its pitch to upright, the
 * posture from the crouch's angles to the guard's on a minimum-jerk path, the feet planted
 * (`StanceGoal.pose`, followed at `response` s); then the stance's own goal at standing height
 * (`docs/reference/rising.md#a-planned-climb`).
 */
const CLIMB = deepFreeze({ seconds: .6, response: .08, below: .9 });
/** Both feet. */
const BOTH: readonly Side[] = deepFreeze(["left", "right"]);

/**
 * **The steady**: a body on its feet held by its own stance (its mind's motor, `kit`, carrying the
 * stance alone), standing in place at its heading, and climbed to standing height from a quiet
 * crouch (`CLIMB`). Its memory is the climb's, the motor's and the legs'.
 */
export function steadying(own: OwnBody, view: BodyView, kit: MindKit) {
  const motor = carrying(kit.motor(own.built, SERVO_SECONDS, kit.posture, undefined, own.assist), ["stance"], "the steady");
  const legs = locomotion(stanceFeetOf(own.spec), null);
  const state = {
    climb: { on: false, done: false, time: 0, centre: [0, 0], velocity: [0, 0], to: [0, 0], height: 0, rise: 0, pitch: 0,
      from: new Float64Array(own.muscles.channels.length) },
    motor: motor.state, legs: legs.state,
  };
  const turn = new Quaternion(), up = new Vector3(), climbPose: Record<string, number> = {};
  /** The steady's goal this step: `goal`, or the climb's while it runs (`CLIMB`), beginning it where the body allows. */
  const climbing = (goal: StanceGoal, dt: number): StanceGoal => {
    const c = state.climb, r = motor.stance.reading, h = legs.heading, top = view.standing - STANCE_LOWER;
    if (c.done) return { ...goal, height: top };
    if (!c.on) {
      const g = view.ground;
      if (!g || !quietOnFeet(g) || g.height >= CLIMB.below) return goal;
      turnOfToRef(motor.root, turn);
      up.set(0, 1, 0).applyRotationQuaternionToRef(turn, up);
      c.on = true; c.time = 0;
      c.centre[0] = r.centre.x; c.centre[1] = r.centre.z; c.velocity[0] = r.velocity.x; c.velocity[1] = r.velocity.z;
      c.to[0] = r.support.x; c.to[1] = r.support.z; c.height = r.centre.y - r.support.y; c.rise = r.velocity.y;
      c.pitch = atan2(up.x * sin(h) + up.z * cos(h), up.y);
      for (let i = 0; i < c.from.length; i++) c.from[i] = own.muscles.angle(i);
    }
    if (c.time >= CLIMB.seconds) { c.on = false; c.done = true; motor.setPosture(kit.posture); return { ...goal, height: top }; }
    const u = c.time / CLIMB.seconds, k = u * u * u * (10 - 15 * u + 6 * u * u), T = CLIMB.seconds;
    own.muscles.channels.forEach((channel, i) => { climbPose[channel.name] = c.from[i]! + ((kit.posture[channel.name] ?? 0) - c.from[i]!) * k; });
    motor.setPosture(climbPose);
    const at = c.time;
    c.time += dt;
    return { feet: BOTH, heading: h, centre: [quintic(c.centre[0]!, c.velocity[0]!, c.to[0]!, T, at), quintic(c.centre[1]!, c.velocity[1]!, c.to[1]!, T, at)],
      height: quintic(c.height, c.rise, top, T, at), pose: { pitch: quintic(c.pitch, 0, 0, T, at), seconds: CLIMB.response } };
  };
  return {
    state,
    /** Forget what its motor had under way (`Carrying.reset`). */
    reset(): void { motor.reset(); },
    /** Begin steadying the body where it stands: no climb yet, the guard's posture, the legs at the body's heading. */
    begin(): void {
      state.climb.on = false; state.climb.done = false; motor.setPosture(kit.posture);
      motor.stance.read(); legs.resume({ ...view, stance: motor.stance.reading });
    },
    /** Steady the body a step of `dt` s; whether it is climbing. */
    step(dt: number): boolean {
      motor.stance.read();
      const goal = stanceOf(legs.goal({ ...view, stance: motor.stance.reading }, { walk: null, face: legs.heading }, dt));
      motor.setStance(goal && climbing(goal, dt));
      motor.control(own.muscles, dt);
      return state.climb.on;
    },
  };
}

/** A quintic from `x0` at speed `v0`, no acceleration, to `x1` at rest over `T` s: its place at `t`. */
function quintic(x0: number, v0: number, x1: number, T: number, t: number): number {
  const D = x1 - x0 - v0 * T, u = t / T;
  return x0 + v0 * t + u * u * u * ((10 * D + 4 * v0 * T) + u * ((-15 * D - 7 * v0 * T) + u * (6 * D + 3 * v0 * T)));
}
