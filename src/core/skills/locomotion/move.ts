import type { BodyView } from "../../body.ts";
import { hypot } from "../../math/real.ts";
import { nearestFoe } from "../../intent/targets.ts";
import { conditionMatches, type ConditionReading } from "../../intent/conditions.ts";
import type { GaitName } from "./gaits.ts";
import type { LegsDrive, Locomotion } from "./locomotion.ts";
import { ALL_MET, FIELD_BIT, fieldsOf, maskOf, type LegsGoal } from "../framework/skill.ts";

/**
 * How far past a rule's distance the body goes before the rule lets go of the gait it chose, m: no
 * switching back and forth at the edge.
 */
export const LEAVING = 0.5;

/** What a rule of Move reads: its distances, m (Infinity where there is nothing to measure to), and whether the body is asked to walk. */
type Reading = ConditionReading;

/**
 * **A rule of Move**, compiled: the gait it chooses (an index of Move's gaits), and whether it
 * matches `reading`, `holding` when the gait it chooses is the one the body walks by, which a rule
 * of a distance lets go of only `LEAVING` past it.
 */
export interface MoveRule {
  readonly gait: number;
  matches(reading: Reading, holding: boolean): boolean;
  /** Its memory, if it keeps any (`src/core/state.ts`), held in Move's. */
  readonly state?: object;
}

/** A rule that matches while the body is asked to stand: a body standing stands by its gait. */
export const standingRule = (gait: number): MoveRule => ({ gait, matches: (reading) => conditionMatches({ kind: "when-standing" }, reading) });

/** A rule that matches while what `of` names is under (or over) `metres` away. */
export function distanceRule(gait: number, of: "foe" | "destination" | "ally", than: "under" | "over", metres: number): MoveRule {
  return {
    gait,
    matches(reading, holding) {
      return conditionMatches({ kind: "when-distance", of, than, metres }, reading, holding ? LEAVING : 0);
    },
  };
}

/** The distance from `view`'s body's centre of mass to the nearest standing foe's, across the ground, m; Infinity with none. */
function foeDistance(view: BodyView): number {
  const centre = view.stance.centre, foe = nearestFoe(view.senses, centre, "standing");
  return foe === null ? Infinity : hypot(foe.centre.x - centre.x, foe.centre.z - centre.z);
}

/**
 * **A gait of Move**: its name (`GAITS`), the walk it walks by, and for a walk that runs as well
 * (`Locomotion.runs`), whether it may run. Two gaits may share one walk.
 */
export interface MoveGait {
  readonly name: GaitName;
  readonly legs: Locomotion;
  readonly runs?: boolean;
}

/** The distance from `view`'s body's centre of mass to the nearest standing body of its own side, across the ground, m; Infinity with none. */
function allyDistance(view: BodyView): number {
  const centre = view.stance.centre, side = view.senses.side;
  let nearest = Infinity;
  for (const other of view.senses.others) if (other.side === side && !other.out && !other.down)
    nearest = Math.min(nearest, hypot(other.centre.x - centre.x, other.centre.z - centre.z));
  return nearest;
}

/** Nothing near, nothing to go to and asked to stand: what a body reads before its first step. */
const STILL: Reading = Object.freeze({ walking: false, foe: Infinity, destination: Infinity, ally: Infinity });

/**
 * **Move**: a locomotion skill (`Locomotion`) that walks by one of `gaits`: the one a legs goal
 * names (`LegsGoal.gait`) where it has it, else the first whose rule of `rules` matches
 * (`MoveRule`), or `otherwise`. The gait changes only between steps (the stance
 * standing or shifting its weight, and taking no step of its own), and the one it changes to is
 * resumed from the body as it is (`Skill.resume`); the first is not, since none has driven the
 * body. A gait that drives the legs itself (`LegsDrive`) is asked to stand when another is
 * wanted, and the gait changes once it has given the legs back to the stance. Two gaits of one walk
 * change at once, the walk told whether it may run (`MoveGait.runs`). Before the body's first
 * step, and as it is resumed, it walks by the gait it would stand by with nothing near. Its
 * envelope, which tactics plan by, and its arms are the gait's it walks by; it says what each of its
 * gaits holds (`envelopeOf`).
 */
