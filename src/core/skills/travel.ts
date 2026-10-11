import type { BodyView } from "../body.ts";
import { hypot } from "../math/real.ts";
import { nearestFoe } from "../mind/targets.ts";
import type { Locomotion } from "./locomotion.ts";

/** How much farther than `near` the nearest foe goes before the walk is the travelling one again, m: no switching back and forth at the edge. */
const LEAVING = 0.5;

/** Whether a standing foe of `view`'s body is within `near` of its centre of mass, across the ground. */
function foeWithin(view: BodyView, near: number): boolean {
  const centre = view.stance.centre, foe = nearestFoe(view.senses, centre, "standing");
  return foe !== null && hypot(foe.centre.x - centre.x, foe.centre.z - centre.z) <= near;
}

/**
 * **Travel and fight**: a locomotion skill (`Locomotion`) that walks by `travel` while no standing
 * foe is within `near`, and by `fight` once one is, until it is `LEAVING` farther. The walk changes
 * only between steps (the stance standing or shifting its weight, and taking no step of its own),
 * and the one it changes to is resumed from the body as it is (`Skill.resume`). Its envelope, which
 * tactics plan by, is the fight's; its arms are the travelling walk's while it travels, and the
 * guard's while it fights.
 */
export function travelOrFight(travel: Locomotion, fight: Locomotion, near: number): Locomotion {
  const memory = { fighting: false };
  const state = { travel: travel.state, fight: fight.state, choice: memory };
  const now = (): Locomotion => memory.fighting ? fight : travel;
  const choose = (view: BodyView): void => {
    const s = view.stance, wants = foeWithin(view, memory.fighting ? near + LEAVING : near);
    if (wants === memory.fighting || s.own || (s.phase !== "stand" && s.phase !== "shift")) return;
    memory.fighting = wants;
    now().resume(view);
  };
  return {
    state, envelope: fight.envelope,
    get heading() { return now().heading; },
    get pace() { return now().pace; },
    get reference() { return now().reference; },
    get placed() { return now().placed; },
    resume(view) {
      memory.fighting = foeWithin(view, near);
      now().resume(view);
    },
    place(view, footing, lower) { return now().place(view, footing, lower); },
    goal(view, walk, face, dt, lower) {
      choose(view);
      return now().goal(view, walk, face, dt, lower);
    },
    ...(travel.arms ? { arms: (view: BodyView) => memory.fighting ? null : travel.arms!(view) } : {}),
  };
}
