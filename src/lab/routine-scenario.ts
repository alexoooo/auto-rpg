import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Vec3 } from "../core/spec/quantity.ts";
import { recordHistory } from "./history.ts";
import type { LabScenario } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";
import { ROUTINE_TRACK, startRoutine } from "./routine.ts";
import type { TargetReading } from "./targets.ts";
import { paintTrack } from "./run-scenario.ts";
import { trackOf } from "./track.ts";
import { readings, table } from "../ui/controls.ts";
import { strikeHands } from "../render/strike-hands.ts";
import type { Side } from "../core/spec/body.ts";

/**
 * **The Routine scenario**: the lab routine (`routine.ts`), tactics on the core's skills -- walk out,
 * strike at each target with the hands in turn, walk round and back -- to show the muscles. The
 * readout is its loops, the striking fist's speed, read from the hand's body each
 * physics sub-step, and each target's reading (`targets.ts`): what the blow did, or how near it
 * passed. The last `HISTORY_SECONDS` are recorded (`history.ts`). On the ground: the track; in
 * the air, the target that is up, drawn where it will hang and then where its body is: a picture,
 * which decides nothing.
 */

/** What the history holds of each step. */
interface RoutineMoment {
  readonly time: number;
  readonly loops: number;
  readonly fist: number;
  readonly closure: Readonly<Record<Side, number>>;
  /** The ball of the target that is up: its centre and its radius; null when none is. */
  readonly ball: { readonly centre: Vec3; readonly radius: number } | null;
}
/** Seconds of the routine the page keeps to scrub back through. */
const HISTORY_SECONDS = 30;
/** The targets' readings the table shows: the most recent. */
const ROWS = 10;

/** A reading's row: its stratum and hand, the strike thrown, what it did, and whether the body went down. */
function row(reading: TargetReading): string[] {
  const { target, hand, strike, hung, took, nearest, fell } = reading;
  const did = took ? `${took.damage.toFixed(2)} HP` : !strike ? "no strike" : !hung || nearest === null ? "no room to hang it" : `missed by ${(100 * nearest).toFixed(0)} cm`;
  return [`${target.stratum}, ${hand}`, strike?.name ?? "", did, fell ? "fell" : ""];
}

export function routineScenario(scene: Scene): LabScenario {
  const material = new StandardMaterial("lab.routine", scene);
  material.diffuseColor = new Color3(0.85, 0.64, 0.36);
  material.emissiveColor = material.diffuseColor.scale(0.4);
  material.specularColor = Color3.Black();
  material.alpha = 0.55;
  const track = trackOf(ROUTINE_TRACK);
  paintTrack(scene, track, material);
  // A ball of diameter 1, scaled to the target that is up.
  const ball = MeshBuilder.CreateSphere("lab.routine.target", { diameter: 1, segments: 16 }, scene);
  ball.material = material;
  ball.isPickable = false;
  ball.isVisible = false;
  const shown = readings({ loops: { name: "Loops" }, fist: { name: "Fist", unit: "m/s" } });
  const targets = table(["Target", "Strike", "Did", ""]);

  return {
    keys: new Set(),
    panels: { readout: [shown, targets] },
    timelineLabel: `The last ${HISTORY_SECONDS} seconds, one physics step a notch; dragging pauses. Arrow keys step once it has focus.`,
    start({ actor, address, changed, clock, hears }) {
      const { world } = actor, { built } = actor.body;
      const routine = startRoutine(actor, { targets: address.targets, seed: address.seed, hung: hears });
      const hands = strikeHands(world, actor.body, () => routine.report.strike);
      const history = recordHistory(built, world, HISTORY_SECONDS, (): RoutineMoment => ({
        time: routine.time(), loops: routine.tactics.loops, fist: routine.fistSpeed(),
        closure: hands.snapshot(),
        ball: routine.ball(),
      }));
      const player = createPlayer({ world, recording: history }, changed, clock);
      let shownReadings = -1;
      return {
        player,
        recording: () => ({ frames: history.frames, live: history.live() }),
        drive: () => {},
        readout(frame: number | null): number | null {
          const moment = history.at(frame ?? history.live());
          // Before the first step nothing is recorded: the ball is where it is now.
          const up = moment ? moment.ball : routine.ball();
          ball.isVisible = up !== null;
          if (up) {
            ball.position.set(...up.centre);
            ball.scaling.setAll(2 * up.radius);
          }
          if (!moment) return null;
          shown.write({ loops: String(moment.loops), fist: moment.fist.toFixed(1) });
          if (routine.readings.length !== shownReadings) {
            shownReadings = routine.readings.length;
            targets.write(routine.readings.slice(-ROWS).map(row));
          }
          return moment.time;
        },
        // A hand closes only to strike.
        closure(hand) {
          const moment = history.at(player.shownFrame() ?? history.live());
          return moment?.closure[hand] ?? 0;
        },
        dispose(): void {
          ball.isVisible = false;
          history.dispose();
          hands.dispose();
          routine.dispose();
        },
      };
    },
  };
}
