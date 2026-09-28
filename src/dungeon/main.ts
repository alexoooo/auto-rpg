import { loadWorkshopAssets } from "../golem/humanoid/workshop-appearance.ts";
import { loadSkeletonAssets } from "../golem/skeleton/appearance.ts";
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
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { attachPhysics } from "../physics.ts";
import { CONFIG } from "../config.ts";
import { bodyFamily, fixedAttributes, withoutFixedAttributes } from "../golem/family.ts";
import { ARMED_SETUP } from "../golem/family-setup.ts";
import { golemSetupRefusal, golemTerminalOptions } from "../golem/build.ts";
import type { GolemSetup } from "../bout.ts";
import { PLAYABLE_BUILDS } from "../golem/roster.ts";
import { describeAttributes, withAttribute, withAttributeSetting, type AttributeSetting } from "../golem/attributes.ts";
import { attributeAction, attributesPanel, followAttributeSlider, renderAttributes } from "../attributes-ui.ts";
import { GameAudio } from "../game-audio.ts";
import { namedBuild } from "../golem/roster.ts";
import { EnemyHover } from "./hover.ts";
import { DungeonRun } from "./run.ts";
import { orderLabel } from "./commands.ts";
import { cellKey, type Point } from "./map.ts";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward, frameDungeon, pickingCoordinates } from "./camera.ts";
import { DRESSING, dressingPlacements, torchPlacements } from "./dressing.ts";
import { lightDungeon, REFERENCE_LIGHT, type DungeonLighting } from "./lighting.ts";
import { lookProbe } from "./look-probe.ts";
import { frameMeter } from "./frame-meter.ts";
import { dungeonStone, stoneQuery } from "./stone.ts";

import { type CryptRoomPlan } from "./crypt-room.ts";
import { generateCryptDungeon } from "./crypt-dungeon.ts";
type DungeonScenario = "generated" | "reference" | "random-crypt";

import { referenceChamber, REFERENCE_CAMERA, REFERENCE_TORCHES } from "./reference.ts";
import { dressReference, type ReferenceQuality } from "./reference-look.ts";

const need = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id); if (!element) throw new Error(`Missing dungeon element ${id}`); return element as T;
};
const canvas = need<HTMLCanvasElement>("dungeon"), start = need<HTMLButtonElement>("start");
const heroBuild = need<HTMLSelectElement>("hero-build"), seedInput = need<HTMLInputElement>("seed");
const keyboard = need<HTMLInputElement>("keyboard"), facing = need<HTMLInputElement>("facing");
const companionCount = need<HTMLSelectElement>("companions"), partyList = need<HTMLOListElement>("party-list");
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
// `?pitch=` in degrees, to compare the camera's elevation against the concept art's steeper view.
const pitchQuery = Number(new URLSearchParams(location.search).get("pitch"));
let pitch = Number.isFinite(pitchQuery) && pitchQuery > 0 ? Math.max(25, Math.min(65, pitchQuery)) * Math.PI / 180 : CAMERA_PITCH;
// `?azimuth=` in degrees, any finite value, to compare the camera's bearing: 45 is the old diagonal. An absent or
// empty parameter is the default, not 0, which `Number` would make of it.
const azimuthText = new URLSearchParams(location.search).get("azimuth")?.trim();
const azimuthQuery = azimuthText ? Number(azimuthText) : NaN;
let azimuth = Number.isFinite(azimuthQuery) ? (azimuthQuery % 360 + 360) % 360 * Math.PI / 180 : CAMERA_AZIMUTH;
let toward = cameraToward(azimuth);
// `?floor=flat` and `?wall=flat` draw the untextured colours, the control for what the stone's maps cost, and
// `?masonry=0` the flat wall skin, the control for what the blocks cost; `?dressing=0` leaves the clutter out.
const stone = stoneQuery(location.search);
seedInput.value = String(randomSeed());
// Wheel locomotion cannot strafe; the hero picker offers bodies that can honor screen movement.
const WALKERS = PLAYABLE_BUILDS.filter(b => b.setup.locomotion !== "locomotion.wheel");
/** The companions for a hero: the next walkers on the list after the hero's own build, so none is its twin. */
const companionBuilds = (hero: string, count: number): string[] => {
  const at = Math.max(0, WALKERS.findIndex(b => b.name === hero));
  return Array.from({ length: count }, (_, i) => WALKERS[(at + 1 + i) % WALKERS.length].name);
};
for (const build of WALKERS) {
  const option = document.createElement("option"); option.value = build.name; option.textContent = build.name.replaceAll("-", " "); heroBuild.append(option);
}
// The Warrior leads unless somebody picks another hero.
heroBuild.value = "warrior";

