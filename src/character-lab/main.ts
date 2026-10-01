import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import "./style.css";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import "@babylonjs/loaders/glTF/index.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import {
  CHARACTERS, WEAPONS, clipFor, gripHand, visiblePart, type CharacterId, type Loadout, type PoseId, type WeaponId,
} from "./catalog.ts";
import { need } from "../dom.ts";

type Triple = readonly [number, number, number];

/** The studio the models stand in: its backdrop, grade, lights, shadow and plinth
 * (`docs/reference/look.md#workshop`). */
const STAGE = Object.freeze({
  /** The page draws at one pixel for every `pixelRatio` of the device's, and never finer than the page's own. */
  pixelRatio: 1.5,
  backdrop: [.155, .202, .198] as Triple,
  fog: Object.freeze({ start: 5, end: 15 }),
  environmentSize: 256,
  ambient: [.24, .27, .25] as Triple,
  exposure: 1.05,
  contrast: 1.12,
  fill: Object.freeze({
    direction: [0, 1, -.6] as Triple, intensity: .85, diffuse: [.75, .85, .86] as Triple, ground: [.26, .28, .24] as Triple,
  }),
  key: Object.freeze({
    position: [-3, 5, 4] as Triple, direction: [.7, -1, -.65] as Triple, intensity: 1.7, diffuse: [1, .88, .70] as Triple,
    near: .1, far: 12,
  }),
  rim: Object.freeze({ direction: [-.6, -.4, .8] as Triple, intensity: 1.4, diffuse: [.6, .78, .85] as Triple }),
  shadow: Object.freeze({ size: 2048, blurKernel: 24, darkness: .25 }),
  floor: Object.freeze({ size: 200, colour: [.065, .088, .08] as Triple }),
  plinth: Object.freeze({ diameter: 1.55, height: .055, y: -.028, tessellation: 96 }),
  inlay: Object.freeze({ diameter: 1.46, thickness: .004, y: .002, tessellation: 96, colour: [.53, .45, .29] as Triple }),
});

/** The camera: where it starts and returns to, what it may do, how it frames a grip and what a key does
 * (`docs/reference/look.md#workshop`). */
const VIEW = Object.freeze({
  home: Object.freeze({ alpha: Math.PI / 2 + .22, beta: 1.39, radius: 5.7, target: [0, 1.02, .65] as Triple }),
  fov: .57,
  near: .01,
  radius: Object.freeze({ least: .2, most: 9 }),
  beta: Object.freeze({ least: .45, most: 1.65 }),
  wheel: .015,
  pinch: .008,
  panning: 1200,
  grip: Object.freeze({
    radius: .85,
    hand: Object.freeze({ alpha: Math.PI / 2 + .3, beta: 1.1 }),
    /** The shield's grip is behind its board, and is seen from above. */
    shield: Object.freeze({ alpha: .4, beta: .45 }),
  }),
  keys: Object.freeze({ turn: .12, raise: .08, lowest: .15, highest: 1.9, zoom: .15, farthest: 5 }),
});

/** The authored loop: its length, s, the clips' frames a second, and the longest step one drawn frame may take,
 * ms (`docs/reference/look.md#workshop`). */
const MOTION = Object.freeze({ seconds: 12, framesPerSecond: 60, longestStep: 100 });

const IDS = Object.keys(CHARACTERS) as CharacterId[];
const colour = ([r, g, b]: Triple): Color3 => new Color3(r, g, b);
const vector = ([x, y, z]: Triple): Vector3 => new Vector3(x, y, z);

const canvas = need<HTMLCanvasElement>("stage");
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / STAGE.pixelRatio));
const scene = new Scene(engine);
scene.clearColor = Color4.FromColor3(colour(STAGE.backdrop), 1);
scene.fogMode = Scene.FOGMODE_LINEAR;
scene.fogStart = STAGE.fog.start;
scene.fogEnd = STAGE.fog.end;
scene.fogColor = colour(STAGE.backdrop);
scene.environmentTexture = new HDRCubeTexture(
  import.meta.env.BASE_URL + "assets/env.hdr", scene, STAGE.environmentSize, false, true, false, true);
scene.ambientColor = colour(STAGE.ambient);
scene.imageProcessingConfiguration.exposure = STAGE.exposure;
scene.imageProcessingConfiguration.contrast = STAGE.contrast;

const camera = new ArcRotateCamera(
  "workshop-camera", VIEW.home.alpha, VIEW.home.beta, VIEW.home.radius, vector(VIEW.home.target), scene);
