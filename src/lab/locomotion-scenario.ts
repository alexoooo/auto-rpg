import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { takesScript } from "../core/mind/catalog.ts";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { massOf } from "../core/control/support.ts";
import { MOVE } from "../core/mind/config.ts";
import { STOCK_GAITS, type GaitName } from "../core/skills/gaits.ts";
import { recordHistory } from "./history.ts";
import type { LabScenario, LabShell } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";
import { startLocomotion, type LocomotionFrame } from "./locomotion-mode.ts";
import { COMMANDS_AREA, commandsOf } from "./commands.ts";
import { TRACK_IDS, TRACKS, trackOf, type Track } from "./track.ts";
import { gustText, type WindSettings } from "./wind.ts";
import { groundDisc } from "./ground-disc.ts";
import { following, legend, menu, readings, slider, type Control, type Entry } from "../ui/controls.ts";
import { atan2, cos, hypot, sin } from "../core/math/real.ts";

/**
 * **The Locomotion scenario**: the human round a course (`locomotion-mode.ts`) at the pace the lab
 * asks, by default the fastest its walk holds (Max), on the course chosen -- a circle, straight back
 * and forth, the square walked facing one way, forward, right, back and left, the diamond walked
 * facing one way along the diagonals (`track.ts`), or random commands, one destination after
 * another (`commands.ts`) -- with the wind blowing on it as the lab sets it (`wind.ts`). Choosing a
 * course, its gait, its size or the pace starts the run again; the wind changes the run under way.
 * The readout is the run's: whether it is up, its speed against the pace asked, its laps or
 * destinations reached, how far it is off its way and its steps (`gait-meter.ts`). On the ground: the track, or the walk under way
 * to its destination, the centre of mass over it and the point it aims at; at the chest, an arrow
 * along the wind while it blows. The last ten seconds are recorded (`history.ts`).
 */

/** What the history holds of each step: the readout, and where the centre of mass was. */
interface RunMoment {
  readonly frame: LocomotionFrame;
  readonly centre: readonly [number, number];
}
/** Seconds of the run the page keeps to scrub back through. */
const HISTORY_SECONDS = 10;
/** The track's painted width, m. */
const LANE = 0.08;
const MARKS = {
  track: { colour: new Color3(0.85, 0.64, 0.36), name: "track" },
  centre: { colour: new Color3(0.95, 0.75, 0.4), name: "centre of mass" },
  aim: { colour: new Color3(0.35, 0.65, 0.9), name: "aim" },
  wind: { colour: new Color3(0.55, 0.85, 0.95), name: "wind" },
};
/** The wind arrow's length per newton, m, and its height over the ground, m. */
const ARROW_PER_NEWTON = 0.01, ARROW_HEIGHT = 1.35;
/** The pace slider's range, m/s: its notch past the fastest reads Max, the fastest the body's walk holds. */
const PACES = { least: 0.2, most: 4.5, step: 0.1 } as const;
const MAX = PACES.most + PACES.step;
/** The wind unless the sliders say: none. */
const CALM: WindSettings = { rate: 0, strength: 0 };

/** The courses: the tracks, and random commands. */
const COURSE_IDS = [...TRACK_IDS, "random"] as const;
type CourseId = (typeof COURSE_IDS)[number];
const COURSES: Readonly<Record<CourseId, { readonly name: string; readonly size?: { readonly name: string; readonly least: number; readonly most: number; readonly metres: number } }>> = {
  ...TRACKS,
  random: { name: "Random commands", size: { name: "Area", least: 4, most: 30, metres: COMMANDS_AREA } },
};

/**
 * What the body gets about by: Move as the game plays it (`MOVE`), one gait alone, or the
 * locomotion of the mind the page chose.
 */
type Legs = "move" | GaitName | "mind";
const LEGS: readonly Entry<Legs>[] = [
  { value: "move", name: "Move, as the game" },
  ...STOCK_GAITS.map((gait) => ({ value: gait.name, name: gait.label })),
  { value: "mind", name: "As its mind says", title: "The locomotion of the mind under Character" },
];

/** A flat strip along `track` on the ground, for the eye; it collides with nothing. */
function paintTrack(scene: Scene, track: Track, material: StandardMaterial): Mesh {
  const left: Vector3[] = [], right: Vector3[] = [];
  const pieces = Math.ceil(track.length / 0.05);
  for (let i = 0; i <= pieces; i++) {
    // The right of a heading h is (cos h, -sin h).
    const p = track.at(i * track.length / pieces), rx = cos(p.heading) * LANE / 2, rz = -sin(p.heading) * LANE / 2;
    left.push(new Vector3(p.x - rx, 0.004, p.z - rz));
    right.push(new Vector3(p.x + rx, 0.004, p.z + rz));
  }
  const strip = MeshBuilder.CreateRibbon("lab.track", { pathArray: [left, right], sideOrientation: 2 }, scene);
  strip.material = material;
  strip.isPickable = false;
  return strip;
}

