import { warmScene } from "../render/ready.ts";
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
import { GameAudio } from "../audio/game-audio.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { buildBody, type BuiltBody } from "../core/build/build-body.ts";
import { poseAngles } from "../core/control/kinematics.ts";
import { guardPosture } from "../core/skills/guard/guard.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import { balanceCeiling, balancePercent, rulebook } from "../core/rules/rulebook.ts";
import { HUMAN_HASTE } from "../core/human/attributes.ts";
import { createWorld, type Hook, type World } from "../core/world.ts";
import { publicAssetUrl } from "../asset-url.ts";
import { labActor } from "./actor.ts";
import { labCameraRig } from "./camera.ts";
import type { Control } from "../ui/controls.ts";
import { controlsSection } from "./hud/controls-section.ts";
import { characterSection } from "./hud/character-section.ts";
import { scenarioSection } from "./hud/scenario-section.ts";
import { labSections, SECTIONS, type LabPage, type SectionName } from "./hud/sections.ts";
import { thinkingSection } from "./hud/thinking-section.ts";
import { labTransport } from "./hud/transport.ts";
import { viewSection } from "./hud/view-section.ts";
import type { LabScenario, LabShell, ScenarioRun } from "./lab-scenario.ts";
import { allowing, loadoutSpec } from "./loadout.ts";
import { resolveCharacter } from "../core/models.ts";
import { createMindLog, logged, watchHas, type MindLog } from "./mind-log.ts";
import { attackScenario } from "./attack-scenario.ts";
import { locomotionScenario } from "./locomotion-scenario.ts";
import { createSoundLog, LAB_BODY, logSounds, type SoundLog } from "./sound-log.ts";
import type { BodySpec } from "../core/spec/body.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { treeData } from "../entrants/game.ts";
import { loadData, type DataKey } from "../core/data/store.ts";
import { labHref, labMind, labStaging, SCENARIOS, type LabAddress, type ScenarioId } from "./scenarios.ts";
import { mindInspector } from "../ui/mind-inspector.ts";
import { dresserFor } from "../render/dress.ts";
import { skinSlot, type SkinSlot } from "../render/skin-slot.ts";
import { appearanceFor, type Appearance } from "../render/appearance.ts";
import { stanceScenario } from "./stance-scenario.ts";
import { groundScenario } from "./ground-scenario.ts";
import { drawBody, drawHeld, type BodyShapes } from "../render/body-shapes.ts";
import { need as find } from "../dom.ts";
import type { ScreenContext } from "../ui/screen.ts";

/** The floor's side, m: a body running 4 m/s along the longest course comes up to its pace and back down on it. */
const FLOOR = 200;

/**
 * **The lab**: a core human in one scenario (`scenarios.ts`), the page's shell around it. The
 * scenario owns what it does to the body, its panels and its marks; the shell owns the rest.
 * The HUD is sections (`hud/sections.ts`): the shell fills them with its own controls, each
 * section's in its module, then with the scenario's panels; Restart and the view's choices sit in
 * the transport's bar.
 *
 * The body is the loadout's (`loadout.ts`): the model, and what each hand holds. Its assist
 * (`actor.ts`) has the ceiling its balance buys (`loadoutBalance`), named by the clock. Its mind (`labMind`, `scenarios.ts`)
 * carries out game orders, the scenario's script or stands, and throws no strike the address bars; what it decides
 * is logged (`mind-log.ts`), and the Thinking section shows the log up to the time shown. It is drawn in one
 * of two views: World, the workshop model's skin (`skin.ts`), wearing the loadout's clothing, or
 * Tactical, the collision shapes themselves (`src/render/body-shapes.ts`); what a hand holds is drawn as its shapes
 * in both. A Free, an Isometric or a Chase camera follows it (`camera.ts`).
 *
 * The body is heard (`sound-log.ts`): its touches, its air, and the scenario's own instruments,
 * logged at the mind's time and played as the time shown passes them, so a replay sounds as the
 * run did, and a pause, a scrub and a seek are silent. The volume control sits at the transport's end.
 *
 * The world (`src/core/world.ts`) owns the clock, and the render only draws what its steps
 * produced. Loading a body or a new rate makes a new world, and starts the scenario on it anew.
 *
 * The scenario's recording is what the transport steps through, one physics step a notch, and the
 * player (`player.ts`) is the only thing that steps the world. Pausing stops it. Choosing a step
 * behind the live one shows it from the recording, and playing from there replays the recording at
 * the world's pace until it reaches the live step, where the world runs on. Choosing a step ahead
 * -- past the recorded history -- runs the world there as fast as
 * the page allows, and holds it there. The world is never rewound: what follows the live step is
 * always its own.
 */

