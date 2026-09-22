import { loadHumanAssets } from "../golem/humanoid/appearance.ts";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import { Plane } from "@babylonjs/core/Maths/math.plane.js";
import "@babylonjs/core/Culling/ray.js";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { attachPhysics } from "../physics.ts";
import { CONFIG } from "../config.ts";
import { humanSetup } from "../golem/humanoid/presets.ts";
import { EFFECTOR_TERMINALS } from "../golem/registry.ts";
import type { GolemSetup } from "../bout.ts";
import { PLAYABLE_BUILDS } from "../golem/roster.ts";
import { DungeonRun } from "./run.ts";
import { cellKey, type Point } from "./map.ts";
import { frameDungeon, pickingCoordinates } from "./camera.ts";

const need = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id); if (!element) throw new Error(`Missing dungeon element ${id}`); return element as T;
};
const canvas = need<HTMLCanvasElement>("dungeon"), start = need<HTMLButtonElement>("start");
const heroBuild = need<HTMLSelectElement>("hero-build"), seedInput = need<HTMLInputElement>("seed");
const keyboard = need<HTMLInputElement>("keyboard"), facing = need<HTMLInputElement>("facing");
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
seedInput.value = String(randomSeed());
// Wheel locomotion cannot strafe; the hero picker offers bodies that can honor screen movement.
for (const build of PLAYABLE_BUILDS.filter(b => b.setup.locomotion !== "locomotion.wheel")) {
  const option = document.createElement("option"); option.value = build.name; option.textContent = build.name.replaceAll("-", " "); heroBuild.append(option);
}

const humanPrimary = need<HTMLSelectElement>("human-primary"), humanSecondary = need<HTMLSelectElement>("human-secondary");
for (const picker of [humanPrimary, humanSecondary]) for (const terminal of Object.values(EFFECTOR_TERMINALS)) {
  const option = document.createElement("option"); option.value = terminal.id;
  option.textContent = terminal.id === "fist" ? "Empty hand" : terminal.id === "maul" ? "Maul (two hands)" : terminal.label; picker.append(option);
}
const updateEquipment = () => {
  const setup = PLAYABLE_BUILDS.find(b => b.name === heroBuild.value)?.setup;
  need("human-equipment").hidden = setup?.primary.chain !== "anatomical";
  humanPrimary.value = setup?.primary.terminal ?? "blade"; humanSecondary.value = setup?.secondary.terminal ?? "plate";
  humanSecondary.disabled = humanPrimary.value === "maul";
};
heroBuild.addEventListener("change", updateEquipment);
humanPrimary.addEventListener("change", () => { humanSecondary.disabled = humanPrimary.value === "maul"; });
updateEquipment();

