import { hypot } from "../../core/math/real.ts";
import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import type { Side } from "../../core/bodies/spec/body.ts";

/** A blow's path by its shape: what an opening is searched for (`openingSelector`). */
export type BlowFamily = "straight" | "cross" | "hook" | "downward" | "overhand" | "uppercut";

/**
 * **The path a blow is predicted to take** (`attackPathToRef`), which opening selection samples for
 * a clear lane: from a chamber along the shared quintic Hermite (`pointPathTargetToRef`) to the
 * target, met at `contactSpeed` m/s.
 */
export const ATTACK_PATH = Object.freeze({
  // The swing's seconds, and the speed asked at contact, m/s.
  swingSeconds: .12, contactSpeed: 5,
  // The chamber drawn back from the guard, m; a cross's chamber offset across, m; and its thoracic turn, rad.
  windup: .12, across: .05, torso: .2,
  // A hook: its swing's seconds, its lateral curve, m, and the across share of its contact direction.
  hookSeconds: .18, curve: .05, hookAcross: .15,
  // An overhand's chamber raised above the guard, m.
  overhandWindup: .35,
  // An uppercut's chamber dropped behind the guard, m, and its swing's seconds.
  uppercutWindup: .12, uppercutSeconds: .25 });

type AttackTuning = { readonly [K in keyof typeof ATTACK_PATH]: number };

/** A blow's path written in place (`attackPathToRef`): its chamber, its contact velocity, its hook's curve where `curved`, its torso turn and its swing's seconds. */
interface AttackPathWork {
  readonly chamber: [number, number, number];
  readonly contactVelocity: [number, number, number];
  readonly curve: [number, number, number];
  curved: boolean;
  torso: number;
  seconds: number;
}

/** An attack path's work, made once by its reader. */
export const attackPathWork = (): AttackPathWork =>
  ({ chamber: [0, 0, 0], contactVelocity: [0, 0, 0], curve: [0, 0, 0], curved: false, torso: 0, seconds: 0 });

/** A blow's chamber and contact velocity from the actual guard and observed target, in the body frame, into `out`, which carries nothing between calls: what a search over many candidate blows reads. */
export function attackPathToRef(home: Vec3, target: Vec3, hand: Side, family: BlowFamily, tuning: AttackTuning, direction: Vec3 | undefined, out: AttackPathWork): AttackPathWork {
  const side = hand === "right" ? 1 : -1, chamber = out.chamber;
  let torso: number, seconds = tuning.swingSeconds;
  switch (family) {
    case "straight": chamber[0] = home[0]; chamber[1] = home[1]; chamber[2] = home[2] - tuning.windup; torso = 0; break;
    case "cross": chamber[0] = home[0] + side * tuning.across; chamber[1] = home[1]; chamber[2] = home[2] - tuning.windup; torso = side * tuning.torso; break;
    case "hook": chamber[0] = home[0] + side * tuning.windup; chamber[1] = home[1]; chamber[2] = home[2]; torso = side * tuning.torso; seconds = tuning.hookSeconds; break;
    case "downward": chamber[0] = home[0]; chamber[1] = home[1] + tuning.windup; chamber[2] = home[2]; torso = 0; break;
    case "overhand": chamber[0] = home[0]; chamber[1] = home[1] + tuning.overhandWindup; chamber[2] = home[2] - tuning.windup; torso = 0; break;
    case "uppercut": chamber[0] = home[0]; chamber[1] = home[1] - tuning.uppercutWindup; chamber[2] = home[2] - tuning.windup; torso = 0; seconds = tuning.uppercutSeconds; break;
    default: { const never: never = family; throw new Error(`unknown attack path ${never}`); }
  }
  const dx = direction?.[0] ?? (family === "hook" ? -side * tuning.hookAcross : target[0] - chamber[0]),
    dy = direction?.[1] ?? target[1] - chamber[1], dz = direction?.[2] ?? target[2] - chamber[2], length = hypot(dx, dy, dz);
  if (direction && (!Number.isFinite(direction[0]) || !Number.isFinite(direction[1]) || !Number.isFinite(direction[2]) || !length))
    throw new Error("contact direction needs a finite nonzero vector");
  const scale = length > 0 ? tuning.contactSpeed / length : 0;
  out.contactVelocity[0] = dx * scale; out.contactVelocity[1] = dy * scale; out.contactVelocity[2] = dz * scale;
  out.curved = family === "hook";
  if (out.curved) { out.curve[0] = side * tuning.curve; out.curve[1] = 0; out.curve[2] = 0; }
  out.torso = torso; out.seconds = seconds;
  return out;
}
