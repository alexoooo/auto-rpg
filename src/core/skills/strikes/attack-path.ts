import { hypot } from "../../math/real.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import type { Side } from "../../spec/body.ts";

/** A blow's path by its shape: each is an action of the path strike (`pathExecutor`, `combat.ts`). */
export type BlowFamily = "straight" | "cross" | "hook" | "downward" | "overhand" | "uppercut";

/** An arm-extension preference is finite and in [0, 1]; omitted inherits the executor's (`docs/reference/combat-arm-style.md`). */
export function validArmExtension(extension = 0): boolean {
  return Number.isFinite(extension) && extension >= 0 && extension <= 1;
}

/** Experimental trajectory search cells and physical gates: `docs/reference/combat-strikes.md#trajectory-settings`. */
export const ATTACK_PATH = Object.freeze({ chamberSeconds: .22, swingSeconds: .12, returnSeconds: .32,
  contactSpeed: 5, windup: .12, across: .05, followSeconds: .04, torso: .2,
  hookSeconds: .18, curve: .05, hookAcross: .15,
  // Vertical chamber measurement: `docs/reference/combat-strikes.md#overhand-settings`.
  overhandWindup: .35,
  // Upward chamber search: `docs/reference/combat-uppercut.md`.
  uppercutWindup: .12, uppercutSeconds: .25,
  // Optional elbow preference: `docs/reference/combat-strikes.md#elbow-extension`.
  elbowExtension: 0,
  prepareLimit: .8, returnLimit: 1.2, near: .05, slow: .6, hold: .05 });

export type AttackTuning = { readonly [K in keyof typeof ATTACK_PATH]: number };

/** The shared executor admits finite path settings, positive durations and a bounded elbow preference. */
export function validAttackTuning(tuning: AttackTuning): boolean {
  return Object.values(tuning).every(v => Number.isFinite(v) && v >= 0)
    && [tuning.chamberSeconds, tuning.swingSeconds, tuning.hookSeconds, tuning.uppercutSeconds, tuning.returnSeconds, tuning.prepareLimit, tuning.returnLimit, tuning.hold].every(v => v > 0)
    && validArmExtension(tuning.elbowExtension);
}

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

/** A chamber and contact velocity from the actual guard and observed target, in the body frame. */
export function attackPath(home: Vec3, target: Vec3, hand: Side, family: BlowFamily, tuning: AttackTuning = ATTACK_PATH, direction?: Vec3) {
  const out = attackPathToRef(home, target, hand, family, tuning, direction, attackPathWork());
  return { chamber: out.chamber as Vec3, contactVelocity: out.contactVelocity as Vec3, torso: out.torso, curve: out.curved ? out.curve as Vec3 : undefined, seconds: out.seconds };
}

/** `attackPath` into `out`, which carries nothing between calls: what a search over many candidate blows reads. */
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
