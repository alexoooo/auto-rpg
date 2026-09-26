import type { CombatReportEvent } from "./combat.ts";
import type { BodyFamily } from "./golem/family.ts";

export type SoundKind = "stone" | "bone" | "body" | "metal";
export interface SoundPoint { x: number; z: number }
export interface ImpactCue { key: string; kind: SoundKind; strength: number; severed: boolean; point: SoundPoint }
const surfaces: Record<BodyFamily, SoundKind> = { golem: "stone", skeleton: "bone", human: "body" };
/** Cosmetic interpretation only: never changes the report or consumes a simulation random draw. */
export function impactCue(event: CombatReportEvent, attacker: string, family: BodyFamily): ImpactCue | null {
  const r = event.report;
  const blocked = event.blocked || event.guarded;
  const energy = Math.max(0, r.energyJ || 0);
  const strength = energy > 0 ? Math.sqrt(energy / 60)
    : Math.max(Math.abs(r.solverImpulse || 0) / 8, Math.abs(r.speed || 0) / 12);
  if (!Number.isFinite(strength) || strength < .035) return null;
  return { key: `${attacker}:${r.targetId ?? "opponent"}`, kind: blocked
    ? r.key === "block:empty" ? "body" : "metal" : surfaces[family],
    strength: Math.min(1, strength), severed: r.severed,
    point: { x: r.point.x, z: r.point.z } };
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
