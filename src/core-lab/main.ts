import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { PhysicsActivationControl, PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { Scene } from "@babylonjs/core/scene.js";
import HavokPhysics from "@babylonjs/havok";
// A page entry may carry the `?url` import that Node rejects (H25); nothing Node loads imports this file.
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { buildBody, type BuiltBody } from "../core/build/build-body.ts";
import { PHYSICS_HZ } from "../core/engine/havok.ts";
import type { WorkshopModel } from "../core/human/rig.ts";
import { humanSpec } from "../core/human/spec.ts";
import { createWorld, type World } from "../core/world.ts";
import { publicAssetUrl } from "../asset-url.ts";
import { recordHistory, type History } from "./history.ts";
import { startRoutine, type Routine, type Step } from "./routine.ts";
import { createPlayer, isPaused, type Player, type Playhead } from "./player.ts";
import { dressBody, loadSkin, type SkinView } from "./skin.ts";
import { startStance, type StanceFrame, type StanceSession } from "./stance-mode.ts";
import { recordTimeline, type FrameReading, type Timeline } from "./timeline.ts";
import { drawBody, type BodyView } from "./view.ts";

/**
 * **The core lab**: a core human, chosen here, in one of two modes.
 *
 * - **Stance** (the default): the human on its own feet under the core stance, guard up, walked
 *   from the keyboard -- W A S D or the arrows walk, Q and E turn while walking -- and shoved from
 *   the panel. The readout is the stance's own: its phase, its steps, the centre of mass. On the
 *   ground: the centre of mass over it, the capture point, the place the stance holds the centre
 *   toward, and the heading. The last ten seconds are recorded (`history.ts`).
 * - **Routine** (`?mode=routine`): the lab routine (`routine.ts`) with its pelvis carried -- walk
 *   forward, strike three times, turn, walk back, turn -- to show the muscles; the readout is the
 *   striking fist's speed, read from the hand's body each physics sub-step. Its last loop is
 *   recorded (`timeline.ts`).
 *
 * The body is drawn in one of two views: World, the workshop model's skin (`skin.ts`), or
 * Tactical, the collision shapes themselves (`view.ts`).
 *
 * The world (`src/core/world.ts`) owns the clock, and the render only draws what its steps
 * produced. Loading a body, a mode or a new rate makes a new world.
 *
 * The timeline is the recording, one physics step a notch, and the player (`player.ts`) is the only
 * thing that steps the world. Pausing stops it. Choosing a step behind the live one shows it from
 * the recording, and playing from there replays the recording at the world's pace until it
 * reaches the live step, where the world runs on. Choosing a step ahead -- on the routine's loop,
 * or a nudge past the history's end -- runs the world there as fast as the page allows, and holds
 * it there. The world is never rewound: what follows the live step is always its own.
 */

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.082, 0.098, 0.11, 1);
const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
/** The world a body is loaded into; each load makes a new one, at the chosen rate. */
let world: World | null = null;

const camera = new ArcRotateCamera("lab.camera", -Math.PI / 2 - 0.9, 1.25, 4.8, new Vector3(0, 1, 1.5), scene);
camera.lowerRadiusLimit = 1.5;
camera.upperRadiusLimit = 14;
camera.wheelDeltaPercentage = 0.02;
// The arrows walk the body; the camera orbits by the pointer alone.
camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
camera.attachControl(canvas, true);
new HemisphericLight("lab.sky", new Vector3(0, 1, 0), scene).intensity = 0.75;
const sun = new DirectionalLight("lab.sun", new Vector3(-0.4, -1, 0.3), scene);
sun.intensity = 0.7;
// The skin's materials are PBR, lit by the environment as in the arena; the shapes ignore it.
scene.environmentTexture = new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"), scene, 256, false, true, false, true);
scene.environmentIntensity = 0.85;

