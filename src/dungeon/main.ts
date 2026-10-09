import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import { Plane } from "@babylonjs/core/Maths/math.plane.js";
import "@babylonjs/core/Culling/ray.js";
import type { PhysicsEngine } from "../core/engine/engine.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { HUMANOID_MODELS, type BodyModel } from "../core/models.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { mindInspector } from "../ui/mind-inspector.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import type { Clothing } from "../render/skin-view.ts";
import { loadSkeletonArt, type SkeletonArt } from "../render/skeleton-skin.ts";
import { drawHeld } from "../render/body-shapes.ts";
import { dresserFor, type Dresser } from "../render/dress.ts";
import { fighterHands } from "../render/strike-hands.ts";
import { debrisCues } from "../audio/cues.ts";
import { GameAudio } from "../audio/game-audio.ts";
import { hearRun, type RunHearing } from "./hearing.ts";
import { EnemyHover } from "./hover.ts";
import { DungeonRun, runMap, runModels, type DungeonActor, type RunStatus } from "./run.ts";
import { orderLabel } from "./commands.ts";
import { cellKey, type Point } from "./map.ts";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward, frameDungeon, pickingCoordinates } from "./camera.ts";
import { DRESSING, dressingPlacements, torchPlacements } from "./dressing.ts";
import { lightDungeon, REFERENCE_LIGHT, type DungeonLighting } from "./lighting.ts";
import { lookProbe } from "./look-probe.ts";
import { frameMeter } from "./frame-meter.ts";
import { dungeonStone, stoneQuery } from "./stone.ts";
import { partyMinds } from "./party-minds.ts";

import { type CryptRoomPlan } from "./crypt-plan.ts";
import { generateCryptDungeon } from "./crypt-dungeon.ts";
import { referenceChamber, REFERENCE_CAMERA, REFERENCE_TORCHES } from "./reference.ts";
import { dressReference, type ReferenceQuality } from "./reference-look.ts";
import { need } from "../dom.ts";
import { showHeroLineup } from "../render/character-preview.ts";

type DungeonScenario = "generated" | "reference" | "random-crypt";

/** The scenario `text` names, as the scene's menu and the address write it. */
function scenarioOf(text: string): DungeonScenario {
  if (text === "generated" || text === "reference" || text === "random-crypt") return text;
  throw new Error(`unknown crypt scenario ${JSON.stringify(text)}`);
}

/** Whether a scenario is drawn with the reference chamber's look, in place of the generated level's. */
function usesReferenceLook(scenario: DungeonScenario): boolean {
  switch (scenario) {
    case "generated": return false;
    case "reference": case "random-crypt": return true;
    default: {
      const never: never = scenario;
      throw new Error(`unknown crypt scenario ${JSON.stringify(never)}`);
    }
  }
}

/** The pause panel's title for a run of `party` bodies. */
function pauseTitle(status: RunStatus, party: number): string {
  switch (status) {
    case "playing": return "Paused";
    case "won": return "You escaped.";
    case "dead": return party > 1 ? "Your party has fallen." : "Your hero has fallen.";
    default: {
      const never: never = status;
      throw new Error(`unknown run status ${JSON.stringify(never)}`);
    }
  }
}

const canvas = need<HTMLCanvasElement>("dungeon"), start = need<HTMLButtonElement>("start");
const heroChoices = need("hero-choices"), seedInput = need<HTMLInputElement>("seed");
const keyboard = need<HTMLInputElement>("keyboard"), facing = need<HTMLInputElement>("facing");
const companionCount = need<HTMLFieldSetElement>("companions"), partyList = need<HTMLOListElement>("party-list");
const choice = (group: HTMLElement): string => group.querySelector<HTMLInputElement>("input:checked")!.value;
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
// `?pitch=` in degrees, to compare the camera's elevation against the concept art's steeper view.
const pitchQuery = Number(new URLSearchParams(location.search).get("pitch"));
/** The address's pitch, held between 25 and 65 degrees, in radians; `otherwise` when the address gives none. */
const pitchOr = (otherwise: number): number =>
  Number.isFinite(pitchQuery) && pitchQuery > 0 ? Math.max(25, Math.min(65, pitchQuery)) * Math.PI / 180 : otherwise;