export function locomotionScenario(scene: Scene, shell: LabShell): LabScenario {
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
    state: { name: "State" }, speed: { name: "Speed", unit: "m/s" }, mean: { name: "Mean", unit: "m/s" },
    laps: { name: "Laps" }, off: { name: "Off track", unit: "cm" }, steps: { name: "Steps" },
  });
  // The pace asked: none is Max.
  let chosen: CourseId = COURSE_IDS[0], top: number | undefined = undefined, wind = CALM, legs: Legs = "move";
  /** Each course's size, m, where it comes in sizes. */
  const sizes = new Map(COURSE_IDS.flatMap((id) => { const size = COURSES[id].size; return size ? [[id, size.metres] as const] : []; }));
  // The track painted, or on random commands the walk under way, by its command.
  let painted: { readonly id: CourseId; readonly size: number | undefined; readonly track: Track | null; readonly mesh: Mesh } | null = null;
  let leg: { readonly index: number; readonly mesh: Mesh } | null = null;
  // The run the wind's sliders act on: the latest one started.
  let current: { wind: WindSettings } | null = null;
  /** The body's weight, N, for the wind's share of it. */
  let weight = 0;
  const setWind = (settings: WindSettings): void => { wind = settings; if (current) current.wind = settings; };
  /** Nothing, where a track has no size. */
  const unsized: Control = { element: document.createElement("div"), refresh() {} };

  // The chosen course's size, if it comes in sizes: made again when another course is chosen.
  const sized = following(() => chosen, (id) => {
    const size = COURSES[id].size;
    return size ? slider(size.name, size.least, size.most, 0.5, () => sizes.get(id)!, (metres) => { sizes.set(id, metres); shell.restart(); }, (metres) => `${metres} m`) : unsized;
  });

  return {
    keys: new Set(),
    panels: {
      scenario: [
        menu("Course", COURSE_IDS.map((id) => ({ value: id, name: COURSES[id].name })), () => chosen, (id) => { chosen = id; sized.refresh(); shell.restart(); }),
        menu("Gait", LEGS, () => legs, (value) => { legs = value; shell.restart(); }),
        sized,
        slider("Pace", PACES.least, MAX, PACES.step, () => top ?? MAX, (pace) => { top = pace > PACES.most ? undefined : pace; shell.restart(); },
          (pace) => pace > PACES.most ? "Max" : `${pace.toFixed(1)} m/s`),
      ],
      controls: [
        slider("Gusts", 0, 2, 0.1, () => wind.rate, (rate) => setWind({ ...wind, rate }), (rate) => `${rate.toFixed(1)} /s`),
        slider("Gust force", 0, 200, 5, () => wind.strength, (strength) => setWind({ ...wind, strength }), (strength) => gustText(strength, weight)),
      ],
      readout: [shown, legend([MARKS.track, MARKS.centre, MARKS.aim, MARKS.wind])],
    },
    mind: (mind) => legs === "mind" || !takesScript(mind) ? mind : { ...mind, locomotion: legs === "move" ? MOVE : { kind: "move", rules: [], otherwise: legs } },
    timelineLabel: `The last ${HISTORY_SECONDS} seconds, one physics step a notch; dragging pauses. Arrow keys step once it has focus.`,
    start({ actor, changed, clock, address }) {
      const { world } = actor, { built } = actor.body;
      const size = sizes.get(chosen);
      if (painted?.id !== chosen || painted.size !== size) {
        painted?.mesh.dispose();
        leg?.mesh.dispose();
        leg = null;
        if (chosen === "random") painted = null;
        else {
          const info = TRACKS[chosen], track = trackOf(info.size && size !== undefined ? info.size.of(size) : info.pieces);
          painted = { id: chosen, size, track, mesh: paintTrack(scene, track, trackMaterial) };
        }
      }
      weight = massOf([...built.segments.values()]) * -world.physics.gravity[1];
      const course = chosen === "random" ? commandsOf(size ?? COMMANDS_AREA, address.seed) : painted!.track!;
      const run = startLocomotion(actor, course, { top, facing: chosen === "random" ? undefined : TRACKS[chosen].facing, wind: { settings: wind, seed: address.seed } });
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
          const f = moment.frame, g = f.gait, force = hypot(f.wind[0], f.wind[1]);
          shown.write({
            state: f.fallen ? "Fallen: restart" : "On its feet",
            speed: `${f.speed.toFixed(2)} of ${f.pace.toFixed(2)}`, mean: f.mean.toFixed(2),
            laps: `${f.laps}${f.lastLap === null ? "" : `, last ${f.lastLap.toFixed(1)} s`}`,
            off: (100 * f.off).toFixed(0), steps: `${g.step.toFixed(2)} m, ${g.cadence.toFixed(1)} /s`,
          }, f.fallen ? ["state"] : []);
          if (f.leg && leg?.index !== f.leg.index) {
            // The walk under way: a straight from where it set off to its destination.
            leg?.mesh.dispose();
            const [x0, z0] = f.leg.from, [x1, z1] = f.leg.to;
            const way = trackOf([{ kind: "corner", metres: 0, turn: atan2(x1 - x0, z1 - z0) }, { kind: "straight", metres: Math.max(0.01, hypot(x1 - x0, z1 - z0)) }]);
            const mesh = paintTrack(scene, way, trackMaterial);
            mesh.position.x = x0; mesh.position.z = z0;
            leg = { index: f.leg.index, mesh };
          }
          centreMark.position.x = moment.centre[0]; centreMark.position.z = moment.centre[1];
          aimMark.position.x = f.aim[0]; aimMark.position.z = f.aim[1];
          arrow.isVisible = force > 0;
          if (force > 0) {
            // From the chest along the force, whose heading about up is atan2(x, z).
            arrow.position.set(moment.centre[0], ARROW_HEIGHT, moment.centre[1]);
            Quaternion.RotationYawPitchRollToRef(atan2(f.wind[0], f.wind[1]), 0, 0, arrow.rotationQuaternion!);
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
