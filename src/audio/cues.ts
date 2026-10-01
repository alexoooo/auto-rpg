import type { BodyModel } from "../core/human/spec.ts";
import type { LandedBlow } from "../core/rules/blows.ts";

export type SoundKind = "bone" | "body" | "shield";
/** What each body sounds like when struck. */
export const SURFACE_SOUND: Readonly<Record<BodyModel, SoundKind>> = Object.freeze({
  "workshop-fighter": "body", "workshop-rogue": "body", "crypt-skeleton": "bone",
});
export interface SoundPoint { x: number; z: number }
export interface ImpactCue { key: string; kind: SoundKind; strength: number; severed: boolean; point: SoundPoint }
/**
 * How loud a blow is: its strength is the square root of its energy over `joules`, J, capped at 1, and
 * one weaker than `floor` makes no sound. Set, and measured against no bout's blows
 * (`docs/reference/look.md#sound`).
 */
const CUE = Object.freeze({ joules: 60, floor: .035 });

/**
 * The inbox's bounds, numeric settings that keep a fast simulation from flooding the audio clock: a
 * cue waits `coalesce` ms for a louder one of its pair, and one older than `stale` ms is dropped
 * unplayed; at most `pending` pairs wait, and at most `most` play from one drain.
 */
const INBOX = Object.freeze({ coalesce: 60, stale: 200, pending: 64, most: 12 });

/**
 * Where a sound sits, set by ear (`docs/reference/look.md#sound`): its pan is how far it is to
 * the listener's side over `panMetres`, held within `panMost` either way, and in the crypt its
 * gain falls to nothing at `reach`, m.
 */
const PLACEMENT = Object.freeze({ panMetres: 10, panMost: .85, reach: 18 });

/**
 * The cue for a blow (`LandedBlow`) on a body of `struck`'s surface, as loud as `CUE` makes it.
 * A clash, a hand or what it holds meeting another (`src/core/rules/blows.ts`), plays the `shield`
 * knock whatever the bodies are made of: a wooden club on a wooden club.
 */
export function blowCue(blow: LandedBlow, struck: SoundKind): ImpactCue | null {
  const strength = Math.sqrt(Math.max(0, blow.energy) / CUE.joules);
  if (!Number.isFinite(strength) || strength < CUE.floor) return null;
  return { key: `${blow.attacker}:${blow.target}`, kind: blow.clash ? "shield" : struck, strength: Math.min(1, strength),
    severed: (blow.wound?.severed.length ?? 0) > 0, point: { x: blow.point[0], z: blow.point[2] } };
}

/** A bounded wall-clock inbox: a fast simulation cannot flood the audio clock. */
export class ImpactInbox {
  private pending = new Map<string, { cue: ImpactCue; at: number }>();
  add(cue: ImpactCue, now: number): void {
    const old = this.pending.get(cue.key);
    if (old && now - old.at < INBOX.coalesce) {
      if (cue.strength > old.cue.strength) old.cue = cue;
      return;
    }
    if (old && now - old.at <= INBOX.stale) return; // Ready for the next drain; do not postpone it.
    if (this.pending.size >= INBOX.pending) this.pending.delete(this.pending.keys().next().value!);
    this.pending.set(cue.key, { cue, at: now });
  }
  drain(now: number): ImpactCue[] {
    const ready: ImpactCue[] = [];
    for (const [key, entry] of this.pending) {
      const age = now - entry.at;
      if (age < INBOX.coalesce) continue;
      this.pending.delete(key);
      if (age <= INBOX.stale) ready.push(entry.cue);
    }
    return ready.sort((a, b) => b.strength - a.strength).slice(0, INBOX.most);
  }
  clear(): void { this.pending.clear(); }
}
export function soundPlacement(point: SoundPoint, listener: SoundPoint, toward: SoundPoint, dungeon: boolean) {
  const dx = point.x - listener.x, dz = point.z - listener.z;
  const length = Math.hypot(toward.x, toward.z) || 1;
  return { pan: Math.max(-PLACEMENT.panMost, Math.min(PLACEMENT.panMost, (-dx * toward.z + dz * toward.x) / length / PLACEMENT.panMetres)),
    gain: dungeon ? Math.max(0, 1 - Math.hypot(dx, dz) / PLACEMENT.reach) ** 2 : 1 };
}
