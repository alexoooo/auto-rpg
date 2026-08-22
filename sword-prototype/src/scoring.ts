// Explicit extension: this module and its test are run directly by Node (which
// requires it) as well as bundled by Vite (which does not care).
import { CONFIG } from "./config.ts";

export type HitKind = "cut" | "thrust" | "slap" | "weak";

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
export function scoreHit(contact: Contact, tuning: Tuning = CONFIG.combat): Score {
  if (contact.speed < tuning.minCutSpeed) {
    return { kind: "weak", quality: 0, damage: 0 };
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

  const speedFactor = clamp01(
    (contact.speed - tuning.minCutSpeed) / (tuning.referenceSpeed - tuning.minCutSpeed),
  );

  return { kind, quality, damage: tuning.damageScale * quality * speedFactor };
}

/**
 * Whether a blow that emptied a limb should also take it off.
 *
 * Beating a limb to nothing with the flat leaves it ruined but attached, which
 * is both more interesting and more honest than letting a clumsy player
 * dismember by accumulation.
 */
export function severs(score: Score, remainingHealth: number): boolean {
  return remainingHealth <= 0 && score.quality > 0.4 && score.kind !== "slap";
}
