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
import { loadEngine } from "../core/engine/engines.ts";
import { buildBody, type BuiltBody } from "../core/build/build-body.ts";
import type { BodyModel } from "../core/human/spec.ts";
import { balanceCeiling, balancePercent, rulebook } from "../core/rules/rulebook.ts";
import { createWorld, type World } from "../core/world.ts";
import { publicAssetUrl } from "../asset-url.ts";
import { labActor } from "./actor.ts";
import { labCameraRig } from "./camera.ts";
import type { Control } from "./hud/controls.ts";
import { controlsSection } from "./hud/controls-section.ts";
import { characterSection } from "./hud/character-section.ts";
import { scenarioSection } from "./hud/scenario-section.ts";
import { labSections, SECTIONS, type LabPage, type SectionName } from "./hud/sections.ts";
import { thinkingSection } from "./hud/thinking-section.ts";
import { labTransport } from "./hud/transport.ts";
import { viewSection } from "./hud/view-section.ts";
import { SCENARIO_PANELS, type LabScenario, type LabShell, type ScenarioRun } from "./lab-scenario.ts";
import { allowing, loadoutBalance, loadoutSpec } from "./loadout.ts";
import { createMindLog, logged, type MindLog } from "./mind-log.ts";
import { LAB_MINDS } from "./minds.ts";
import { blowScenario } from "./blow-scenario.ts";
import { routineScenario } from "./routine-scenario.ts";
import { runScenario } from "./run-scenario.ts";
import { labHref, SCENARIOS, type LabAddress, type ScenarioId } from "./scenarios.ts";
import { dressSkeleton, loadSkeletonArt } from "../render/skeleton-skin.ts";
import { dressBody, loadSkin, type SkinView } from "../render/skin.ts";
import { stanceScenario } from "./stance-scenario.ts";
import { drawBody, drawHeld, type BodyShapes } from "../render/body-shapes.ts";
import { need } from "../dom.ts";

/**
 * **The lab**: a core human in one scenario (`scenarios.ts`), the page's shell around it. The
 * scenario -- the Stance (`stance-scenario.ts`), the Routine (`routine-scenario.ts`), the Run
 * (`run-scenario.ts`) or the Blow (`blow-scenario.ts`) -- owns what it does to the body, its panels
 * and its marks; the shell owns the rest. The HUD is sections (`hud/sections.ts`): the shell fills
 * them with its own controls, each section's in its module, then with the scenario's panels.
 *
 * The body is the loadout's (`loadout.ts`): the model, and what each hand holds. Its assist
 * (`actor.ts`) has the ceiling its balance buys (`loadoutBalance`), named by the clock. Its mind (`minds.ts`)
 * makes its tactics of the scenario's script, and throws no strike the address bars; what it decides
 * is logged (`mind-log.ts`), and the Thinking section shows the log up to the time shown. It is drawn in one
 * of two views: World, the workshop model's skin (`skin.ts`), wearing the loadout's clothing, or
 * Tactical, the collision shapes themselves (`src/render/body-shapes.ts`); what a hand holds is drawn as its shapes
 * in both. A Free, an Isometric or a Chase camera follows it (`camera.ts`).
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

const TINT: Readonly<Record<BodyModel, Color3>> = {
  "workshop-fighter": new Color3(0.55, 0.6, 0.66),
  "workshop-rogue": new Color3(0.5, 0.62, 0.55),
  "crypt-skeleton": new Color3(0.72, 0.68, 0.58),
};

/** What a per cent of balance is: the arena's. */
const PERCENT = balancePercent(rulebook("arena"));

const SCENARIO: Readonly<Record<ScenarioId, (scene: Scene, shell: LabShell) => LabScenario>> = {
  stance: stanceScenario,
  routine: routineScenario,
  run: runScenario,
  blow: blowScenario,
};

/**
 * A seek runs the world for up to this long in each page frame, ms, then lets the page draw: with
 * the draw's 6 ms it fits one frame of a 60 Hz display. Set: `docs/reference/lab.md#seek-budget`.
 */
const SEEK_BUDGET_MS = 10;

/** A key pressed in a slider is the slider's: focused, it takes its arrows. */
const forAControl = (event: KeyboardEvent): boolean => event.target instanceof HTMLInputElement;
/** A button or a section's summary that has the focus is pressed by Space. */
const takesItsOwnSpace = (event: KeyboardEvent): boolean => event.target instanceof HTMLElement && event.target.matches("button, summary");

