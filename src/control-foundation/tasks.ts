import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { isEngineName, loadEngine } from "../core/engine/engines.ts";
import { BODY_MODELS, type BodyModel } from "../core/human/spec.ts";
import { createBarProbe } from "../core/tasks/bar.ts";
import { createSupportProbe } from "../core/tasks/support.ts";
import { createSupportEntryProbe } from "../core/tasks/support-entry.ts";
import { createPostureHoldProbe } from "../core/tasks/posture-hold.ts";
import { createPointStrikeProbe } from "../core/tasks/point-strike.ts";
import { createDefenseProbe } from "../core/tasks/defense.ts";
import { loadState, saveState } from "../core/state.ts";
import { drawBody, drawEquipment } from "../render/body-shapes.ts";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>("view"), renderer = new Engine(canvas, true), scene = new Scene(renderer);
scene.clearColor = new Color4(0.07, 0.1, 0.13, 1);
const camera = new ArcRotateCamera("camera", Math.PI / 3, Math.PI / 2.4, 3.6, new Vector3(0, 0.95, 0.15), scene);
camera.attachControl(canvas, true); camera.lowerRadiusLimit = 1; camera.upperRadiusLimit = 8; camera.wheelPrecision = 60;
new HemisphericLight("light", new Vector3(0.4, 1, 0.2), scene);
const query = new URLSearchParams(location.search), engineName = query.get("engine") ?? "rapier";
if (!isEngineName(engineName)) throw new Error("Unknown physical configuration");
const engine = await loadEngine(engineName);
const physics = element<HTMLSelectElement>("engine"); physics.value = engineName;
const task = element<HTMLSelectElement>("task"), model = element<HTMLSelectElement>("model"), side = element<HTMLSelectElement>("side");
const support = element<HTMLSelectElement>("support"), seed = element<HTMLInputElement>("seed");
const held = element<HTMLSelectElement>("held"), target = element<HTMLSelectElement>("target");
const release = element<HTMLSelectElement>("release");
const motion = element<HTMLSelectElement>("motion");
const defense = element<HTMLSelectElement>("defense"), stops = element<HTMLSelectElement>("stops");
const balance = element<HTMLSelectElement>("balance"), continuation = element<HTMLSelectElement>("continuation");
const posture = element<HTMLSelectElement>("posture"), servo = element<HTMLSelectElement>("servo"), direction = element<HTMLSelectElement>("direction");
for (const select of [task, model, side, support, held, target, motion, balance, continuation, defense, release, stops, posture, servo, direction]) {
  const value = query.get(select.id);
  if (value && [...select.options].some((o) => o.value === value)) select.value = value;
}
if (query.has("seed")) seed.value = query.get("seed")!;

