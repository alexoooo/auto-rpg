import { playerControls } from "../ui/player-controls.ts";
import { isRefused, type Refused } from "../../../core/refusal.ts";
import type { SkeletonArt } from "../../../core/bodies/human/skeleton-art.ts";
import { sceneProfile, visualGroup } from "../render/scene-profile.ts";
import { solidGeometry } from "../render/solid-geometry.ts";
import { viewControls } from "../ui/view-controls.ts";
import { cameraControls } from "../ui/camera-controls.ts";
import type { Control } from "../ui/controls.ts";
import { readViewSettings, viewSearch, type ViewSettings } from "../../../game/appearance/view.ts";
import { boundary, cutAway, CUT_AWAY, fogMask, WALL_HEIGHT } from "../../../game/dungeon/fog.ts";
import { isFloor } from "../../../game/dungeon/map.ts";
import type { SolidSense } from "../../../core/bodies/object-senses.ts";
import { warmScene } from "../render/ready.ts";
import { loadArtAssets } from "../render/art-assets.ts";
import { browserTextures } from "../render/surface.ts";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { movementRoutes } from "../render/movement-routes.ts";
import { Plane } from "@babylonjs/core/Maths/math.plane.js";
import "@babylonjs/core/Culling/ray.js";
import { HUMANOID_MODELS, type BodyModel } from "../../../core/bodies/models.ts";
import { defaultMind } from "../../catalog.ts";
import type { MindConfig } from "../../../minds/config.ts";
import { mindInspector } from "../ui/mind-inspector.ts";
import { MODEL_DISPLAY } from "../../../game/appearance/models.ts";
import type { Clothing } from "../render/skin-view.ts";
import { loadSkeletonArt } from "../render/skeleton-skin.ts";
import { drawBody, drawHeld } from "../render/body-shapes.ts";
import { dresserFor, type Dresser } from "../render/dress.ts";
import { handsOf } from "../render/strike-hands.ts";
import { GameAudio } from "../audio/game-audio.ts";
import { EnemyHover } from "./hover.ts";
import { prepareDungeonCharacters, runMap, runModels, runParticipants, type Participant, type RunStatus } from "../../../game/dungeon/run.ts";
import { RunView, type ViewActor } from "./run-view.ts";
import { openWorld } from "../worker/client.ts";
import type { CryptCard } from "../../worker/crypt-stage.ts";
import { runAttributes } from "./run-attributes.ts";
import type { AttributeOverrides } from "../../../core/bodies/character-attributes.ts";
import { cellKey } from "../../../game/dungeon/map.ts";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward } from "../../../game/dungeon/bearing.ts";
import { orbitCamera, cameraSubject, type CameraSubject } from "../render/orbit-camera.ts";
import { VIEW_CAMERA } from "../render/camera-math.ts";
import { pickingCoordinates } from "../render/picking.ts";
import { DRESSING, dressingPlacements, torchPlacements } from "../../../game/dungeon/dressing.ts";
import { lightDungeon, CRYPT_LIGHT, REFERENCE_LIGHT, type DungeonLighting } from "./lighting.ts";
import { lookProbe } from "./look-probe.ts";
import { frameMeter } from "../ui/frame-meter.ts";
import { dungeonStone, stoneQuery } from "./stone.ts";
import { runMinds } from "./run-minds.ts";
import { ENCOUNTER_MODELS } from "../../../game/dungeon/encounters.ts";

import type { CryptRoomPlan } from "../../../game/dungeon/crypt-plan.ts";
import { generateCryptDungeon } from "../../../game/dungeon/crypt-dungeon.ts";
import { referenceChamber, REFERENCE_ZOOM, REFERENCE_TORCHES } from "../../../game/dungeon/reference.ts";
import { dressReference, type ReferenceQuality } from "./reference-look.ts";
import { need as find } from "../dom.ts";
import type { ScreenContext } from "../ui/screen.ts";
import { showHeroLineup } from "../render/character-preview.ts";
import type { Command } from "../../../minds/command/commands.ts";
import type { CommanderConfig, CommanderEntry } from "../../../minds/command/kind.ts";
import { commanderOf } from "../../../minds/command/commander.ts";
import { COMMANDERS } from "../../registration/commanders.ts";

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

/** The pause panel's title for the run's status. */
function pauseTitle(status: RunStatus): string {
  switch (status) {
    case "playing": return "Paused";
    case "won": return "Escaped";
    case "dead": return "Defeat";
    default: {
      const never: never = status;
      throw new Error(`unknown run status ${JSON.stringify(never)}`);
    }
  }
}