/** Run the scenario `address` names; the screen's markup (`#lab-screen`) is already mounted. */
export async function bootLab(address: LabAddress & { readonly scenario: ScenarioId }): Promise<void> {
  const canvas = need<HTMLCanvasElement>("stage");
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.082, 0.098, 0.11, 1);
  /** The world a body is loaded into; each load makes a new one, at the chosen rate. */
  let world: World | null = null;
  let physicsEngine: Awaited<ReturnType<typeof loadEngine>> | null = null;

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

  const scenario = SCENARIO[address.scenario](scene, { restart: () => load(shown) });
  need("scenario-name").textContent = SCENARIOS.find((s) => s.id === address.scenario)!.name;
  const back = need<HTMLAnchorElement>("to-scenarios");

  interface Loaded {
    readonly built: BuiltBody; readonly view: BodyShapes; readonly held: BodyShapes; skin: SkinView | null; readonly run: ScenarioRun;
    /** The pelvis's rotation as built, facing +z: the chase camera reads the body's facing from it. */
    readonly rest: Quaternion;
    /** Its balance, per cent of its weight, if its assist has one: every figure read under it is read beside it. */
    readonly helped: number | null;
    /** What its mind has decided. */
    readonly log: MindLog;
  }
  let current: Loaded | null = null;
  let shown: LabAddress = address;
  const transport = labTransport(need("transport"), scenario.timelineLabel, () => current?.run ?? null);

  // The HUD: the shell's controls in their sections, then the scenario's panels in theirs.
  const page: LabPage = { get shown() { return shown; }, get spec() { return current?.built.spec ?? loadoutSpec(shown); }, load, show };
  const sections = labSections(document);
  const thinking = thinkingSection();
  const controls: Readonly<Partial<Record<SectionName, readonly Control[]>>> = {
    scenario: scenarioSection(page), view: viewSection(page), character: characterSection(page), controls: controlsSection(page),
    thinking: [thinking],
  };
  for (const name of SECTIONS) sections[name].append(...(controls[name] ?? []).map((control) => control.element));
  for (const panel of SCENARIO_PANELS) sections[panel].append(...(scenario.panels[panel] ?? []).map((control) => control.element));

  /** Draw the body as `shown.view` says; until the skin has loaded, World shows the shapes. */
  function showView(): void {
    if (!current) return;
    const skinned = shown.view === "world" && current.skin !== null;
    for (const mesh of current.view.meshes) mesh.setEnabled(!skinned);
    current.skin?.setEnabled(skinned);
  }

  /** Show the body under way as `to` says, and keep `to` in the address and in the way back to the menu. */
  function show(to: LabAddress): void {
    shown = to;
    history.replaceState(null, "", labHref(to, location.search));
    back.href = labHref({ ...to, scenario: null }, location.search);
    rig.choose(to.camera, to.projection);
    // Clothing is the skin's alone: it changes no body, so nothing is rebuilt.
    current?.skin?.wear(to);
    showView();
    for (const control of Object.values(controls).flat()) control.refresh();
  }

  /** Load `to`'s loadout at `to`'s rate, in a new world, and start the scenario on it. */
  function load(to: LabAddress): void {
    // Until the physics engine has loaded there is no world to make: `to` is what is loaded then.
    if (!physicsEngine) { show(to); return; }
    if (current) {
      current.run.dispose();
      current.skin?.dispose();
      current.view.dispose();
      current.held.dispose();
      current.built.dispose();
    }
    world?.dispose();
    world = createWorld(scene, physicsEngine, { hz: to.hz });
    world.physics.addFixedBox([0, -0.5, 0], [40, 1, 40]);
    const built = buildBody(loadoutSpec(to), world, { position: [0, 0, 0] }), balance = loadoutBalance(to.balance, built.spec);
    const log = createMindLog();
    const actor = labActor(built, world, {
      assist: balanceCeiling(balance, PERCENT), allows: allowing(to.barred), mind: (script) => logged(LAB_MINDS[to.mind].tactics(script), log),
    });
    const rest = built.segments.get("lowerTrunk")!.node.rotationQuaternion!.clone();
    const view = drawBody(built, scene, TINT[to.model]), heldView = drawHeld(built, scene);
    // A new body starts live: nothing of the last one's recording is shown.
    const run = scenario.start({ scene, actor, changed: transport.showPlayhead, clock: () => performance.now() });
    const loaded: Loaded = { built, view, held: heldView, skin: null, run, rest, helped: actor.body.assist.on ? balance : null, log };
    current = loaded;
    show(to);
    const model = to.model;
    const dressed: Promise<(built: BuiltBody) => SkinView> = model === "crypt-skeleton"
      ? loadSkeletonArt().then((art) => (b) => dressSkeleton(b, art, scene))
      : loadSkin(model, scene).then((container) => (b) => dressBody(b, container, scene, shown, (hand) => run.closure(hand)));
    dressed.then((dress) => {
      if (current !== loaded) return;
      loaded.skin = dress(built);
      showView();
    }, (error: unknown) => console.error(`${to.model}: the skin did not load`, error));
  }

  function readout(): void {
    if (!current) return;
    const { run, helped, log } = current, time = run.readout(run.player.shownFrame());
    transport.show(run, time, helped);
    // Before its first step a body's mind has decided nothing.
    thinking.show(log, time ?? -Infinity);
  }

  // The scenario's keys, held: a key held is a level, what is down now, cleared whenever the page
  // may miss a release, since a release is not guaranteed to arrive.
  const held = new Set<string>();
  document.addEventListener("keydown", (event) => {
    if (forAControl(event)) return;
    if (event.code === "Space") {
      if (takesItsOwnSpace(event)) return;
      event.preventDefault();
      transport.togglePause();
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

  // The HUD is filled before the wait for the physics engine, so it never shows empty.
  physicsEngine = await loadEngine();
  load(shown);
  engine.runRenderLoop(() => {
    current?.run.drive(held);
    current?.run.player.tick(engine.getDeltaTime() * transport.speed(), performance.now() + SEEK_BUDGET_MS);
    readout();
    scene.render();
    if (current) {
      const pelvis = current.built.segments.get("lowerTrunk")!.node;
      rig.follow(pelvis.position, pelvis.rotationQuaternion!, current.rest, engine.getDeltaTime() / 1000, engine.getAspectRatio(camera));
    }
  });
  window.addEventListener("resize", () => engine.resize());
  // For the console: a hidden tab does not render, so a check steps the world by hand
  // (`__lab.drive()`, `__lab.world().step(n)`, then `scene.render()`).
  (window as unknown as { __lab: unknown }).__lab = {
    scene, engine, readout, drive: () => current?.run.drive(held), current: () => current, world: () => world, held,
  };
}
