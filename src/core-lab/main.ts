import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
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
import { attachHavok, PHYSICS_HZ } from "../core/engine/havok.ts";
import type { WorkshopModel } from "../core/human/rig.ts";
import { humanSpec } from "../core/human/spec.ts";
import { publicAssetUrl } from "../asset-url.ts";
import { startRoutine, type Routine, type Step } from "./routine.ts";
import { dressBody, loadSkin, type SkinView } from "./skin.ts";
import { createPlayer, isPaused, type Player, type Playhead } from "./player.ts";
import { recordTimeline, type FrameReading, type Timeline } from "./timeline.ts";
import { drawBody, type BodyView } from "./view.ts";

/**
 * **The core lab**: a core human, chosen here, on the lab routine (`routine.ts`): walk forward,
 * strike three times, turn, walk back, turn. It shows stage 2's muscles at work; the readout is
 * the striking fist's speed, read from the hand's body each physics sub-step, at the game's rate
 * or a finer one. The body is drawn in one of two views: World, the workshop model's skin
 * (`skin.ts`), or Tactical, the collision shapes themselves (`view.ts`).
 *
 * The timeline is the routine's current loop, one physics step a notch (`timeline.ts`). Behind the
 * live step is the recording; ahead of it is what the world has not done yet. Pausing stops the
 * world. Choosing a step behind the live one shows it from the recording, and playing from there
 * replays the recording at the world's pace until it reaches the live step, where the world runs
 * on. Choosing a step ahead runs the world there as fast as the page allows, and holds it there
 * (`player.ts`). The world is never rewound: what follows the live step is always its own.
 */

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.082, 0.098, 0.11, 1);
attachHavok(scene, await HavokPhysics({ locateFile: () => havokWasmUrl }));

const camera = new ArcRotateCamera("lab.camera", -Math.PI / 2 - 0.9, 1.25, 4.8, new Vector3(0, 1, 1.5), scene);
camera.lowerRadiusLimit = 1.5;
camera.upperRadiusLimit = 14;
camera.wheelDeltaPercentage = 0.02;
camera.attachControl(canvas, true);
new HemisphericLight("lab.sky", new Vector3(0, 1, 0), scene).intensity = 0.75;
const sun = new DirectionalLight("lab.sun", new Vector3(-0.4, -1, 0.3), scene);
sun.intensity = 0.7;
// The skin's materials are PBR, lit by the environment as in the arena; the shapes ignore it.
scene.environmentTexture = new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"), scene, 256, false, true, false, true);
scene.environmentIntensity = 0.85;

// The ground: a static box for the solver, a plane with a grid of metre lines for the eye.
const groundNode = new TransformNode("lab.ground", scene);
groundNode.position = new Vector3(0, -0.5, 0);
groundNode.rotationQuaternion = Quaternion.Identity();
const groundBody = new PhysicsBody(groundNode, PhysicsMotionType.STATIC, false, scene);
groundBody.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(40, 1, 40), scene);
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
const startMark = MeshBuilder.CreateDisc("lab.start", { radius: 0.25, tessellation: 32 }, scene);
startMark.rotation.x = Math.PI / 2;
startMark.position.y = 0.004;
const markMaterial = new StandardMaterial("lab.start", scene);
markMaterial.diffuseColor = new Color3(0.85, 0.64, 0.36);
markMaterial.alpha = 0.35;
startMark.material = markMaterial;

const TINT: Readonly<Record<WorkshopModel, Color3>> = {
  "workshop-fighter": new Color3(0.55, 0.6, 0.66),
  "workshop-rogue": new Color3(0.5, 0.62, 0.55),
};

type ViewKind = "world" | "tactical";
let current: {
  built: BuiltBody; view: BodyView; skin: SkinView | null; routine: Routine; timeline: Timeline; player: Player;
} | null = null;
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