// The ground: a static box for the solver (made with each world, in `load`), a plane with a grid
// of metre lines for the eye.
const groundNode = new TransformNode("lab.ground", scene);
groundNode.position = new Vector3(0, -0.5, 0);
groundNode.rotationQuaternion = Quaternion.Identity();
let groundBody: PhysicsBody | null = null;
const floor = MeshBuilder.CreateGround("lab.floor", { width: 40, height: 40 }, scene);
const floorMaterial = new StandardMaterial("lab.floor", scene);
floorMaterial.diffuseColor = new Color3(0.16, 0.18, 0.19);
floorMaterial.specularColor = Color3.Black();
floor.material = floorMaterial;
const lineColour = new Color4(0.3, 0.33, 0.35, 1);
const lines: Vector3[][] = [];
for (let i = -10; i <= 10; i++) {
  lines.push([new Vector3(i, 0.002, -10), new Vector3(i, 0.002, 10)], [new Vector3(-10, 0.002, i), new Vector3(10, 0.002, i)]);
}
MeshBuilder.CreateLineSystem("lab.grid", { lines, colors: lines.map((l) => l.map(() => lineColour)) }, scene);

/** A flat disc on the ground, drawn over the floor at height `y`. */
function groundDisc(name: string, radius: number, colour: Color3, alpha: number, y: number): Mesh {
  const disc = MeshBuilder.CreateDisc(name, { radius, tessellation: 32 }, scene);
  disc.rotation.x = Math.PI / 2;
  disc.position.y = y;
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = colour;
  material.emissiveColor = colour.scale(0.5);
  material.specularColor = Color3.Black();
  material.alpha = alpha;
  disc.material = material;
  return disc;
}
const startMark = groundDisc("lab.start", 0.25, new Color3(0.85, 0.64, 0.36), 0.35, 0.004);
// The stance's marks: the place it holds the centre toward, the centre of mass over the ground,
// the capture point, and a stroke along the heading.
const placeMark = groundDisc("lab.place", 0.07, new Color3(0.35, 0.65, 0.9), 0.55, 0.006);
const centreMark = groundDisc("lab.centre", 0.045, new Color3(0.95, 0.75, 0.4), 0.95, 0.008);
const captureMark = groundDisc("lab.capture", 0.035, new Color3(0.9, 0.3, 0.25), 0.95, 0.01);
const headingMark = MeshBuilder.CreateBox("lab.heading", { width: 0.012, height: 0.002, depth: 0.35 }, scene);
headingMark.material = centreMark.material;
const stanceMarks = [placeMark, centreMark, captureMark, headingMark];
// Drawn after the body, over it: the marks sit under the feet, where the skin would hide them.
for (const mark of stanceMarks) mark.renderingGroupId = 1;

const TINT: Readonly<Record<WorkshopModel, Color3>> = {
  "workshop-fighter": new Color3(0.55, 0.6, 0.66),
  "workshop-rogue": new Color3(0.5, 0.62, 0.55),
};

type ViewKind = "world" | "tactical";
type Mode = "stance" | "routine";

/** What the stance's history holds of each step: the readout, and where the marks were. */
interface StanceMoment {
  readonly frame: StanceFrame;
  readonly centre: readonly [number, number];
  readonly capture: readonly [number, number];
  readonly place: readonly [number, number];
}
/** Seconds of the stance the page keeps to scrub back through. */
const HISTORY_SECONDS = 10;

interface Loaded { readonly built: BuiltBody; readonly view: BodyView; skin: SkinView | null; readonly player: Player }
type Current =
  | Loaded & { readonly mode: "routine"; readonly routine: Routine; readonly timeline: Timeline }
  | Loaded & { readonly mode: "stance"; readonly stance: StanceSession; readonly history: History<StanceMoment> };

let current: Current | null = null;
/**
 * A seek runs the world for up to this long in each page frame, ms, then lets the page draw: with
 * the draw's 6 ms it fits one frame of a 60 Hz display. Longer frames lose more than they gain.
 * Measured on this page in the automation tab (2026-09-29, 120 Hz, a step 0.9 to 1.8 ms), steps a
 * second through a 400-step seek against the budget: 16 ms, 140 to 214; 25 ms, 162; 40 ms, 92,
 * with the page drawing 3 times a second. The browser held back frames that ran long.
 */
