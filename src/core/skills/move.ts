import type { BodyView } from "../body.ts";
import { hypot } from "../math/real.ts";
import { nearestFoe } from "../mind/targets.ts";
import type { LegsDrive, Locomotion } from "./locomotion.ts";

/**
 * How far past a rule's distance the body goes before the rule lets go of the gait it chose, m: no
 * switching back and forth at the edge.
 */
const LEAVING = 0.5;

/** What a rule of Move reads: its distances, m (Infinity where there is nothing to measure to), and whether the body is asked to walk. */
interface Reading {
  readonly walking: boolean;
  readonly foe: number;
  readonly destination: number;
}

/**
 * **A rule of Move**, compiled: the gait it chooses (an index of Move's gaits), and whether it
 * matches `reading`, `holding` when the gait it chooses is the one the body walks by, which a rule
 * of a distance lets go of only `LEAVING` past it.
 */
export interface MoveRule {
  readonly gait: number;
  matches(reading: Reading, holding: boolean): boolean;
}

/** A rule that matches while the body is asked to stand: a body standing stands by its gait. */
export const standingRule = (gait: number): MoveRule => ({ gait, matches: (reading) => !reading.walking });

/** A rule that matches while what `of` names is under (or over) `metres` away. */
export function distanceRule(gait: number, of: "foe" | "destination", than: "under" | "over", metres: number): MoveRule {
  return {
    gait,
    matches(reading, holding) {
      const distance = reading[of];
      return than === "under" ? distance <= metres + (holding ? LEAVING : 0) : distance > metres - (holding ? LEAVING : 0);
    },
  };
}

/** The distance from `view`'s body's centre of mass to the nearest standing foe's, across the ground, m; Infinity with none. */
function foeDistance(view: BodyView): number {
  const centre = view.stance.centre, foe = nearestFoe(view.senses, centre, "standing");
  return foe === null ? Infinity : hypot(foe.centre.x - centre.x, foe.centre.z - centre.z);
}

/** Nothing near, nothing to go to and asked to stand: what a body reads before its first step. */
const STILL: Reading = Object.freeze({ walking: false, foe: Infinity, destination: Infinity });

/**
 * **Move**: a locomotion skill (`Locomotion`) that walks by one of `gaits`, the first whose rule of
 * `rules` matches (`MoveRule`), or `otherwise`. The gait changes only between steps (the stance
 * standing or shifting its weight, and taking no step of its own), and the one it changes to is
 * resumed from the body as it is (`Skill.resume`); the first is not, since none has driven the
 * body. A gait that drives the legs itself (`Locomotion.drive`) is asked to stand when another is
 * wanted, and the gait changes once it has given the legs back to the stance. Before the body's
 * first step, and as it is resumed, it walks by the gait it would stand by with nothing near. Its
 * envelope, which tactics plan by, and its arms are the gait's it walks by.
 */
export function move(gaits: readonly Locomotion[], rules: readonly MoveRule[], otherwise: number): Locomotion {
  const wanted = (reading: Reading, current: number | null): number =>
    rules.find((rule) => rule.matches(reading, rule.gait === current))?.gait ?? otherwise;
  const memory = { chosen: false, gait: wanted(STILL, null), driven: false };
  const state = { gaits: gaits.map((gait) => gait.state), choice: memory };
  const now = (): Locomotion => gaits[memory.gait]!;
  /** Whether the gait now is the one wanted, changing to it between steps if not: false while a gait that drives the legs has them. */
  const choose = (view: BodyView, walking: boolean, destination: number | undefined): boolean => {
    const s = view.stance, wants = wanted({ walking, foe: foeDistance(view), destination: destination ?? Infinity }, memory.gait);
    if (!memory.chosen) { memory.chosen = true; memory.gait = wants; return true; }
    if (wants === memory.gait) return true;
    if (memory.driven || s.own || (s.phase !== "stand" && s.phase !== "shift")) return false;
    memory.gait = wants;
    now().resume(view);
    return true;
  };
  return {
    state,
    get envelope() { return now().envelope; },
    get heading() { return now().heading; },
    get pace() { return now().pace; },
    get reference() { return now().reference; },
    get placed() { return now().placed; },
    resume(view) {
      memory.chosen = true;
      memory.gait = wanted(STILL, null);
      memory.driven = false;
      now().resume(view);
    },
    place(view, footing, lower) {
      choose(view, false, undefined);
      memory.driven = false;
      return now().place(view, footing, lower);
    },
    goal(view, walk, face, dt, lower, destination) {
      choose(view, walk !== null, destination);
      memory.driven = false;
      return now().goal(view, walk, face, dt, lower, destination);
    },
    ...(gaits.some((gait) => gait.drive) ? {
      drive(view: BodyView, walk: readonly [number, number] | null, face: number, dt: number, lower?: number, destination?: number): LegsDrive {
        // Not yet the gait wanted, a gait that drives the legs is asked to stand, and gives them back to the stance.
        const asked = choose(view, walk !== null, destination) ? walk : null, legs = now();
        const drive: LegsDrive = legs.drive ? legs.drive(view, asked, face, dt, lower, destination) : { kind: "stance", goal: legs.goal(view, asked, face, dt, lower, destination) };
        memory.driven = drive.kind === "drive";
        return drive;
      },
    } : {}),
    ...(gaits.some((gait) => gait.arms) ? { arms: (view: BodyView) => now().arms?.(view) ?? null } : {}),
  };
}