async function boot(): Promise<void> {
  await loadHumanAssets();
  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 1.5));
  let scene: Scene | null = null, run: DungeonRun | null = null, camera: FreeCamera | null = null;
  let light: PointLight | null = null, paused = false, zoom = 10, seed = 0, selectedBuild = "default";
  let selectedEquipment: GolemSetup | undefined;
  let route: LinesMesh | null = null, routeSignature = "", lastUi = 0;
  const held = new Set<string>();
  const abort = new AbortController(), signal = abort.signal;
  const setPaused = (value: boolean) => {
    if (!run || !scene) return;
    if (run.status !== "playing") value = true;
    paused = value; scene.physicsEnabled = !value && run.status === "playing";
    held.clear(); run.commands.right = run.commands.up = 0; run.commands.cancelPointer();
    need("pause-panel").hidden = !value;
    need("pause-title").textContent = run.status === "won" ? "You escaped." : run.status === "dead" ? "Your golem has fallen." : "Paused";
    need("pause-copy").textContent = run.status === "playing" ? "Your run is frozen. Wheel zoom remains available." : `Seed ${seed} · ${Math.floor(run.clock)} seconds in the depths.`;
    need("resume").hidden = run.status !== "playing";
    need("pause-button").textContent = value ? "Resume · Esc" : "Pause · Esc";
  };
  const framing = () => {
    if (!run || !camera || !light) return;
    const hero = run.hero.body.feetPosition();
    frameDungeon(camera, hero, zoom, engine.getRenderWidth() / engine.getRenderHeight());
    light.position.set(hero.x - 1, 5, hero.z - 1);
  };
  const rebuild = (nextSeed: number) => {
    run?.dispose(); run = null; scene?.dispose(); scene = null; route = null; routeSignature = "";
    seed = nextSeed >>> 0; scene = new Scene(engine); scene.clearColor = new Color4(0.018, 0.026, 0.041, 1);
    attachPhysics(scene, havok); scene.getPhysicsEngine()!.setSubTimeStep(1000 / CONFIG.world.physicsHz);
    scene.preventDefaultOnPointerDown = scene.preventDefaultOnPointerUp = false;
    camera = new FreeCamera("dungeon camera", new Vector3(0, 20, 0), scene); camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    camera.minZ = 0.1; camera.maxZ = 160;
    const ambient = new HemisphericLight("cold vault light", new Vector3(0.3, 1, -0.4), scene);
    ambient.intensity = 0.85; ambient.diffuse = Color3.FromHexString("#c4d0e7"); ambient.groundColor = Color3.FromHexString("#313039");
    light = new PointLight("wanderer lantern", new Vector3(0, 5, 0), scene); light.diffuse = Color3.FromHexString("#ffd49a"); light.intensity = 1.8; light.range = 18;
    run = new DungeonRun(scene, seed, selectedBuild, true, undefined, selectedEquipment); run.commands.setMode({ keyboard: keyboard.checked, facing: facing.checked });
    scene.onBeforePhysicsObservable.add(() => {
      if (!run || paused) return;
      run.step(1 / CONFIG.world.physicsHz);
      if (run.status !== "playing") setPaused(true);
    });
    need("start-panel").hidden = true; need("seed-label").textContent = `SEED ${seed}`;
    need("hero-name").textContent = selectedBuild.replaceAll("-", " ");
    setPaused(false); framing(); run.present(); scene.render(); canvas.focus();
    Object.assign(window, { __dungeon: { get run() { return run; }, get scene() { return scene; }, get camera() { return camera; }, engine } });
  };
  const launch = (nextSeed: number) => {
    try { rebuild(nextSeed); }
    catch (error) {
      run?.dispose(); run = null; scene?.dispose(); scene = null;
      need("start-panel").hidden = false; need("pause-panel").hidden = true;
      need("notice").textContent = `Could not build this dungeon: ${String(error)}`; console.error(error);
    }
  };
  const modeChanged = () => {
    held.clear(); run?.commands.setMode({ keyboard: keyboard.checked, facing: facing.checked });
    if (run) canvas.focus();
    need("control-help").textContent = keyboard.checked
      ? facing.checked ? "WASD / arrows to move · cursor to face · attacks are automatic" : "WASD / arrows to move · AI faces and attacks"
      : facing.checked ? "Cursor to face · AI explores, moves and attacks" : "Click to attack-move · click an enemy to lock on · drag to force move";
  };
  keyboard.addEventListener("change", modeChanged, { signal }); facing.addEventListener("change", modeChanged, { signal });
  start.disabled = false; start.textContent = "Enter the dungeon →";
  start.addEventListener("click", () => {
    if (!/^\d{1,10}$/.test(seedInput.value) || Number(seedInput.value) > 0xffffffff) { seedInput.setCustomValidity("Enter a seed from 0 to 4294967295."); seedInput.reportValidity(); return; }
    seedInput.setCustomValidity(""); selectedBuild = heroBuild.value;
    selectedEquipment = need("human-equipment").hidden ? undefined : humanSetup(humanPrimary.value, humanSecondary.value);
    launch(Number(seedInput.value));
  }, { signal });
  seedInput.addEventListener("input", () => seedInput.setCustomValidity(""), { signal });
  need("pause-button").addEventListener("click", () => setPaused(!paused), { signal });
  need("resume").addEventListener("click", () => setPaused(false), { signal });
  need("retry").addEventListener("click", () => launch(seed), { signal });
  need("new-run").addEventListener("click", () => launch(randomSeed()), { signal });
  const toggleHelp = () => { const panel = need("help"); panel.hidden = !panel.hidden; need("help-button").setAttribute("aria-expanded", String(!panel.hidden)); if (!panel.hidden) setPaused(true); };
  need("help-button").addEventListener("click", toggleHelp, { signal }); need("close-help").addEventListener("click", toggleHelp, { signal });
  const sampleKeys = () => {
    if (!run) return;
    run.commands.right = Number(held.has("KeyD") || held.has("ArrowRight")) - Number(held.has("KeyA") || held.has("ArrowLeft"));
    run.commands.up = Number(held.has("KeyW") || held.has("ArrowUp")) - Number(held.has("KeyS") || held.has("ArrowDown"));
  };
  window.addEventListener("keydown", event => {
    if ((event.target as HTMLElement).matches("input, select, textarea")) return;
    if (event.code === "Escape" || event.code === "Space") {
      event.preventDefault(); if (!event.repeat) { if (!need("help").hidden) toggleHelp(); else setPaused(!paused); } return;
    }
    if (event.key === "?") { if (!event.repeat) toggleHelp(); return; }
    if (paused || !run) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault(); held.add(event.code); sampleKeys();
    }
  }, { signal });
  window.addEventListener("keyup", event => { held.delete(event.code); sampleKeys(); }, { signal });
  window.addEventListener("blur", () => setPaused(true), { signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); }, { signal });
  const pointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const { x, y } = pickingCoordinates(event.clientX, event.clientY, rect,
      engine.getRenderWidth(), engine.getRenderHeight(), engine.getHardwareScalingLevel());
    const ray = scene!.createPickingRay(x, y, Matrix.Identity(), camera!);
    const t = ray.intersectsPlane(new Plane(0, 1, 0, 0));
    const p = t !== null && t >= 0 ? ray.origin.add(ray.direction.scale(t)) : null;
    return { x, y, screen: { x: event.clientX, z: event.clientY }, ground: p ? { x: p.x, z: p.z } : null };
  };
  canvas.addEventListener("pointerdown", event => {
    if (paused || !run || !scene || event.button !== 0) return;
    canvas.focus(); const p = pointer(event); if (!p.ground) return;
    const picked = scene.pick(p.x, p.y, mesh => run!.targetAt(mesh) !== null, false, camera!);
    const target = picked?.pickedMesh ? run.targetAt(picked.pickedMesh) : null;
    if (!target && !run.explored.has(cellKey(run.map, p.ground))) return;
    run.commands.down(p.screen, p.ground, target?.id ?? null); canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener("pointermove", event => {
    if (paused || !run || !scene) return;
    const p = pointer(event); if (!(event.buttons & 1)) run.commands.cancelPointer();
    run.commands.move(p.screen, p.ground);
  }, { signal });
  canvas.addEventListener("pointerup", event => {
    if (event.button !== 0 || !run) return;
    run.commands.upPointer(); if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener("pointercancel", () => run?.commands.cancelPointer(), { signal });
  canvas.addEventListener("lostpointercapture", () => run?.commands.cancelPointer(), { signal });
  canvas.addEventListener("wheel", event => { event.preventDefault(); zoom = Math.max(6, Math.min(18, zoom * Math.exp(event.deltaY * 0.001))); }, { passive: false, signal });
  window.addEventListener("resize", () => engine.resize(), { signal });
  engine.runRenderLoop(() => {
    if (!scene || !run) return;
    framing();
    if (performance.now() - lastUi > 100) {
      lastUi = performance.now(); run.present();
      need<HTMLProgressElement>("hero-hp").value = run.hero.body.vitality;
      need("hp-label").textContent = `${Math.ceil(run.hero.body.vitality * 100)}% HP`;
      const target = run.hero.target; need("target-panel").hidden = !target || !target.body.alive;
      if (target) { need("target-name").textContent = target.name.replaceAll("-", " "); need<HTMLProgressElement>("target-hp").value = target.body.vitality; }
      need("notice").textContent = run.notice;
      const order = run.commands.order;
      const points: Point[] = order.kind === "force" ? [...run.hero.route, ...order.points.slice(1)] : run.hero.route;
      const signature = JSON.stringify(points);
      if (signature !== routeSignature) {
        route?.dispose(); route = null; routeSignature = signature;
        if (points.length) {
          const hero = run.hero.body.feetPosition();
          route = MeshBuilder.CreateLines("movement route", { points: [new Vector3(hero.x, 0.06, hero.z), ...points.map(p => new Vector3(p.x, 0.06, p.z))] }, scene);
          route.color = order.kind === "force" ? Color3.FromHexString("#70d8e0") : Color3.FromHexString("#dec693"); route.isPickable = false;
        }
      }
    }
    scene.render();
  });
  const dispose = () => {
    abort.abort(); engine.stopRenderLoop(); run?.dispose(); run = null; scene?.dispose(); scene = null; engine.dispose();
  };
  window.addEventListener("pagehide", dispose, { once: true, signal });
  import.meta.hot?.dispose(dispose);
  need("notice").textContent = "Choose your golem and enter the depths.";
}
boot().catch(error => { need("notice").textContent = `Dungeon could not start: ${String(error)}`; start.textContent = "Unable to start"; console.error(error); });