function make() {
  if (task.value === "support" || task.value === "posture-hold" || task.value === "support-entry") stops.value = "off";
  if (task.value === "posture-hold" || task.value === "support-entry") model.value = "workshop-fighter";
  if (task.value === "point-strike" && held.value === "shared") side.value = "both";
  const chosen = model.value as BodyModel, selectedSide = side.value, selectedSupport = support.value, number = Number(seed.value);
  if (!BODY_MODELS.includes(chosen) || (selectedSide !== "left" && selectedSide !== "right" && selectedSide !== "both")
    || (selectedSupport !== "standing" && selectedSupport !== "pinned") || !Number.isInteger(number) || number < 0 || number >= 1000000) throw new Error("Invalid development configuration");
  const fraction = (((number + 1) * 2654435761) >>> 0) / 4294967296;
  const common = { model: chosen, hz: 120, actuation: "directional" as const, ...(stops.value === "on" ? { jointStops: true } : {}) };
  let probe: ReturnType<typeof createBarProbe> | ReturnType<typeof createSupportProbe> | ReturnType<typeof createPointStrikeProbe> | ReturnType<typeof createDefenseProbe> | ReturnType<typeof createPostureHoldProbe> | ReturnType<typeof createSupportEntryProbe>;
  switch (task.value) {
    case "support-entry": {
      const chosenDirection = Number(direction.value);
      if (chosenDirection !== 0 && chosenDirection !== 1 && chosenDirection !== 2 && chosenDirection !== 3) throw new Error("Unknown shove direction");
      probe = createSupportEntryProbe(scene, engine, { ...common, direction: chosenDirection });
      camera.target.set(...probe.body.observe().centre);
      break;
    }
    case "posture-hold": {
      const installed = posture.value;
      if (installed !== "fours" && installed !== "half-kneel" && installed !== "squat") throw new Error("Unknown installed posture");
      probe = createPostureHoldProbe(scene, engine, { ...common, posture: installed, servoSeconds: Number(servo.value), speed: 10, activation: 1 });
      camera.target.set(...probe.body.observe().centre);
      break;
    }
    case "defense": {
      const item = held.value, variant = defense.value;
      if ((item !== "empty" && item !== "club") || (variant !== "predict" && variant !== "pose")) throw new Error("Invalid defense configuration");
      probe = createDefenseProbe(scene, engine, { ...common, hands: selectedSide, held: item, variant,
        offset: (fraction * 2 - 1) * 0.04, angleOffset: (fraction * 2 - 1) * 0.1 }); break;
    }
    case "point-strike": {
      const item = held.value;
      const released = release.value;
      if ((item !== "empty" && item !== "club" && item !== "shared") || !["none", "left", "right"].includes(released)) throw new Error("Invalid strike equipment");
      probe = createPointStrikeProbe(scene, engine, { ...common, hands: selectedSide, held: item === "shared" ? "club" : item,
        ...(item === "shared" ? { shared: released === "left" || released === "right" ? { release: released } : {} } : {}),
        miss: target.value === "miss", offset: (fraction * 2 - 1) * 0.002,
        centreControl: balance.value === "centre", continueSeconds: Number(continuation.value),
        ...(motion.value !== "static" ? { swing: { angle: (fraction * 2 - 1) * 0.12, speed: 0.7, delay: 3,
          tracking: motion.value === "tracked", braking: true } } : {}) });
      break;
    }
    case "bar":
      if (selectedSide === "both") throw new Error("Choose one release hand");
      probe = createBarProbe(scene, engine, { ...common, release: selectedSide, offset: (fraction * 2 - 1) * 0.005, support: selectedSupport }); break;
    case "support":
      if (selectedSide === "both") throw new Error("Choose one moving foot");
      probe = createSupportProbe(scene, engine, { ...common, side: selectedSide, liftOffset: (fraction * 2 - 1) * 0.002 }); break;
    default: throw new Error("Unknown physical task");
  }
  const shapes = [drawBody(probe.built, scene, new Color3(0.42, 0.68, 0.72))];
  if ("item" in probe) shapes.push(drawEquipment(probe.item, scene));
  if ("items" in probe) for (const item of probe.items) shapes.push(drawEquipment(item, scene));
  if ("incoming" in probe) for (const item of probe.incoming) shapes.push(drawEquipment(item, scene));
  const geometry = "geometry" in probe ? probe.geometry : { floor: probe.configuration.settings.floor, obstacle: null };
  const blocks = [{ name: "floor", box: geometry.floor }, ...("obstacles" in geometry ? geometry.obstacles : "obstacle" in geometry && geometry.obstacle ? [geometry.obstacle] : [])
    .map((box, i) => ({ name: `obstacle-${i}`, box }))];
  const ground = new StandardMaterial("ground", scene); ground.diffuseColor = new Color3(0.15, 0.2, 0.23);
  const obstacle = new StandardMaterial("obstacle", scene); obstacle.diffuseColor = new Color3(0.75, 0.4, 0.2);
  const boxes = blocks.flatMap(({ name, box }) => {
    if (!box) return [];
    const mesh = MeshBuilder.CreateBox(name, { width: box.size[0], height: box.size[1], depth: box.size[2] }, scene);
    mesh.position.set(box.centre[0]!, box.centre[1]!, box.centre[2]!); mesh.material = name === "floor" ? ground : obstacle;
    return [mesh];
  });
  if ("targets" in probe) for (const rig of probe.targets) {
    const mesh = MeshBuilder.CreateBox("swing-target", { width: rig.size[0], height: rig.size[1], depth: rig.size[2] }, scene);
    mesh.parent = rig.body.node; mesh.material = obstacle; boxes.push(mesh);
  }
  return { probe, dispose() { shapes.forEach((s) => s.dispose()); boxes.forEach((b) => b.dispose(false, false)); ground.dispose(); obstacle.dispose(); probe.dispose(); } };
}