/** What a per cent of balance is: the arena's. */
const PERCENT = balancePercent(rulebook("arena"));

const SCENARIO: Readonly<Record<ScenarioId, (scene: Scene, shell: LabShell) => LabScenario>> = {
  stance: (scene) => stanceScenario(scene),
  attack: attackScenario,
  locomotion: locomotionScenario,
  ground: groundScenario,
};

/**
 * A seek runs the world for up to this long in each page frame, ms, then lets the page draw: with
 * the draw's 6 ms it fits one frame of a 60 Hz display. Set: `docs/reference/lab.md#seek-budget`.
 */
const SEEK_BUDGET_MS = 10;

/** Seconds of the body's air the page keeps: as long as the longest recording a scenario keeps, the Attack scenario's. */
const AIR_SECONDS = 30;

/** A key pressed in a slider is the slider's: focused, it takes its arrows. */
const forAControl = (event: KeyboardEvent): boolean => event.target instanceof HTMLInputElement;
/** A button or a section's summary that has the focus is pressed by Space. */
const takesItsOwnSpace = (event: KeyboardEvent): boolean => event.target instanceof HTMLElement && event.target.matches("button, summary");

/** Run the scenario `address` names; the screen's markup (`#lab-screen`) is already mounted. */
export async function bootLab(address: LabAddress & { readonly scenario: ScenarioId }, context: ScreenContext): Promise<void> {
  const location = context.address;
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const canvas = need<HTMLCanvasElement>("stage");
  const engine = new Engine(canvas, true, { stencil: true });
  context.own(() => engine.dispose());
  const scene = new Scene(engine);
  context.own(() => scene.dispose());
  let disposed = false;
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
  // of metre lines for the eye, wide enough for a run's straight (`FLOOR`).
  const floor = MeshBuilder.CreateGround("lab.floor", { width: FLOOR, height: FLOOR }, scene);
  const floorMaterial = new StandardMaterial("lab.floor", scene);
  floorMaterial.diffuseColor = new Color3(0.16, 0.18, 0.19);
  floorMaterial.specularColor = Color3.Black();
  floor.material = floorMaterial;
  const lineColour = new Color4(0.3, 0.33, 0.35, 1);
  const lines: Vector3[][] = [];
  const half = FLOOR / 2;
  for (let i = -half; i <= half; i++) {
    lines.push([new Vector3(i, 0.002, -half), new Vector3(i, 0.002, half)], [new Vector3(-half, 0.002, i), new Vector3(half, 0.002, i)]);
  }
  MeshBuilder.CreateLineSystem("lab.grid", { lines, colors: lines.map((l) => l.map(() => lineColour)) }, scene);

  const scenario = SCENARIO[address.scenario](scene, { load, restart: () => load(shown) });
  need("scenario-name").textContent = SCENARIOS.find((s) => s.id === address.scenario)!.name;
  const back = need<HTMLAnchorElement>("to-scenarios");

  interface Loaded {
    readonly built: BuiltBody; readonly view: BodyShapes; readonly held: BodyShapes; readonly skin: SkinSlot; appearance: Appearance | null; readonly run: ScenarioRun;
    /** The pelvis's rotation as built, facing +z: the chase camera reads the body's facing from it. */
    readonly rest: Quaternion;
    /** Its balance, per cent of its weight, if its assist has one, and its haste, per cent over a person's, if it is hasted: every figure read under them is read beside them. */
    readonly helped: number | null;
    readonly hasted: number | null;
    /** What its mind has decided, and the watch that notes in it who has the body. */
    readonly log: MindLog;
    readonly has: Hook;
    /** What it sounded of, what logs it, and the time shown that was last heard. */
    readonly sounds: SoundLog;
    readonly logging: { dispose(): void };
    heardTo: number;
  }
  let current: Loaded | null = null;
  let skinReady: Promise<void> = Promise.resolve(), loading = false, firstFrame = true;
  const loadError = document.createElement("p"); loadError.className = "alert"; loadError.hidden = true; loadError.setAttribute("role", "alert");
  need("sections").append(loadError);
  let shown: LabAddress = address;
  const transport = labTransport(need("transport"), scenario.timelineLabel, () => current?.run ?? null);

  // The HUD: the shell's controls in their sections and the transport's bar, then the scenario's
  // panels in theirs, what acts on the run under way beneath what starts it.
  const page: LabPage = { get shown() { return shown; }, get spec() {
    if (current) return current.built.spec;
    try { return loadoutSpec(shown); } catch { return resolveCharacter({ model: shown.model }).spec; }
  }, load, show };
  const sections = labSections(context.root);
  const thinking = thinkingSection();
  const controls: Readonly<Partial<Record<SectionName, readonly Control[]>>> = {
    scenario: scenarioSection(page), character: characterSection(page), thinking: [thinking],
  };
  const restart = controlsSection(page), view = viewSection(page);
  for (const name of SECTIONS) sections[name].append(...(controls[name] ?? []).map((control) => control.element));
  need("transport").prepend(...restart.map((control) => control.element));
  need("transport").append(...view.map((control) => control.element));
  const underWay = Object.assign(document.createElement("div"), { className: "under-way" });
  underWay.append(...(scenario.panels.controls ?? []).map((control) => control.element));
  sections.scenario.append(...(scenario.panels.scenario ?? []).map((control) => control.element), underWay);
  sections.readout.append(...(scenario.panels.readout ?? []).map((control) => control.element));
  const shellControls = [...Object.values(controls).flat(), ...restart, ...view];
  const audio = new GameAudio(false, need("transport"));
  context.own(() => audio.dispose());
  context.own(() => { disposed = true; engine.stopRenderLoop(); unload(); context.remember(labHref(shown, location.search)); });

  /** Draw the body as `shown.view` says; until the skin has loaded, World shows the shapes. */
  function showView(): void {
    if (!current) return;
    const skinned = shown.view === "world" && current.skin.meshes.length > 0;
    for (const mesh of current.view.meshes) mesh.setEnabled(!skinned);
    current.skin?.setEnabled(skinned);
  }

  /** Show the body under way as `to` says, and keep `to` in the address and in the way back to the menu. */
  function show(to: LabAddress): void {
    to = { ...to, appearance: appearanceFor(to.model, to.appearance) };
    shown = to;
    try {
      context.replace(labHref(to, location.search));
      back.href = labHref({ ...to, scenario: null }, location.search);
    } catch { /* Invalid linked attributes stay visible in their editor. */ }
    rig.choose(to.camera, to.projection);
    // Clothing is the skin's alone: it changes no body, so nothing is rebuilt.
    current?.skin.wear(to);
    if (current && current.appearance !== to.appearance) {
      const loaded = current;
      loaded.appearance = to.appearance;
      skinReady = loaded.skin.replace(dresserFor(to.model, scene, { appearance: to.appearance }),
        { clothing: to, closure: hand => loaded.run.closure(hand) });
      void skinReady.catch(error => { if (!disposed) { loadError.hidden = false; loadError.textContent = String(error); } });
    }
    showView();
    for (const control of shellControls) control.refresh();
    for (const control of Object.values(scenario.panels).flat()) control.refresh();
  }

  function unload(): void {
    if (current) {
      current.has.dispose();
      current.logging.dispose();
      current.run.dispose();
      current.skin?.dispose();
      current.view.dispose();
      current.held.dispose();
      current.built.dispose();
    }
    current = null;
    world?.dispose(); world = null;
  }

  /** Load `to`'s loadout at `to`'s rate, in a new world, and start the scenario on it. */
  /** The mind a body of `spec` plays at `to`: the page's choice, as the scenario has it. */
  function mindAt(to: LabAddress, spec: BodySpec): MindConfig {
    const chosen = labMind(to.mind, spec, to.scenario).plays;
    return scenario.mind?.(chosen, to) ?? chosen;
  }

  /** The mind data a load of `to` reads (`loadData`): its mind's; none where `to` does not load, which `loadWorld` reports. */
  function dataAt(to: LabAddress): readonly DataKey[] {
    try { return treeData(mindAt(to, loadoutSpec(to))); }
    catch { return []; }
  }

  function loadWorld(to: LabAddress): void {
    if (disposed) return;
    let spec: ReturnType<typeof loadoutSpec>;
    try { spec = loadoutSpec(to); }
    catch (error) {
      show(to);
      const editor = document.querySelector<HTMLDetailsElement>(".attribute-editor");
      if (editor) editor.open = true;
      console.error(error); return;
    }
    // Until the physics engine has loaded there is no world to make: `to` is what is loaded then.
    if (!physicsEngine) { show(to); return; }
    audio.reset();
    unload();
    world = createWorld(scene, physicsEngine, { hz: to.hz });
    world.physics.addFixedBox([0, -0.5, 0], [FLOOR, 1, FLOOR]);
    // The scenario supplies its initial placement; ordinary starts hold the standing guard.
    let placement: Parameters<typeof buildBody>[2];
    try { placement = scenario.placement?.(spec, to) ?? { position: [0, 0, 0], joints: poseAngles(spec, guardPosture(spec)) }; }
    catch (error) { console.error(error); show(to); return; }
    const built = buildBody(spec, world, placement);
    const balance = built.spec.attributes.balance.value;
    const log = createMindLog();
    const mind = mindAt(to, spec);
    const actor = labActor(built, world, {
      mind,
      subs: scenario.subs?.(to),
      assist: balanceCeiling(balance, PERCENT), allows: allowing(to.barred), around: (tactics) => logged(tactics, log),
    });
    thinking.inspect(mindInspector(mind, spec, () => ({ body: actor.body, skills: actor.skills }), labStaging(to.scenario)));
    const rest = built.segments.get("lowerTrunk")!.node.rotationQuaternion!.clone();
    const view = drawBody(built, scene, Color3.FromHexString(MODEL_DISPLAY[to.model].tint)), heldView = drawHeld(built, scene);
    const sounds = createSoundLog(world.dt, AIR_SECONDS), logging = logSounds(world, actor.body, sounds);
    // A new body starts live: nothing of the last one's recording is shown.
    const run = scenario.start({ scene, actor, address: to, changed: transport.showPlayhead, clock: () => performance.now(), heard: logging.heard, hears: logging.hears });
    const loaded: Loaded = {
      built, view, held: heldView, skin: skinSlot(built, showView), appearance: null, run, rest, helped: actor.body.assist.on ? balance : null,
      hasted: built.spec.attributes.haste.value === HUMAN_HASTE.value ? null : built.spec.attributes.haste.value, log, has: watchHas(world, actor.body, log),
      sounds, logging, heardTo: -Infinity,
    };
    current = loaded;
    show(to);
  }

  async function prepare(to: LabAddress): Promise<void> {
    if (disposed || loading) return;
    loading = true; loadError.hidden = true;
    try {
      await context.loading("Preparing the scenario", async stage => {
        await loadData(dataAt(to));
        context.signal.throwIfAborted();
        loadWorld(to);
        await skinReady;
        context.signal.throwIfAborted();
        await stage("Preparing lighting");
        await warmScene(scene, context.signal);
        firstFrame = true;
      });
    } finally { loading = false; }
  }

  function load(to: LabAddress): void {
    void prepare(to).catch(error => {
      if (disposed) return;
      loadError.hidden = false; loadError.textContent = `Could not load scenario: ${String(error)}`;
    });
  }

  function readout(): void {
    if (!current) return;
    const { run, helped, hasted, log, sounds } = current;
    // Read before the readout, where a scenario may pause its own run: the frame that pauses is still heard.
    const playing = !run.player.isPaused();
    const time = run.readout(run.player.shownFrame());
    transport.show(run, time, helped, hasted);
    // Before its first step a body's mind has decided nothing.
    thinking.show(log, time ?? -Infinity);
    audio.setActive(playing);
    if (time === null) return;
    if (playing) {
      for (const cue of sounds.passed(current.heardTo, time)) audio.cue(cue);
      const air = sounds.airAt(time);
      if (air) audio.swish(LAB_BODY, air.speed, air.at);
    }
    current.heardTo = time;
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
  }, { signal: context.signal });
  document.addEventListener("keyup", (event) => { held.delete(event.code); }, { signal: context.signal });
  window.addEventListener("blur", () => held.clear(), { signal: context.signal });
  document.addEventListener("visibilitychange", () => held.clear(), { signal: context.signal });


  // The HUD is filled before the wait for the physics engine, so it never shows empty.
  physicsEngine = await loadEngine();
  context.signal.throwIfAborted();
  await prepare(shown);
  engine.runRenderLoop(() => {
    if (context.busy) { firstFrame = true; return; }
    const seconds = firstFrame ? 0 : engine.getDeltaTime(); firstFrame = false;
    current?.run.drive(held);
    current?.run.player.tick(seconds * transport.speed(), performance.now() + SEEK_BUDGET_MS);
    readout();
    scene.render();
    if (current) {
      const pelvis = current.built.segments.get("lowerTrunk")!.node;
      rig.follow(pelvis.position, pelvis.rotationQuaternion!, current.rest, engine.getDeltaTime() / 1000, engine.getAspectRatio(camera));
    }
    audio.setView(camera.position, camera.target.subtract(camera.position));
    audio.update();
  });
  window.addEventListener("resize", () => engine.resize(), { signal: context.signal });
  // For the console: a hidden tab does not render, so a check steps the world by hand
  // (`__lab.drive()`, `__lab.world().step(n)`, then `scene.render()`).
  (window as unknown as { __lab: unknown }).__lab = {
    scene, engine, readout, drive: () => current?.run.drive(held), current: () => current, world: () => world, held,
  };
  context.own(() => {
    if ((window as unknown as { __lab?: { engine: Engine } }).__lab?.engine === engine) Reflect.deleteProperty(window, "__lab");
  });
}