/** Mount a dungeon whose DOM and resources belong to this screen's lifetime. */
export async function bootDungeon(context: ScreenContext): Promise<void> {
  const location = context.address;
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const canvas = need<HTMLCanvasElement>("dungeon"), start = need<HTMLButtonElement>("start");
  const heroChoices = need("hero-choices"), seedInput = need<HTMLInputElement>("seed");
  const companionCount = need<HTMLFieldSetElement>("companions"), partyList = need<HTMLOListElement>("party-list");
  const choice = (group: HTMLElement): string => group.querySelector<HTMLInputElement>("input:checked")!.value;
  let view = readViewSettings(location.search, { view: "world", camera: "isometric", projection: "orthographic" });
  let profile: ReturnType<typeof sceneProfile> | null = null;
  let geometry: ReturnType<typeof solidGeometry> | null = null;
  let geometryVersion = "";
  let geometryMaskVersion = "", geometryMask = new Uint8Array(0);
  const bodies: { skin: import("../render/skin-view.ts").SkinView; shapes: ReturnType<typeof drawBody> }[] = [];
  const applyView = () => {
    profile?.setView(view.view);
    for (const { skin, shapes } of bodies) { skin.setEnabled(view.view === "world"); for (const mesh of shapes.meshes) mesh.setEnabled(view.view === "tactical"); }
  };
  const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
  let pitch = CAMERA_PITCH, azimuth = CAMERA_AZIMUTH;
  let toward = cameraToward(azimuth);
  const viewFields: Control[] = [];
  const cameraTarget = new Vector3();
  // `?floor=flat` and `?wall=flat` draw the untextured colours, the control for what the stone's maps cost, and
  // `?masonry=0` the flat wall skin, the control for what the blocks cost; `?dressing=0` leaves the clutter out.
  const stone = stoneQuery(location.search);
  const setupQuery = new URLSearchParams(location.search);
  const linkedSeed = setupQuery.get("seed");
  seedInput.value = linkedSeed !== null && /^\d{1,10}$/.test(linkedSeed) && Number(linkedSeed) <= 4294967295 ? linkedSeed : String(randomSeed());
  /** The heroes a person can lead, in the order companions are drawn from: each is a body, and each carries what its model holds (`ModelInfo.held`). */
  const HEROES: readonly { readonly model: BodyModel; readonly label: string }[] = HUMANOID_MODELS.map((model) => ({ model, label: MODEL_DISPLAY[model].label }));
  /** The companions for a hero: the next heroes on the list after the hero's own, in turn. */
  const companionModels = (hero: BodyModel, count: number): BodyModel[] => {
    const at = Math.max(0, HEROES.findIndex(h => h.model === hero));
    return Array.from({ length: count }, (_, i) => HEROES[(at + 1 + i) % HEROES.length].model);
  };
  for (const hero of HEROES) {
    const label = document.createElement("label"), input = document.createElement("input"), name = document.createElement("span");
    input.type = "radio"; input.name = "hero"; input.value = hero.model; input.checked = hero.model === (setupQuery.get("hero") ?? "workshop-fighter");
    name.textContent = hero.label;
    label.append(input, name); heroChoices.append(label);
  }
  const heroLabel = (model: BodyModel) => HEROES.find(h => h.model === model)?.label ?? model;
  if (!heroChoices.querySelector<HTMLInputElement>("input:checked")) heroChoices.querySelector<HTMLInputElement>("input")!.checked = true;
  const linkedCompanions = (setupQuery.get("companions") ?? "").split(",").filter((value): value is BodyModel => HEROES.some(h => h.model === value)).slice(0, 3);
  companionCount.querySelector<HTMLInputElement>(`input[value="${linkedCompanions.length}"]`)!.checked = true;
  let selectedCompanions = linkedCompanions;
  const attributeHolder = document.createElement("div");
  attributeHolder.id = "party-attributes"; need("party-minds").before(attributeHolder);
  const attributePanel = runAttributes(attributeHolder, location.search);
  const updateAttributeParty = (keepRoster = false) => {
    const hero = choice(heroChoices) as BodyModel;
    if (!keepRoster) selectedCompanions = companionModels(hero, Number(choice(companionCount)));
    attributePanel.update(hero, selectedCompanions);
  };
  updateAttributeParty(true);
  heroChoices.addEventListener("change", () => updateAttributeParty());
  companionCount.addEventListener("change", () => updateAttributeParty());
  /** Each hero's mind as a party member, and each enemy model's: chosen on the start panel and carried by the address. */
  const mindPanel = runMinds(need("party-mind-list"), [...HEROES.map(h => ({ side: "party" as const, model: h.model })),
    ...ENCOUNTER_MODELS.map((model) => ({ side: "enemy" as const, model }))], location.search);

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
  // Each side's Commander, offered from every one that leads that side (`COMMANDERS`, `CommanderEntry.sides`), by kind as the
  // address carries it (`?party=`, `?enemies=`): the first offered unless it names another, and a kind it cannot take is said.
  const partyCommander = need<HTMLSelectElement>("party-commander"), enemyCommander = need<HTMLSelectElement>("enemy-commander");
  const unknownCommanders: string[] = [];
  for (const [select, key, side] of [[partyCommander, "party", "party"], [enemyCommander, "enemies", "enemies"]] as const) {
    select.replaceChildren(...Object.entries(COMMANDERS).filter(([, entry]) => (entry as CommanderEntry).sides.includes(side))
      .map(([kind, entry]) => Object.assign(document.createElement("option"), { value: kind, textContent: entry.label })));
    const kind = setupQuery.get(key);
    if (kind === null) continue;
    if ([...select.options].some((option) => option.value === kind)) select.value = kind;
    else unknownCommanders.push(`No Commander ${JSON.stringify(kind)} leads the ${side}; ${select.selectedOptions[0]?.textContent ?? "none"} does.`);
  }
  if (unknownCommanders.length > 0) Object.assign(need("setup-error"), { hidden: false, textContent: unknownCommanders.join(" ") });
  /** `url` with each side's Commander, and none where it is the default (the picker's first). */
  const writeCommanders = (url: URL) => {
    for (const [select, key] of [[partyCommander, "party"], [enemyCommander, "enemies"]] as const) {
      if (select.selectedIndex === 0) url.searchParams.delete(key);
      else url.searchParams.set(key, select.value);
    }
  };

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
    readonly skeletonArt: Promise<SkeletonArt>;
    readonly engine: Engine;
    readonly audio: GameAudio;
    readonly hover: EnemyHover;
    readonly probe: ReturnType<typeof lookProbe>;
    readonly meter: ReturnType<typeof frameMeter>;
    /** Ends every listener the page added. */
    readonly abort: AbortController;
    readonly signal: AbortSignal;
    /** The party's panel: null until `boot` has wired it, which is before any run is built. */
    party: Party | null;

    /** What the start panel chose for the run. */
    selectedHero: BodyModel;
    /** Each participant's mind (`runMinds`). */
    mind: (participant: Participant) => MindConfig | null;
    attributes: (participant: Participant) => AttributeOverrides;
    companions: BodyModel[];
    clothing: Clothing;
    selectedScenario: DungeonScenario;
    selectedQuality: ReferenceQuality;
    /** Whether the scenario is drawn with the reference chamber's look. */
    reference: boolean;
    /** Each side's Commander (`DungeonRunOptions.party`, `enemies`). */
    commanders: { party: CommanderConfig; enemies: CommanderConfig };

    /** The run on show and what was built for it; each is null between runs. */
    seed: number;
    cryptPlan: CryptRoomPlan | undefined;
    scene: Scene | null;
    /** The run, its world in a worker (`RunView`). */
    run: RunView | null;
    camera: FreeCamera | null;
    rig: ReturnType<typeof orbitCamera> | null;
    /** The body poses available to the common Chase camera. */
    subjects: Map<ViewActor, CameraSubject>;
    lighting: DungeonLighting | null;
    referenceLook: Awaited<ReturnType<typeof dressReference>> | null;
    /** The bodies' visual instances and their simulation-step presentation hooks. */
    drawn: { dispose(): void }[];
    /** The torches whose flames are heard. */
    soundTorches: ReturnType<typeof torchPlacements>;
    /** The party's current navigation paths. */
    routes: ReturnType<typeof movementRoutes> | null;

    paused: boolean;
    /** True while a run is being built: no frame is drawn, and no second build starts. */
    launching: boolean;
    freshFrame: boolean;
    /** When the HUD was last refreshed, by `performance.now()`. */
    lastUi: number;
    controls: ReturnType<typeof playerControls<Command>> | null;
    /** Where the pointer is over the canvas, for the hover's pick; null when it is not over it. */
    hoverPointer: { clientX: number; clientY: number } | null;
    /** The enemy under the pointer, outlined; null when there is none. */
    hovered: ViewActor | null;
    /** The body whose mind the HUD's inspector shows, and the inspector; null before one is shown. */
    inspected: { readonly actor: ViewActor; readonly inspector: ReturnType<typeof mindInspector> } | null;
  }

  /** The page before its first run: the engines, the sound, the look's probe and the frame meter. */
  function createPage(skeletonArt: Promise<SkeletonArt>): DungeonPage {
    const engine = new Engine(canvas, true, { stencil: true, antialias: true });
    engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 1.5));
    const hover = new EnemyHover(), audio = new GameAudio({ dungeon: true, mount: need("dungeon-sound") });
    const meter = frameMeter(engine, context.signal);
    const panel = need("dungeon-view");
    panel.querySelector("summary")!.addEventListener("click", event => (event.currentTarget as HTMLElement).blur());
    for (const type of ["pointerdown", "pointermove", "wheel"]) panel.addEventListener(type, event => event.stopPropagation(), { signal: context.signal });
    const chooseView = (patch: Partial<ViewSettings>) => {
      view = { ...view, ...patch }; page.rig?.choose(view); applyView(); meter.reset();
      context.replace(viewSearch(context.address.search, view) + context.address.hash);
      for (const control of viewFields) control.refresh();
    };
    viewFields.push(...viewControls(() => view, chooseView));
    need("dungeon-view-controls").append(...viewFields.map(control => control.element));
    need("pause-button").before(meter.element);
    const abort = new AbortController();
    const page: DungeonPage = {
      skeletonArt, engine, audio, hover,
      probe: lookProbe(engine, () => page.scene && page.lighting ? { scene: page.scene, lighting: page.lighting } : null),
      meter,
      abort, signal: abort.signal,
      party: null,
      selectedHero: "workshop-fighter", mind: () => null, attributes: () => ({}), companions: [], clothing: { boots: true, armour: true },
      selectedScenario: "generated", selectedQuality: "high", reference: false, commanders: { party: { kind: "party" }, enemies: { kind: "mob" } },
      seed: 0, cryptPlan: undefined, scene: null, run: null, camera: null, rig: null, subjects: new Map(), lighting: null, referenceLook: null,
      drawn: [], soundTorches: [], routes: null,
      paused: false, launching: false, freshFrame: true, lastUi: 0, controls: null, hoverPointer: null, hovered: null, inspected: null,
    };
    return page;
  }

  /** Pauses or resumes the run. A run that has ended stays paused, and its panel says how it ended. */
  function setPaused(page: DungeonPage, value: boolean): void {
    const { run } = page;
    if (!run || !page.scene) return;
    if (run.status !== "playing") value = true;
    page.paused = value;
    if (value) run.play(false);
    page.audio.setActive(!value && run.status === "playing");
    page.controls?.reset();
    run.lead = { keys: null, walk: false };
    need("pause-panel").hidden = !value;
    need("pause-title").textContent = pauseTitle(run.status);
    need("run-time").hidden = run.status === "playing";
    need("run-time").textContent = `${Math.floor(run.clock)} s`;
    need("resume").hidden = run.status !== "playing";
    need("pause-button").textContent = value ? "Resume · Esc" : "Pause · Esc";
  }

  /** The common camera follows the party's leader; fog, lighting and movement read its actual pose. */
  function framing(page: DungeonPage): void {
    const { run, camera, rig, lighting, engine } = page;
    if (!run || !camera || !rig || !lighting) return;
    const hero = run.leader.feet();
    cameraTarget.set(hero.x, VIEW_CAMERA.lookHeight, hero.z);
    rig.frame(cameraTarget, page.subjects.get(run.leader) ?? null, engine.getDeltaTime() / 1000, engine.getAspectRatio(camera));
    pitch = rig.pitch; azimuth = rig.azimuth + Math.PI;
    const nextToward = cameraToward(azimuth);
    if (run.pitch !== pitch || toward.x !== nextToward.x || toward.z !== nextToward.z) {
      toward = nextToward; run.pitch = pitch; run.toward = toward; run.present();
    }
    page.referenceLook?.setAzimuth(azimuth);
    lighting.update(hero, rig.extent, pitch, toward);
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
    profile?.dispose(); profile = null;
    page.lighting?.dispose();
    page.lighting = null;
    page.routes?.dispose(); page.routes = null;
    undraw(page);
    page.run?.dispose();
    page.run = null;
    geometry?.dispose(); geometry = null; bodies.length = 0;
    page.scene?.dispose();
    page.scene = null;
    page.camera = null; page.rig = null; page.subjects.clear();
  }

  /** The scenario's opening frame and rendering scale. Camera modes belong to the shared View settings. */
  function cameraFor(page: DungeonPage): { zoom: number; scaling: number } {
    const { reference } = page;
    return {
      // A random crypt is followed at the scale of a room, rather than fitted whole.
      zoom: page.cryptPlan ? 5.2 : reference ? REFERENCE_ZOOM : 10,
      scaling: reference ? page.selectedQuality === "reduced" ? 1.4 : 1 : 1 / Math.min(devicePixelRatio, 1.5),
    };
  }

  /** Replaces the run on show with one of `nextSeed`, in the scenario and with the party the start panel chose. */
  async function buildRun(page: DungeonPage, nextSeed: number, stage: (label: string) => Promise<void>): Promise<void | Refused> {
    const { engine, audio, reference } = page;
    const art = await loadArtAssets();
    page.signal.throwIfAborted();
    const seed = nextSeed >>> 0;
    const cryptPlan = page.selectedScenario === "random-crypt" ? generateCryptDungeon(seed) : undefined;
    if (cryptPlan && isRefused(cryptPlan)) return cryptPlan;
    const fielded = { seed, layout: cryptPlan?.map ?? (reference ? referenceChamber(seed) : undefined), hero: page.selectedHero, companions: page.companions, attributes: page.attributes };
    const layout = runMap(fielded);
    if (isRefused(layout)) return layout;
    const prepared = prepareDungeonCharacters(layout, fielded);
    if (isRefused(prepared)) return prepared;
    audio.reset();
    page.soundTorches = [];
    teardownRun(page);
    page.seed = seed; page.cryptPlan = cryptPlan;
    const cameraSettings = cameraFor(page);
    engine.setHardwareScalingLevel(cameraSettings.scaling);

    const scene = page.scene = new Scene(engine);
    page.routes = movementRoutes(scene);
    /** A page torn down while a part of the run loaded has no scene, or another: the build stops there. */
    const stillShown = () => {
      context.signal.throwIfAborted();
      if (page.scene !== scene) throw new Error("The dungeon was torn down while it was being built.");
    };
    scene.preventDefaultOnPointerDown = scene.preventDefaultOnPointerUp = false;
    const camera = page.camera = new FreeCamera("dungeon camera", new Vector3(0, 20, 0), scene);
    camera.minZ = 0.1;
    camera.maxZ = 160;
    page.rig = orbitCamera(camera, view, { extent: cameraSettings.zoom });
    pitch = page.rig.pitch; azimuth = CAMERA_AZIMUTH;
    toward = cameraToward(azimuth);
    // The skin of each model the run fields, loaded once a scene; a body whose skin did not load is drawn as its shapes.
    const dressers = new Map<BodyModel, Dresser>();
    await Promise.all(runModels(layout, fielded).map((model) =>
      dresserFor(model, scene, { skeletonArt: () => page.skeletonArt }).then((dress) => { dressers.set(model, dress); })));
    stillShown();
    const dress = (actor: ViewActor) => {
      const puppet = actor.puppet!, hands = handsOf(puppet.configurations.state);
      page.subjects.set(actor, cameraSubject(puppet, actor.centre));
      const skin = dressers.get(actor.model)!(puppet, { clothing: page.clothing, closure: hands.closure }), held = drawHeld(puppet, scene);
      const shapes = drawBody(puppet, scene, Color3.FromHexString(MODEL_DISPLAY[actor.model].tint));
      bodies.push({ skin, shapes });
      skin.setEnabled(view.view === "world"); for (const mesh of shapes.meshes) mesh.setEnabled(view.view === "tactical");
      page.drawn.push(hands, skin, held, shapes);
      actor.meshes.push(...skin.meshes, ...held.meshes, ...shapes.meshes);
    };
    await stage("Building the dungeon");
    stillShown();
    // The run's world steps in a worker (`cryptStage`), which hears it (`hearRun`) and says what it heard.
    const participants = runParticipants(layout, fielded);
    const lead = { keys: null, walk: false };
    const minds = Object.fromEntries(participants.flatMap((participant) => { const mind = page.mind(participant); return mind ? [[participant.id, mind]] : []; }));
    const link = await openWorld<CryptCard>({ kind: "crypt", start: { seed, layout, hero: page.selectedHero, companions: page.companions, minds,
      attributes: Object.fromEntries(participants.map((participant) => [participant.id, page.attributes(participant)])),
      party: page.commanders.party, enemies: page.commanders.enemies, lead } }, page.signal);
    // The worker is the run's from here: torn down with it, or at once where the run is not made.
    let made: RunView;
    try {
      stillShown();
      made = new RunView(scene, link, {
        map: layout, visuals: { ...dungeonStone(scene, stone.floor, stone.wall, browserTextures(art)), masonry: reference ? false : stone.masonry },
        characters: prepared.characters, mind: (card) => page.mind(card) ?? defaultMind(card.model), lead, toward, built: dress, heard: (cue) => audio.cue(cue),
      });
    } catch (error) { link.dispose(); throw error; }
    const run = page.run = made;
    run.pitch = pitch;
    // The look is page code no Node test loads, so the rule that it adds no collider is held here, where it runs.
    const solids = run.level.solids.length;
    const torches = cryptPlan?.torches ?? (reference ? [...REFERENCE_TORCHES] : torchPlacements(run.map, seed));
    page.soundTorches = torches;
    const lighting = page.lighting = lightDungeon(scene, camera, run.map, torches, azimuth, cryptPlan ? CRYPT_LIGHT : reference ? REFERENCE_LIGHT : undefined);
    run.level.sconces(torches);
    if (!reference && stone.dressing) run.level.dress(dressingPlacements(run.map, seed, DRESSING, toward));
    if (reference) {
      await stage("Preparing the chamber");
      stillShown();
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
    framing(page);
    run.present();
    lighting.refreshFog(run.explored);
    showScreen("playing");
    engine.resize();
    framing(page);
    const physical: SolidSense[] = [];
    for (let z = 0; z < run.map.size; z++) for (let x = 0; x < run.map.size; x++) {
      if (isFloor(run.map, x, z)) physical.push({ name: "floor", kind: "box", centre: [x, -.5, z], size: [1, 1, 1] });
      if (boundary(run.map, x, z)) {
        const foot = CUT_AWAY.foot[0];
        physical.push({ name: "wall.base", kind: "box", centre: [x, foot / 2, z], size: [1, foot, 1] },
          { name: "wall", kind: "box", centre: [x, (WALL_HEIGHT + foot) / 2, z], size: [1, WALL_HEIGHT - foot, 1] });
      }
    }
    physical.push(...run.level.solids.filter(s => s.name !== "dungeon slab" && !s.name.startsWith("wall.")).map(s => ({ ...s, kind: "box" as const })));
    geometryVersion = "";
    geometryMaskVersion = ""; geometryMask = new Uint8Array(run.map.size * run.map.size);
    profile = sceneProfile(scene); profile.register("world", visualGroup(scene.meshes.filter(mesh => !run.actors.some(a => a.meshes.includes(mesh)) && !run.level.markers.some(marker => marker === mesh))));
    geometry = solidGeometry(scene, physical); profile.register("tactical", geometry);
    profile.register("world", { setEnabled(on) { lighting.setPresentationEnabled(on); } });
    if (page.referenceLook) profile.register("world", page.referenceLook);
    applyView();
    await stage("Preparing lighting");
    stillShown();
    await warmScene(scene, page.signal);
    stillShown();
    page.freshFrame = true;
    setPaused(page, false);
    /** From a console: `step(n)` takes `n` steps in the worker, then draws the newest, as a hidden tab needs. */
    const step = async (steps = 1) => {
      if (page.run !== run) return;
      await link.step(steps);
      run.pose({ from: link.newest, to: link.newest, share: 1 });
      framing(page);
      refreshHud(page, page.party!);
      scene.render();
    };
    Object.assign(window, { __dungeon: {
      get run() { return page.run; }, get world() { return page.run === run ? link : null; }, step,
      get scene() { return page.scene; }, get camera() { return page.camera; },
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
    const previousScene = page.scene;
    let failed = false;
    const showFailure = (message: string) => {
      failed = true;
      page.audio.setActive(false);
      if (page.scene !== previousScene) teardownRun(page);
      page.run?.play(false);
      page.paused = true;
      showScreen("setup");
      need("pause-panel").hidden = true;
      need("help").hidden = true;
      need("setup-error").hidden = false;
      need("setup-error").textContent = `Could not load level: ${message}`;
    };
    try {
      const result = await context.loading("Preparing your expedition", stage => buildRun(page, nextSeed, stage));
      if (result && isRefused(result)) { showFailure(result.refused); return; }
      if (!page.signal.aborted) canvas.focus();
    } catch (error) {
      if (page.signal.aborted) return;
      showFailure(String(error));
      console.error(error);
    } finally {
      page.launching = false;
      start.disabled = false;
      start.textContent = failed ? "Retry" : "Start";
      need("start-panel").inert = false;
    }
  }

  /** The start panel, the pause panel and the help. */
  function wireControls(page: DungeonPage): void {
    const { signal } = page;
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
      const attributes = attributePanel.read();
      if (!attributes) { need("setup-error").hidden = false; need("setup-error").textContent = "Correct the highlighted character attributes."; return; }
      page.attributes = attributes;
      page.selectedHero = choice(heroChoices) as BodyModel;
      page.selectedScenario = scenarioOf(choice(scenario));
      page.reference = usesReferenceLook(page.selectedScenario);
      page.selectedQuality = quality.value === "reduced" ? "reduced" : "high";
      page.mind = mindPanel.mind(page.attributes);
      page.commanders = { party: commanderOf(COMMANDERS, partyCommander.value)!.defaults, enemies: commanderOf(COMMANDERS, enemyCommander.value)!.defaults };
      // The address keeps the scenario and the party's minds, so that a reload opens the same.
      const url = new URL(location.href);
      mindPanel.write(url);
      attributePanel.write(url);
      writeCommanders(url);
      url.searchParams.set("hero", page.selectedHero);
      url.searchParams.set("companions", selectedCompanions.join(","));
      url.searchParams.set("seed", seedInput.value);
      if (page.reference) {
        url.searchParams.set("scene", page.selectedScenario);
        url.searchParams.set("quality", page.selectedQuality);
      } else {
        url.searchParams.delete("scene");
        url.searchParams.delete("quality");
      }
      context.replace(url);
      page.companions = [...selectedCompanions];
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
      const selected = run.selected;
      for (const button of partyList.querySelectorAll<HTMLButtonElement>("button[data-member]")) {
        const member = run.party.find((candidate) => candidate.id === button.dataset.member);
        if (!member) continue;
        button.setAttribute("aria-pressed", String(selected.has(member.id)));
        button.classList.toggle("fallen", !member.alive);
        button.querySelector("progress")!.value = member.vitality;
        button.querySelector("small")!.textContent = member.alive ? `· ${member.news.task}` : "· fallen";
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

  /** The keys that command the members selected: F calls them back, H holds, X stops, and Q and E turn them an eighth
   * of a turn left and right. */
  const COMMAND_KEYS: Readonly<Record<string, Command>> = Object.freeze({
    KeyF: { kind: "regroup" }, KeyH: { kind: "hold" }, KeyX: { kind: "stop" },
    KeyQ: { kind: "face", turn: -Math.PI / 4 }, KeyE: { kind: "face", turn: Math.PI / 4 },
  });

  function wireKeys(page: DungeonPage, party: Party): void {
    const { signal } = page;
    window.addEventListener("keydown", (event) => {
      if (!need("start-panel").hidden || page.launching) return;
      if (event.target instanceof HTMLElement && event.target.matches("input, select, textarea")) return;
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
      const command = COMMAND_KEYS[event.code];
      if (command && !event.repeat) {
        run.command(command);
        party.partyStatus();
        return;
      }
    }, { signal });
    window.addEventListener("blur", () => setPaused(page, true), { signal });
    document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(page, true); }, { signal });
  }

  /** Where a pointer at `clientX`, `clientY` is: on the canvas for a pick and on the ground. */
  function pointerOn(page: DungeonPage, scene: Scene, camera: FreeCamera, event: { clientX: number; clientY: number }) {
    const { engine } = page;
    const { x, y } = pickingCoordinates(event.clientX, event.clientY, canvas.getBoundingClientRect(),
      engine.getRenderWidth(), engine.getRenderHeight(), engine.getHardwareScalingLevel());
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera);
    const t = ray.intersectsPlane(new Plane(0, 1, 0, 0));
    const p = t !== null && t >= 0 ? ray.origin.add(ray.direction.scale(t)) : null;
    return { x, y, ground: p ? { x: p.x, z: p.z } : null };
  }

  /** Shared player and camera gestures, with the Dungeon's selection and world picking. */
  function wirePointer(page: DungeonPage, party: Party): void {
    const { signal, hover, engine } = page;
    cameraControls(canvas, { signal, enabled: () => page.rig !== null && !page.launching,
      camera: { orbit: (dx, dy) => page.rig?.orbit(dx, dy), zoom: delta => page.rig?.zoom(delta) } });
    page.controls = playerControls<Command>(canvas, {
      signal,
      enabled: () => !!page.run && !page.paused && !page.launching && page.run.status === "playing",
      select: (point, extend) => {
        const { run, scene, camera } = page;
        if (!run || !scene || !camera) return false;
        const p = pointerOn(page, scene, camera, point);
        const hit = scene.pick(p.x, p.y, mesh => run.memberAt(mesh) !== null, false, camera);
        const member = hit?.pickedMesh ? run.memberAt(hit.pickedMesh) : null;
        if (!member) return false;
        party.selectMember(member.id, extend);
        return true;
      },
      pick: point => {
        const { run, scene, camera } = page;
        if (!run || !scene || !camera) return null;
        const p = pointerOn(page, scene, camera, point);
        const hit = scene.pick(p.x, p.y, mesh => mesh.isVisible && run.targetAt(mesh) !== null, false, camera);
        const target = hit?.pickedMesh ? run.targetAt(hit.pickedMesh) : null;
        if (target) return { kind: "attack", foe: target.id };
        return p.ground && run.explored.has(cellKey(run.map, p.ground)) ? { kind: "go", destination: p.ground } : null;
      },
      order: command => { page.run?.command(command); party.partyStatus(); },
    });
    canvas.addEventListener("pointermove", event => {
      page.hoverPointer = { clientX: event.clientX, clientY: event.clientY };
    }, { signal });
    const unhover = () => {
      page.hoverPointer = null;
      page.hovered = null;
      hover.clear();
    };
    canvas.addEventListener("pointerleave", unhover, { signal });
    window.addEventListener("blur", unhover, { signal });
    window.addEventListener("resize", () => engine.resize(), { signal });
  }

  /** Draws each living party member's current navigation path. */
  function drawRoutes(page: DungeonPage): void {
    page.routes?.update(page.run?.party.filter(member => member.alive).map(member => ({
      forced: member.news.forced, attacking: member.news.target !== null, from: member.news.feet, points: member.news.route ?? [],
    })) ?? []);
  }

  /** Brings the HUD up to date with the run: what is seen, the hero, the party, the target, the notice and the
   * routes. */
  function refreshHud(page: DungeonPage, party: Party): void {
    const { run } = page;
    if (!run) return;
    run.present();
    page.lighting?.refreshFog(run.explored);
    need<HTMLProgressElement>("hero-hp").value = run.hero.vitality;
    need("hp-label").textContent = `${Math.ceil(run.hero.vitality * 100)}% life`;
    party.partyStatus();
    const target = run.targetOf(run.leader);
    need("target-panel").hidden = !target || !target.alive;
    if (target) {
      need("target-name").textContent = target.name.replaceAll("-", " ");
      need<HTMLProgressElement>("target-hp").value = target.vitality;
    }
    const notice = run.fault === null ? run.notice : `The run stopped: ${run.fault}`;
    need("notice").textContent = notice;
    need("notice").hidden = !notice;
    drawRoutes(page);
    inspectMind(page, run);
  }

  /**
   * Shows in the HUD the mind of the enemy under the pointer, else of the enemy the party is locked
   * on, else of the first selected party member, else the hero's (`mindInspector`): who has the
   * body and which part of the mind holds each part of it, as the start panel chose it.
   */
  function inspectMind(page: DungeonPage, run: RunView): void {
    const leading = run.targetOf(run.leader), target = leading?.alive ? leading : null;
    const selected = run.selected, actor = page.hovered ?? target ?? run.party.find((member) => selected.has(member.id)) ?? run.hero;
    if (!actor.puppet) return;
    run.look(actor.id);
    if (page.inspected?.actor !== actor) {
      const inspector = mindInspector(actor.mind, actor.spec, () => run.inspected?.id === actor.id ? run.inspected.inspected : null);
      page.inspected = { actor, inspector };
      need("mind-who").textContent = `${actor.name.replaceAll("-", " ")} · ${actor.side === "enemy" ? "enemy" : "party"}`;
      need("mind-view").replaceChildren(inspector.element);
    }
    page.inspected.inspector.refresh();
  }

  /** Outlines the enemy under the pointer, when the pointer is over the canvas and nothing of the HUD covers it. */
  function hoverEnemy(page: DungeonPage, scene: Scene, run: RunView): void {
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

  /** One drawn frame: unless the page is paused, the person's lead sent to the run and the torches advanced by the real
   * time since the last; the bodies drawn between the last two steps the worker sent; then the camera, the sound, the
   * HUD at most ten times a second, the hover and the picture. */
  function frame(page: DungeonPage, party: Party): void {
    const { scene, run, engine, meter, audio } = page;
    if (!scene || !run || page.launching || context.busy) { run?.play(false); meter.reset(); return; }
    if (page.freshFrame) meter.reset();
    meter.frame(() => {
      const seconds = page.freshFrame ? 0 : engine.getDeltaTime() / 1000;
      page.freshFrame = false;
      const playing = () => run.status === "playing";
      // The world runs while the page draws it, unpaused: never under the loading screen or in a hidden tab.
      run.play(!page.paused && playing());
      meter.world(run.received(), !page.paused && playing() ? run.speed : 0);
      if (!page.paused && playing()) {
        for (const { id, speed, at } of run.air) audio.swish(id, speed, at);
        if (view.view === "world") page.lighting?.burn(seconds);
      }
      run.pose(run.between(performance.now()));
      // The steps may have ended the run.
      if (!page.paused && !playing()) setPaused(page, true);
      framing(page);
      if (!page.paused && playing()) {
        run.lead = page.controls!.sample(toward);
        run.send();
      }
      const seen = page.soundTorches.filter((torch) =>
        run.visible.has(cellKey(run.map, { x: torch.cell.x + torch.facing.x, z: torch.cell.z + torch.facing.z })));
      audio.setView(run.leader.feet(), toward, seen.map((torch) => torch.flame));
      audio.update();
      if (performance.now() - page.lastUi > 100) {
        page.lastUi = performance.now();
        refreshHud(page, party);
      }
      hoverEnemy(page, scene, run);
      const hero = run.leader.feet();
      const known = `${run.explored.size}:${run.map.doors.map(door => door.open).join(",")}`;
      if (view.view === "tactical" && known !== geometryMaskVersion) {
        geometryMaskVersion = known;
        // Reuse the level's reveal rule for walls, closed doors and opaque furnishings, without a texture upload.
        fogMask(run.map, run.explored, run.explored, geometryMask);
      }
      const visibleGeometry = `${hero.x},${hero.z},${pitch},${azimuth}:${known}`;
      if (view.view === "tactical" && visibleGeometry !== geometryVersion) {
        geometryVersion = visibleGeometry;
        geometry?.show(solid => {
          if (solid.name.startsWith("door.") && run.map.doors.some(d => solid.name === `door.${d.id}` && d.open)) return false;
          // Replace the shader's dithered wall opening with a geometric cut, keeping its footprint.
          if (solid.name === "wall" && cutAway(hero, { x: solid.centre[0], y: solid.centre[1], z: solid.centre[2] }, pitch, toward) > 0) return false;
          const p = { x: Math.round(solid.centre[0]), z: Math.round(solid.centre[2]) };
          return geometryMask[cellKey(run.map, p)]! > 0;
        });
      }
      scene.render();
    });
  }

  /** Ends the page: its sound, its listeners, its loop, the run on show and the engine. */
  function disposePage(page: DungeonPage): void {
    if ((window as unknown as { __dungeon?: { engine: Engine } }).__dungeon?.engine === page.engine) Reflect.deleteProperty(window, "__dungeon");
    page.audio.dispose();
    page.abort.abort();
    page.engine.stopRenderLoop();
    teardownRun(page);
    page.engine.dispose();
  }

  async function boot(): Promise<void> {
    const page = createPage(loadSkeletonArt());
    const dispose = () => disposePage(page);
    context.own(dispose);
    const preview = await showHeroLineup(need<HTMLCanvasElement>("hero-preview"), HEROES.map(h => h.model), page.signal);
    const updatePreview = async () => {
      try {
        const attributes = attributePanel.read(), hero = choice(heroChoices) as BodyModel;
        if (!attributes) return;
        await Promise.all(HEROES.map((row, index) => {
          const companion = selectedCompanions.indexOf(row.model), id = row.model === hero ? "hero" : companion >= 0 ? `ally-${companion}` : "";
          return preview.setCharacter(index, { model: row.model, attributes: id ? attributes({ id, model: row.model, side: "party" }) : {} });
        }));
      } catch (error) { if (page.signal.aborted) return; throw error; }
    };
    await updatePreview();
    const refreshPreview = () => { void updatePreview().catch(error => { if (!page.signal.aborted) { need("setup-error").hidden = false; need("setup-error").textContent = String(error); } }); };
    attributeHolder.addEventListener("input", refreshPreview, { signal: page.signal });
    attributeHolder.addEventListener("click", refreshPreview, { signal: page.signal });
    heroChoices.addEventListener("change", refreshPreview, { signal: page.signal });
    companionCount.addEventListener("change", refreshPreview, { signal: page.signal });
    if (page.signal.aborted) return;
    context.own(() => {
      const url = new URL(location.href);
      mindPanel.write(url);
      try { attributePanel.write(url); } catch { /* The last valid attributes remain in the link. */ }
      writeCommanders(url);
      url.searchParams.set("hero", choice(heroChoices));
      url.searchParams.set("companions", selectedCompanions.join(","));
      url.searchParams.set("seed", seedInput.value);
      url.searchParams.set("scene", choice(scenario));
      url.searchParams.set("quality", quality.value);
      context.remember(url.href);
    });
    wireControls(page);
    const party = page.party = wireParty(page);
    wireKeys(page, party);
    wirePointer(page, party);
    page.engine.runRenderLoop(() => frame(page, party));
  }

  await boot();
}