let live = make(), playing = false, busy = false;
const state = () => ({ world: live.probe.world.state, ...live.probe.state });
const save = () => ({ physics: live.probe.world.physics.save(), state: saveState(state()) });
let saved: ReturnType<typeof save> | null = null;
const restore = (snapshot: ReturnType<typeof save>) => { live.probe.world.physics.load(snapshot.physics); loadState(state(), snapshot.state); };
const ended = () => live.probe.configuration.task === "support-entry" ? live.probe.complete : live.probe.complete || live.probe.world.steps >= 120 * ("continueSeconds" in live.probe.configuration.settings
  ? 7 + live.probe.configuration.settings.continueSeconds : 12);
function show() {
  const p = live.probe, r = p.observe().task;
  element("status").textContent = "acquiredAt" in r ? p.complete ? r.success ? "Entry passed" : "Entry failed" : "Acquiring support" : "fell" in r && r.fell ? "Fell" : p.complete ? "success" in r ? r.success ? "Hold passed" : "Hold failed" : "Task complete" : ended() ? "Time limit" : p.world.steps ? "In progress" : "Ready";
  element("steps").textContent = String("steps" in r ? r.steps : p.world.steps);
  element("phase").textContent = "acquiredAt" in r ? r.acquiredAt < 0 ? "Acquire" : "Hold" : "peakDrift" in r ? "Hold" : "phase" in r ? r.phase : r.captured < 0 ? "Capture" : r.released ? "Return" : "Shared motion";
  element("error-label").textContent = "peakDrift" in r ? "Maximum segment drift" : "guards" in r ? "Protected-region impulse" : "Return error";
  element("error").textContent = "guards" in r ? `${r.protectedImpulse.toFixed(3)} N·s`
    : `${(100 * ("peakDrift" in r ? r.peakDrift : "strikes" in r ? Math.max(...r.strikes.map((s) => s.returnError)) : "returnError" in r ? r.returnError : r.finalError)).toFixed(3)} cm`;
  element("rejected").textContent = "rejectedSteps" in r ? String(r.rejectedSteps) : "—";
  element("contacts").textContent = "guards" in r ? String(r.guards.reduce((sum, g) => sum + g.qualifyingContacts, 0))
    : "supportedSteps" in r ? String(r.supportedSteps) : "strikes" in r ? String(r.strikes.reduce((sum, s) => sum + s.contacts, 0)) : "contactSteps" in r ? String(r.contactSteps) : "—";
  element("result").textContent = JSON.stringify({ configuration: p.configuration, outcome: r }, null, 2);
  element("side-label").textContent = task.value === "defense" ? "Defending hands" : task.value === "point-strike" ? "Striking hands" : task.value === "bar" ? "Released hand" : "Moving foot";
  element("description").textContent = task.value === "support-entry" ? "Acquire hand-and-shin support after a shove, settle for two seconds, then hold for ten seconds within 2 cm. Head or trunk support fails. Kneeling and standing are not tested."
    : task.value === "posture-hold" ? "Hold an installed Warrior pose for ten seconds using independent joint feedback. Pass: every segment stays within 2 cm. Entry and recovery are not tested."
    : task.value === "bar" ? "Capture, move and swing one shared item against an obstacle, release either hand, and return."
    : task.value === "defense" ? "Prepare, intercept gravity-driven clubs, and sustain defense. Head and upper-trunk contact is scored separately from blocks."
    : task.value === "point-strike" ? "Prepare a guard, strike with either hand, independent items or one shared item, and return after contact or a miss."
      : "Shift weight, lift either foot, verify placement contact, and regain two-foot support.";
  for (const control of document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button, input, select")) control.disabled = busy;
  stops.disabled = busy || task.value === "support" || task.value === "posture-hold" || task.value === "support-entry";
  direction.disabled = busy || task.value !== "support-entry";
  posture.disabled = servo.disabled = busy || task.value !== "posture-hold";
  model.disabled = seed.disabled = busy || task.value === "posture-hold" || task.value === "support-entry";
  support.disabled = busy || task.value !== "bar";
  held.disabled = busy || (task.value !== "point-strike" && task.value !== "defense");
  held.querySelector<HTMLOptionElement>('option[value="shared"]')!.disabled = task.value !== "point-strike";
  release.disabled = busy || task.value !== "point-strike" || held.value !== "shared";
  side.disabled = busy || task.value === "posture-hold" || task.value === "support-entry" || (task.value === "point-strike" && held.value === "shared");
  defense.disabled = busy || task.value !== "defense";
  target.disabled = motion.disabled = busy || task.value !== "point-strike";
  balance.disabled = continuation.disabled = busy || task.value !== "point-strike";
  side.querySelector<HTMLOptionElement>('option[value="both"]')!.disabled = task.value !== "point-strike" && task.value !== "defense";
  for (const id of ["step", "run", "play"]) element<HTMLButtonElement>(id).disabled = busy || ended();
  element<HTMLButtonElement>("load").disabled = busy || saved === null;
  element("play").textContent = playing ? "Pause" : "Play";
}
function restart() {
  playing = false;
  const next = make(); live.dispose(); live = next; saved = null; element("verification").textContent = ""; show();
}
async function run(trace?: string[]) {
  playing = false;
  while (!ended()) {
    for (let i = 0; i < 24 && !ended(); i++) { live.probe.world.step(); trace?.push(JSON.stringify(live.probe.body.observe())); }
    show(); await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");
async function verify() {
  restart(); live.probe.world.step(live.probe.configuration.task === "point-strike" ? 60 : live.probe.configuration.task === "point-defense" ? 300 : 240);
  const checkpoint = save(), first: string[] = [], second: string[] = [];
  await run(first); const expectedState = JSON.stringify(saveState(state()));
  restore(checkpoint); await run(second);
  const hash = await digest(second.join(""));
  const exact = first.join("") === second.join("") && JSON.stringify(saveState(state())) === expectedState;
  element("verification").textContent = `${exact ? "Replay matched" : "Replay differed"} · Observation SHA256 ${hash}`;
}
const actions: Record<string, () => void | Promise<void>> = {
  reset: restart, play: () => { playing = !playing; }, step: () => { playing = false; if (!ended()) live.probe.world.step(); },
  run: () => run(), save: () => { playing = false; saved = save(); }, load: () => { playing = false; if (saved) restore(saved); }, verify,
};
for (const [id, action] of Object.entries(actions)) element<HTMLButtonElement>(id).addEventListener("click", async (event) => {
  if (busy) return;
  (event.currentTarget as HTMLButtonElement).blur(); busy = true; show();
  try { await action(); } catch (error) { playing = false; element("verification").textContent = String(error); }
  finally { busy = false; show(); }
});
const inputs = [task, model, side, support, seed, held, target, motion, balance, continuation, defense, release, stops, posture, servo, direction];
physics.addEventListener("change", () => {
  const next = new URLSearchParams(location.search);
  for (const input of [...inputs, physics]) next.set(input.id, input.value);
  location.search = next.toString();
});
for (const input of inputs) input.addEventListener("change", () => {
  if (task.value !== "point-strike" && held.value === "shared") held.value = "club";
  if (task.value !== "point-strike" && task.value !== "defense" && side.value === "both") side.value = "left";
  try { restart(); } catch (error) { element("verification").textContent = String(error); }
});
window.addEventListener("resize", () => renderer.resize());
window.addEventListener("beforeunload", () => { live.dispose(); scene.dispose(); renderer.dispose(); });
show(); renderer.runRenderLoop(() => {
  if (playing && !busy) { live.probe.world.advance(renderer.getDeltaTime() / 1000, 8); if (ended()) playing = false; show(); }
  scene.render();
});