const heroEquipment = need("hero-equipment");
const workshopAppearance=document.createElement("div");
workshopAppearance.hidden=true;
workshopAppearance.innerHTML='<label><input type="checkbox" data-workshop="boots" checked> Boots</label> <label><input type="checkbox" data-workshop="armour" checked> Armour</label><p>Appearance only; human protection is unchanged.</p>';
heroEquipment.append(workshopAppearance);
const heroPrimary = need<HTMLSelectElement>("hero-primary"), heroSecondary = need<HTMLSelectElement>("hero-secondary");
const heroSetup = () => PLAYABLE_BUILDS.find(b => b.name === heroBuild.value)?.setup;
/** How the chosen hero's hands are armed, or null for a family whose weapons are its build. */
const heroArming = () => { const setup = heroSetup(); return setup ? ARMED_SETUP[bodyFamily(setup)] ?? null : null; };
// Refilled on each change of hero from what the hero's own chains offer, which is what the arena
// setup screen offers for those chains.
const updateEquipment = () => {
  const setup = heroSetup();
  workshopAppearance.hidden=!setup?.human;
  heroEquipment.hidden = !heroArming();
  if (!setup || heroEquipment.hidden) return;
  for (const [picker, hand] of [[heroPrimary, setup.primary], [heroSecondary, setup.secondary]] as const) {
    picker.replaceChildren(...golemTerminalOptions(hand.chain).filter(option=>(!setup.human && option.id !== "bow")
      || (picker===heroPrimary?(setup.human?.model==="workshop-rogue"?["bow","blade","fist"]:["blade","club","fist"]):(setup.human?.model==="workshop-rogue"?["plate","fist","bow"]:["plate","fist"])).includes(option.id)).map(({ id, label }) => {
      const option = document.createElement("option"); option.value = id; option.textContent = label; return option;
    }));
    picker.value = hand.terminal;
  }
  heroSecondary.disabled = ["maul", "bow"].includes(heroPrimary.value);
};
heroBuild.addEventListener("change", updateEquipment);
heroBuild.addEventListener("change", () => {
  const setup = heroSetup();
  if (setup) heroAttributes = withoutFixedAttributes(heroAttributes, setup) ?? {};
  renderHeroAttributes();
});
// The hero's attributes, held here until Start puts them on the hero's setup. Only the hero: every
// enemy is built at x1. Nothing is remembered between visits, because the dungeon remembers nothing.
const heroAttributesPanel = need("hero-attributes");
let heroAttributes: AttributeSetting = {};
heroAttributesPanel.innerHTML = attributesPanel("hero");
// A stat the hero's family fixes is shown fixed, and left off the hero at Start (`FAMILY_FIXED_ATTRIBUTES`).
const heroFixed = () => { const setup = heroSetup(); return setup ? fixedAttributes(setup) : {}; };
const renderHeroAttributes = () => renderAttributes(heroAttributesPanel, "hero", heroAttributes, false, heroFixed());
const editHeroAttributes = (event: Event) => {
  const action = attributeAction(event.target);
  if (!action) return;
  heroAttributes = action.kind === "set" ? withAttribute(heroAttributes, action.id, action.value) : {};
  renderHeroAttributes();
};
heroAttributesPanel.addEventListener("input", followAttributeSlider);
heroAttributesPanel.addEventListener("change", editHeroAttributes);
heroAttributesPanel.addEventListener("click", event => { if (event.target instanceof HTMLButtonElement) editHeroAttributes(event); });
renderHeroAttributes();
heroPrimary.addEventListener("change", () => { heroSecondary.disabled = ["maul", "bow"].includes(heroPrimary.value); });
const scenario = need<HTMLSelectElement>("dungeon-scene"), quality = need<HTMLSelectElement>("dungeon-quality");
const requestedScene = new URLSearchParams(location.search).get("scene");
scenario.value = requestedScene === "reference" || requestedScene === "random-crypt" ? requestedScene : "generated";
quality.value = new URLSearchParams(location.search).get("quality") === "reduced" ? "reduced" : "high";
const chooseScenario = () => {
  quality.parentElement!.hidden = scenario.value === "generated";
  if (scenario.value !== "generated") { companionCount.value = "0"; heroBuild.value = "warrior"; }
  updateEquipment(); renderHeroAttributes();
};
scenario.addEventListener("change", chooseScenario);
chooseScenario();
updateEquipment();