let pitch = pitchOr(CAMERA_PITCH);
// `?azimuth=` in degrees, any finite value, to compare the camera's bearing: 45 is a diagonal. An absent or
// empty parameter is the default, not 0, which `Number` would make of it.
const azimuthText = new URLSearchParams(location.search).get("azimuth")?.trim();
const azimuthQuery = azimuthText ? Number(azimuthText) : NaN;
let azimuth = Number.isFinite(azimuthQuery) ? (azimuthQuery % 360 + 360) % 360 * Math.PI / 180 : CAMERA_AZIMUTH;
let toward = cameraToward(azimuth);
// `?floor=flat` and `?wall=flat` draw the untextured colours, the control for what the stone's maps cost, and
// `?masonry=0` the flat wall skin, the control for what the blocks cost; `?dressing=0` leaves the clutter out.
const stone = stoneQuery(location.search);
seedInput.value = String(randomSeed());
/** The heroes a person can lead, in the order companions are drawn from: each is a body, and each carries a club. */
const HEROES: readonly { readonly model: BodyModel; readonly label: string }[] = HUMANOID_MODELS.map((model) => ({ model, label: MODEL_DISPLAY[model].label }));
/** The companions for a hero: the next heroes on the list after the hero's own, in turn. */
const companionModels = (hero: BodyModel, count: number): BodyModel[] => {
  const at = Math.max(0, HEROES.findIndex(h => h.model === hero));
  return Array.from({ length: count }, (_, i) => HEROES[(at + 1 + i) % HEROES.length].model);
};
for (const hero of HEROES) {
  const label = document.createElement("label"), input = document.createElement("input"), name = document.createElement("span");
  input.type = "radio"; input.name = "hero"; input.value = hero.model; input.checked = hero.model === "workshop-fighter";
  name.textContent = hero.label;
  label.append(input, name); heroChoices.append(label);
}
const heroLabel = (model: BodyModel) => HEROES.find(h => h.model === model)?.label ?? model;
/** Each hero's mind, as a party member: chosen on the start panel and carried by the address. */
const partyMindPanel = partyMinds(need("party-mind-list"), HEROES.map(h => h.model), location.search);

const scenario = need<HTMLFieldSetElement>("dungeon-scene"), quality = need<HTMLSelectElement>("dungeon-quality");
const requestedScene = new URLSearchParams(location.search).get("scene");
const initialScene = requestedScene === "reference" || requestedScene === "random-crypt" ? requestedScene : "generated";
scenario.querySelector<HTMLInputElement>(`input[value="${initialScene}"]`)!.checked = true;
quality.value = new URLSearchParams(location.search).get("quality") === "reduced" ? "reduced" : "high";
const chooseScenario = () => {
  const reference = usesReferenceLook(scenarioOf(choice(scenario)));
  quality.parentElement!.hidden = !reference;
};
scenario.addEventListener("change", chooseScenario);
chooseScenario();

/** The most real time one frame steps the world through, s: a page that falls behind runs slow rather than in a burst.
 * A numeric setting. */
const CATCH_UP_SECONDS = 0.1;

/** What the party's panel gives the rest of the page. */
interface Party {
  /** Builds one row a member of the run's party. */
  partyRows(): void;
  /** Brings each row up to date with its member. */
  partyStatus(): void;
  /** Selects the member `id` alone, or with those already selected when `add`. */
  selectMember(id: string, add: boolean): void;
}

/** The crypt page: what lasts as long as the page does, what the start panel chose, and the run on show with
 * everything built for it, which the next run replaces. */
interface DungeonPage {
  readonly physicsEngine: PhysicsEngine;
  readonly skeletonArt: Promise<SkeletonArt>;
  readonly engine: Engine;
  readonly audio: GameAudio;
  readonly hover: EnemyHover;
  readonly probe: ReturnType<typeof lookProbe>;
  readonly meter: ReturnType<typeof frameMeter>;
  /** The frame meter's element, where it stands in the HUD, and the fold it goes under with the reference look. */
  readonly meterElement: HTMLElement;
  readonly meterParent: HTMLElement;
  readonly diagnostics: HTMLDetailsElement;
  /** Ends every listener the page added. */
  readonly abort: AbortController;
  readonly signal: AbortSignal;
  /** The party's panel: null until `boot` has wired it, which is before any run is built. */
  party: Party | null;

  /** What the start panel chose for the run. */
  selectedHero: BodyModel;
  /** The party's minds by model (`partyMinds`). */
  minds: Readonly<Partial<Record<BodyModel, MindConfig>>>;
  companions: BodyModel[];
  clothing: Clothing;
  selectedScenario: DungeonScenario;
  selectedQuality: ReferenceQuality;
  /** Whether the scenario is drawn with the reference chamber's look. */
  reference: boolean;

  /** The run on show and what was built for it; each is null between runs. */
  seed: number;
  cryptPlan: CryptRoomPlan | undefined;
  scene: Scene | null;
  run: DungeonRun | null;
  /** What hears the run: its bodies' touches and air, where the party sees. */
  hearing: RunHearing | null;
  camera: FreeCamera | null;
  lighting: DungeonLighting | null;
  referenceLook: Awaited<ReturnType<typeof dressReference>> | null;
  /** The bodies' visual instances and their simulation-step presentation hooks. */
  drawn: { dispose(): void }[];
  /** The torches whose flames are heard. */
  soundTorches: ReturnType<typeof torchPlacements>;
  /** The party's routes as they are drawn, and what they were drawn from. */
  route: LinesMesh | null;
  routeSignature: string;

