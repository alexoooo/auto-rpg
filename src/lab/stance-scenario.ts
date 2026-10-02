import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { recordHistory } from "./history.ts";
import type { LabScenario, ScenarioRun } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";
import { shoveSound } from "./sound-log.ts";
import { startStance, type StanceFrame } from "./stance-mode.ts";
import { groundDisc } from "./ground-disc.ts";
import { actions, choice, keyHints, legend, readings, type Entry } from "./hud/controls.ts";

/**
 * **The Stance scenario**: the human on its own feet under the core stance, guard up, walked from
 * the keyboard -- W A S D or the arrows walk, Q and E turn while walking -- and shoved from its
 * controls. The keys are the body's tactics (`stanceTactics`), so they turn it as the locomotion skill turns
 * any body: once a walk is under way, a second after setting off (`TURN_LEAD`). The readout is the
 * stance's own: its phase, its steps, the centre of mass. On the ground: the centre of mass over
 * it, the capture point, the place the stance holds the centre toward, and the heading. The last
 * ten seconds are recorded (`history.ts`). A shove sounds as a hand on the body (`shoveSound`).
 */

/** What the history holds of each step: the readout, and where the marks were. */
interface StanceMoment {
  readonly frame: StanceFrame;
  readonly centre: readonly [number, number];
  readonly capture: readonly [number, number];
  readonly place: readonly [number, number];
}
/** Seconds of the stance the page keeps to scrub back through. */
const HISTORY_SECONDS = 10;

const WALK_KEYS: Readonly<Record<string, readonly [forward: number, right: number]>> = {
  KeyW: [1, 0], KeyA: [0, -1], KeyS: [-1, 0], KeyD: [0, 1],
  ArrowUp: [1, 0], ArrowLeft: [0, -1], ArrowDown: [-1, 0], ArrowRight: [0, 1],
};
const TURN_KEYS: Readonly<Record<string, -1 | 1>> = { KeyQ: -1, KeyE: 1 };
/** The letters among `codes`, as their keys are marked. */
const letters = (codes: object): string[] => Object.keys(codes).filter((code) => code.startsWith("Key")).map((code) => code.slice(3));

const PHASE: Readonly<Record<StanceFrame["phase"], string>> = { stand: "Standing", shift: "Shifting its weight", swing: "Swinging a foot" };

/** The walking speeds on offer, m/s, and the shove's impulses, N s. */
const SPEEDS = [0.2, 0.3, 0.4, 0.5], IMPULSES = [10, 20, 30, 40, 60];
/** Where a shove pushes the chest, degrees to the right of where it faces. */
const SHOVES: readonly Entry<number>[] = [
  { value: 0, name: "Front", title: "Toward where it faces" }, { value: 180, name: "Back", title: "Toward its back" },
  { value: 270, name: "Left", title: "Toward its left" }, { value: 90, name: "Right", title: "Toward its right" },
];
const MARKS = {
  centre: { colour: new Color3(0.95, 0.75, 0.4), name: "centre of mass" },
  capture: { colour: new Color3(0.9, 0.3, 0.25), name: "capture point" },
  place: { colour: new Color3(0.35, 0.65, 0.9), name: "the place it holds the centre toward" },
};