async function boot(): Promise<void> {
  await loadSkeletonAssets().catch(error => console.warn("Skeleton bones fall back to primitives:", error));
  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 1.5));
  const hover = new EnemyHover();
  let hoverPointer: { clientX:number; clientY:number } | null = null;
  let scene: Scene | null = null, run: DungeonRun | null = null, camera: FreeCamera | null = null;
  let lighting: DungeonLighting | null = null, paused = false, zoom = 10, seed = 0, selectedBuild = "default", companions: string[] = [];
  let selectedEquipment: GolemSetup | undefined;
  let selectedScenario: DungeonScenario = "generated";
  let cryptPlan: CryptRoomPlan | undefined;
  let reference = false, selectedQuality: ReferenceQuality = "high";
  let referenceLook: Awaited<ReturnType<typeof dressReference>> | null = null;
  let route: LinesMesh | null = null, routeSignature = "", lastUi = 0;
  const held = new Set<string>();
  const audio = new GameAudio(true);
  let soundTorches: ReturnType<typeof torchPlacements> = [];
  const probe = lookProbe(engine, () => scene && lighting ? { scene, lighting } : null);
  const meterElement = need("frame-meter");
  const diagnostics = document.createElement("details"), summary = document.createElement("summary");
  summary.textContent = "Performance"; diagnostics.append(summary);
  const meterParent = meterElement.parentElement!;
  const meter = frameMeter(engine, meterElement);
  const abort = new AbortController(), signal = abort.signal;
  const setPaused = (value: boolean) => {
    if (!run || !scene) return;
    if (run.status !== "playing") value = true;
    paused = value; audio.setActive(!value && run.status === "playing"); scene.physicsEnabled = !value && run.status === "playing";
    held.clear(); run.commands.right = run.commands.up = 0; run.commands.cancelPointer();
    need("pause-panel").hidden = !value;
    need("pause-title").textContent = run.status === "won" ? "You escaped." : run.status === "dead"
      ? run.party.length > 1 ? "Your party has fallen." : "Your hero has fallen." : "Paused";
    need("pause-copy").textContent = run.status === "playing" ? "Your run is frozen. Wheel zoom remains available." : `Seed ${seed} · ${Math.floor(run.clock)} seconds in the depths.`;
    need("resume").hidden = run.status !== "playing";
    need("pause-button").textContent = value ? "Resume · Esc" : "Pause · Esc";
  };
  const framing = () => {
    if (!run || !camera || !lighting) return;
    const hero = run.leader.body.feetPosition();
    // Keep the composed room view when wide; centre the leader for close inspection.
    const follow = .4 + .6 * Math.max(0, Math.min(1, (6.5 - zoom) / 3.5));
    const centre=cryptPlan?{x:(cryptPlan.bounds.min.x+cryptPlan.bounds.max.x)/2,z:(cryptPlan.bounds.min.z+cryptPlan.bounds.max.z)/2}:{x:9.5,z:9};
    frameDungeon(camera, reference && !cryptPlan ? { x: centre.x + (hero.x - centre.x) * follow, z: centre.z + (hero.z - centre.z) * follow } : hero, zoom, engine.getRenderWidth() / engine.getRenderHeight(), pitch, azimuth);
    lighting.update(hero, zoom, pitch, toward); run.world.setHero(hero);
  };
  const rebuild = async (nextSeed: number) => {
    audio.reset(); soundTorches = [];
    hover.dispose(); hoverPointer=null; referenceLook?.dispose(); referenceLook = null; lighting?.dispose(); lighting = null; run?.dispose(); run = null; scene?.dispose(); scene = null; route = null; routeSignature = "";
    seed = nextSeed >>> 0;
    cryptPlan = selectedScenario === "random-crypt" ? generateCryptDungeon(seed) : undefined;
    if (reference) { meterParent.prepend(diagnostics); diagnostics.append(meterElement); }
    else { meterParent.prepend(meterElement); diagnostics.remove(); }
    pitch = Number.isFinite(pitchQuery) && pitchQuery > 0 ? Math.max(25, Math.min(65, pitchQuery)) * Math.PI / 180 : reference ? REFERENCE_CAMERA.pitch : CAMERA_PITCH;
    azimuth = Number.isFinite(azimuthQuery) ? azimuthQuery * Math.PI / 180 : reference ? REFERENCE_CAMERA.azimuth : CAMERA_AZIMUTH;
    toward = cameraToward(azimuth); zoom = reference ? REFERENCE_CAMERA.zoom : 10;
    if (cryptPlan) zoom = 8; // Follow exploration at room scale, rather than fitting the entire dungeon.
    engine.setHardwareScalingLevel(reference ? selectedQuality === "reduced" ? 1.4 : 1 : 1 / Math.min(devicePixelRatio, 1.5));
    scene = new Scene(engine);
    attachPhysics(scene, havok); scene.physicsEnabled = false; scene.getPhysicsEngine()!.setSubTimeStep(1000 / CONFIG.world.physicsHz);
    scene.preventDefaultOnPointerDown = scene.preventDefaultOnPointerUp = false;
    camera = new FreeCamera("dungeon camera", new Vector3(0, 20, 0), scene); camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    camera.minZ = 0.1; camera.maxZ = 160;
    await loadWorkshopAssets(scene);
    run = new DungeonRun(scene, seed, selectedBuild, { ...dungeonStone(scene, stone.floor, stone.wall), masonry: reference ? false : stone.masonry }, cryptPlan?.map ?? (reference ? referenceChamber(seed) : undefined), selectedEquipment, companions, reference ? () => "skeleton-warrior" : undefined, (attacker, event) => {
      if (!run || !run.visible.has(cellKey(run.map, event.report.point))) return;
      const target = run.actors.find(a => a.id === event.report.targetId);
      if (target) audio.report(event, attacker, bodyFamily(target === run.hero && selectedEquipment ? selectedEquipment : namedBuild(target.name)!.setup));
    }); run.commands.setMode({ keyboard: keyboard.checked, facing: facing.checked });
    run.pitch = pitch; run.toward = toward;
    // After the run, so that no torch mesh is counted among a golem's own (`DungeonActor.meshes`). The look is page
    // code no Node test loads, so the rule that it adds no body is held here, where it runs.
    const bodies = () => scene!.meshes.filter(m => m.physicsBody).length, before = bodies();
    const torches = cryptPlan?.torches ?? (reference ? [...REFERENCE_TORCHES] : torchPlacements(run.map, seed)); soundTorches = torches;
    lighting = lightDungeon(scene, camera, run.map, torches, azimuth, reference ? REFERENCE_LIGHT : undefined); run.world.sconces(torches);
    if (!reference && stone.dressing) run.world.dress(dressingPlacements(run.map, seed, DRESSING, toward));
    if (reference) {
      referenceLook = await dressReference(scene, run.world, selectedQuality, azimuth, cryptPlan);
      if (selectedQuality === "reduced") lighting.setLook({ ssao: false });
    }
    if (bodies() !== before) throw new Error(`The dungeon's look added ${bodies() - before} physics bodies; cosmetics carry none.`);
    scene.onBeforePhysicsObservable.add(() => {
      if (!run || paused) return;
      run.step(1 / CONFIG.world.physicsHz);
      if (run.status !== "playing") setPaused(true);
    });
    meter.watch(scene);
    need("start-panel").hidden = true; need("seed-label").textContent = `SEED ${seed}`;
    need("hero-name").textContent = selectedBuild.replaceAll("-", " ");
    // From the body that was built, not from the dialog, so the line is what is walking about.
    need("hero-attributes-line").textContent = describeAttributes(run.hero.body.attributes);
    partyRows();
    setPaused(false); framing(); run.present(); lighting.refreshFog(run.explored); scene.render(); canvas.focus();
    Object.assign(window, { __dungeon: { get run() { return run; }, get scene() { return scene; }, get camera() { return camera; },
      get lighting() { return lighting; }, look: probe, engine } });
  };
  let launching=false;
  const launch = async (nextSeed: number) => {
    if(launching)return;
    launching=true;start.disabled=true;
    try { await rebuild(nextSeed); }
    catch (error) {
      audio.setActive(false);
      hover.dispose(); hoverPointer=null; referenceLook?.dispose(); referenceLook = null; lighting?.dispose(); lighting = null; run?.dispose(); run = null; scene?.dispose(); scene = null;
      need("start-panel").hidden = false; need("pause-panel").hidden = true;
      need("notice").textContent = `Could not build this dungeon: ${String(error)}`; console.error(error);
    } finally { launching=false;start.disabled=false; }
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
    selectedScenario = scenario.value as DungeonScenario; reference = selectedScenario !== "generated"; selectedQuality = quality.value === "reduced" ? "reduced" : "high";
    const url = new URL(location.href);
    if (reference) { url.searchParams.set("scene", selectedScenario); url.searchParams.set("quality", selectedQuality); }
    else { url.searchParams.delete("scene"); url.searchParams.delete("quality"); }
    history.replaceState(null, "", url);
    companions = companionBuilds(selectedBuild, Number(companionCount.value));
    const arm = heroArming();
    selectedEquipment = arm ? arm(heroPrimary.value, heroSecondary.value) : undefined;
    if(selectedEquipment && heroSetup()?.human) selectedEquipment.human={model:heroSetup()!.human!.model,
      boots:workshopAppearance.querySelector<HTMLInputElement>('[data-workshop="boots"]')!.checked,
      armour:workshopAppearance.querySelector<HTMLInputElement>('[data-workshop="armour"]')!.checked};
    // A hero somebody tuned is handed over as a whole setup; one nobody tuned goes the way it always
    // did, so a default run is the run it was.
    const base = selectedEquipment ?? heroSetup();
    const kept = base ? withoutFixedAttributes(heroAttributes, base) ?? {} : {};
    if (base && Object.keys(kept).length > 0) selectedEquipment = withAttributeSetting(base, kept);
    // Named here rather than thrown by the body's constructor from inside the run.
    const refused = selectedEquipment ? golemSetupRefusal(selectedEquipment) : null;
    if (refused) { need("notice").textContent = `This hero cannot be built: ${refused}.`; return; }
    launch(Number(seedInput.value));
  }, { signal });
  seedInput.addEventListener("input", () => seedInput.setCustomValidity(""), { signal });
  need("pause-button").addEventListener("click", () => setPaused(!paused), { signal });
  need("resume").addEventListener("click", () => setPaused(false), { signal });
  need("retry").addEventListener("click", () => launch(seed), { signal });
  need("new-run").addEventListener("click", () => launch(randomSeed()), { signal });
  const toggleHelp = () => { const panel = need("help"); panel.hidden = !panel.hidden; need("help-button").setAttribute("aria-expanded", String(!panel.hidden)); if (!panel.hidden) setPaused(true); };
  need("help-button").addEventListener("click", toggleHelp, { signal }); need("close-help").addEventListener("click", toggleHelp, { signal });
  // One row per party member, built once a run; `partyStatus` refreshes them. A row is a button: a
  // click selects that member alone and Shift adds it, as a click on its body does.
  const partyRows = () => {
    if (!run) return;
    partyList.replaceChildren(...run.party.map((member, i) => {
      const row = document.createElement("li"), button = document.createElement("button");
      button.type = "button"; button.dataset.member = member.id;
      button.innerHTML = `<kbd>${i + 1}</kbd><span>${member.name.replaceAll("-", " ")} <small></small></span><progress max="1" value="1"></progress>`;
      row.append(button); return row;
    }));
  };
  const partyStatus = () => {
    if (!run) return;
    for (const button of partyList.querySelectorAll<HTMLButtonElement>("button[data-member]")) {
      const member = run.party.find(m => m.id === button.dataset.member); if (!member) continue;
      button.setAttribute("aria-pressed", String(run.selected.has(member.id)));
      button.classList.toggle("fallen", !member.body.alive);
      button.querySelector("progress")!.value = member.body.vitality;
      button.querySelector("small")!.textContent = member.body.alive ? `· ${orderLabel(member.order, member.post, member === run.hero)}` : "· fallen";
    }
  };
  const selectMember = (id: string, add: boolean) => {
    if (!run) return;
    run.select(add ? [...run.selected, id] : [id]); partyStatus();
  };
  partyList.addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-member]");
    if (!button?.dataset.member) return;
    selectMember(button.dataset.member, event.shiftKey);
    // A focused button takes Space, which pauses here, as a second press.
    button.blur(); canvas.focus();
  }, { signal });
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
    const digit = /^Digit([0-9])$/.exec(event.code);
    if (digit && !event.repeat) {
      const index = Number(digit[1]);
      if (index === 0) { run.select(null); partyStatus(); }
      else if (run.party[index - 1]) selectMember(run.party[index - 1].id, event.shiftKey);
      return;
    }
    if (event.code === "KeyF" && !event.repeat) { run.regroup(); partyStatus(); return; }
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
    // A click on a party member selects it, and is not an order.
    const friend = scene.pick(p.x, p.y, mesh => run!.memberAt(mesh) !== null, false, camera!);
    const member = friend?.pickedMesh ? run.memberAt(friend.pickedMesh) : null;
    if (member) { selectMember(member.id, event.shiftKey); return; }
    const picked = scene.pick(p.x, p.y, mesh => run!.targetAt(mesh) !== null, false, camera!);
    const target = picked?.pickedMesh ? run.targetAt(picked.pickedMesh) : null;
    if (!target && !run.explored.has(cellKey(run.map, p.ground))) return;
    run.commands.down(p.screen, p.ground, target?.id ?? null); canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener("pointermove", event => {
    hoverPointer={clientX:event.clientX,clientY:event.clientY};
    if (paused || !run || !scene) return;
    const p = pointer(event); if (!(event.buttons & 1)) run.commands.cancelPointer();
    run.commands.move(p.screen, p.ground);
  }, { signal });
  canvas.addEventListener("pointerleave", () => { hoverPointer=null; hover.clear(); }, { signal });
  window.addEventListener("blur", () => { hoverPointer=null; hover.clear(); }, { signal });
  canvas.addEventListener("pointerup", event => {
    if (event.button !== 0 || !run) return;
    run.commands.upPointer(); if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener("pointercancel", () => run?.commands.cancelPointer(), { signal });
  canvas.addEventListener("lostpointercapture", () => run?.commands.cancelPointer(), { signal });
  canvas.addEventListener("wheel", event => { event.preventDefault(); zoom = Math.max(2, Math.min(18, zoom * Math.exp(event.deltaY * 0.001))); }, { passive: false, signal });
  window.addEventListener("resize", () => engine.resize(), { signal });
  engine.runRenderLoop(() => meter.frame(() => {
    if (!scene || !run || launching) return;
    framing();
    audio.setView(run.leader.body.feetPosition(), toward, soundTorches.filter(t => run!.visible.has(cellKey(run!.map, { x: t.cell.x + t.facing.x, z: t.cell.z + t.facing.z }))).map(t => t.flame));
    audio.update();
    if (performance.now() - lastUi > 100) {
      lastUi = performance.now(); run.present(); lighting?.refreshFog(run.explored);
      need<HTMLProgressElement>("hero-hp").value = run.hero.body.vitality;
      need("hp-label").textContent = `${Math.ceil(run.hero.body.vitality * 100)}% HP`;
      partyStatus();
      const target = run.leader.target; need("target-panel").hidden = !target || !target.body.alive;
      if (target) { need("target-name").textContent = target.name.replaceAll("-", " "); need<HTMLProgressElement>("target-hp").value = target.body.vitality; }
      need("notice").textContent = run.notice;
      // Every standing member's route, from its feet: the rest of a drawn route after the point it is on.
      const walks = run.party.filter(m => m.body.alive).map(m => {
        const order = m.order;
        return { force: order.kind === "force", from: m.body.feetPosition(),
          points: (order.kind === "force" ? [...m.route, ...order.points.slice(m.next + 1)] : m.route) as Point[] };
      }).filter(walk => walk.points.length);
      const signature = JSON.stringify(walks.map(w => [w.force, w.points]));
      if (signature !== routeSignature) {
        route?.dispose(); route = null; routeSignature = signature;
        if (walks.length) {
          const cool = Color3.FromHexString("#70d8e0"), warm = Color3.FromHexString("#dec693");
          const lines = walks.map(w => [new Vector3(w.from.x, 0.06, w.from.z), ...w.points.map(p => new Vector3(p.x, 0.06, p.z))]);
          route = MeshBuilder.CreateLineSystem("movement route", { lines,
            colors: walks.map((w, i) => lines[i].map(() => (w.force ? cool : warm).toColor4())) }, scene);
          route.isPickable = false;
        }
      }
    }
    if(hoverPointer && document.elementFromPoint(hoverPointer.clientX,hoverPointer.clientY)===canvas){
      const rect=canvas.getBoundingClientRect();
      const p=pickingCoordinates(hoverPointer.clientX,hoverPointer.clientY,rect,engine.getRenderWidth(),engine.getRenderHeight(),engine.getHardwareScalingLevel());
      const hit=scene.pick(p.x,p.y,m=>m.isVisible&&run!.targetAt(m)!==null,false,camera!);
      hover.show(hit?.pickedMesh?run.targetAt(hit.pickedMesh):null);
    }else hover.clear();
    scene.render();
  }));
  const dispose = () => {
    audio.dispose(); abort.abort(); engine.stopRenderLoop(); hover.dispose(); hoverPointer=null; referenceLook?.dispose(); referenceLook = null; lighting?.dispose(); lighting = null; run?.dispose(); run = null; scene?.dispose(); scene = null; engine.dispose();
  };
  window.addEventListener("pagehide", dispose, { once: true, signal });
  import.meta.hot?.dispose(dispose);
  need("notice").textContent = "Choose your golem and enter the depths.";
}
/** Called by `src/app.ts` after the dungeon's screen is mounted: this module's top level reads it. */
export function bootDungeon(): Promise<void> {
  return boot().catch(error => { need("notice").textContent = `Dungeon could not start: ${String(error)}`; start.textContent = "Unable to start"; console.error(error); });
}