camera.fov = VIEW.fov;
camera.minZ = VIEW.near;
camera.lowerRadiusLimit = VIEW.radius.least;
camera.upperRadiusLimit = VIEW.radius.most;
camera.lowerBetaLimit = VIEW.beta.least;
camera.upperBetaLimit = VIEW.beta.most;
camera.wheelDeltaPercentage = VIEW.wheel;
camera.pinchDeltaPercentage = VIEW.pinch;
camera.panningSensibility = VIEW.panning;
camera.attachControl(canvas, true);

const fill = new HemisphericLight("softbox-fill", vector(STAGE.fill.direction), scene);
fill.intensity = STAGE.fill.intensity;
fill.diffuse = colour(STAGE.fill.diffuse);
fill.groundColor = colour(STAGE.fill.ground);
// The key casts the shadow. Its frustum's sides follow the casters; only its depth is set here.
const key = new DirectionalLight("warm-key", vector(STAGE.key.direction), scene);
key.position = vector(STAGE.key.position);
key.intensity = STAGE.key.intensity;
key.diffuse = colour(STAGE.key.diffuse);
key.shadowMinZ = STAGE.key.near;
key.shadowMaxZ = STAGE.key.far;
key.autoCalcShadowZBounds = false;
const rim = new DirectionalLight("cool-rim", vector(STAGE.rim.direction), scene);
rim.intensity = STAGE.rim.intensity;
rim.diffuse = colour(STAGE.rim.diffuse);
const shadow = new ShadowGenerator(STAGE.shadow.size, key);
shadow.useBlurExponentialShadowMap = true;
shadow.blurKernel = STAGE.shadow.blurKernel;
shadow.darkness = STAGE.shadow.darkness;

const ground = MeshBuilder.CreateGround("studio-floor", { width: STAGE.floor.size, height: STAGE.floor.size }, scene);
const floorMat = new StandardMaterial("studio-matte", scene);
floorMat.diffuseColor = colour(STAGE.floor.colour);
floorMat.specularColor = Color3.Black();
ground.material = floorMat;
ground.receiveShadows = true;
const plinth = MeshBuilder.CreateCylinder("display-plinth",
  { diameter: STAGE.plinth.diameter, height: STAGE.plinth.height, tessellation: STAGE.plinth.tessellation }, scene);
plinth.position.y = STAGE.plinth.y;
plinth.material = floorMat;
plinth.receiveShadows = true;
const ring = MeshBuilder.CreateTorus("plinth-inlay",
  { diameter: STAGE.inlay.diameter, thickness: STAGE.inlay.thickness, tessellation: STAGE.inlay.tessellation }, scene);
ring.position.y = STAGE.inlay.y;
const ringMat = new StandardMaterial("inlay-brass", scene);
ringMat.diffuseColor = colour(STAGE.inlay.colour);
ringMat.specularColor = Color3.Black();
ring.material = ringMat;

let current: CharacterId = IDS[0];
let pose: PoseId = "loop";
let ready = false;
/** Each character keeps the kit it was last given. */
const loadouts = Object.fromEntries(IDS.map((id) => [id, { ...CHARACTERS[id].defaults }])) as Record<CharacterId, Loadout>;
const assets = new Map<CharacterId, AssetContainer>();
let seconds = 0, playing = true, speed = 1;
/** The clips of the pose on show: the body's, and with a bow its stave's and string's. */
let clips: AnimationGroup[] = [];

const buttons = (selector: string): NodeListOf<HTMLButtonElement> => document.querySelectorAll<HTMLButtonElement>(selector);
const stage = (): Element | null => document.querySelector(".stage");

/** The frame of `clip` that `seconds` of the pose on show falls on. */
function frameOf(clip: AnimationGroup): number {
  switch (pose) {
    case "inspection": return clip.from;
    case "loop": return clip.from + seconds * MOTION.framesPerSecond;
    default: { const never: never = pose; throw new Error(`Unknown pose: ${String(never)}`); }
  }
}

/** Puts the motion at `time`, s, held within the loop, and shows it on the timeline. */
function sample(time: number): void {
  seconds = Math.max(0, Math.min(MOTION.seconds, time));
  for (const clip of clips) clip.goToFrame(frameOf(clip));
  need<HTMLInputElement>("timeline").value = String(seconds);
  need("time-label").textContent = `${seconds.toFixed(1)} / ${MOTION.seconds.toFixed(1)} s`;
}

