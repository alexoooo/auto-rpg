import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { cos, sin, hypot } from "../math/real.ts";
import type { ActionStatus, Phase } from "../skills/action.ts";
import type { SupportReport } from "../skills/support-fold.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { GroundIntent } from "./ground-position.ts";
import type { BodySense } from "./senses.ts";

/** The walking cells and finite deadlines both ground approaches share: `docs/reference/ground-combat.md#policy-settings`. */
export const GROUND_APPROACH = Object.freeze({ near: .1, settle: .12, speed: .18, braking: .5, quiet: .1, refresh: .5, targetShift: .2,
  acquisition: 5, attack: 8, approach: 30, retry: 1 });

/** An episode's stage: walking beside the foe, lowering until the support is ready, attacking, and standing again. */
export type GroundStage = "approach" | "lower" | "attack" | "rise";

/** What ground positioning reports doing: its own phases, or the phase of the blow it is throwing. */
export type GroundPhase = "guard" | "low-approach" | "low-wait" | "low-prepare" | "low-attack" | "low-return" | Phase;

/** The memory an approach's episode keeps, in its approach's `state`. */
interface Episode {
  phase: GroundPhase;
  stage: GroundStage;
  face: number;
  target: Vec3 | null;
  elapsed: number;
  lowTime: number;
  retry: number;
}

/** A world offset (x, z) as a walk (forward, right) along `heading`, or a walk back as a world offset: the map is its own inverse. */
export function turned(heading: number, a: number, b: number): [number, number] {
  return [a * sin(heading) + b * cos(heading), a * cos(heading) - b * sin(heading)];
}

/** A walk toward the world offset (dx, dz) from a body facing `heading`: the offset over `braking` seconds, each component capped at `speed`. */
export function walkToward(heading: number, dx: number, dz: number): [number, number] {
  const clip = (v: number) => Math.max(-GROUND_APPROACH.speed, Math.min(GROUND_APPROACH.speed, v / GROUND_APPROACH.braking));
  const walk = turned(heading, dx, dz);
  walk[0] = clip(walk[0]);
  walk[1] = clip(walk[1]);
  return walk;
}

/** Where to stand facing `face`: `ahead` short of `target` and `across` to the left of it for `side` 1, the right hand's, or to its right for -1. */
export function beside(target: Vec3, face: number, side: number, across: number, ahead: number): [number, number] {
  return [target[0] - side * across * cos(face) - ahead * sin(face), target[2] + side * across * sin(face) - ahead * cos(face)];
}

/** The highest of `surface`'s points on the foe's middle segments, the first of equals, and its segment; null where it finds none. */
export function highestOpening(foe: BodySense, surface: (segment: string) => Vec3 | null): { readonly segment: string; readonly target: Vec3 } | null {
  let best: { segment: string; target: Vec3 } | null = null;
  for (const segment of foe.spec.marks.middle) {
    const target = surface(segment);
    if (target && (!best || target[1] > best.target[1])) best = { segment, target };
  }
  return best;
}

/** Counts `dt` into `episode` and sends it to its return when its foe is `gone` or its stage outlives its deadline. */
export function lapse(episode: Episode, gone: boolean, dt: number): void {
  episode.elapsed += dt;
  if (gone) episode.stage = "rise";
  switch (episode.stage) {
    case "approach":
      if (episode.elapsed >= GROUND_APPROACH.approach) episode.stage = "rise";
      return;
    case "lower":
      episode.lowTime += dt;
      if (episode.lowTime >= GROUND_APPROACH.acquisition) episode.stage = "rise";
      return;
    case "attack":
      episode.lowTime += dt;
      if (episode.lowTime >= GROUND_APPROACH.acquisition + GROUND_APPROACH.attack) episode.stage = "rise";
      return;
    case "rise":
      return;
    default: {
      const never: never = episode.stage;
      throw new Error(`unknown ground stage ${never}`);
    }
  }
}

/** Standing still, facing as the episode faces. */
export function hold(episode: Episode): GroundIntent {
  return { move: null, face: episode.face, allow: false };
}

/** The return: once no blow of the episode runs and the support stands, the episode ends (`reset`) and waits out the retry delay. */
export function rise(episode: Episode, busy: ActionStatus | undefined, support: SupportReport, reset: () => void): GroundIntent {
  episode.phase = "low-return";
  if (!busy && support.stage === "stand") {
    reset();
    episode.retry = GROUND_APPROACH.retry;
  }
  return hold(episode);
}

/** Lowered beside the target: the return if the target is beyond `reach` of `centre`, else the attack once the support is ready. */
export function lowered(episode: Episode, centre: Vector3, reach: number, busy: ActionStatus | undefined, support: SupportReport): GroundIntent {
  const target = episode.target!;
  if (hypot(target[0] - centre.x, target[2] - centre.z) > reach) {
    episode.stage = "rise";
    return hold(episode);
  }
  if (support.ready) episode.stage = "attack";
  episode.phase = episode.stage === "attack" ? busy?.phase ?? "low-attack" : "low-prepare";
  return { move: null, face: episode.face, allow: true };
}
