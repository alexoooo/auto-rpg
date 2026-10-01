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
 * The cue for a blow (`LandedBlow`) on a body of `struck`'s surface. Its strength is the
 * square root of the blow's energy over 60 J, capped at 1. A clash, a hand or what it holds meeting
 * another (`src/core/rules/blows.ts`), plays the `shield` knock whatever the bodies are made of: a
 * wooden club on a wooden club.
 */
export function blowCue(blow: LandedBlow, struck: SoundKind): ImpactCue | null {
  const strength = Math.sqrt(Math.max(0, blow.energy) / 60);
  if (!Number.isFinite(strength) || strength < .035) return null;
  return { key: `${blow.attacker}:${blow.target}`, kind: blow.clash ? "shield" : struck, strength: Math.min(1, strength),
    severed: (blow.wound?.severed.length ?? 0) > 0, point: { x: blow.point[0], z: blow.point[2] } };
}

/** A bounded wall-clock inbox: a fast simulation cannot flood the audio clock. */
export class ImpactInbox {
  private pending = new Map<string, { cue: ImpactCue; at: number }>();
  add(cue: ImpactCue, now: number): void {
    const old = this.pending.get(cue.key);
    if (old && now - old.at < 60) {
      if (cue.strength > old.cue.strength) old.cue = cue;
      return;
    }
    if (old && now - old.at <= 200) return; // Ready for the next drain; do not postpone it.
    if (this.pending.size >= 64) this.pending.delete(this.pending.keys().next().value!);
    this.pending.set(cue.key, { cue, at: now });
  }
  drain(now: number): ImpactCue[] {
    const ready: ImpactCue[] = [];
    for (const [key, entry] of this.pending) {
      const age = now - entry.at;
      if (age < 60) continue;
      this.pending.delete(key);
      if (age <= 200) ready.push(entry.cue);
    }
    return ready.sort((a, b) => b.strength - a.strength).slice(0, 12);
  }
  clear(): void { this.pending.clear(); }
}
export function soundPlacement(point: SoundPoint, listener: SoundPoint, toward: SoundPoint, dungeon: boolean) {
  const dx = point.x - listener.x, dz = point.z - listener.z;
  const length = Math.hypot(toward.x, toward.z) || 1;
  return { pan: Math.max(-.85, Math.min(.85, (-dx * toward.z + dz * toward.x) / length / 10)),
    gain: dungeon ? Math.max(0, 1 - Math.hypot(dx, dz) / 18) ** 2 : 1 };
}
