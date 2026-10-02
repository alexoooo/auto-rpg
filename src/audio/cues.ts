import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import { heldBy } from "../core/build/rigid.ts";
import type { BodyModel } from "../core/human/spec.ts";
import type { LandedBlow } from "../core/rules/blows.ts";
import type { Surface } from "../core/spec/body.ts";

/** The voices an impact has: a blow on bone, on flesh, and on wood. */
export type SoundKind = "bone" | "body" | "shield";
/** What each body sounds like when struck. */
export const SURFACE_SOUND: Readonly<Record<BodyModel, SoundKind>> = Object.freeze({
  "workshop-fighter": "body", "workshop-rogue": "body", "crypt-skeleton": "bone",
});
export interface SoundPoint { x: number; z: number }
/** A sound to play: the pair it is of (`key`), its voice, how loud from 0 to 1, and where. */
export interface SoundCue { key: string; kind: SoundKind; strength: number; severed: boolean; point: SoundPoint }
/**
 * How loud a touch is: its strength is the square root of its energy over `joules`, J, capped at 1,
 * and one weaker than `floor` makes no sound. `joules` is over the hardest blow of three bouts, and
 * `floor` between a sole laid down and the quietest footfall (`docs/reference/look.md#sound`).
 */
const CUE = Object.freeze({ joules: 60, floor: .0125 });

/**
 * A body's air: none while its fastest point moves at `from`, m/s, or slower, all of it at `full`,
 * and in proportion between. `from` is over the fastest foot of a walk or the Run, and `full` is a
 * club's end in a blow (`docs/reference/look.md#sound`).
 */
const SWISH = Object.freeze({ from: 5, full: 20 });

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

/** The surfaces, softest first: the softer of two that meet decides the voice. */
const SOFTNESS: readonly Surface[] = Object.freeze(["flesh", "bone", "wood", "stone"]);

/** The voice of `a` meeting `b`: the softer one's. Stone has none of its own, and two stones never meet. */
export function voiceOf(a: Surface, b: Surface): SoundKind {
  const softer = SOFTNESS.indexOf(a) <= SOFTNESS.indexOf(b) ? a : b;
  switch (softer) {
    case "flesh": return "body";
    case "bone": return "bone";
    case "wood": return "shield";
    case "stone": throw new Error("stone on stone has no voice: nothing fixed meets something fixed");
    default: { const never: never = softer; throw new Error(`no voice for a surface of ${String(never)}`); }
  }
}

/**
 * What `segment` of `built` is made of: what it holds, if it holds anything (the two are one rigid
 * body, and sound as the item whichever of them met), and else what its body is made of.
 */
export function surfaceOf(built: BuiltBody, segment: BuiltSegment): Surface {
  const [held] = heldBy(built.spec, segment.spec.name);
  const surface = held ? held.item.surface : built.spec.surface;
  if (!SOFTNESS.includes(surface)) throw new Error(`${held ? held.item.name : built.spec.model} does not say what it is made of`);
  return surface;
}

/**
 * The cue for `energy`, J, in the voice `kind`, of the pair `key` at `point`: as loud as `CUE`
 * makes it, and none for one too quiet to hear.
 */
export function impactCue(key: string, kind: SoundKind, energy: number, point: SoundPoint, severed = false): SoundCue | null {
  const strength = Math.sqrt(Math.max(0, energy) / CUE.joules);
  if (!Number.isFinite(strength) || strength < CUE.floor) return null;
  return { key, kind, strength: Math.min(1, strength), severed, point: { x: point.x, z: point.z } };
}

/** How much of its air a body whose fastest point moves at `speed`, m/s, makes, from 0 to 1 (`SWISH`). */
export function swishStrength(speed: number): number {
  return Math.max(0, Math.min(1, (speed - SWISH.from) / (SWISH.full - SWISH.from)));
}

/**
 * The cue for a blow (`LandedBlow`) on a body of `struck`'s surface, as loud as `CUE` makes it.
 * A clash, a hand or what it holds meeting another (`src/core/rules/blows.ts`), plays the `shield`
 * knock whatever the bodies are made of: a wooden club on a wooden club.
 */
export function blowCue(blow: LandedBlow, struck: SoundKind): SoundCue | null {
  return impactCue(`${blow.attacker}:${blow.target}`, blow.clash ? "shield" : struck, blow.energy,
    { x: blow.point[0], z: blow.point[2] }, (blow.wound?.severed.length ?? 0) > 0);
}

/** A bounded wall-clock inbox: a fast simulation cannot flood the audio clock. */
export class CueInbox {
  private pending = new Map<string, { cue: SoundCue; at: number }>();
  add(cue: SoundCue, now: number): void {
    const old = this.pending.get(cue.key);
    if (old && now - old.at < INBOX.coalesce) {
      if (cue.strength > old.cue.strength) old.cue = cue;
      return;
    }
    if (old && now - old.at <= INBOX.stale) return; // Ready for the next drain; do not postpone it.
    if (this.pending.size >= INBOX.pending) this.pending.delete(this.pending.keys().next().value!);
    this.pending.set(cue.key, { cue, at: now });
  }
  drain(now: number): SoundCue[] {
    const ready: SoundCue[] = [];
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
