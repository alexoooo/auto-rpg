import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import { loadRapier } from "../core/engine/rapier.ts";
import { buildBody, type BuiltBody } from "../core/build/build-body.ts";
import type { WorkshopModel } from "../core/human/rig.ts";
import { humanSpec } from "../core/human/spec.ts";
import { createWorld, type World } from "../core/world.ts";
import { publicAssetUrl } from "../asset-url.ts";
import { labCameraRig } from "./camera.ts";
import type { LabScenario, ScenarioRun } from "./lab-scenario.ts";
import { isPaused, type Playhead } from "./player.ts";
import { routineScenario } from "./routine-scenario.ts";
import { labHref, SCENARIOS, type LabAddress, type LabCamera, type LabProjection, type ScenarioId } from "./scenarios.ts";
import { dressBody, loadSkin, type SkinView } from "./skin.ts";
import { stanceScenario } from "./stance-scenario.ts";
import { drawBody, type BodyView } from "./view.ts";

/**
 * **The lab**: a core human in one scenario (`scenarios.ts`), the page's shell around it. The
 * scenario -- the Stance (`stance-scenario.ts`) or the Routine (`routine-scenario.ts`) -- owns
 * what it does to the body, its panel section and its marks; the shell owns the rest.
 *
 * The body is drawn in one of two views: World, the workshop model's skin (`skin.ts`), or
 * Tactical, the collision shapes themselves (`view.ts`), and followed by a Free, an Isometric or a
 * Chase camera (`camera.ts`).
 *
 * The world (`src/core/world.ts`) owns the clock, and the render only draws what its steps
 * produced. Loading a body or a new rate makes a new world, and starts the scenario on it anew.
 *
 * The scenario's recording is what the transport steps through, one physics step a notch, and the
 * player (`player.ts`) is the only thing that steps the world. Pausing stops it. Choosing a step
 * behind the live one shows it from the recording, and playing from there replays the recording at
 * the world's pace until it reaches the live step, where the world runs on. Choosing a step ahead
 * -- on the routine's loop, or a nudge past the stance's history -- runs the world there as fast as
 * the page allows, and holds it there. The world is never rewound: what follows the live step is
 * always its own.
 */

const TINT: Readonly<Record<WorkshopModel, Color3>> = {
  "workshop-fighter": new Color3(0.55, 0.6, 0.66),
  "workshop-rogue": new Color3(0.5, 0.62, 0.55),
};

const SCENARIO: Readonly<Record<ScenarioId, (scene: Scene) => LabScenario>> = {
  stance: stanceScenario,
  routine: routineScenario,
};

type ViewKind = "world" | "tactical";

/**
 * A seek runs the world for up to this long in each page frame, ms, then lets the page draw: with
 * the draw's 6 ms it fits one frame of a 60 Hz display. Longer frames lose more than they gain.
 * Measured on this page in the automation tab (2026-09-29, 120 Hz, a step 0.9 to 1.8 ms), steps a
 * second through a 400-step seek against the budget: 16 ms, 140 to 214; 25 ms, 162; 40 ms, 92,
 * with the page drawing 3 times a second. The browser held back frames that ran long.
 */
const SEEK_BUDGET_MS = 10;

/** A key pressed in a slider or a list is that control's: a focused slider takes its arrows. */
const forAControl = (event: KeyboardEvent): boolean =>
  event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;

