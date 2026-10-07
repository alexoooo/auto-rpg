import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { loadEngine } from "../core/engine/engines.ts";
import { HUMANOID_MODELS, type HumanoidModel } from "../core/models.ts";
import { createEnvironment } from "../core/tasks/environment.ts";
import { createReachTask, type ReachTaskConfig } from "../core/tasks/reach.ts";
import { reachAction, reachFrame } from "../core/tasks/reach-policy.ts";
import { drawBody } from "../render/body-shapes.ts";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>("view"), renderer = new Engine(canvas, true), scene = new Scene(renderer);
scene.clearColor = new Color4(0.07, 0.1, 0.13, 1);
const camera = new ArcRotateCamera("camera", Math.PI / 3, Math.PI / 2.4, 3.5, new Vector3(0, 0.95, 0), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 1; camera.upperRadiusLimit = 7; camera.wheelPrecision = 60;
new HemisphericLight("light", new Vector3(0.4, 1, 0.2), scene);
const engine = await loadEngine();
const model = element<HTMLSelectElement>("model"), controller = element<HTMLSelectElement>("controller"), seed = element<HTMLInputElement>("seed");

/** The shared runner's reach settings (`docs/reference/control-foundation.md`), not anatomy. */
function configuration(): ReachTaskConfig {
  const chosen = model.value as HumanoidModel, control = controller.value;
  if (!HUMANOID_MODELS.includes(chosen) || (control !== "actuator" && control !== "layered")) throw new Error("unknown body or controller");
  return { model: chosen, controller: control, actuation: "directional", gravity: true, pin: "lowerTrunk",
    channel: "elbow.right flexion", target: [0.5, 0.7], servoSeconds: 0.1, tolerance: 0.025, holdSteps: 120, engineRevision: engine.revision };
}

const makeEnvironment = (config: ReachTaskConfig) => createEnvironment(config, (settings, random) => {
  const task = createReachTask(scene, engine, settings, random), shapes = drawBody(task.body.built, scene, new Color3(0.42, 0.68, 0.72));
  return { ...task, dispose() { shapes.dispose(); task.dispose(); } };
}, { policyPeriodSteps: 4, maxSteps: 360 });

let environment = makeEnvironment(configuration());
let result = environment.reset(Number(seed.value)), frames: string[] = [];
let saved: { simulation: ReturnType<typeof environment.save>; frames: string[] } | null = null;
let busy = false;
const ended = () => result.terminated || result.truncated || result.invalid !== null;
const show = () => {
  element("status").textContent = result.invalid ? `Invalid: ${result.invalid}` : result.terminated ? "Reached and held" : result.truncated ? "Time limit" : result.steps ? "In progress" : "Ready";
  element("steps").textContent = String(result.steps);
  const reading = result.observation, joint = reading?.body.joints.find((j) => j.name === reading.goal.channel);
  element("angle").textContent = reading && joint ? `${joint.angle.toFixed(3)} / ${reading.goal.angle.toFixed(3)}` : "—";
  element("error").textContent = result.metrics.error?.toFixed(5) ?? "—";
  element("held").textContent = `${result.metrics.heldSteps ?? 0} / 120`;
  for (const control of document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button, input, select")) control.disabled = busy;
  for (const id of ["step", "run"]) element<HTMLButtonElement>(id).disabled = busy || ended();
  element<HTMLButtonElement>("load").disabled = busy || saved === null;
};
const step = () => {
  if (ended()) return;
  if (result.decisionDue) environment.act(reachAction(result.observation!, environment.configuration.controller, environment.configuration.servoSeconds, 3));
  result = environment.step(1); frames.push(reachFrame(result));
};
const run = () => { while (!ended()) step(); show(); };
const restart = () => {
  const value = Number(seed.value);
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error("Seed must be a whole number from 0 to 4294967295");
  environment.dispose(); environment = makeEnvironment(configuration()); result = environment.reset(value);
  frames = []; saved = null; element("verification").textContent = ""; show();
};
const digest = async (trace: readonly string[]) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(trace.join("\n")))))
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");
const verify = async () => {
  restart();
  for (let i = 0; i < 14; i++) step();
  const checkpoint = environment.save(), prefix = [...frames];
  run(); const first = await digest(frames);
  result = environment.load(checkpoint); frames = [...prefix];
  run(); const second = await digest(frames);
  element("verification").textContent = `${first === second ? "Replay matched" : "Replay differed"} · Observation SHA256 ${second}`;
};
const actions: Record<string, () => void | Promise<void>> = {
  reset: restart, step: () => { step(); show(); }, run,
  save: () => { saved = { simulation: environment.save(), frames: [...frames] }; show(); },
  load: () => { if (saved) { result = environment.load(saved.simulation); frames = [...saved.frames]; show(); } }, verify,
};
for (const [id, action] of Object.entries(actions)) element<HTMLButtonElement>(id).addEventListener("click", async (event) => {
  if (busy) return;
  (event.currentTarget as HTMLButtonElement).blur();
  busy = true; show();
  try { await action(); }
  catch (error) { element("verification").textContent = String(error); }
  finally { busy = false; show(); }
});
for (const select of [model, controller]) select.addEventListener("change", () => { try { restart(); } catch (error) { element("status").textContent = String(error); } });
window.addEventListener("resize", () => renderer.resize());
window.addEventListener("beforeunload", () => { environment.dispose(); scene.dispose(); renderer.dispose(); });
show(); renderer.runRenderLoop(() => scene.render());