const SEEK_BUDGET_MS = 10;
let shownView: ViewKind = "world";
let shownStrikes = -1;
/** The physics and control rate: the game's, or a finer reference. */
let hz = PHYSICS_HZ.value;
let mode: Mode = new URLSearchParams(location.search).get("mode") === "routine" ? "routine" : "stance";

/** What the transport bar steps through: the routine's loop, which wraps, or the stance's history. */
const recording = (c: Current) => c.mode === "routine"
  ? { frames: c.timeline.frames, live: c.timeline.live(), wraps: true }
  : { frames: c.history.frames, live: c.history.live(), wraps: false };

function load(model: WorkshopModel): void {
  if (current) {
    if (current.mode === "routine") { current.timeline.dispose(); current.routine.dispose(); }
    else { current.history.dispose(); current.stance.dispose(); }
    current.skin?.dispose();
    current.view.dispose();
    current.built.dispose();
  }
  groundBody?.dispose();
  world?.dispose();
  scene.disablePhysicsEngine();
  world = createWorld(scene, havok, { hz });
  groundBody = new PhysicsBody(groundNode, PhysicsMotionType.STATIC, false, scene);
  groundBody.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(40, 1, 40), scene);
  const built = buildBody(humanSpec(model), scene, { position: [0, 0, 0] });
  const plugin = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
  // Keep every segment awake: a sleeping body reads a perfect zero (H08).
  for (const segment of built.segments.values()) plugin.setActivationControl(segment.body, PhysicsActivationControl.ALWAYS_ACTIVE);
  const view = drawBody(built, scene, TINT[model]);
  // A new body starts live: nothing of the last one's recording is shown.
  const now = () => performance.now();
  let loaded: Current;
  if (mode === "routine") {
    const routine = startRoutine(built, world), loop = recordTimeline(built, routine, world);
    const player = createPlayer({ world, recording: loop }, showTransport, now);
    loaded = { built, view, skin: null, player, mode, routine, timeline: loop };
  } else {
    const stance = startStance(built, world), capture = new Vector3();
    const history = recordHistory(built, world, HISTORY_SECONDS, (): StanceMoment => {
      const s = stance.body.view.stance;
      stance.capturePointToRef(capture);
      return { frame: stance.frame(), centre: [s.centre.x, s.centre.z], capture: [capture.x, capture.z], place: [s.place.x, s.place.z] };
    });
    const player = createPlayer({ world, recording: history }, showTransport, now);
    loaded = { built, view, skin: null, player, mode, stance, history };
  }
  current = loaded;
  shownStrikes = -1;
  showView();
  showMode();
  loadSkin(model, scene).then((container) => {
    if (current !== loaded) return;
    // A hand closes only to strike; on the stance, the hands stay open.
    loaded.skin = dressBody(built, container, scene, (hand) => {
      if (loaded.mode === "stance") return 0;
      const frame = loaded.player.shownFrame();
      return frame === null ? loaded.routine.closure(hand) : loaded.timeline.at(frame)?.closure[hand] ?? 0;
    });
    showView();
  }, (error: unknown) => console.error(`${model}: the skin did not load`, error));
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-model]")) {
    button.setAttribute("aria-pressed", String(button.dataset.model === model));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-hz]")) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.hz) === hz));
  }
}

/** Show `shownView`; until the skin has loaded, World shows the shapes. */
function showView(): void {
  if (!current) return;
  const world = shownView === "world" && current.skin !== null;
  for (const mesh of current.view.meshes) mesh.setEnabled(!world);
  current.skin?.setEnabled(world);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    button.setAttribute("aria-pressed", String(button.dataset.view === shownView));
  }
}

/** Show the panel, the marks and the notes of `mode`. */
function showMode(): void {
  for (const element of document.querySelectorAll<HTMLElement>("[data-for]")) element.hidden = element.dataset.for !== mode;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  for (const mark of stanceMarks) mark.setEnabled(mode === "stance");
  startMark.setEnabled(mode === "routine");
  timeline.setAttribute("aria-label", mode === "routine"
    ? "The routine's loop, one physics step a notch; dragging pauses. Arrow keys step once it has focus."
    : `The last ${HISTORY_SECONDS} seconds, one physics step a notch; dragging pauses. Arrow keys step once it has focus.`);
}