  paused: boolean;
  /** True while a run is being built: no frame is drawn, and no second build starts. */
  launching: boolean;
  zoom: number;
  /** When the HUD was last refreshed, by `performance.now()`. */
  lastUi: number;
  /** The movement keys held down, by `KeyboardEvent.code`. */
  readonly held: Set<string>;
  /** Where the pointer is over the canvas, for the hover's pick; null when it is not over it. */
  hoverPointer: { clientX: number; clientY: number } | null;
  /** The enemy under the pointer, outlined; null when there is none. */
  hovered: DungeonActor | null;
  /** The body whose mind the HUD's inspector shows, its combatant, and the inspector; null before one is shown. */
  inspected: { readonly actor: DungeonActor; readonly fighter: NonNullable<DungeonActor["fighter"]>; readonly inspector: ReturnType<typeof mindInspector> } | null;
}

/** The page before its first run: the engines, the sound, the look's probe and the frame meter. */
function createPage(physicsEngine: PhysicsEngine, skeletonArt: Promise<SkeletonArt>): DungeonPage {
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 1.5));
  const hover = new EnemyHover(), audio = new GameAudio(true, need("dungeon-sound"));
  const meterElement = need("frame-meter");
  const diagnostics = document.createElement("details"), summary = document.createElement("summary");
  summary.textContent = "Performance";
  diagnostics.append(summary);
  const abort = new AbortController();
  const page: DungeonPage = {
    physicsEngine, skeletonArt, engine, audio, hover,
    probe: lookProbe(engine, () => page.scene && page.lighting ? { scene: page.scene, lighting: page.lighting } : null),
    meter: frameMeter(engine, meterElement),
    meterElement, meterParent: meterElement.parentElement!, diagnostics,
    abort, signal: abort.signal,
    party: null,
    selectedHero: "workshop-fighter", minds: {}, companions: [], clothing: { boots: true, armour: true },
    selectedScenario: "generated", selectedQuality: "high", reference: false,
    seed: 0, cryptPlan: undefined, scene: null, run: null, hearing: null, camera: null, lighting: null, referenceLook: null,
    drawn: [], soundTorches: [], route: null, routeSignature: "",
    paused: false, launching: false, zoom: 10, lastUi: 0, held: new Set(), hoverPointer: null, hovered: null, inspected: null,
  };
  return page;
}

/** Pauses or resumes the run. A run that has ended stays paused, and its panel says how it ended. */
function setPaused(page: DungeonPage, value: boolean): void {
  const { run } = page;
  if (!run || !page.scene) return;
  if (run.status !== "playing") value = true;
  page.paused = value;
  page.audio.setActive(!value && run.status === "playing");
  page.held.clear();
  run.commands.right = run.commands.up = 0;
  run.commands.cancelPointer();
  need("pause-panel").hidden = !value;
  need("pause-title").textContent = pauseTitle(run.status, run.party.length);
  need("pause-copy").textContent = run.status === "playing"
    ? "Your run is frozen. Wheel zoom remains available."
    : `Seed ${page.seed} · ${Math.floor(run.clock)} seconds in the depths.`;
  need("resume").hidden = run.status !== "playing";
  need("pause-button").textContent = value ? "Resume · Esc" : "Pause · Esc";
}

/** Points the camera and the light at the leader. The reference chamber keeps its composed view when the zoom is
 * wide and follows the leader as it closes in; every other level follows the leader. */
function framing(page: DungeonPage): void {
  const { run, camera, lighting, zoom, engine } = page;
  if (!run || !camera || !lighting) return;
  const hero = run.leader.feet();
  const follow = 0.4 + 0.6 * Math.max(0, Math.min(1, (6.5 - zoom) / 3.5));
  // The chamber's middle.
  const centre = { x: 9.5, z: 9 };
  const target = page.reference && !page.cryptPlan
    ? { x: centre.x + (hero.x - centre.x) * follow, z: centre.z + (hero.z - centre.z) * follow }
    : hero;
  frameDungeon(camera, target, zoom, engine.getRenderWidth() / engine.getRenderHeight(), pitch, azimuth);
  lighting.update(hero, zoom, pitch, toward);
  run.level.setHero(hero);
}

function toggleHelp(page: DungeonPage): void {
  const panel = need("help");
  panel.hidden = !panel.hidden;
  need("help-button").setAttribute("aria-expanded", String(!panel.hidden));
  if (!panel.hidden) setPaused(page, true);
}

/** Frees what the page drew for the bodies. */
function undraw(page: DungeonPage): void {
  for (const view of page.drawn) view.dispose();
  page.drawn = [];
}

