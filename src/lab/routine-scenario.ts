import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Hand } from "../core/control/motor.ts";
import { recordHistory } from "./history.ts";
import type { LabScenario } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";
import { ROUTINE_TRACK, startRoutine } from "./routine.ts";
import { paintTrack } from "./run-scenario.ts";
import { trackOf } from "./track.ts";
import { readings } from "./hud/controls.ts";

/**
 * **The Routine scenario**: the lab routine (`routine.ts`), tactics on the core's skills -- walk out,
 * strike at the post with each hand in turn, walk round and back -- to show the muscles. The
 * readout is what it is doing, its loops, the striking fist's speed, read from the hand's body each
 * physics sub-step, and each strike's peak and where the head stood from the recipe's place. The
 * last `HISTORY_SECONDS` are recorded (`history.ts`), about one loop. On the ground: the track; in
 * the air, the post.
 */

/** What the history holds of each step. */
interface RoutineMoment {
  readonly time: number;
  readonly doing: string;
  readonly loops: number;
  readonly fist: number;
  readonly closure: Readonly<Record<Hand, number>>;
}
/** Seconds of the routine the page keeps to scrub back through: about a loop. */
const HISTORY_SECONDS = 30;
/** The post's drawn diameter, m: a point aimed at, not a body. */
const POST = 0.06;

export function routineScenario(scene: Scene): LabScenario {
  const material = new StandardMaterial("lab.routine", scene);
  material.diffuseColor = new Color3(0.85, 0.64, 0.36);
  material.emissiveColor = material.diffuseColor.scale(0.4);
  material.specularColor = Color3.Black();
  material.alpha = 0.55;
  const track = trackOf(ROUTINE_TRACK);
  paintTrack(scene, track, material);
  const post = MeshBuilder.CreateSphere("lab.routine.post", { diameter: POST, segments: 12 }, scene);
  post.material = material;
  post.isPickable = false;
  post.isVisible = false;
  const shown = readings({ doing: { name: "Doing" }, loops: { name: "Loops" }, fist: { name: "Fist", unit: "m/s" } });
  const line = (tag: "td" | "th", cells: readonly string[]): HTMLElement => {
    const made = document.createElement("tr");
    made.append(...cells.map((text) => Object.assign(document.createElement(tag), { textContent: text })));
    return made;
  };
  const table = document.createElement("table"), strikes = document.createElement("tbody");
  table.createTHead().append(line("th", ["Strike", "Peak fist, m/s", "Off, cm"]));
  table.append(strikes);

  return {
    keys: new Set(),
    panels: { readout: [shown.element, table] },
    timelineLabel: `The last ${HISTORY_SECONDS} seconds, one physics step a notch; dragging pauses. Arrow keys step once it has focus.`,
    start({ built, world, changed, clock }) {
      const routine = startRoutine(built, world);
      const history = recordHistory(built, world, HISTORY_SECONDS, (): RoutineMoment => ({
        time: routine.time(), doing: routine.doing(), loops: routine.tactics.loops, fist: routine.fistSpeed(),
        closure: { left: routine.closure("left"), right: routine.closure("right") },
      }));
      const player = createPlayer({ world, recording: history }, changed, clock);
      let shownStrikes = -1;
      return {
        player,
        recording: () => ({ frames: history.frames, live: history.live() }),
        drive: () => {},
        readout(frame: number | null): number | null {
          const at = routine.tactics.post;
          if (at) { post.position.set(at[0], at[1], at[2]); post.isVisible = true; }
          const moment = history.at(frame ?? history.live());
          if (!moment) return null;
          shown.write({ doing: moment.doing, loops: String(moment.loops), fist: moment.fist.toFixed(1) });
          if (routine.strikes.length !== shownStrikes) {
            shownStrikes = routine.strikes.length;
            strikes.replaceChildren(...routine.strikes.slice(-6).map((s) =>
              line("td", [s.name, s.peak.toFixed(1), `${(100 * s.off.along).toFixed(0)}, ${(100 * s.off.across).toFixed(0)}`])));
          }
          return moment.time;
        },
        // A hand closes only to strike.
        closure(hand) {
          const moment = history.at(player.shownFrame() ?? history.live());
          return moment?.closure[hand] ?? 0;
        },
        dispose(): void {
          history.dispose();
          routine.dispose();
        },
      };
    },
  };
}
