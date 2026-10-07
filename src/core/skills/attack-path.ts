import { hypot } from "../math/real.ts";
import { validArmExtension, type CombatAction } from "../mind/intent.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Side } from "../spec/body.ts";

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
  prepareLimit: .8, returnLimit: 1.2, near: .05, slow: .6, hold: .05, startup: 2 });

export type AttackTuning = { readonly [K in keyof typeof ATTACK_PATH]: number };

/** The shared executor admits finite path settings, positive durations and a bounded elbow preference. */
export function validAttackTuning(tuning: AttackTuning): boolean {
  return Object.values(tuning).every(v => Number.isFinite(v) && v >= 0)
    && [tuning.chamberSeconds, tuning.swingSeconds, tuning.hookSeconds, tuning.uppercutSeconds, tuning.returnSeconds, tuning.prepareLimit, tuning.returnLimit, tuning.hold].every(v => v > 0)
    && validArmExtension(tuning.elbowExtension);
}

/** A chamber and contact velocity from the actual guard and observed target, in the body frame. */
export function attackPath(home: Vec3, target: Vec3, hand: Side, family: CombatAction["family"], tuning: AttackTuning = ATTACK_PATH, direction?: Vec3) {
  const side = hand === "right" ? 1 : -1;
  let chamber: Vec3, torso: number, seconds = tuning.swingSeconds;
  switch (family) {
    case "straight": chamber = [home[0], home[1], home[2] - tuning.windup]; torso = 0; break;
    case "cross": chamber = [home[0] + side * tuning.across, home[1], home[2] - tuning.windup]; torso = side * tuning.torso; break;
    case "hook": chamber = [home[0] + side * tuning.windup, home[1], home[2]]; torso = side * tuning.torso; seconds = tuning.hookSeconds; break;
    case "downward": chamber = [home[0], home[1] + tuning.windup, home[2]]; torso = 0; break;
    case "overhand": chamber = [home[0], home[1] + tuning.overhandWindup, home[2] - tuning.windup]; torso = 0; break;
    case "uppercut": chamber = [home[0], home[1] - tuning.uppercutWindup, home[2] - tuning.windup]; torso = 0; seconds = tuning.uppercutSeconds; break;
    default: { const never: never = family; throw new Error(`unknown attack path ${never}`); }
  }
  const dx = direction?.[0] ?? (family === "hook" ? -side * tuning.hookAcross : target[0] - chamber[0]),
    dy = direction?.[1] ?? target[1] - chamber[1], dz = direction?.[2] ?? target[2] - chamber[2], length = hypot(dx, dy, dz);
  if (direction && (direction.some(v => !Number.isFinite(v)) || !length)) throw new Error("contact direction needs a finite nonzero vector");
  const scale = length > 0 ? tuning.contactSpeed / length : 0;
  return { chamber, contactVelocity: [dx * scale, dy * scale, dz * scale] as Vec3, torso,
    curve: family === "hook" ? [side * tuning.curve, 0, 0] as Vec3 : undefined,
    seconds };
}