/** The movement keys held down, as the run's two axes. */
function sampleKeys(page: DungeonPage): void {
  const { run, held } = page;
  if (!run) return;
  run.commands.right = Number(held.has("KeyD") || held.has("ArrowRight")) - Number(held.has("KeyA") || held.has("ArrowLeft"));
  run.commands.up = Number(held.has("KeyW") || held.has("ArrowUp")) - Number(held.has("KeyS") || held.has("ArrowDown"));
}

/** Frees the run on show and all that was built for it: what is drawn over the scene first, then the run, then
 * the scene. */
function teardownRun(page: DungeonPage): void {
  page.hover.dispose();
  page.hoverPointer = null;
  page.hovered = null;
  page.inspected = null;
  need("mind-view").replaceChildren();
  page.referenceLook?.dispose();
  page.referenceLook = null;
  page.lighting?.dispose();
  page.lighting = null;
  undraw(page);
  page.hearing?.dispose();
  page.hearing = null;
  page.run?.dispose();
  page.run = null;
  page.scene?.dispose();
  page.scene = null;
}

/** The view a run of the page's scenario opens with: the address's pitch and bearing where it gives them, and
 * otherwise the reference look's or the generated level's; the zoom; and the engine's hardware scaling. */
function cameraFor(page: DungeonPage): { pitch: number; azimuth: number; zoom: number; scaling: number } {
  const { reference } = page;
  return {
    pitch: pitchOr(reference ? REFERENCE_CAMERA.pitch : CAMERA_PITCH),
    azimuth: Number.isFinite(azimuthQuery) ? azimuthQuery * Math.PI / 180 : reference ? REFERENCE_CAMERA.azimuth : CAMERA_AZIMUTH,
    // A random crypt is followed at the scale of a room, rather than fitted whole.
    zoom: page.cryptPlan ? 8 : reference ? REFERENCE_CAMERA.zoom : 10,
    scaling: reference ? page.selectedQuality === "reduced" ? 1.4 : 1 : 1 / Math.min(devicePixelRatio, 1.5),
  };
}

