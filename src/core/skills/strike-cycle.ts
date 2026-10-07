import { hypot } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";

export interface StrikeCycleState {
  phase: "chamber" | "swing" | "return" | null;
  time: number;
  ready: number;
  sequence: number;
  velocity: Vec3;
  touching: boolean;
  impact: { origin: Vec3; finish: Vec3; elapsed: number } | null;
}

interface Motion {
  readonly at: Vec3;
  readonly velocity: Vec3;
  readonly home: Vec3;
  readonly chamber: Vec3;
  readonly requested: boolean;
  readonly down: boolean;
  readonly supported: boolean;
  readonly prepared: boolean;
  /** The adapter has released physical contact before accepting its measured return. */
  readonly released?: boolean;
  readonly touching: boolean;
  readonly intended: boolean;
  readonly aligned: boolean;
  readonly contactVelocity: Vec3;
  readonly seconds: number;
}
export interface StrikeLimits {
  readonly near: number;
  readonly slow: number;
  readonly hold: number;
  readonly prepareLimit: number;
  readonly returnLimit: number;
  readonly followSeconds: number;
  readonly impact?: { readonly impactSeconds: number; readonly impactTravel: number };
}

/** Numeric setting: independent event bit masks; the limb adapter records counts and placement work. */
export const STRIKE_EVENT = Object.freeze({ launch: 1, thrown: 2, returned: 4, failed: 8, finished: 16, admitted: 32, aborted: 64 });

/** Measured endpoint proximity and speed, independent of a requested path's clock. */
function strikeReady(at: Vec3, target: Vec3, velocity: Vec3, limits: Pick<StrikeLimits, "near" | "slow">): boolean {
  return hypot(at[0] - target[0], at[1] - target[1], at[2] - target[2]) <= limits.near && hypot(...velocity) <= limits.slow;
}

/** Start a finite path from the measured endpoint motion. */
export function strikeTransition(state: StrikeCycleState, phase: StrikeCycleState["phase"], velocity: Vec3): void {
  state.impact = null; state.phase = phase; state.time = 0; state.ready = 0; state.sequence++; state.velocity = velocity;
}

/** Chamber, committed stroke, bounded intended contact and verified withdrawal for any effector. */
export function advanceStrike(state: StrikeCycleState, motion: Motion, limits: StrikeLimits, dt: number): number {
  state.time += dt;
  const distance = (to: Vec3) => hypot(motion.at[0] - to[0], motion.at[1] - to[1], motion.at[2] - to[2]);
  let event = 0;
  switch (state.phase) {
    case "chamber":
      if (!motion.requested) strikeTransition(state, "return", motion.velocity);
      else {
        state.ready = motion.prepared && motion.supported && strikeReady(motion.at, motion.chamber, motion.velocity, limits) ? state.ready + dt : 0;
        if (state.ready >= limits.hold) { strikeTransition(state, "swing", motion.velocity); event = STRIKE_EVENT.launch; }
        else if (state.time >= limits.prepareLimit) { event = STRIKE_EVENT.failed; strikeTransition(state, "return", motion.velocity); }
      }
      break;
    case "swing": {
      const impact = limits.impact;
      if (impact && state.impact) {
        state.impact.elapsed += dt;
        const failed = motion.down || !motion.supported || !motion.requested || (motion.touching && (!motion.intended || !motion.aligned));
        if (failed || state.impact.elapsed >= impact.impactSeconds || distance(state.impact.origin) >= impact.impactTravel) {
          event = STRIKE_EVENT.thrown | (failed ? STRIKE_EVENT.aborted : 0); strikeTransition(state, "return", motion.velocity);
        }
      } else if (impact && motion.touching && !state.touching && !motion.down && motion.supported && motion.requested
        && impact.impactSeconds > 0 && impact.impactTravel > 0 && motion.intended) {
        const unit = hypot(...motion.contactVelocity);
        if (motion.aligned && unit > 0) {
          state.impact = { origin: [...motion.at], finish: motion.at.map((v, k) => v + motion.contactVelocity[k]! / unit * impact.impactTravel) as unknown as Vec3, elapsed: 0 };
          state.sequence++; state.velocity = motion.velocity; event = STRIKE_EVENT.admitted;
        } else { event = STRIKE_EVENT.thrown | STRIKE_EVENT.aborted; strikeTransition(state, "return", motion.velocity); }
      } else if (!motion.requested || (impact && (motion.down || !motion.supported)) || (motion.touching && !state.touching)
        || state.time >= motion.seconds + limits.followSeconds) {
        event = STRIKE_EVENT.thrown; strikeTransition(state, "return", motion.velocity);
      }
      break;
    }
    case "return":
      state.ready = !motion.down && motion.released !== false && strikeReady(motion.at, motion.home, motion.velocity, limits) ? state.ready + dt : 0;
      if (state.ready >= limits.hold || state.time >= limits.returnLimit) {
        event = STRIKE_EVENT.finished | (state.ready >= limits.hold ? STRIKE_EVENT.returned : STRIKE_EVENT.failed); state.phase = null;
      }
      break;
    case null: break;
    default: { const never: never = state.phase; throw new Error(`unknown strike phase ${never}`); }
  }
  state.touching = motion.touching;
  return event;
}
