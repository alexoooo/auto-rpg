import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { massOf } from "../core/control/support.ts";
import { recordHistory } from "./history.ts";
import type { LabScenario, LabShell } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";
import { startRun, type RunFrame } from "./run-mode.ts";
import { TRACK_IDS, TRACKS, trackOf, type Track, type TrackId } from "./track.ts";
import type { WindSettings } from "./wind.ts";
import { groundDisc } from "./ground-disc.ts";
import { choice, following, legend, readings, slider, type Control } from "../ui/controls.ts";

/**
 * **The Run scenario**: the human round a track (`run-mode.ts`) at the pace the lab asks, on the
 * track chosen -- the big circle, straight back and forth, or the square walked facing one way,
 * forward, right, back and left (`track.ts`) -- with the wind blowing on it as the lab sets it
 * (`wind.ts`). Choosing a track, its size or the pace starts the run again; the wind changes the
 * run under way. The readout is the run's: its laps, its speeds, how far it is off the track, what
 * its feet do (`gait-meter.ts`) and the wind. On the ground: the track, the centre of mass over it
 * and the point it aims at; at the chest, an arrow along the wind while it blows. The last ten
 * seconds are recorded (`history.ts`).
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
  wind: { colour: new Color3(0.55, 0.85, 0.95), name: "the wind" },
};
/** The wind arrow's length per newton, m, and its height over the ground, m. */
const ARROW_PER_NEWTON = 0.01, ARROW_HEIGHT = 1.35;
/** The pace the Run asks unless the slider says, m/s: a person's preferred walk (`docs/roadmap.md`). */
const TOP = 1.4;
/** The wind unless the sliders say: none. */
const CALM: WindSettings = { rate: 0, strength: 0 };