/** Run the scenario `address` names; the screen's markup (`#lab-screen`) is already mounted. */
export async function bootLab(address: LabAddress & { readonly scenario: ScenarioId }): Promise<void> {
  const $ = (id: string): HTMLElement => document.getElementById(id)!;
  const canvas = $("stage") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.082, 0.098, 0.11, 1);
  const rapier = await loadRapier();
  /** The world a body is loaded into; each load makes a new one, at the chosen rate. */
  let world: World | null = null;

  const camera = new ArcRotateCamera("lab.camera", -Math.PI / 2 - 0.9, 1.25, 4.8, new Vector3(0, 1, 1.5), scene);
  camera.lowerRadiusLimit = 1.5;
  camera.upperRadiusLimit = 14;
  camera.wheelDeltaPercentage = 0.02;
  // The arrows walk the body; the camera orbits by the pointer alone.
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  camera.attachControl(canvas, true);
  const rig = labCameraRig(camera);
  new HemisphericLight("lab.sky", new Vector3(0, 1, 0), scene).intensity = 0.75;
  const sun = new DirectionalLight("lab.sun", new Vector3(-0.4, -1, 0.3), scene);
  sun.intensity = 0.7;
  // The skin's materials are PBR, lit by the environment as in the arena; the shapes ignore it.
  scene.environmentTexture = new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"), scene, 256, false, true, false, true);
  scene.environmentIntensity = 0.85;

  // The ground: a fixed box for the solver (made with each world, in `load`), a plane with a grid
  // of metre lines for the eye.
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

  const scenario = SCENARIO[address.scenario](scene);
  const timeline = $("timeline") as HTMLInputElement;
  const clock = $("clock"), pauseButton = $("pause") as HTMLButtonElement;
  const back = $("to-scenarios") as HTMLAnchorElement;
  $("scenario-name").textContent = SCENARIOS.find((s) => s.id === address.scenario)!.name;
  for (const element of document.querySelectorAll<HTMLElement>("[data-for]")) element.hidden = element.dataset.for !== address.scenario;
  timeline.setAttribute("aria-label", scenario.timelineLabel);

  interface Loaded {
    readonly built: BuiltBody; readonly view: BodyView; skin: SkinView | null; readonly run: ScenarioRun;
    /** The pelvis's rotation as built, facing +z: the chase camera reads the body's facing from it. */
    readonly rest: Quaternion;
  }
  let current: Loaded | null = null;
  let shown: LabAddress = address;
  let shownView: ViewKind = "world";

  /** Show the transport's state: Play while paused, Pause while the world runs or replays. */
  function showTransport(playhead: Playhead): void {
    pauseButton.textContent = isPaused(playhead) ? "Play" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(isPaused(playhead)));
  }

  /** Show `shownView`; until the skin has loaded, World shows the shapes. */
  function showView(): void {
    if (!current) return;
    const skinned = shownView === "world" && current.skin !== null;
    for (const mesh of current.view.meshes) mesh.setEnabled(!skinned);
    current.skin?.setEnabled(skinned);
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
      button.setAttribute("aria-pressed", String(button.dataset.view === shownView));
    }
  }

  /** Keep `to` in the address, and in the way back to the menu. */
  function remember(to: LabAddress): void {
    shown = to;
    history.replaceState(null, "", labHref(to, location.search));
    back.href = labHref({ ...to, scenario: null }, location.search);
  }

  /** Follow the body the way `shown` says. */
  function showCamera(): void {
    rig.choose(shown.camera, shown.projection);
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-camera]")) {
      button.setAttribute("aria-pressed", String(button.dataset.camera === shown.camera));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-projection]")) {
      button.setAttribute("aria-pressed", String(button.dataset.projection === shown.projection));
    }
    $("projection").hidden = shown.camera !== "isometric";
  }

  /** Load `to`'s character at `to`'s rate, in a new world, and start the scenario on it. */
  function load(to: LabAddress): void {
    if (current) {
      current.run.dispose();
      current.skin?.dispose();
      current.view.dispose();
      current.built.dispose();
    }
    world?.dispose();
    remember(to);
    world = createWorld(scene, rapier, { hz: to.hz });
    world.physics.addGround([0, -0.5, 0], [40, 1, 40]);
    const built = buildBody(humanSpec(to.model), world, { position: [0, 0, 0] });
    const rest = built.segments.get("lowerTrunk")!.node.rotationQuaternion!.clone();
    const view = drawBody(built, scene, TINT[to.model]);
    // A new body starts live: nothing of the last one's recording is shown.
    const run = scenario.start({ scene, built, world, changed: showTransport, clock: () => performance.now() });
    const loaded: Loaded = { built, view, skin: null, run, rest };
    current = loaded;
    showView();
    loadSkin(to.model, scene).then((container) => {
      if (current !== loaded) return;
      loaded.skin = dressBody(built, container, scene, (hand) => run.closure(hand));
      showView();
    }, (error: unknown) => console.error(`${to.model}: the skin did not load`, error));
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-model]")) {
      button.setAttribute("aria-pressed", String(button.dataset.model === to.model));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-hz]")) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.hz) === to.hz));
    }
  }

  function readout(): void {
    if (!current) return;
    const { run } = current;
    const r = run.recording(), shownFrame = run.player.shownFrame();
    timeline.max = String(Math.max(0, r.frames - 1));
    if (document.activeElement !== timeline) timeline.value = String(shownFrame ?? r.live);
    const time = run.readout(shownFrame);
    const replay = run.player.playhead.kind === "replaying" ? "replay " : "";
    if (time !== null) clock.textContent = `${replay}${time.toFixed(3)} s`;
  }

  const togglePause = (): void => current?.run.player.setPaused(!current.run.player.isPaused());

  // The scenario's keys, held: a key held is a level (H16), what is down now, cleared whenever the
  // page may miss a release.
  const held = new Set<string>();
  document.addEventListener("keydown", (event) => {
    if (forAControl(event)) return;
    if (event.code === "Space") {
      // A focused button takes its own Space.
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      togglePause();
      return;
    }
    if (scenario.keys.has(event.code)) {
      event.preventDefault();
      held.add(event.code);
    }
  });
  document.addEventListener("keyup", (event) => { held.delete(event.code); });
  window.addEventListener("blur", () => held.clear());
  document.addEventListener("visibilitychange", () => held.clear());

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-model]")) {
    button.addEventListener("click", () => { load({ ...shown, model: button.dataset.model as WorkshopModel }); button.blur(); });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    button.addEventListener("click", () => { shownView = button.dataset.view as ViewKind; showView(); button.blur(); });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-hz]")) {
    button.addEventListener("click", () => { load({ ...shown, hz: Number(button.dataset.hz) as LabAddress["hz"] }); button.blur(); });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-camera]")) {
    button.addEventListener("click", () => { remember({ ...shown, camera: button.dataset.camera as LabCamera }); showCamera(); button.blur(); });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-projection]")) {
    button.addEventListener("click", () => {
      remember({ ...shown, projection: button.dataset.projection as LabProjection });
      showCamera();
      button.blur();
    });
  }
  pauseButton.addEventListener("click", () => { togglePause(); pauseButton.blur(); });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-nudge]")) {
    button.addEventListener("click", () => {
      if (current) {
        // The routine's loop wraps: back from its first step is its last. The history stops at its
        // start; on from its end is a step of the world.
        const { player } = current.run, r = current.run.recording();
        const to = (player.shownFrame() ?? r.live) + Number(button.dataset.nudge);
        player.seek(r.wraps ? (to + r.frames) % r.frames : Math.max(0, to));
      }
      button.blur();
    });
  }
  timeline.addEventListener("input", () => current?.run.player.seek(Number(timeline.value)));
  $("restart").addEventListener("click", (event) => {
    load(shown);
    (event.currentTarget as HTMLButtonElement).blur();
  });

  load(address);
  showCamera();
  engine.runRenderLoop(() => {
    current?.run.drive(held);
    current?.run.player.tick(engine.getDeltaTime(), performance.now() + SEEK_BUDGET_MS);
    readout();
    scene.render();
    if (current) {
      const pelvis = current.built.segments.get("lowerTrunk")!.node;
      rig.follow(pelvis.position, pelvis.rotationQuaternion!, current.rest, engine.getDeltaTime() / 1000, engine.getAspectRatio(camera));
    }
  });
  window.addEventListener("resize", () => engine.resize());
  // For the console: a hidden tab does not render, so a check steps the world by hand
  // (`__coreLab.drive()`, `__coreLab.world().step(n)`, then `scene.render()`; H03).
  (window as unknown as { __coreLab: unknown }).__coreLab = {
    scene, engine, readout, drive: () => current?.run.drive(held), current: () => current, world: () => world, held,
  };
}
