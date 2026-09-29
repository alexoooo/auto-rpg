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
import { drawBody, type BodyView } from "./view.ts";

/**
 * **The core lab**: a core human, chosen here, on the lab routine (`routine.ts`): walk forward,
 * strike three times, turn, walk back, turn. It shows stage 2's muscles at work; the readout is
 * the striking fist's speed, read from the hand's body each physics sub-step, at the game's rate
 * or a finer one. The body is drawn in one of two views: World, the workshop model's skin
 * (`skin.ts`), or Tactical, the collision shapes themselves (`view.ts`).
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
let current: { built: BuiltBody; view: BodyView; skin: SkinView | null; routine: Routine } | null = null;
let shownView: ViewKind = "world";
let shownStrikes = -1;
/** The physics and control rate: the game's, or a finer reference. */
let hz = PHYSICS_HZ.value;

function load(model: WorkshopModel): void {
  if (current) {
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
  const loaded = current = { built, view: drawBody(built, scene, TINT[model]), skin: null as SkinView | null, routine: startRoutine(built, scene) };
  shownStrikes = -1;
  showView();
  loadSkin(model, scene).then((container) => {
    if (current !== loaded) return;
    loaded.skin = dressBody(built, container, scene);
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
function readout(): void {
  if (!current) return;
  const { routine } = current;
  doing.textContent = describe(routine.state().step);
  fist.textContent = routine.fistSpeed().toFixed(1);
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
document.getElementById("restart")!.addEventListener("click", (event) => {
  load(shownModel());
  (event.currentTarget as HTMLButtonElement).blur();
});

load("workshop-fighter");
const follow = new Vector3();
engine.runRenderLoop(() => {
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
