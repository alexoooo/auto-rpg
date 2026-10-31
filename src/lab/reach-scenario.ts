import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { MindConfig } from "../core/mind/config.ts";
import { hypot } from "../core/math/real.ts";
import { recordHistory } from "./history.ts";
import type { LabScenario, ScenarioRun } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";
import { groundDisc } from "./ground-disc.ts";
import { legend, readings } from "../ui/controls.ts";

/**
 * **The Reach scenario**: the body alone on the floor, no foe and no orders, its mind deciding for
 * itself; a mind whose objective is reaching a place (`reach-place`, the Walker's) walks there and
 * stands. The place its objective names is marked on the ground, at the reach its walk counts as
 * there. The readout is what the mind is doing, how far its centre is from the place, its speed and
 * when it first got there. The last 30 seconds are recorded (`history.ts`).
 */

/** Seconds of the run the page keeps to scrub back through. */
const HISTORY_SECONDS = 30;

/** How near the place counts as there where the mind's walk names no reach, m: the walk's own default. */
const THERE = .3;

const MARKS = {
  place: { colour: new Color3(0.35, 0.8, 0.45), name: "the place its objective names" },
  centre: { colour: new Color3(0.95, 0.75, 0.4), name: "centre of mass" },
};

/** A place on the ground and how near it counts as there, m. */
interface Place { readonly x: number; readonly z: number; readonly within: number }

/**
 * The place `mind`'s objective names, if it is one of reaching a place (`reach-place` in its
 * chooser's objective slot), at the reach its walk to a place counts as there (`walk-to-place`).
 */
function placeOf(mind: MindConfig): Place | null {
  const tree = mind as { readonly chooser?: { readonly objective?: { readonly kind?: string; readonly x?: number; readonly z?: number } };
    readonly options?: readonly { readonly kind?: string; readonly within?: number }[] | null };
  const objective = tree.chooser?.objective;
  if (objective?.kind !== "reach-place" || typeof objective.x !== "number" || typeof objective.z !== "number") return null;
  const walk = tree.options?.find((option) => option.kind === "walk-to-place");
  return { x: objective.x, z: objective.z, within: walk?.within ?? THERE };
}

/** What the history holds of each step. */
interface ReachMoment {
  readonly time: number;
  readonly doing: string;
  readonly down: boolean;
  readonly centre: readonly [number, number];
  readonly speed: number;
  readonly reached: number | null;
}

export function reachScenario(scene: Scene): LabScenario {
  const centreMark = groundDisc(scene, "lab.reach.centre", 0.045, MARKS.centre.colour, 0.95, 0.008);
  centreMark.renderingGroupId = 1;
  const shown = readings({
    doing: { name: "Doing" }, state: { name: "State" }, off: { name: "From the place", unit: "m" },
    speed: { name: "Speed", unit: "m/s" }, reached: { name: "There at", unit: "s" },
  });
  // The mind the body plays, as the shell last chose it (`mind`): where its objective's place is read from.
  let played: MindConfig | null = null;
  return {
    keys: new Set(),
    panels: { readout: [shown, legend([MARKS.place, MARKS.centre])] },
    timelineLabel: `The last ${HISTORY_SECONDS} seconds, one physics step a notch; dragging pauses.`,
    mind(chosen) { played = chosen; return chosen; },
    start({ actor, changed, clock }) {
      const { world } = actor, body = actor.body, place = played ? placeOf(played) : null;
      const placeMark = place ? groundDisc(scene, "lab.reach.place", place.within, MARKS.place.colour, 0.5, 0.006) : null;
      if (placeMark && place) { placeMark.position.x = place.x; placeMark.position.z = place.z; placeMark.renderingGroupId = 1; }
      const mind = actor.drive();
      let reached: number | null = null;
      const history = recordHistory(body.built, world, HISTORY_SECONDS, (): ReachMoment => {
        const stance = body.view.stance, centre = stance.centre;
        if (place && reached === null && hypot(place.x - centre.x, place.z - centre.z) <= place.within) reached = world.time;
        return { time: world.time, doing: mind.report.engagement?.phase ?? "—", down: body.down, centre: [centre.x, centre.z],
          speed: hypot(stance.velocity.x, stance.velocity.z), reached };
      });
      const player = createPlayer({ world, recording: history }, changed, clock);
      const run: ScenarioRun = {
        player,
        recording: () => ({ frames: history.frames, live: history.live() }),
        drive() {},
        readout(frame: number | null): number | null {
          const moment = history.at(frame ?? history.live());
          if (!moment) return null;
          const off = place ? hypot(place.x - moment.centre[0], place.z - moment.centre[1]) : null;
          shown.write({ doing: moment.doing, state: moment.down ? "Down" : "Upright", off: off === null ? "no place" : off.toFixed(2),
            speed: moment.speed.toFixed(2), reached: moment.reached === null ? "not yet" : moment.reached.toFixed(2) }, moment.down ? ["state"] : []);
          centreMark.position.x = moment.centre[0]; centreMark.position.z = moment.centre[1];
          return moment.time;
        },
        closure: () => 0,
        dispose(): void {
          history.dispose();
          placeMark?.material?.dispose();
          placeMark?.dispose();
          actor.dispose();
        },
      };
      return run;
    },
  };
}