const shownModel = (): WorkshopModel =>
  (document.querySelector<HTMLButtonElement>("[data-model][aria-pressed=true]")?.dataset.model ?? "workshop-fighter") as WorkshopModel;

const describe = (step: Step): string => {
  switch (step.kind) {
    case "settle": return "Settling";
    case "walk": return "Walking";
    case "turn": return "Turning";
    case "strike": return `Striking: ${step.strike.name}`;
    default: { const never: never = step; return String(never); }
  }
};

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const doing = $("doing"), fist = $("fist"), strikesBody = $("strikes");
const timeline = $("timeline") as HTMLInputElement;
const clock = $("clock"), pauseButton = $("pause") as HTMLButtonElement;
const shown = {
  phase: $("s-phase"), strides: $("s-strides"), recoveries: $("s-recoveries"), speed: $("s-speed"),
  height: $("s-height"), off: $("s-off"), heading: $("s-heading"), state: $("s-state"),
};

/** Show the transport's state: Play while paused, Pause while the world runs or replays. */
function showTransport(playhead: Playhead): void {
  pauseButton.textContent = isPaused(playhead) ? "Play" : "Pause";
  pauseButton.setAttribute("aria-pressed", String(isPaused(playhead)));
}

const togglePause = (): void => current?.player.setPaused(!current.player.isPaused());

const PHASE: Readonly<Record<StanceFrame["phase"], string>> = { stand: "Standing", shift: "Shifting its weight", swing: "Swinging a foot" };

function readout(): void {
  if (!current) return;
  const r = recording(current), shownFrame = current.player.shownFrame(), frame = shownFrame ?? r.live;
  const replay = current.player.playhead.kind === "replaying" ? "replay " : "";
  timeline.max = String(Math.max(0, r.frames - 1));
  if (document.activeElement !== timeline) timeline.value = String(frame);
  if (current.mode === "routine") {
    const { routine } = current;
    const reading: FrameReading | null = shownFrame === null ? null : current.timeline.at(shownFrame);
    doing.textContent = describe(reading?.step ?? routine.state().step);
    fist.textContent = (reading?.fist ?? routine.fistSpeed()).toFixed(1);
    clock.textContent = `${replay}${(reading?.time ?? routine.state().time).toFixed(3)} s`;
    if (routine.strikes.length !== shownStrikes) {
      shownStrikes = routine.strikes.length;
      strikesBody.replaceChildren(...routine.strikes.slice(-6).map((s) => {
        const row = document.createElement("tr");
        row.append(Object.assign(document.createElement("td"), { textContent: s.name }),
          Object.assign(document.createElement("td"), { textContent: s.peak.toFixed(1) }));
        return row;
      }));
    }
    return;
  }
  const moment = current.history.at(frame);
  if (!moment) return;
  const f = moment.frame;
  shown.phase.textContent = PHASE[f.phase];
  shown.strides.textContent = String(f.strides);
  shown.recoveries.textContent = String(f.recoveries);
  shown.speed.textContent = f.speed.toFixed(2);
  shown.height.textContent = `${f.height.toFixed(3)} / ${f.goal.toFixed(3)}`;
  shown.off.textContent = (100 * f.off).toFixed(1);
  shown.heading.textContent = String(Math.round(f.heading * 180 / Math.PI));
  shown.state.textContent = f.fallen ? "Fallen: restart" : "On its feet";
  shown.state.classList.toggle("fallen", f.fallen);
  clock.textContent = `${replay}${f.time.toFixed(3)} s`;
  placeMark.position.x = moment.place[0]; placeMark.position.z = moment.place[1];
  centreMark.position.x = moment.centre[0]; centreMark.position.z = moment.centre[1];
  captureMark.position.x = moment.capture[0]; captureMark.position.z = moment.capture[1];
  headingMark.rotation.y = f.heading;
  headingMark.position.set(moment.centre[0] + 0.175 * Math.sin(f.heading), 0.008, moment.centre[1] + 0.175 * Math.cos(f.heading));
}