/** Replaces the run on show with one of `nextSeed`, in the scenario and with the party the start panel chose. */
async function buildRun(page: DungeonPage, nextSeed: number): Promise<void> {
  const { engine, audio, reference } = page;
  audio.reset();
  page.soundTorches = [];
  teardownRun(page);
  page.route = null;
  page.routeSignature = "";
  const seed = page.seed = nextSeed >>> 0;
  const cryptPlan = page.cryptPlan = page.selectedScenario === "random-crypt" ? generateCryptDungeon(seed) : undefined;
  if (reference) {
    page.meterParent.prepend(page.diagnostics);
    page.diagnostics.append(page.meterElement);
  } else {
    page.meterParent.prepend(page.meterElement);
    page.diagnostics.remove();
  }
  const view = cameraFor(page);
  pitch = view.pitch;
  azimuth = view.azimuth;
  toward = cameraToward(azimuth);
  page.zoom = view.zoom;
  engine.setHardwareScalingLevel(view.scaling);

  const scene = page.scene = new Scene(engine);
  /** A page torn down while a part of the run loaded has no scene, or another: the build stops there. */
  const stillShown = () => {
    if (page.scene !== scene) throw new Error("The dungeon was torn down while it was being built.");
  };
  scene.preventDefaultOnPointerDown = scene.preventDefaultOnPointerUp = false;
  const camera = page.camera = new FreeCamera("dungeon camera", new Vector3(0, 20, 0), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = 160;
  const fielded = { seed, layout: cryptPlan?.map ?? (reference ? referenceChamber(seed) : undefined), hero: page.selectedHero, companions: page.companions };
  const layout = runMap(fielded);
  // The skin of each model the run fields, loaded once a scene; a body whose skin did not load is drawn as its shapes.
  const dressers = new Map<BodyModel, Dresser>();
  await Promise.all(runModels(layout, fielded).map((model) =>
    dresserFor(model, scene, { skeletonArt: () => page.skeletonArt }).then((dress) => { dressers.set(model, dress); })));
  stillShown();
  const dress = (actor: DungeonActor) => {
    const fighter = actor.fighter!, hands = fighterHands(fighter), built = fighter.built;
    const skin = dressers.get(actor.model)!(built, { clothing: page.clothing, closure: hands.closure }), club = drawHeld(built, scene);
    page.drawn.push(hands, skin, club);
    actor.meshes.push(...skin.meshes, ...club.meshes);
  };
  const run = page.run = new DungeonRun(scene, {
    seed, engine: page.physicsEngine,
    visuals: { ...dungeonStone(scene, stone.floor, stone.wall), masonry: reference ? false : stone.masonry },
    layout, hero: page.selectedHero, companions: page.companions, minds: page.minds, onBuilt: dress,
    // A blow is a touch, and is heard as one (`hearRun`); this is what it took off, where the party can see.
    onBlow: (blow) => {
      const heard = page.run;
      if (heard?.visible.has(cellKey(heard.map, { x: blow.point[0], z: blow.point[2] }))) for (const cue of debrisCues(blow)) audio.cue(cue);
    },
  });
  page.hearing = hearRun(run, (cue) => audio.cue(cue));
  run.commands.setMode({ keyboard: keyboard.checked, facing: facing.checked });
  run.pitch = pitch;
  run.toward = toward;
  // The look is page code no Node test loads, so the rule that it adds no collider is held here, where it runs.
  const solids = run.level.solids.length;
  const torches = cryptPlan?.torches ?? (reference ? [...REFERENCE_TORCHES] : torchPlacements(run.map, seed));
  page.soundTorches = torches;
  const lighting = page.lighting = lightDungeon(scene, camera, run.map, torches, azimuth, reference ? REFERENCE_LIGHT : undefined);
  run.level.sconces(torches);
  if (!reference && stone.dressing) run.level.dress(dressingPlacements(run.map, seed, DRESSING, toward));
  if (reference) {
    page.referenceLook = await dressReference(scene, run.level, page.selectedQuality, azimuth, cryptPlan);
    stillShown();
    if (page.selectedQuality === "reduced") lighting.setLook({ ssao: false });
  }
  if (run.level.solids.length !== solids) {
    throw new Error(`The dungeon's look added ${run.level.solids.length - solids} colliders; cosmetics carry none.`);
  }
  need("seed-label").textContent = `SEED ${seed}`;
  need("hero-name").textContent = heroLabel(page.selectedHero);
  page.party!.partyRows();
  setPaused(page, false);
  framing(page);
  run.present();
  lighting.refreshFog(run.explored);
  showScreen("playing");
  engine.resize();
  framing(page);
  scene.render();
  canvas.focus();
  Object.assign(window, { __dungeon: {
    get run() { return page.run; }, get scene() { return page.scene; }, get camera() { return page.camera; },
    get lighting() { return page.lighting; }, look: page.probe, engine,
  } });
}

/** Setup and gameplay are separate screens, including the sound controls and keyboard focus. */
function showScreen(screen: "setup" | "playing"): void {
  need("start-panel").hidden = screen !== "setup";
  need("dungeon-play").hidden = screen !== "playing";
}

/** Builds a run of `nextSeed`, one build at a time. A build that fails leaves the start panel, with the reason. */
async function launch(page: DungeonPage, nextSeed: number): Promise<void> {
  if (page.launching) return;
  page.launching = true;
  start.disabled = true;
  start.textContent = "Loading…";
  need("setup-error").hidden = true;
  need("start-panel").inert = true;
  try {
    await buildRun(page, nextSeed);
  } catch (error) {
    page.audio.setActive(false);
    teardownRun(page);
    showScreen("setup");
    need("pause-panel").hidden = true;
    need("help").hidden = true;
    need("setup-error").hidden = false;
    need("setup-error").textContent = `Could not load level: ${String(error)}`;
    console.error(error);
  } finally {
    page.launching = false;
    start.disabled = false;
    start.textContent = "Start";
    need("start-panel").inert = false;
  }
}

/** The control modes, the start panel, the pause panel and the help. */
function wireControls(page: DungeonPage): void {
  const { signal } = page;
  const modeChanged = () => {
    page.held.clear();
    page.run?.commands.setMode({ keyboard: keyboard.checked, facing: facing.checked });
    if (page.run) canvas.focus();
    need("control-help").textContent = keyboard.checked
      ? facing.checked ? "WASD / arrows to move · cursor to face · attacks are automatic" : "WASD / arrows to move · AI faces and attacks"
      : facing.checked ? "Cursor to face · AI explores, moves and attacks" : "Click to attack-move · click an enemy to lock on · drag to force move";
  };
  keyboard.addEventListener("change", modeChanged, { signal });
  facing.addEventListener("change", modeChanged, { signal });
  start.disabled = false;
  start.textContent = "Start";
  start.addEventListener("click", () => {
    if (!/^\d{1,10}$/.test(seedInput.value) || Number(seedInput.value) > 0xffffffff) {
      need<HTMLDetailsElement>("setup-options").open = true;
      seedInput.setCustomValidity("Enter a seed from 0 to 4294967295.");
      seedInput.reportValidity();
      return;
    }
    seedInput.setCustomValidity("");
    page.selectedHero = choice(heroChoices) as BodyModel;
    page.selectedScenario = scenarioOf(choice(scenario));
    page.reference = usesReferenceLook(page.selectedScenario);
    page.selectedQuality = quality.value === "reduced" ? "reduced" : "high";
    page.minds = partyMindPanel.minds();
    // The address keeps the scenario and the party's minds, so that a reload opens the same.
    const url = new URL(location.href);
    partyMindPanel.write(url);
    if (page.reference) {
      url.searchParams.set("scene", page.selectedScenario);
      url.searchParams.set("quality", page.selectedQuality);
    } else {
      url.searchParams.delete("scene");
      url.searchParams.delete("quality");
    }
    history.replaceState(null, "", url);
    page.companions = companionModels(page.selectedHero, Number(choice(companionCount)));
    void launch(page, Number(seedInput.value));
  }, { signal });
  seedInput.addEventListener("input", () => seedInput.setCustomValidity(""), { signal });
  need("pause-button").addEventListener("click", () => setPaused(page, !page.paused), { signal });
  need("resume").addEventListener("click", () => setPaused(page, false), { signal });
  need("retry").addEventListener("click", () => void launch(page, page.seed), { signal });
  need("new-run").addEventListener("click", () => void launch(page, randomSeed()), { signal });
  need("help-button").addEventListener("click", () => toggleHelp(page), { signal });
  need("close-help").addEventListener("click", () => toggleHelp(page), { signal });
}

/** The party's panel: one row a member, built once a run and refreshed with the HUD. A row is a button: a click
 * selects that member alone and Shift adds it, as a click on its body does. */
function wireParty(page: DungeonPage): Party {
  const partyRows = () => {
    if (!page.run) return;
    partyList.replaceChildren(...page.run.party.map((member, i) => {
      const row = document.createElement("li"), button = document.createElement("button");
      button.type = "button";
      button.dataset.member = member.id;
      button.innerHTML = `<kbd>${i + 1}</kbd><span>${member.name.replaceAll("-", " ")} <small></small></span><progress max="1" value="1"></progress>`;
      row.append(button);
      return row;
    }));
  };
  const partyStatus = () => {
    const { run } = page;
    if (!run) return;
    for (const button of partyList.querySelectorAll<HTMLButtonElement>("button[data-member]")) {
      const member = run.party.find((candidate) => candidate.id === button.dataset.member);
      if (!member) continue;
      button.setAttribute("aria-pressed", String(run.selected.has(member.id)));
      button.classList.toggle("fallen", !member.alive);
      button.querySelector("progress")!.value = member.vitality;
      button.querySelector("small")!.textContent = member.alive ? `· ${orderLabel(member.order, member.post, member === run.hero)}` : "· fallen";
    }
  };
  const selectMember = (id: string, add: boolean) => {
    const { run } = page;
    if (!run) return;
    run.select(add ? [...run.selected, id] : [id]);
    partyStatus();
  };
  partyList.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-member]");
    if (!button?.dataset.member) return;
    selectMember(button.dataset.member, event.shiftKey);
    // A focused button takes Space, which pauses here, as a second press.
    button.blur();
    canvas.focus();
  }, { signal: page.signal });
  return { partyRows, partyStatus, selectMember };
}

