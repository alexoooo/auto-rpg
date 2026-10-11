import type { BodyView } from "../body.ts";
import { hypot } from "../math/real.ts";
import { nearestFoe } from "../mind/targets.ts";
import type { LegsDrive, Locomotion } from "./locomotion.ts";

/** How much farther than `near` the nearest foe goes before the walk is the travelling one again, m: no switching back and forth at the edge. */
const LEAVING = 0.5;

/** Whether a standing foe of `view`'s body is within `near` of its centre of mass, across the ground. */
function foeWithin(view: BodyView, near: number): boolean {
  const centre = view.stance.centre, foe = nearestFoe(view.senses, centre, "standing");
  return foe !== null && hypot(foe.centre.x - centre.x, foe.centre.z - centre.z) <= near;
}

/**
 * **Travel and fight**: a locomotion skill (`Locomotion`) that walks by `travel` while it is asked
 * to walk and no standing foe is within `near`, and by `fight` once one is, until it is `LEAVING`
 * farther, and whenever it is asked to stand: a body standing stands in its guard. The walk changes
 * only between steps (the stance standing or shifting its weight, and taking no step of its own),
 * and the one it changes to is resumed from the body as it is (`Skill.resume`); the first it is
 * asked for is not, since neither has driven the body. A walk that drives the legs itself
 * (`Locomotion.drive`) is asked to stand when the other is wanted, and changes once it has given
 * the legs back to the stance. Its envelope, which tactics plan by, and its arms are the walk's it
 * walks by: the guard's while it fights.
 */
export function travelOrFight(travel: Locomotion, fight: Locomotion, near: number): Locomotion {
  const memory = { chosen: false, fighting: true, driven: false };
  const state = { travel: travel.state, fight: fight.state, choice: memory };
  const now = (): Locomotion => memory.fighting ? fight : travel;
  /** Whether the walk now is the one wanted, changing to it between steps if not: false while a walk that drives the legs has them. */
  const choose = (view: BodyView, walking: boolean): boolean => {
    const s = view.stance, wants = !walking || foeWithin(view, memory.fighting ? near + LEAVING : near);
    if (!memory.chosen) { memory.chosen = true; memory.fighting = wants; return true; }
    if (wants === memory.fighting) return true;
    if (memory.driven || s.own || (s.phase !== "stand" && s.phase !== "shift")) return false;
    memory.fighting = wants;
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
      memory.fighting = true;
      memory.driven = false;
      now().resume(view);
    },
    place(view, footing, lower) {
      choose(view, false);
      memory.driven = false;
      return now().place(view, footing, lower);
    },
    goal(view, walk, face, dt, lower) {
      choose(view, walk !== null);
      memory.driven = false;
      return now().goal(view, walk, face, dt, lower);
    },
    ...(travel.drive || fight.drive ? {
      drive(view: BodyView, walk: readonly [number, number] | null, face: number, dt: number, lower?: number): LegsDrive {
        // Not yet the walk wanted, a walk that drives the legs is asked to stand, and gives them back to the stance.
        const asked = choose(view, walk !== null) ? walk : null, legs = now();
        const drive: LegsDrive = legs.drive ? legs.drive(view, asked, face, dt, lower) : { kind: "stance", goal: legs.goal(view, asked, face, dt, lower) };
        memory.driven = drive.kind === "drive";
        return drive;
      },
    } : {}),
    ...(travel.arms ? { arms: (view: BodyView) => memory.fighting ? null : travel.arms!(view) } : {}),
  };
}
