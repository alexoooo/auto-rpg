import type { LegsDrive, Locomotion } from "../framework/locomotion-part.ts";
import type { BodyView } from "../../control/body.ts";
import { cos, hypot, sin } from "../../core/math/real.ts";
import { heldPace, type StanceEnvelope } from "../../control/stance/stance-envelope.ts";
import { nearestFoe } from "../perception/targets.ts";
import { conditionMatches, type ConditionReading } from "./conditions.ts";
import { ALL_MET, FIELD_BIT, fieldsOf, maskOf, type LegsGoal, type GaitName } from "../framework/skill.ts";

/**
 * How far past a rule's distance the body goes before the rule lets go of the gait it chose, m: no
 * switching back and forth at the edge.
 */
const LEAVING = 0.5;

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

/** **A gait of Move**: its name (`GAITS`) and the walk it walks by. Two gaits may share one walk. */
export interface MoveGait {
  readonly name: GaitName;
  readonly legs: Locomotion;
}

/** `walk`, no faster than `envelope` holds that way (`heldPace`); as it is where `envelope` states no limits. */
function within(walk: readonly [number, number] | null, envelope: StanceEnvelope | null | undefined): readonly [number, number] | null {
  if (!walk || !envelope) return walk;
  const speed = hypot(walk[0], walk[1]), most = heldPace(envelope, walk[0], walk[1]);
  return speed > most ? [walk[0] * most / speed, walk[1] * most / speed] : walk;
}

/** Whether `envelope` holds the body's ground speed, read in the frame of `heading`: true where it states no limits. */
function holds(envelope: StanceEnvelope | null | undefined, view: BodyView, heading: number): boolean {
  if (!envelope) return true;
  const v = view.stance.velocity, forward = v.x * sin(heading) + v.z * cos(heading), right = v.x * cos(heading) - v.z * sin(heading);
  return hypot(forward, right) <= heldPace(envelope, forward, right);
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
 * (`MoveRule`), or `otherwise`. The gait changes only between steps (the stance standing or
 * shifting its weight, and taking no step of its own) with the body going no faster than the one
 * it changes to holds (`holds` its envelope), and the one it changes to takes the body up
 * as it is, moving, by the heading the one before walked by (`Locomotion.resume`); the first is
 * not resumed, since none has driven the body. While another gait is wanted, a gait that drives
 * the legs itself (`LegsDrive`) is asked to stand, and gives them back to the stance at its next
 * step, still moving; the stance's walk is then asked no faster than the gait wanted holds
 * (`within` its envelope), and the gait changes between its steps, on the move. Two gaits of one
 * walk change at once. Before the body's first step, and as it is resumed, it walks by the gait it
 * would stand by with nothing near. Its envelope, which minds plan by, and its arms are the gait's
 * it walks by; it says what each of its gaits holds (`envelopeOf`).
 */
export function move(gaits: readonly MoveGait[], rules: readonly MoveRule[], otherwise: number): Locomotion {
  const wanted = (reading: Reading, current: number | null, named?: GaitName): number => {
    const asked = named === undefined ? -1 : gaits.findIndex((gait) => gait.name === named);
    return asked >= 0 ? asked : rules.find((rule) => rule.matches(reading, rule.gait === current))?.gait ?? otherwise;
  };
  const memory = { chosen: false, gait: wanted(STILL, null), wants: wanted(STILL, null), driven: false, unmet: { ...ALL_MET } };
  const walks = [...new Set(gaits.map((gait) => gait.legs))];
  const state = { gaits: walks.map((walk) => walk.state), choice: memory, rules: rules.map((rule) => rule.state ?? null) };
  const now = (): Locomotion => gaits[memory.gait]!.legs;
  /** Whether the gait now is the one wanted, changing to it between steps if not: false while a gait that drives the legs has them. */
  const choose = (view: BodyView, walking: boolean, destination: number | undefined, named?: GaitName): boolean => {
    const s = view.stance, wants = memory.wants = wanted({ walking, foe: foeDistance(view), destination: destination ?? Infinity, ally: allyDistance(view) }, memory.gait, named);
    if (!memory.chosen) { memory.chosen = true; memory.gait = wants; return true; }
    if (wants === memory.gait) return true;
    if (gaits[wants]!.legs.state === now().state) { memory.gait = wants; return true; }
    const heading = now().heading;
    if (memory.driven || s.own || (s.phase !== "stand" && s.phase !== "shift") || !holds(gaits[wants]!.legs.envelope, view, heading)) return false;
    memory.gait = wants;
    now().resume(view, heading);
    return true;
  };
  /**
   * What of `goal` the gait walked by left undone, as `drive` it gave: its gait by name Move's to
   * meet, a gait by name not the one walked by, and a walk slowed while the gait changes.
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
    supports: Object.freeze([...new Set(walks.flatMap(walk => walk.supports))]),
    get lower() { return now().lower; },
    get envelope() { return now().envelope; },
    get stopping() { return now().stopping; },
    get lag() { return now().lag; },
    get heading() { return now().heading; },
    get pace() { return now().pace; },
    get reference() { return now().reference; },
    get placed() { return now().placed; },
    get unmet() { return memory.unmet; },
    get gait() { return gaits[memory.gait]!.name; },
    envelopeOf(name) {
      const gait = gaits.find((one) => one.name === name);
      if (!gait) return null;
      return gait.legs.envelope ?? null;
    },
    resume(view) {
      memory.chosen = true;
      memory.gait = memory.wants = wanted(STILL, null);
      memory.driven = false;
      memory.unmet.fields = ALL_MET.fields; memory.unmet.centre = 0; memory.unmet.height = 0;
      now().resume(view);
    },
    goal(view, goal, dt, context) {
      if (goal.footing) {
        choose(view, false, undefined, goal.gait);
        memory.driven = false;
        return report(goal, now().goal(view, goal, dt, context), true);
      }
      // Not yet the gait wanted: one driving the legs stands, giving them back to the stance, whose walk goes no faster than the one wanted holds.
      const chosen = choose(view, goal.walk !== null, goal.destination, goal.gait);
      const drive = now().goal(view, chosen ? goal : { ...goal, walk: memory.driven ? null : within(goal.walk, gaits[memory.wants]!.legs.envelope) }, dt, context);
      memory.driven = drive.kind === "drive";
      return report(goal, drive, chosen);
    },
    ...(walks.some((walk) => walk.arms) ? { arms: (view: BodyView) => now().arms?.(view) ?? null } : {}),
  };
}