/** The keyboard: pause and help, the digits that select, the regroup key and the movement keys; and the pause a
 * page takes when it loses the person's attention. */
function wireKeys(page: DungeonPage, party: Party): void {
  const { signal, held } = page;
  window.addEventListener("keydown", (event) => {
    if (!need("start-panel").hidden || page.launching) return;
    if ((event.target as HTMLElement).matches("input, select, textarea")) return;
    if (event.code === "Escape" || event.code === "Space") {
      event.preventDefault();
      if (event.repeat) return;
      if (!need("help").hidden) toggleHelp(page);
      else setPaused(page, !page.paused);
      return;
    }
    if (event.key === "?") {
      if (!event.repeat) toggleHelp(page);
      return;
    }
    const { run } = page;
    if (page.paused || !run) return;
    const digit = /^Digit([0-9])$/.exec(event.code);
    if (digit && !event.repeat) {
      const index = Number(digit[1]);
      if (index === 0) {
        run.select(null);
        party.partyStatus();
      } else if (run.party[index - 1]) party.selectMember(run.party[index - 1].id, event.shiftKey);
      return;
    }
    if (event.code === "KeyF" && !event.repeat) {
      run.regroup();
      party.partyStatus();
      return;
    }
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
      held.add(event.code);
      sampleKeys(page);
    }
  }, { signal });
  window.addEventListener("keyup", (event) => {
    held.delete(event.code);
    sampleKeys(page);
  }, { signal });
  window.addEventListener("blur", () => setPaused(page, true), { signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(page, true); }, { signal });
}

/** Where a pointer at `clientX`, `clientY` is: on the canvas for a pick, on the screen, and on the ground. */
function pointerOn(page: DungeonPage, scene: Scene, camera: FreeCamera, event: { clientX: number; clientY: number }) {
  const { engine } = page;
  const { x, y } = pickingCoordinates(event.clientX, event.clientY, canvas.getBoundingClientRect(),
    engine.getRenderWidth(), engine.getRenderHeight(), engine.getHardwareScalingLevel());
  const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera);
  const t = ray.intersectsPlane(new Plane(0, 1, 0, 0));
  const p = t !== null && t >= 0 ? ray.origin.add(ray.direction.scale(t)) : null;
  return { x, y, screen: { x: event.clientX, z: event.clientY }, ground: p ? { x: p.x, z: p.z } : null };
}

