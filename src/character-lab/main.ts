import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture.js';
import './style.css';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import type { AssetContainer } from '@babylonjs/core/assetContainer.js';
import '@babylonjs/loaders/glTF/index.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { CHARACTERS, WEAPONS, visiblePart, clipFor, type CharacterId, type Loadout, type PoseId, type WeaponId } from './catalog.ts';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('stage');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
const scene = new Scene(engine);
scene.clearColor = new Color4(.155, .202, .198, 1);
scene.fogMode = Scene.FOGMODE_LINEAR; scene.fogStart = 5; scene.fogEnd = 15; scene.fogColor = new Color3(.155, .202, .198);
scene.environmentTexture = new HDRCubeTexture(import.meta.env.BASE_URL + 'assets/env.hdr', scene, 256, false, true, false, true);
scene.ambientColor = new Color3(.24, .27, .25);
scene.imageProcessingConfiguration.exposure = 1.05;
scene.imageProcessingConfiguration.contrast = 1.12;
const camera = new ArcRotateCamera('workshop-camera', Math.PI / 2 + .22, 1.39, 5.7, new Vector3(0, 1.02, .65), scene);
camera.fov = .57; camera.minZ = .01; camera.lowerRadiusLimit = .2; camera.upperRadiusLimit = 9;
camera.lowerBetaLimit = .45; camera.upperBetaLimit = 1.65; camera.wheelDeltaPercentage = .015;
camera.pinchDeltaPercentage = .008; camera.panningSensibility = 1200; camera.attachControl(canvas, true);
const fill = new HemisphericLight('softbox-fill', new Vector3(0, 1, -.6), scene);
fill.intensity = .85; fill.diffuse = new Color3(.75, .85, .86); fill.groundColor = new Color3(.26, .28, .24);
const key = new DirectionalLight('warm-key', new Vector3(.7, -1, .65), scene);
key.position = new Vector3(-3, 5, 4); key.direction = new Vector3(.7, -1, -.65); key.intensity = 1.7; key.diffuse = new Color3(1, .88, .70);
key.shadowMinZ = .1; key.shadowMaxZ = 12; key.autoCalcShadowZBounds = false;
key.orthoLeft = -2; key.orthoRight = 2; key.orthoTop = 3; key.orthoBottom = -2;
const rim = new DirectionalLight('cool-rim', new Vector3(-.6, -.4, -.8), scene);
rim.direction = new Vector3(-.6, -.4, .8); rim.intensity = 1.4; rim.diffuse = new Color3(.6, .78, .85);
const shadow = new ShadowGenerator(2048, key); shadow.useBlurExponentialShadowMap = true; shadow.blurKernel = 24; shadow.darkness = .25;
const ground = MeshBuilder.CreateGround('studio-floor', { width: 200, height: 200 }, scene);
const floorMat = new StandardMaterial('studio-matte', scene); floorMat.diffuseColor = new Color3(.065, .088, .08); floorMat.specularColor = Color3.Black(); ground.material = floorMat; ground.receiveShadows = true;
const plinth = MeshBuilder.CreateCylinder('display-plinth', { diameter: 1.55, height: .055, tessellation: 96 }, scene);
plinth.position.y = -.028; plinth.material = floorMat; plinth.receiveShadows = true;
const ring = MeshBuilder.CreateTorus('plinth-inlay', { diameter: 1.46, thickness: .004, tessellation: 96 }, scene);
ring.position.y = .002;
const ringMat = new StandardMaterial('inlay-brass', scene); ringMat.diffuseColor = new Color3(.53, .45, .29); ringMat.specularColor = Color3.Black(); ring.material = ringMat;

