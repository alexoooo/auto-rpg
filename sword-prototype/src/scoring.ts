// Explicit extension: this module and its test are run directly by Node (which
// requires it) as well as bundled by Vite (which does not care).
import { CONFIG } from "./config.ts";

export type HitKind = "cut" | "thrust" | "slap" | "weak" | "crush";

/**
 * What is doing the hitting.
 *
 * Restated here rather than imported from `weapon.ts`, for the reason every
 * other shape in this file is what it is: `weapon.ts` imports Babylon and the
 * whole value of this module is that it does not. `WeaponKind` satisfies this
 * structurally, so what is handed in is the weapon's own answer.
 */
export type Striker = "sword" | "shield" | "buckler" | "club" | "empty";

/** A contact reduced to the four numbers that decide what it was worth. */
export interface Contact {
  /** Speed of the blade at the contact point, m/s. */
  speed: number;
  /** |unit velocity . edge axis| -- 1 when travelling straight into the edge. */
  edgeAlignment: number;
  /** |unit velocity . blade axis| -- 1 when travelling straight along the blade. */
  bladeAlignment: number;
  /** Whether the contact landed in the business end of the point. */
  nearTip: boolean;
}

export interface Score {
  kind: HitKind;
  /** 0..1. How well the blow was delivered, before speed is considered. */
  quality: number;
  damage: number;
}

export type Tuning = typeof CONFIG.combat;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * The rule that decides whether a contact was a cut, a thrust, or a clang.
 *
 * Kept pure and separate from the physics so it can be argued with in a test
 * rather than only in the browser. This is the balance surface of the whole
 * prototype: change these few lines and the game becomes a different game.
 */
export function scoreHit(
  contact: Contact,
  by: Striker = "sword",
  tuning: Tuning = CONFIG.combat,
): Score {
  // The floor is the weapon's own, which is why this is not one comparison at
  // the top of the function any more. A blade below `minCutSpeed` is being
  // leaned on rather than swung; a club at the same speed is still several
  // kilograms of wood arriving. Gating both on the blade's number made the
  // club's floor unreachable and the setting a lie -- caught by the test that
  // asserts a club does something at a speed a sword does not.
  const floor = by === "club" ? tuning.minCrushSpeed : tuning.minCutSpeed;
  if (contact.speed < floor) {
    return { kind: "weak", quality: 0, damage: 0 };
  }

  const speedFrom = (from: number) =>
    clamp01((contact.speed - from) / (tuning.referenceSpeed - from));

  // A shield scores nothing, ever, and a buckler is a shield. Both still file a
  // report and both still shove, because the shove is applied by `combat.ts`
  // regardless of quality and a bash is a real thing to do with either -- but a
  // plate has no edge and no point, and giving one damage would be inventing a
  // weapon rather than modelling one.
  //
  // A buckler punch is the case with an argument on the other side: it is a
  // fist-sized boss driven point-first at speed, and people did break faces with
  // them. It is refused all the same, because the moment a shield scores, every
  // policy that holds one has an offensive option nobody designed and the guard
  // stops being a guard. If it is ever given damage it should be given its own
  // kind and its own test, not a share of the sword's.
  if (by === "shield" || by === "buckler") {
    return { kind: "slap", quality: 0, damage: 0 };
  }

  // A club has no edge, so there is nothing to align with and no way to hold it
  // wrong. Everything it does is speed, which is the whole character of the
  // weapon: you cannot place a blow with it, you can only arrive with one.
  if (by === "club") {
    return {
      kind: "crush",
      quality: 1,
      damage: tuning.crushScale * speedFrom(tuning.minCrushSpeed),
    };
  }

  const cutQuality = Math.pow(contact.edgeAlignment, tuning.edgeExponent);
  // Driving the middle of the blade lengthwise into something is a shove, not a
  // thrust, so only a contact near the point can score as one.
  const thrustQuality = contact.nearTip
    ? Math.pow(contact.bladeAlignment, tuning.edgeExponent)
    : 0;

  const thrusting = thrustQuality > cutQuality;
  const quality = thrusting ? thrustQuality : cutQuality;
  const kind: HitKind = quality < 0.25 ? "slap" : thrusting ? "thrust" : "cut";

  return { kind, quality, damage: tuning.damageScale * quality * speedFrom(tuning.minCutSpeed) };
}

/**
 * Whether a blow that emptied a limb should also take it off.
 *
 * Beating a limb to nothing with the flat leaves it ruined but attached, which
 * is both more interesting and more honest than letting a clumsy player
 * dismember by accumulation.
 */
export function severs(score: Score, remainingHealth: number, by: Striker = "sword"): boolean {
  if (remainingHealth > 0) return false;
  // A club takes a limb off by crushing through what is left of it, and the
  // edge-quality clause has nothing to say about a weapon with no edge. Dropping
  // it rather than refusing outright is deliberate: a club that could never
  // sever could only win by flattening all thirteen parts, which is not a weapon
  // so much as a chore.
  if (by === "club") return score.kind === "crush";
  return score.quality > 0.4 && score.kind !== "slap";
}
