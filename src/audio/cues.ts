import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import { heldBy } from "../core/build/rigid.ts";
import { woundedIn, type LandedBlow } from "../core/rules/blows.ts";
import type { Substance } from "../core/spec/body.ts";

/** The voices a touch has: on bone, on flesh, and on wood. */
export type SoundKind = "bone" | "body" | "shield";
export interface SoundPoint { x: number; z: number }
/**
 * A sound to play: the pair it is of (`key`), its voice, how loud from 0 to 1, and where. Its
 * voice is a touch's, or `debris`: what a blow took off, scattering (`debrisCues`).
 */
export interface SoundCue { key: string; kind: SoundKind | "debris"; strength: number; point: SoundPoint }
/**
 * How loud a touch is: its strength is the square root of its energy over `joules`, J, capped at 1,
 * and one weaker than `floor` makes no sound. `joules` is a hard fall's landing, which a club blow
 * passes, and `floor` between a sole laid down and the quietest footfall (`docs/reference/look.md#sound`).
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

/** What things are made of, softest first: the softer of two that meet decides the voice. */
const SOFTNESS: readonly Substance[] = Object.freeze(["flesh", "bone", "wood", "stone"]);

/** The voice of `a` meeting `b`: the softer one's. Stone has none of its own, and two stones never meet. */
export function voiceOf(a: Substance, b: Substance): SoundKind {
  const softer = SOFTNESS.indexOf(a) <= SOFTNESS.indexOf(b) ? a : b;
  switch (softer) {
    case "flesh": return "body";
    case "bone": return "bone";
    case "wood": return "shield";
    case "stone": throw new Error("stone on stone has no voice: nothing fixed meets something fixed");
    default: { const never: never = softer; throw new Error(`no voice for a thing of ${String(never)}`); }
  }
}

/**
 * What `segment` of `built` is made of: what it holds, if it holds anything (the two are one rigid
 * body, and sound as the item whichever of them met), and else what its body is made of.
 */
export function substanceOf(built: BuiltBody, segment: BuiltSegment): Substance {
  const [held] = heldBy(built.spec, segment.spec.name);
  const substance = held ? held.item.substance : built.spec.substance;
  if (!SOFTNESS.includes(substance)) throw new Error(`${held ? held.item.name : built.spec.model} does not say what it is made of`);
  return substance;
}

/**
 * The cue for `energy`, J, in the voice `kind`, of the pair `key` at `point`: as loud as `CUE`
 * makes it, and none for one too quiet to hear.
 */
export function impactCue(key: string, kind: SoundCue["kind"], energy: number, point: SoundPoint): SoundCue | null {
  const strength = Math.sqrt(Math.max(0, energy) / CUE.joules);
  if (!Number.isFinite(strength) || strength < CUE.floor) return null;
  return { key, kind, strength: Math.min(1, strength), point: { x: point.x, z: point.z } };
}

/** How much of its air a body whose fastest point moves at `speed`, m/s, makes, from 0 to 1 (`SWISH`). */
export function swishStrength(speed: number): number {
  return Math.max(0, Math.min(1, (speed - SWISH.from) / (SWISH.full - SWISH.from)));
}

/**
 * The cues for what `blow` took off (`Wound.severed`), one for each side it took something off:
 * debris, as loud as that side's share of the blow's energy makes it. The blow itself is a touch,
 * and is heard as one (`hearTouches`); each of these is of a pair of its own, so it plays beside
 * it.
 */
export function debrisCues(blow: LandedBlow): SoundCue[] {
  return woundedIn(blow).flatMap((side) => {
    const cue = side.wound.severed.length ? impactCue(`${side.fighter}:debris`, "debris", side.share * blow.energy, { x: blow.point[0], z: blow.point[2] }) : null;
    return cue ? [cue] : [];
  });
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