/** The pointer on the canvas: a click selects a member or gives an order, a drag draws a forced route, the wheel
 * zooms; and the window's size. */
function wirePointer(page: DungeonPage, party: Party): void {
  const { signal, hover, engine } = page;
  canvas.addEventListener("pointerdown", (event) => {
    const { run, scene, camera } = page;
    if (page.paused || !run || !scene || !camera || event.button !== 0) return;
    canvas.focus();
    const p = pointerOn(page, scene, camera, event);
    if (!p.ground) return;
    // A click on a party member selects it, and is not an order.
    const friend = scene.pick(p.x, p.y, (mesh) => run.memberAt(mesh) !== null, false, camera);
    const member = friend?.pickedMesh ? run.memberAt(friend.pickedMesh) : null;
    if (member) {
      party.selectMember(member.id, event.shiftKey);
      return;
    }
    const picked = scene.pick(p.x, p.y, (mesh) => run.targetAt(mesh) !== null, false, camera);
    const target = picked?.pickedMesh ? run.targetAt(picked.pickedMesh) : null;
    if (!target && !run.explored.has(cellKey(run.map, p.ground))) return;
    run.commands.down(p.screen, p.ground, target?.id ?? null);
    canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener("pointermove", (event) => {
    page.hoverPointer = { clientX: event.clientX, clientY: event.clientY };
    const { run, scene, camera } = page;
    if (page.paused || !run || !scene || !camera) return;
    const p = pointerOn(page, scene, camera, event);
    if (!(event.buttons & 1)) run.commands.cancelPointer();
    run.commands.move(p.screen, p.ground);
  }, { signal });
  const unhover = () => {
    page.hoverPointer = null;
    page.hovered = null;
    hover.clear();
  };
  canvas.addEventListener("pointerleave", unhover, { signal });
  window.addEventListener("blur", unhover, { signal });
  canvas.addEventListener("pointerup", (event) => {
    if (event.button !== 0 || !page.run) return;
    page.run.commands.upPointer();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener("pointercancel", () => page.run?.commands.cancelPointer(), { signal });
  canvas.addEventListener("lostpointercapture", () => page.run?.commands.cancelPointer(), { signal });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    page.zoom = Math.max(2, Math.min(18, page.zoom * Math.exp(event.deltaY * 0.001)));
  }, { passive: false, signal });
  window.addEventListener("resize", () => engine.resize(), { signal });
}

/** Draws every standing member's route, from its feet: the rest of a drawn route after the point it is on. The
 * lines are made again only when the routes change. */
function drawRoutes(page: DungeonPage): void {
  const { run, scene } = page;
  if (!run || !scene) return;
  const walks = run.party.filter((member) => member.alive).map((member) => {
    const order = member.order;
    return {
      force: order.kind === "force", from: member.feet(),
      points: (order.kind === "force" ? [...member.route, ...order.points.slice(member.next + 1)] : member.route) as Point[],
    };
  }).filter((walk) => walk.points.length);
  const signature = JSON.stringify(walks.map((walk) => [walk.force, walk.points]));
  if (signature === page.routeSignature) return;
  page.route?.dispose();
  page.route = null;
  page.routeSignature = signature;
  if (!walks.length) return;
  const cool = Color3.FromHexString("#70d8e0"), warm = Color3.FromHexString("#dec693");
  const lines = walks.map((walk) => [new Vector3(walk.from.x, 0.06, walk.from.z), ...walk.points.map((p) => new Vector3(p.x, 0.06, p.z))]);
  page.route = MeshBuilder.CreateLineSystem("movement route", {
    lines, colors: walks.map((walk, i) => lines[i].map(() => (walk.force ? cool : warm).toColor4())),
  }, scene);
  page.route.isPickable = false;
}

/** Brings the HUD up to date with the run: what is seen, the hero, the party, the target, the notice and the
 * routes. */
function refreshHud(page: DungeonPage, party: Party): void {
  const { run } = page;
  if (!run) return;
  run.present();
  page.lighting?.refreshFog(run.explored);
  need<HTMLProgressElement>("hero-hp").value = run.hero.vitality;
  need("hp-label").textContent = `${Math.ceil(run.hero.vitality * 100)}% HP`;
  party.partyStatus();
  const target = run.leader.target;
  need("target-panel").hidden = !target || !target.alive;
  if (target) {
    need("target-name").textContent = target.name.replaceAll("-", " ");
    need<HTMLProgressElement>("target-hp").value = target.vitality;
  }
  need("notice").textContent = run.notice;
  drawRoutes(page);
  inspectMind(page, run);
}

/**
 * Shows in the HUD the mind of the enemy under the pointer, else of the enemy the party is locked
 * on, else of the first selected party member, else the hero's (`mindInspector`): who has the
 * body and which part of the mind holds each part of it. An enemy's mind is its model's, shown and
 * never changed; a party member's was chosen on the start panel.
 */
function inspectMind(page: DungeonPage, run: DungeonRun): void {
  const target = run.leader.target?.alive ? run.leader.target : null;
  const actor = page.hovered ?? target ?? run.party.find((member) => run.selected.has(member.id)) ?? run.hero;
  const fighter = actor.fighter;
  if (!fighter) return;
  if (page.inspected?.actor !== actor || page.inspected.fighter !== fighter) {
    const minded = fighter.minded;
    const inspector = mindInspector(fighter.mind, fighter.built.spec, () => actor.fighter === fighter
      ? { body: minded.body, skills: minded.kind === "fighter" ? minded.skills : null } : null);
    page.inspected = { actor, fighter, inspector };
    need("mind-who").textContent = `${actor.name.replaceAll("-", " ")} · ${actor.side === "enemy" ? "enemy" : "party"}`;
    need("mind-view").replaceChildren(inspector.element);
  }
  page.inspected.inspector.refresh();
}

/** Outlines the enemy under the pointer, when the pointer is over the canvas and nothing of the HUD covers it. */
function hoverEnemy(page: DungeonPage, scene: Scene, run: DungeonRun): void {
  const { hover, hoverPointer, camera, engine } = page;
  if (!hoverPointer || !camera || document.elementFromPoint(hoverPointer.clientX, hoverPointer.clientY) !== canvas) {
    page.hovered = null;
    hover.clear();
    return;
  }
  const p = pickingCoordinates(hoverPointer.clientX, hoverPointer.clientY, canvas.getBoundingClientRect(),
    engine.getRenderWidth(), engine.getRenderHeight(), engine.getHardwareScalingLevel());
  const hit = scene.pick(p.x, p.y, (mesh) => mesh.isVisible && run.targetAt(mesh) !== null, false, camera);
  page.hovered = hit?.pickedMesh ? run.targetAt(hit.pickedMesh) : null;
  hover.show(page.hovered);
}

/** One drawn frame: the world and the torches advanced by the real time since the last unless the page is paused,
 * then the camera, the sound, the HUD at most ten times a second, the hover and the picture. */
function frame(page: DungeonPage, party: Party): void {
  const { scene, run, engine, meter, audio } = page;
  if (!scene || !run || page.launching) return;
  const playing = () => run.status === "playing";
  if (!page.paused && playing()) {
    meter.physics(() => run.advance(engine.getDeltaTime() / 1000, Math.ceil(CATCH_UP_SECONDS * run.world.hz)));
    page.hearing?.airs((id, speed, at) => audio.swish(id, speed, at));
    page.lighting?.burn(engine.getDeltaTime() / 1000);
    // The steps may have ended the run.
    if (!playing()) setPaused(page, true);
  }
  framing(page);
  const seen = page.soundTorches.filter((torch) =>
    run.visible.has(cellKey(run.map, { x: torch.cell.x + torch.facing.x, z: torch.cell.z + torch.facing.z })));
  audio.setView(run.leader.feet(), toward, seen.map((torch) => torch.flame));
  audio.update();
  if (performance.now() - page.lastUi > 100) {
    page.lastUi = performance.now();
    refreshHud(page, party);
  }
  hoverEnemy(page, scene, run);
  scene.render();
}

/** Ends the page: its sound, its listeners, its loop, the run on show and the engine. */
function disposePage(page: DungeonPage): void {
  page.audio.dispose();
  page.abort.abort();
  page.engine.stopRenderLoop();
  teardownRun(page);
  page.engine.dispose();
}

async function boot(): Promise<void> {
  const page = createPage(await loadEngine(), loadSkeletonArt());
  const dispose = () => disposePage(page);
  window.addEventListener("pagehide", dispose, { once: true, signal: page.signal });
  import.meta.hot?.dispose(dispose);
  await showHeroLineup(need<HTMLCanvasElement>("hero-preview"), page.physicsEngine, HEROES.map(h => h.model), page.signal);
  if (page.signal.aborted) return;
  wireControls(page);
  const party = page.party = wireParty(page);
  wireKeys(page, party);
  wirePointer(page, party);
  page.engine.runRenderLoop(() => page.meter.frame(() => frame(page, party)));
}

/** Called by `src/app.ts` after the dungeon's screen is mounted: this module's top level reads it. */
export function bootDungeon(): Promise<void> {
  return boot().catch((error) => {
    need("setup-error").hidden = false;
    need("setup-error").textContent = `Could not load characters: ${String(error)}`;
    start.textContent = "Unable to start";
    console.error(error);
  });
}