function showPlaying(): void {
  need("play").textContent = playing ? "Pause" : "Play";
}

function restart(): void {
  seconds = 0;
  pose = "loop";
  playing = true;
  sync();
}

/** Shows the chosen character's meshes for its kit, and starts the clips of the pose, paused at `seconds`. */
function showCharacter(kit: Loadout): void {
  clips = [];
  for (const [id, asset] of assets) {
    for (const mesh of asset.meshes) {
      if (mesh.name !== "__root__") mesh.setEnabled(id === current && visiblePart(mesh.name, kit));
    }
    for (const animation of asset.animationGroups) animation.stop();
    if (id !== current) continue;
    const clip = asset.animationGroups.find((group) => group.name === clipFor(pose, kit));
    if (!clip) throw new Error(`Missing pose: ${clipFor(pose, kit)}`);
    clips = asset.animationGroups.filter((group) => group.name === clip.name || group.name.startsWith(clip.name + "-bow__"));
    for (const group of clips) {
      group.start(false);
      group.pause();
    }
    sample(seconds);
  }
}

/** Marks the page's controls and writes its labels for the chosen character, kit and pose. */
function showControls(kit: Loadout): void {
  const character = CHARACTERS[current];
  buttons("[data-character]").forEach((button) => {
    const selected = button.dataset.character === current;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("selected", selected);
  });
  for (const slot of ["boots", "armour"] as const) {
    buttons(`[data-${slot}]`).forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset[slot] === String(kit[slot]))));
  }
  buttons("[data-pose]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.pose === pose)));
  need<HTMLSelectElement>("weapon").value = kit.weapon;
  need("character-title").textContent = character.name;
  need("character-class").textContent = character.subtitle;
  const count = (n: number): string => String(n).padStart(2, "0");
  need("model-count").textContent = `${count(IDS.indexOf(current) + 1)} / ${count(IDS.length)}`;
  need("equipment-note").textContent = WEAPONS[kit.weapon].note;
  const footwear = kit.boots ? "Leather boots" : "Barefoot", armour = kit.armour ? character.armour : "Base clothing";
  need("loadout-summary").textContent = `${footwear} · ${armour} · ${WEAPONS[kit.weapon].label}`;
}

/** Brings the scene and the page to the chosen character, kit and pose, and draws once. */
function sync(): void {
  showPlaying();
  const kit = loadouts[current];
  showCharacter(kit);
  showControls(kit);
  scene.render();
}

function resetCamera(): void {
  stage()?.classList.remove("inspecting");
  camera.inertialAlphaOffset = 0;
  camera.inertialBetaOffset = 0;
  camera.inertialRadiusOffset = 0;
  camera.inertialPanningX = 0;
  camera.inertialPanningY = 0;
  camera.movement.resetPanVelocity();
  camera.setTarget(vector(VIEW.home.target));
  camera.alpha = VIEW.home.alpha;
  camera.beta = VIEW.home.beta;
  camera.radius = VIEW.home.radius;
}

/** The bearing and pitch the grip of `weapon` is framed from. */
function gripView(weapon: WeaponId): { alpha: number; beta: number } {
  switch (weapon) {
    case "shield": return VIEW.grip.shield;
    case "empty": case "sword": case "sword-shield": case "bow": return VIEW.grip.hand;
    default: { const never: never = weapon; throw new Error(`Unknown weapon: ${String(never)}`); }
  }
}

/** Pauses, and frames the middle knuckle of the hand that holds the weapon. */
function inspectGrip(): void {
  playing = false;
  showPlaying();
  const weapon = loadouts[current].weapon;
  const joint = assets.get(current)?.transformNodes.find((node) => node.name === `middle_01_${gripHand(weapon)}`);
  if (!joint) return;
  resetCamera();
  joint.computeWorldMatrix(true);
  stage()?.classList.add("inspecting");
  camera.setTarget(joint.getAbsolutePosition().clone());
  const view = gripView(weapon);
  camera.radius = VIEW.grip.radius;
  camera.alpha = view.alpha;
  camera.beta = view.beta;
}

/** The keyboard's way to do what a drag and the wheel do, for the focused canvas. */
function onKey(event: KeyboardEvent): void {
  const keys = VIEW.keys;
  switch (event.key) {
    case "ArrowLeft": camera.alpha -= keys.turn; break;
    case "ArrowRight": camera.alpha += keys.turn; break;
    case "ArrowUp": camera.target.y = Math.min(keys.highest, camera.target.y + keys.raise); break;
    case "ArrowDown": camera.target.y = Math.max(keys.lowest, camera.target.y - keys.raise); break;
    case "+": case "=": camera.radius = Math.max(VIEW.radius.least, camera.radius - keys.zoom); break;
    case "-": camera.radius = Math.min(keys.farthest, camera.radius + keys.zoom); break;
    default: return;
  }
  event.preventDefault();
}