function load(model: WorkshopModel): void {
  if (current) {
    current.timeline.dispose();
    current.routine.dispose();
    current.skin?.dispose();
    current.view.dispose();
    current.built.dispose();
  }
  // The driver reads its step from the engine when it starts, so the rate is set first.
  scene.getPhysicsEngine()!.setSubTimeStep(1000 / hz);
  const built = buildBody(humanSpec(model), scene, { position: [0, 0, 0] });
  const plugin = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
  // Keep every segment awake: a sleeping body reads a perfect zero (H08).
  for (const segment of built.segments.values()) plugin.setActivationControl(segment.body, PhysicsActivationControl.ALWAYS_ACTIVE);
  const routine = startRoutine(built, scene);
  const recording = recordTimeline(built, routine, scene);
  // The scene's own advance, handed a sub-step's time: it takes the fixed sub-steps then due.
  const stepping = scene as unknown as { _advancePhysicsEngineStep(ms: number): void };
  // A new body starts live: nothing of the last one's recording is shown.
  const player = createPlayer({
    timeline: recording,
    run: (running) => { scene.physicsEnabled = running; },
    advance: () => stepping._advancePhysicsEngineStep(recording.seconds * 1000),
  }, showTransport, () => performance.now());
  const loaded = current = { built, view: drawBody(built, scene, TINT[model]), skin: null as SkinView | null, routine,
    timeline: recording, player };
  shownStrikes = -1;
  timeline.max = String(recording.frames - 1);
  showView();
  loadSkin(model, scene).then((container) => {
    if (current !== loaded) return;
    loaded.skin = dressBody(built, container, scene, (hand) => recorded()?.closure[hand] ?? loaded.routine.closure(hand));
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

const doing = document.getElementById("doing")!, fist = document.getElementById("fist")!;
const strikesBody = document.getElementById("strikes")!;
const timeline = document.getElementById("timeline") as HTMLInputElement;
const clock = document.getElementById("clock")!, pauseButton = document.getElementById("pause") as HTMLButtonElement;

/** What was read at the frame shown, while a recorded one is. */
function recorded(): FrameReading | null {
  const frame = current?.player.shownFrame() ?? null;
  return frame === null ? null : current!.timeline.at(frame);
}

/** Show the transport's state: Play while paused, Pause while the world runs or replays. */
function showTransport(playhead: Playhead): void {
  pauseButton.textContent = isPaused(playhead) ? "Play" : "Pause";
  pauseButton.setAttribute("aria-pressed", String(isPaused(playhead)));
}

const togglePause = (): void => current?.player.setPaused(!current.player.isPaused());

function readout(): void {
  if (!current) return;
  const { routine, player } = current;
  const frame = player.shownFrame() ?? current.timeline.live();
  const reading = recorded();
  doing.textContent = describe(reading?.step ?? routine.state().step);
  fist.textContent = (reading?.fist ?? routine.fistSpeed()).toFixed(1);
  if (document.activeElement !== timeline) timeline.value = String(frame);
  clock.textContent = `${player.playhead.kind === "replaying" ? "replay " : ""}${(reading?.time ?? routine.state().time).toFixed(3)} s`;
  if (routine.strikes.length !== shownStrikes) {
    shownStrikes = routine.strikes.length;
    strikesBody.replaceChildren(...routine.strikes.slice(-6).map((s) => {
      const row = document.createElement("tr");
      row.append(Object.assign(document.createElement("td"), { textContent: s.name }),
        Object.assign(document.createElement("td"), { textContent: s.peak.toFixed(1) }));
      return row;
    }));
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-model]")) {
  button.addEventListener("click", () => { load(button.dataset.model as WorkshopModel); button.blur(); });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
  button.addEventListener("click", () => { shownView = button.dataset.view as ViewKind; showView(); button.blur(); });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-hz]")) {
  button.addEventListener("click", () => { hz = Number(button.dataset.hz); load(shownModel()); button.blur(); });
}
pauseButton.addEventListener("click", () => { togglePause(); pauseButton.blur(); });
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-nudge]")) {
  button.addEventListener("click", () => {
    // The loop wraps: back from its first step is its last.
    if (current) {
      const { frames } = current.timeline, from = current.player.shownFrame() ?? current.timeline.live();
      current.player.seek((from + Number(button.dataset.nudge) + frames) % frames);
    }
    button.blur();
  });
}
timeline.addEventListener("input", () => current?.player.seek(Number(timeline.value)));
// Space pauses and plays, unless a control has the key.
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  togglePause();
});
document.getElementById("restart")!.addEventListener("click", (event) => {
  load(shownModel());
  (event.currentTarget as HTMLButtonElement).blur();
});

load("workshop-fighter");
const follow = new Vector3();
engine.runRenderLoop(() => {
  current?.player.tick(engine.getDeltaTime(), performance.now() + SEEK_BUDGET_MS);
  scene.render();
  if (current) {
    // The camera follows the pelvis, softly.
    const pelvis = current.built.segments.get("lowerTrunk")!.node.position;
    follow.set(pelvis.x, 1.0, pelvis.z);
    camera.target = Vector3.Lerp(camera.target, follow, 0.05);
  }
  readout();
});
window.addEventListener("resize", () => engine.resize());
// For the console: a hidden tab does not render, so a check steps the scene by hand (H03).
(window as unknown as { __coreLab: unknown }).__coreLab = { scene, engine, readout, current: () => current };