// The walk, from the keyboard. A key held is a level (H16): what is down now, cleared whenever
// the page may miss a release.
const held = new Set<string>();
const WALK_KEYS: Readonly<Record<string, readonly [forward: number, right: number]>> = {
  KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0],
  KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1],
};
const TURN_KEYS: Readonly<Record<string, -1 | 1>> = { KeyQ: -1, KeyE: 1 };
let walkSpeed = 0.3;
/** A key pressed in a slider or a list is that control's: a focused slider takes its arrows. */
const forAControl = (event: KeyboardEvent): boolean =>
  event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;

/** Write what the held keys ask into the stance's orders. */
function drive(): void {
  if (current?.mode !== "stance") return;
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
  const orders = current.stance.orders;
  orders.forward = forward * scale;
  orders.right = right * scale;
  orders.turn = Math.sign(turn) as -1 | 0 | 1;
}

document.addEventListener("keydown", (event) => {
  if (forAControl(event)) return;
  if (event.code === "Space") {
    // A focused button takes its own Space.
    if (event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    togglePause();
    return;
  }
  if (event.code in WALK_KEYS || event.code in TURN_KEYS) {
    event.preventDefault();
    held.add(event.code);
  }
});
document.addEventListener("keyup", (event) => { held.delete(event.code); });
window.addEventListener("blur", () => held.clear());
document.addEventListener("visibilitychange", () => held.clear());

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-model]")) {
  button.addEventListener("click", () => { load(button.dataset.model as WorkshopModel); button.blur(); });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
  button.addEventListener("click", () => { shownView = button.dataset.view as ViewKind; showView(); button.blur(); });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-hz]")) {
  button.addEventListener("click", () => { hz = Number(button.dataset.hz); load(shownModel()); button.blur(); });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
  button.addEventListener("click", () => {
    mode = button.dataset.mode as Mode;
    const url = new URL(location.href);
    if (mode === "routine") url.searchParams.set("mode", "routine"); else url.searchParams.delete("mode");
    history.replaceState(null, "", url);
    load(shownModel());
    button.blur();
  });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-speed]")) {
  button.addEventListener("click", () => {
    walkSpeed = Number(button.dataset.speed);
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-speed]")) b.setAttribute("aria-pressed", String(b === button));
    button.blur();
  });
}
const impulse = $("impulse") as HTMLSelectElement;
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-shove]")) {
  button.addEventListener("click", () => {
    if (current?.mode === "stance") {
      current.player.goLive();
      current.stance.shove(Number(impulse.value), Number(button.dataset.shove));
    }
    button.blur();
  });
}
impulse.addEventListener("change", () => impulse.blur());
pauseButton.addEventListener("click", () => { togglePause(); pauseButton.blur(); });
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-nudge]")) {
  button.addEventListener("click", () => {
    if (current) {
      // The routine's loop wraps: back from its first step is its last. The history stops at its
      // start; on from its end is a step of the world.
      const r = recording(current), to = (current.player.shownFrame() ?? r.live) + Number(button.dataset.nudge);
      current.player.seek(r.wraps ? (to + r.frames) % r.frames : Math.max(0, to));
    }
    button.blur();
  });
}
timeline.addEventListener("input", () => current?.player.seek(Number(timeline.value)));
$("restart").addEventListener("click", (event) => {
  load(shownModel());
  (event.currentTarget as HTMLButtonElement).blur();
});

load("workshop-fighter");
const follow = new Vector3();
engine.runRenderLoop(() => {
  drive();
  current?.player.tick(engine.getDeltaTime(), performance.now() + SEEK_BUDGET_MS);
  readout();
  scene.render();
  if (current) {
    // The camera follows the pelvis, softly.
    const pelvis = current.built.segments.get("lowerTrunk")!.node.position;
    follow.set(pelvis.x, 1.0, pelvis.z);
    camera.target = Vector3.Lerp(camera.target, follow, 0.05);
  }
});
window.addEventListener("resize", () => engine.resize());
// For the console: a hidden tab does not render, so a check steps the world by hand
// (`__coreLab.drive()`, `__coreLab.world().step(n)`, then `scene.render()`; H03).
(window as unknown as { __coreLab: unknown }).__coreLab = {
  scene, engine, readout, drive, current: () => current, world: () => world, held,
};