/** A flat strip along `track` on the ground, for the eye; it collides with nothing. */
function paintTrack(scene: Scene, track: Track, material: StandardMaterial): Mesh {
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
  const windMaterial = new StandardMaterial("lab.wind", scene);
  windMaterial.diffuseColor = MARKS.wind.colour;
  windMaterial.emissiveColor = MARKS.wind.colour.scale(0.6);
  windMaterial.specularColor = Color3.Black();
  // A box from its origin along +z, scaled to the wind's force.
  const arrow = MeshBuilder.CreateBox("lab.wind", { width: 0.03, height: 0.03, depth: 1 }, scene);
  arrow.bakeTransformIntoVertices(Matrix.Translation(0, 0, 0.5));
  arrow.material = windMaterial;
  arrow.isPickable = false;
  arrow.isVisible = false;
  arrow.rotationQuaternion = new Quaternion();

  const shown = readings({
    state: { name: "State" }, laps: { name: "Laps" }, lap: { name: "Last lap", unit: "s" },
    pace: { name: "Pace asked", unit: "m/s" }, walking: { name: "Pace walked", unit: "m/s" },
    speed: { name: "Speed", unit: "m/s" }, mean: { name: "Mean speed", unit: "m/s" }, pieces: { name: "Each side", unit: "m/s" },
    off: { name: "Off the track", unit: "cm" },
    step: { name: "Step", unit: "m" }, cadence: { name: "Steps a second" }, support: { name: "Both feet / none", unit: "%" },
    wind: { name: "Wind", unit: "N" },
  });
  let chosen: TrackId = TRACK_IDS[0], top = TOP, wind = CALM;
  /** Each track's size, m, where it comes in sizes. */
  const sizes = new Map(TRACK_IDS.flatMap((id) => { const size = TRACKS[id].size; return size ? [[id, size.metres] as const] : []; }));
  let painted: { readonly id: TrackId; readonly size: number | undefined; readonly track: Track; readonly mesh: Mesh } | null = null;
  // The run the wind's sliders act on: the latest one started.
  let current: { wind: WindSettings } | null = null;
  /** The body's weight, N, for the wind's share of it. */
  let weight = 0;
  const setWind = (settings: WindSettings): void => { wind = settings; if (current) current.wind = settings; };
  /** Nothing, where a track has no size. */
  const unsized: Control = { element: document.createElement("div"), refresh() {} };

  // The chosen track's size, if it comes in sizes: made again when another track is chosen.
  const sized = following(() => chosen, (id) => {
    const size = TRACKS[id].size;
    return size ? slider(`${size.name}, m`, size.least, size.most, 0.5, () => sizes.get(id)!, (metres) => { sizes.set(id, metres); shell.restart(); }) : unsized;
  });

  return {
    keys: new Set(),
    panels: {
      scenario: [
        choice("Track", TRACK_IDS.map((id) => ({ value: id, name: TRACKS[id].name })), () => chosen, (id) => { chosen = id; sized.refresh(); shell.restart(); }),
        sized,
        slider("Pace, m/s", 0.2, 8, 0.1, () => top, (pace) => { top = pace; shell.restart(); }, (pace) => pace.toFixed(1)),
      ],
      controls: [
        slider("Gusts a second", 0, 2, 0.1, () => wind.rate, (rate) => setWind({ ...wind, rate }), (rate) => rate.toFixed(1)),
        slider("Gust, N", 0, 200, 5, () => wind.strength, (strength) => setWind({ ...wind, strength }),
          (strength) => weight > 0 ? `${strength} (${Math.round(100 * strength / weight)} % of its weight)` : String(strength)),
      ],
      readout: [shown, legend([MARKS.track, MARKS.centre, MARKS.aim, MARKS.wind])],
    },
    timelineLabel: `The last ${HISTORY_SECONDS} seconds, one physics step a notch; dragging pauses. Arrow keys step once it has focus.`,
    start({ actor, changed, clock, address }) {
      const { world } = actor, { built } = actor.body;
      const info = TRACKS[chosen], size = sizes.get(chosen);
      if (painted?.id !== chosen || painted.size !== size) {
        painted?.mesh.dispose();
        const track = trackOf(info.size && size !== undefined ? info.size.of(size) : info.pieces);
        painted = { id: chosen, size, track, mesh: paintTrack(scene, track, trackMaterial) };
      }
      weight = massOf([...built.segments.values()]) * -world.physics.gravity[1];
      const run = startRun(actor, painted.track, { top, facing: info.facing, wind: { settings: wind, seed: address.seed } });
      current = run;
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
          const f = moment.frame, g = f.gait, force = Math.hypot(f.wind[0], f.wind[1]);
          shown.write({
            state: f.fallen ? "Fallen: restart" : "On its feet",
            laps: `${f.laps} (${f.travelled.toFixed(1)} m)`, lap: f.lastLap === null ? "-" : f.lastLap.toFixed(1),
            pace: f.pace.toFixed(2), walking: f.walking.toFixed(2),
            speed: f.speed.toFixed(2), mean: f.mean.toFixed(2), pieces: f.pieces.map((v) => v === null ? "-" : v.toFixed(2)).join(" / "),
            off: (100 * f.off).toFixed(1),
            step: g.step.toFixed(2), cadence: g.cadence.toFixed(2), support: `${Math.round(100 * g.double)} / ${Math.round(100 * g.flight)}`,
            wind: `${force.toFixed(0)} (${f.gusts} gusts)`,
          }, f.fallen ? ["state"] : []);
          centreMark.position.x = moment.centre[0]; centreMark.position.z = moment.centre[1];
          aimMark.position.x = f.aim[0]; aimMark.position.z = f.aim[1];
          arrow.isVisible = force > 0;
          if (force > 0) {
            // From the chest along the force, whose heading about up is atan2(x, z).
            arrow.position.set(moment.centre[0], ARROW_HEIGHT, moment.centre[1]);
            Quaternion.RotationYawPitchRollToRef(Math.atan2(f.wind[0], f.wind[1]), 0, 0, arrow.rotationQuaternion!);
            arrow.scaling.set(1, 1, force * ARROW_PER_NEWTON);
          }
          return f.time;
        },
        // Running, the hands stay open.
        closure: () => 0,
        dispose(): void {
          if (current === run) current = null;
          arrow.isVisible = false;
          history.dispose();
          run.dispose();
        },
      };
    },
  };
}