let current: CharacterId = 'fighter'; let pose: PoseId = 'loop'; let ready = false;
const loadouts: Record<CharacterId, Loadout> = { fighter: { ...CHARACTERS.fighter.defaults }, rogue: { ...CHARACTERS.rogue.defaults } };
const assets = new Map<CharacterId, AssetContainer>();
let seconds = 0, playing = true, speed = 1;
let clips: import('@babylonjs/core/Animations/animationGroup.js').AnimationGroup[] = [];
function sample(time: number) {
  seconds = Math.max(0, Math.min(12, time));
  for (const clip of clips) clip.goToFrame(pose === 'inspection' ? clip.from : clip.from + seconds * 60);
  el<HTMLInputElement>('timeline').value = String(seconds);
  el('time-label').textContent = `${seconds.toFixed(1)} / 12.0 s`;
}
function restart() { seconds = 0; pose = 'loop'; playing = true; sync(); }

function sync() {
  el('play').textContent = playing ? 'Pause' : 'Play';
  const kit = loadouts[current]; const character = CHARACTERS[current];
  clips = [];
  for (const [id, asset] of assets) {
    for (const mesh of asset.meshes) { if (mesh.name !== '__root__') mesh.setEnabled(id === current && visiblePart(mesh.name, kit)); }
    for (const animation of asset.animationGroups) animation.stop();
    if (id === current) {
      const clip = asset.animationGroups.find(a => a.name === clipFor(pose, kit));
      if (!clip) throw new Error(`Missing pose: ${clipFor(pose, kit)}`);
      clips = asset.animationGroups.filter(a => a.name === clip.name || a.name.startsWith(clip.name + '-bow__'));
      for (const a of clips) { a.start(false); a.pause(); }
      sample(seconds);
    }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach(b => { const selected = b.dataset.character === current; b.setAttribute('aria-pressed', String(selected)); b.classList.toggle('selected', selected); });
  for (const slot of ['boots', 'armour'] as const) document.querySelectorAll<HTMLButtonElement>(`[data-${slot}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[slot] === String(kit[slot]))));
  document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pose === pose)));
  el<HTMLSelectElement>('weapon').value = kit.weapon;
  el('character-title').textContent = character.name; el('character-class').textContent = character.subtitle;
  el('model-count').textContent = current === 'fighter' ? '01 / 02' : '02 / 02';
  el('equipment-note').textContent = WEAPONS[kit.weapon].note;
  el('loadout-summary').textContent = `${kit.boots ? 'Leather boots' : 'Barefoot'} · ${kit.armour ? (current === 'fighter' ? 'Plate armour' : 'Leather armour') : 'Base clothing'} · ${WEAPONS[kit.weapon].label}`;
  scene.render();
}
document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach(b => b.addEventListener('click', () => { current = b.dataset.character as CharacterId; seconds = 0; if (ready) sync(); }));
for (const slot of ['boots', 'armour'] as const) document.querySelectorAll<HTMLButtonElement>(`[data-${slot}]`).forEach(b => b.addEventListener('click', () => { loadouts[current][slot] = b.dataset[slot] === 'true'; sync(); }));
el<HTMLSelectElement>('weapon').addEventListener('change', event => { loadouts[current].weapon = (event.target as HTMLSelectElement).value as WeaponId; seconds = 0; sync(); });
document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(b => b.addEventListener('click', () => { pose = b.dataset.pose as PoseId; playing = pose === 'loop'; seconds = 0; if (ready) sync(); }));
function resetCamera() {
  document.querySelector('.stage')?.classList.remove('inspecting');
  camera.inertialAlphaOffset = 0; camera.inertialBetaOffset = 0; camera.inertialRadiusOffset = 0;
  camera.inertialPanningX = 0; camera.inertialPanningY = 0;
  camera.movement.resetPanVelocity();
  camera.setTarget(new Vector3(0, 1.02, .65)); camera.alpha = Math.PI / 2 + .22; camera.beta = 1.39; camera.radius = 5.7;
}
el('reset').addEventListener('click', resetCamera);
el('grip-view').addEventListener('click', () => {
  playing = false; el('play').textContent = 'Play';
  const weapon = loadouts[current].weapon;
  const side = weapon === 'bow' || weapon === 'shield' ? 'l' : 'r';
  const joint = assets.get(current)?.transformNodes.find(n => n.name === `middle_01_${side}`);
  if (!joint) return;
  resetCamera(); joint.computeWorldMatrix(true);
  document.querySelector('.stage')?.classList.add('inspecting');
  camera.setTarget(joint.getAbsolutePosition().clone());
  camera.radius = .85;
  camera.alpha = weapon === 'shield' ? .4 : Math.PI / 2 + .3;
  camera.beta = weapon === 'shield' ? .45 : 1.1;
});
// Keyboard alternative to drag for the focusable preview.
canvas.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') camera.alpha -= .12;
  else if (event.key === 'ArrowRight') camera.alpha += .12;
  else if (event.key === 'ArrowUp') camera.target.y = Math.min(1.9, camera.target.y + .08);
  else if (event.key === 'ArrowDown') camera.target.y = Math.max(.15, camera.target.y - .08);
  else if (event.key === '+' || event.key === '=') camera.radius = Math.max(.2, camera.radius - .15);
  else if (event.key === '-') camera.radius = Math.min(5, camera.radius + .15);
  else return;
  event.preventDefault();
});
const resize = () => engine.resize(); const observer = new ResizeObserver(resize); observer.observe(canvas);
el('play').addEventListener('click', () => { playing = !playing; if (pose === 'inspection') { pose = 'loop'; sync(); } el('play').textContent = playing ? 'Pause' : 'Play'; });
el('restart').addEventListener('click', restart);
el<HTMLInputElement>('timeline').addEventListener('input', e => { playing = false; el('play').textContent = 'Play'; sample(Number((e.target as HTMLInputElement).value)); });
el<HTMLSelectElement>('speed').addEventListener('change', e => { speed = Number((e.target as HTMLSelectElement).value); });
engine.runRenderLoop(() => { if (ready && playing && pose === 'loop' && !document.hidden) sample((seconds + Math.min(engine.getDeltaTime(), 100) / 1000 * speed) % 12); scene.render(); });
let disposed = false;
function dispose() { if (disposed) return; disposed = true; observer.disconnect(); engine.stopRenderLoop(); for (const asset of assets.values()) asset.dispose(); scene.dispose(); engine.dispose(); }
window.addEventListener('pagehide', dispose, { once: true }); import.meta.hot?.dispose(dispose);
async function start() {
  try {
    for (const id of ['fighter', 'rogue'] as const) {
      const asset = await LoadAssetContainerAsync(`${import.meta.env.BASE_URL}assets/character-lab/${CHARACTERS[id].asset}`, scene);
      if (disposed) { asset.dispose(); return; }
      asset.addAllToScene(); assets.set(id, asset);
      for (const animation of asset.animationGroups) animation.stop();
      for (const mesh of asset.meshes) {
        if (mesh.name !== '__root__') {
          // The small skinned parts move outside their bind-pose bounds. Keep them
          // eligible for rendering when inspecting a posed wrist at close range.
          if (mesh.name === 'base__skin' && mesh.material) mesh.material.transparencyMode = 0;
          mesh.alwaysSelectAsActiveMesh = true;
          mesh.setEnabled(false); mesh.receiveShadows = false; shadow.addShadowCaster(mesh);
        }
      }
    }
    sync(); ready = true; el<HTMLFieldSetElement>('kit').disabled = false; el('loading').hidden = true;
  } catch (error) { console.error(error); el('loading').textContent = `The workshop could not load. ${error instanceof Error ? error.message : String(error)}. Reload to retry.`; }
}
// Readable diagnostics for the isolated asset/interaction acceptance harness.
Object.assign(window, { __characterLab: { scene, camera, assets, loadouts, get current() { return current; }, get pose() { return pose; }, get ready() { return ready; }, get seconds() { return seconds; }, sample: (t: number) => { playing = false; sample(t); scene.render(); }, render: () => scene.render() } });
void start();