export function stanceScenario(scene: Scene): LabScenario {
  // The marks: the place the stance holds the centre toward, the centre of mass over the ground,
  // the capture point, and a stroke along the heading.
  const placeMark = groundDisc(scene, "lab.place", 0.07, MARKS.place.colour, 0.55, 0.006);
  const centreMark = groundDisc(scene, "lab.centre", 0.045, MARKS.centre.colour, 0.95, 0.008);
  const captureMark = groundDisc(scene, "lab.capture", 0.035, MARKS.capture.colour, 0.95, 0.01);
  const headingMark = MeshBuilder.CreateBox("lab.heading", { width: 0.012, height: 0.002, depth: 0.35 }, scene);
  headingMark.material = centreMark.material;
  // Drawn after the body, over it: the marks sit under the feet, where the skin would hide them.
  for (const mark of [placeMark, centreMark, captureMark, headingMark]) mark.renderingGroupId = 1;

  const shown = readings({
    phase: { name: "Doing" }, state: { name: "State" }, strides: { name: "Walking steps" }, recoveries: { name: "Catching steps" },
    speed: { name: "Speed", unit: "m/s" }, height: { name: "Height / goal", unit: "m" }, off: { name: "Off its place", unit: "cm" },
    heading: { name: "Heading" },
  });
  let walkSpeed = 0.3, impulse = 30;
  // The run the controls act on: the latest one started.
  let current: (ScenarioRun & { shove(impulse: number, degrees: number): void }) | null = null;

  return {
    keys: new Set([...Object.keys(WALK_KEYS), ...Object.keys(TURN_KEYS)]),
    panels: {
      controls: [
        keyHints([{ keys: letters(WALK_KEYS), does: "or arrows walk" }, { keys: letters(TURN_KEYS), does: "turn once walking" }]),
        choice("Walk, m/s", SPEEDS.map((value) => ({ value, name: String(value) })), () => walkSpeed, (value) => { walkSpeed = value; }),
        choice("Impulse, N s", IMPULSES.map((value) => ({ value, name: String(value) })), () => impulse, (value) => { impulse = value; }),
        actions("Shove", SHOVES, (degrees) => current?.shove(impulse, degrees)),
      ],
      readout: [shown, legend([MARKS.centre, MARKS.capture, MARKS.place])],
    },
    timelineLabel: `The last ${HISTORY_SECONDS} seconds, one physics step a notch; dragging pauses. Arrow keys step once it has focus.`,
    start({ actor, changed, clock, heard }) {
      const { world } = actor, { built } = actor.body;
      const shoved = shoveSound(built);
      const stance = startStance(actor, (segment, impulse, at) => heard(shoved(segment, impulse, at))), capture = new Vector3();
      const history = recordHistory(built, world, HISTORY_SECONDS, (): StanceMoment => {
        const s = stance.body.view.stance;
        stance.capturePointToRef(capture);
        return { frame: stance.frame(), centre: [s.centre.x, s.centre.z], capture: [capture.x, capture.z], place: [s.place.x, s.place.z] };
      });
      const player = createPlayer({ world, recording: history }, changed, clock);
      const run = {
        player,
        recording: () => ({ frames: history.frames, live: history.live() }),
        drive(held: ReadonlySet<string>): void {
          let forward = 0, right = 0, turn = 0;
          for (const code of held) {
            const walk = WALK_KEYS[code];
            if (walk) { forward += walk[0]; right += walk[1]; }
            turn += TURN_KEYS[code] ?? 0;
          }
          forward = Math.sign(forward);
          right = Math.sign(right);
          // A diagonal walks at the chosen speed, not faster.
          const scale = forward || right ? walkSpeed / Math.hypot(forward, right) : 0;
          stance.orders.forward = forward * scale;
          stance.orders.right = right * scale;
          stance.orders.turn = Math.sign(turn) as -1 | 0 | 1;
        },
        readout(frame: number | null): number | null {
          const moment = history.at(frame ?? history.live());
          if (!moment) return null;
          const f = moment.frame;
          shown.write({
            phase: PHASE[f.phase], state: f.fallen ? "Fallen: restart" : "On its feet", strides: String(f.strides),
            recoveries: String(f.recoveries), speed: f.speed.toFixed(2), height: `${f.height.toFixed(3)} / ${f.goal.toFixed(3)}`,
            off: (100 * f.off).toFixed(1), heading: `${Math.round(f.heading * 180 / Math.PI)}°`,
          }, f.fallen ? ["state"] : []);
          placeMark.position.x = moment.place[0]; placeMark.position.z = moment.place[1];
          centreMark.position.x = moment.centre[0]; centreMark.position.z = moment.centre[1];
          captureMark.position.x = moment.capture[0]; captureMark.position.z = moment.capture[1];
          headingMark.rotation.y = f.heading;
          headingMark.position.set(moment.centre[0] + 0.175 * Math.sin(f.heading), 0.008, moment.centre[1] + 0.175 * Math.cos(f.heading));
          return f.time;
        },
        // On the stance, the hands stay open.
        closure: () => 0,
        shove(impulse: number, degrees: number): void {
          player.goLive();
          stance.shove(impulse, degrees);
        },
        dispose(): void {
          if (current === run) current = null;
          history.dispose();
          stance.dispose();
        },
      };
      current = run;
      return run;
    },
  };
}