export function move(gaits: readonly MoveGait[], rules: readonly MoveRule[], otherwise: number): Locomotion {
  const wanted = (reading: Reading, current: number | null, named?: GaitName): number => {
    const asked = named === undefined ? -1 : gaits.findIndex((gait) => gait.name === named);
    return asked >= 0 ? asked : rules.find((rule) => rule.matches(reading, rule.gait === current))?.gait ?? otherwise;
  };
  const memory = { chosen: false, gait: wanted(STILL, null), driven: false, unmet: { ...ALL_MET } };
  const walks = [...new Set(gaits.map((gait) => gait.legs))];
  const state = { gaits: walks.map((walk) => walk.state), choice: memory, rules: rules.map((rule) => rule.state ?? null) };
  const now = (): Locomotion => gaits[memory.gait]!.legs;
  /** The walk now told whether its gait may run. */
  const told = (): Locomotion => {
    const gait = gaits[memory.gait]!;
    if (gait.runs !== undefined) gait.legs.runs?.(gait.runs);
    return gait.legs;
  };
  told();
  /** Whether the gait now is the one wanted, changing to it between steps if not: false while a gait that drives the legs has them. */
  const choose = (view: BodyView, walking: boolean, destination: number | undefined, named?: GaitName): boolean => {
    const s = view.stance, wants = wanted({ walking, foe: foeDistance(view), destination: destination ?? Infinity, ally: allyDistance(view) }, memory.gait, named);
    if (!memory.chosen) { memory.chosen = true; memory.gait = wants; return true; }
    if (wants === memory.gait) return true;
    if (gaits[wants]!.legs === now()) { memory.gait = wants; return true; }
    if (memory.driven || s.own || (s.phase !== "stand" && s.phase !== "shift")) return false;
    memory.gait = wants;
    told().resume(view);
    return true;
  };
  /**
   * What of `goal` the gait walked by left undone, as `drive` it gave: its gait by name Move's to
   * meet, a gait by name not the one walked by, and a walk not taken while the gait changes.
   */
  const report = (goal: LegsGoal, drive: LegsDrive, chosen: boolean): LegsDrive => {
    const inner = now().unmet ?? ALL_MET, unmet = memory.unmet;
    unmet.fields = fieldsOf(maskOf(inner.fields) & ~FIELD_BIT.gait
      | (goal.gait !== undefined && gaits[memory.gait]!.name !== goal.gait ? FIELD_BIT.gait : 0)
      | (!chosen && goal.walk ? FIELD_BIT.walk : 0));
    unmet.centre = inner.centre; unmet.height = inner.height;
    return drive;
  };
  return {
    state,
    get envelope() { return now().envelope; },
    get stopping() { return now().stopping; },
    get heading() { return now().heading; },
    get pace() { return now().pace; },
    get reference() { return now().reference; },
    get placed() { return now().placed; },
    get unmet() { return memory.unmet; },
    get gait() { return gaits[memory.gait]!.name; },
    envelopeOf(name) {
      const gait = gaits.find((one) => one.name === name);
      if (!gait) return null;
      return gait.runs !== undefined && gait.legs.envelopeRunning ? gait.legs.envelopeRunning(gait.runs) : gait.legs.envelope ?? null;
    },
    resume(view) {
      memory.chosen = true;
      memory.gait = wanted(STILL, null);
      memory.driven = false;
      memory.unmet.fields = ALL_MET.fields; memory.unmet.centre = 0; memory.unmet.height = 0;
      told().resume(view);
    },
    goal(view, goal, dt, context) {
      if (goal.footing) {
        choose(view, false, undefined, goal.gait);
        memory.driven = false;
        return report(goal, told().goal(view, goal, dt, context), true);
      }
      // Not yet the gait wanted, a gait that drives the legs is asked to stand, and gives them back to the stance.
      const chosen = choose(view, goal.walk !== null, goal.destination, goal.gait);
      const drive = told().goal(view, chosen || goal.walk === null ? goal : { ...goal, walk: null }, dt, context);
      memory.driven = drive.kind === "drive";
      return report(goal, drive, chosen);
    },
    ...(walks.some((walk) => walk.arms) ? { arms: (view: BodyView) => now().arms?.(view) ?? null } : {}),
  };
}
