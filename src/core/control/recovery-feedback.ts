import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { atan2, hypot } from "../math/real.ts";
import { spinBetweenToRef, turnAboutToRef } from "../math/turn.ts";
import type { BodyObservation } from "../observation.ts";

interface Model {
  readonly rest: readonly [number, number, number, number];
  readonly rootHeight: number;
  readonly weight: number;
  readonly angles: readonly number[];
  readonly forceLimit: number;
}
interface Measurement {
  readonly observation: BodyObservation;
  readonly soleUp: readonly number[];
  readonly ready: boolean;
}
interface Settings {
  readonly lift?: number; readonly turn?: number; readonly damping?: number;
  readonly height?: number; readonly settleAfter?: number; readonly settleHeight?: number; readonly horizontal?: number; readonly response?: number; readonly speed?: number;
  readonly yawLock?: boolean; readonly verticalPriority?: boolean; readonly supportedRelease?: boolean;
}

/** Metered recovery's root feedback and guard targets; support-gated release is an explicit controller setting. */
export function recoveryFeedback(model: Model, settings: Settings = {}) {
  // Gains use body weights, metres and seconds; the caller's Assist clips the requested wrench.
  const { lift = 1, turn = .12, damping = .055, height = 1, horizontal = 0,
    response = .15, speed = 6, settleAfter = Infinity, settleHeight = height, yawLock = true, verticalPriority = false, supportedRelease = false } = settings;
  const rest = new Quaternion(...model.rest), inverse = Quaternion.Inverse(rest);
  const q = new Quaternion(), yaw = new Quaternion(), target = new Quaternion(), error = new Vector3();
  const up = new Vector3(), across = new Vector3();
  const state = { heading: null as number | null, released: false, started: null as number | null };
  const control = (measurement: Measurement) => {
    if (state.released) return { kind: "host" } as const;
    const r = measurement.observation.segments.find(s => s.name === "lowerTrunk")!;
    q.set(...r.rotation).multiplyToRef(inverse, target);
    across.set(1,0,0).applyRotationQuaternionToRef(target, across);
    state.heading ??= atan2(-across.z, across.x);
    up.set(0,1,0).applyRotationQuaternionToRef(target, up);
    turnAboutToRef(Vector3.UpReadOnly, state.heading, yaw).multiplyToRef(rest, target);
    spinBetweenToRef(q,target,1,error);
    if (!yawLock) {
      const size = hypot(up.x,up.z), tilt = atan2(size,up.y);
      if (size > 1e-8) error.set(-up.z*tilt/size,0,up.x*tilt/size);
    }
    if (supportedRelease ? measurement.ready : up.y > .95 && measurement.soleUp.every(v => v > .8) && r.centre[1] > .9*model.rootHeight) {
      state.released = true; return { kind: "host" } as const;
    }
    state.started ??= measurement.observation.time;
    // Lowering a late terminal target lets the loaded soles settle without restarting the recovery.
    const fraction = Math.max(0,Math.min(1,measurement.observation.time-state.started-settleAfter));
    const requestedHeight = height + fraction*(settleHeight-height);
    const unload = Math.max(0,Math.min(1,(requestedHeight*model.rootHeight-r.centre[1])/.25));
    const feet = measurement.observation.segments.filter(s => s.name.startsWith("foot."));
    const centre = [0,1,2].map(k => feet.reduce((sum,f) => sum+f.centre[k]!,0)/feet.length);
    const force = [model.weight*horizontal*(2*(centre[0]!-r.centre[0])-.5*r.velocity[0]),
      model.weight*Math.max(0,lift*unload-.3*r.velocity[1]),
      model.weight*horizontal*(2*(centre[2]!-r.centre[2])-.5*r.velocity[2])];
    if (verticalPriority) {
      force[1] = Math.min(model.forceLimit,force[1]!);
      const available = Math.sqrt(Math.max(0,model.forceLimit*model.forceLimit-force[1]*force[1]));
      const scale = Math.min(1,available/Math.max(1e-9,hypot(force[0]!,force[2]!)));
      force[0] = force[0]!*scale; force[2] = force[2]!*scale;
    }
    const moment = [error.x,error.y,error.z].map((v,i) => model.weight*(turn*v-damping*r.spin[i]!));
    if (up.y > .98 && measurement.soleUp.every(v => v > .95) && unload < .05) {
      force.fill(0); moment.fill(0);
    }
    return { kind: "targets", angles: model.angles, response, speed, activation: 1, assist: { force, moment } } as const;
  };
  return Object.assign(control,{state});
}