buttons("[data-character]").forEach((button) => button.addEventListener("click", () => {
  current = button.dataset.character as CharacterId;
  seconds = 0;
  if (ready) sync();
}));
for (const slot of ["boots", "armour"] as const) {
  buttons(`[data-${slot}]`).forEach((button) => button.addEventListener("click", () => {
    loadouts[current][slot] = button.dataset[slot] === "true";
    sync();
  }));
}
need<HTMLSelectElement>("weapon").addEventListener("change", (event) => {
  loadouts[current].weapon = (event.target as HTMLSelectElement).value as WeaponId;
  seconds = 0;
  sync();
});
buttons("[data-pose]").forEach((button) => button.addEventListener("click", () => {
  pose = button.dataset.pose as PoseId;
  playing = pose === "loop";
  seconds = 0;
  if (ready) sync();
}));
need("reset").addEventListener("click", resetCamera);
need("grip-view").addEventListener("click", inspectGrip);
canvas.addEventListener("keydown", onKey);
const observer = new ResizeObserver(() => engine.resize());
observer.observe(canvas);
need("play").addEventListener("click", () => {
  playing = !playing;
  if (pose === "inspection") {
    pose = "loop";
    sync();
  }
  showPlaying();
});
need("restart").addEventListener("click", restart);
need<HTMLInputElement>("timeline").addEventListener("input", (event) => {
  playing = false;
  showPlaying();
  sample(Number((event.target as HTMLInputElement).value));
});
need<HTMLSelectElement>("speed").addEventListener("change", (event) => {
  speed = Number((event.target as HTMLSelectElement).value);
});

engine.runRenderLoop(() => {
  if (ready && playing && pose === "loop" && !document.hidden) {
    const step = Math.min(engine.getDeltaTime(), MOTION.longestStep) / 1000 * speed;
    sample((seconds + step) % MOTION.seconds);
  }
  scene.render();
});

let disposed = false;
function dispose(): void {
  if (disposed) return;
  disposed = true;
  observer.disconnect();
  engine.stopRenderLoop();
  for (const asset of assets.values()) asset.dispose();
  scene.dispose();
  engine.dispose();
}
window.addEventListener("pagehide", dispose, { once: true });
import.meta.hot?.dispose(dispose);

/** Loads `id`'s model into the scene, hidden, with every part of it casting the key's shadow. */
async function load(id: CharacterId): Promise<boolean> {
  const asset = await LoadAssetContainerAsync(
    `${import.meta.env.BASE_URL}assets/character-lab/${CHARACTERS[id].asset}`, scene);
  if (disposed) {
    asset.dispose();
    return false;
  }
  asset.addAllToScene();
  assets.set(id, asset);
  for (const animation of asset.animationGroups) animation.stop();
  for (const mesh of asset.meshes) {
    if (mesh.name === "__root__") continue;
    // The skin is drawn opaque. The small skinned parts move outside their bind-pose bounds,
    // so they are kept eligible for rendering when a posed wrist is inspected close up.
    if (mesh.name === "base__skin" && mesh.material) mesh.material.transparencyMode = 0;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.setEnabled(false);
    mesh.receiveShadows = false;
    shadow.addShadowCaster(mesh);
  }
  return true;
}

async function start(): Promise<void> {
  try {
    for (const id of IDS) if (!await load(id)) return;
    sync();
    ready = true;
    need<HTMLFieldSetElement>("kit").disabled = false;
    need("loading").hidden = true;
  } catch (error) {
    console.error(error);
    const told = error instanceof Error ? error.message : String(error);
    need("loading").textContent = `The workshop could not load. ${told}. Reload to retry.`;
  }
}

// The page's state for the console and the browser checks (`scripts/character-lab/browser-check.mjs`).
Object.assign(window, {
  __characterLab: {
    scene, camera, assets, loadouts,
    get current() { return current; },
    get pose() { return pose; },
    get ready() { return ready; },
    get seconds() { return seconds; },
    sample: (time: number) => { playing = false; sample(time); scene.render(); },
    render: () => scene.render(),
  },
});
void start();
