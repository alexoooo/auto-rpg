import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { recordHistory } from "./history.ts";
import type { LabScenario, LabShell } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";
import { startRun, type RunFrame } from "./run-mode.ts";
import { TRACK_IDS, TRACKS, trackOf, type Track, type TrackId } from "./track.ts";
import { groundDisc } from "./ground-disc.ts";
import { choice, legend, readings } from "../ui/controls.ts";

/**
 * **The Run scenario**: the human round a track as fast as the lab asks its walk to go
 * (`run-mode.ts`), on the track chosen -- the big circle, or straight back and forth
 * (`track.ts`). Choosing a track starts the run again on it. The readout is the run's: its laps,
 * its speed and how far it is off the track. On the ground: the track, the centre of mass over it
 * and the point it aims at. The last ten seconds are recorded (`history.ts`).
 */

/** What the history holds of each step: the readout, and where the centre of mass was. */
interface RunMoment {
  readonly frame: RunFrame;
  readonly centre: readonly [number, number];
}
/** Seconds of the run the page keeps to scrub back through. */
const HISTORY_SECONDS = 10;
/** The track's painted width, m. */
const LANE = 0.08;
const MARKS = {
  track: { colour: new Color3(0.85, 0.64, 0.36), name: "the track" },
  centre: { colour: new Color3(0.95, 0.75, 0.4), name: "centre of mass" },
  aim: { colour: new Color3(0.35, 0.65, 0.9), name: "the point it aims at" },
};

/** A flat strip along `track` on the ground, for the eye; it collides with nothing. */
export function paintTrack(scene: Scene, track: Track, material: StandardMaterial): Mesh {
  const left: Vector3[] = [], right: Vector3[] = [];
  const pieces = Math.ceil(track.length / 0.05);
  for (let i = 0; i <= pieces; i++) {
    // The right of a heading h is (cos h, -sin h).
    const p = track.at(i * track.length / pieces), rx = Math.cos(p.heading) * LANE / 2, rz = -Math.sin(p.heading) * LANE / 2;
    left.push(new Vector3(p.x - rx, 0.004, p.z - rz));
    right.push(new Vector3(p.x + rx, 0.004, p.z + rz));
  }
  const strip = MeshBuilder.CreateRibbon("lab.track", { pathArray: [left, right], sideOrientation: 2 }, scene);
  strip.material = material;
  strip.isPickable = false;
  return strip;
}

export function runScenario(scene: Scene, shell: LabShell): LabScenario {
  const trackMaterial = new StandardMaterial("lab.track", scene);
  trackMaterial.diffuseColor = MARKS.track.colour;
  trackMaterial.emissiveColor = trackMaterial.diffuseColor.scale(0.4);
  trackMaterial.specularColor = Color3.Black();
  trackMaterial.alpha = 0.55;
  const centreMark = groundDisc(scene, "lab.centre", 0.045, MARKS.centre.colour, 0.95, 0.008);
  const aimMark = groundDisc(scene, "lab.aim", 0.035, MARKS.aim.colour, 0.95, 0.01);
  // Drawn after the body, over it: the marks sit under the feet, where the skin would hide them.
  for (const mark of [centreMark, aimMark]) mark.renderingGroupId = 1;

  const shown = readings({
    state: { name: "State" }, laps: { name: "Laps" }, lap: { name: "Last lap", unit: "s" },
    speed: { name: "Speed", unit: "m/s" }, mean: { name: "Mean speed", unit: "m/s" }, pace: { name: "Pace asked", unit: "m/s" },
    off: { name: "Off the track", unit: "cm" },
  });
  let chosen: TrackId = TRACK_IDS[0];
  let painted: { readonly id: TrackId; readonly track: Track; readonly mesh: Mesh } | null = null;

  return {
    keys: new Set(),
    panels: {
      scenario: [choice("Track", TRACK_IDS.map((id) => ({ value: id, name: TRACKS[id].name })), () => chosen, (id) => { chosen = id; shell.restart(); })],
      readout: [shown, legend([MARKS.track, MARKS.centre, MARKS.aim])],
    },
    timelineLabel: `The last ${HISTORY_SECONDS} seconds, one physics step a notch; dragging pauses. Arrow keys step once it has focus.`,
    start({ actor, changed, clock }) {
      const { world } = actor, { built } = actor.body;
      if (painted?.id !== chosen) {
        painted?.mesh.dispose();
        const track = trackOf(TRACKS[chosen].pieces);
        painted = { id: chosen, track, mesh: paintTrack(scene, track, trackMaterial) };
      }
      const run = startRun(actor, painted.track);
      const history = recordHistory(built, world, HISTORY_SECONDS, (): RunMoment => {
        const c = run.body.view.stance.centre;
        return { frame: run.frame(), centre: [c.x, c.z] };
      });
      const player = createPlayer({ world, recording: history }, changed, clock);
      return {
        player,
        recording: () => ({ frames: history.frames, live: history.live() }),
        drive: () => {},
        readout(frame: number | null): number | null {
          const moment = history.at(frame ?? history.live());
          if (!moment) return null;
          const f = moment.frame;
          shown.write({
            state: f.fallen ? "Fallen: restart" : "On its feet",
            laps: `${f.laps} (${f.travelled.toFixed(1)} m)`, lap: f.lastLap === null ? "-" : f.lastLap.toFixed(1),
            speed: f.speed.toFixed(2), mean: f.mean.toFixed(2), pace: f.pace.toFixed(2), off: (100 * f.off).toFixed(1),
          }, f.fallen ? ["state"] : []);
          centreMark.position.x = moment.centre[0]; centreMark.position.z = moment.centre[1];
          aimMark.position.x = f.aim[0]; aimMark.position.z = f.aim[1];
          return f.time;
        },
        // Running, the hands stay open.
        closure: () => 0,
        dispose(): void {
          history.dispose();
          run.dispose();
        },
      };
    },
  };
}
