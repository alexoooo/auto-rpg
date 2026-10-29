/** Plays a recorded hand-off trial: the body built as the trial built it (never stepped), each frame's segment transforms put on it. */
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { createWorld } from "../../../../src/core/world.ts";
import { loadEngine } from "../../../../src/core/engine/engines.ts";
import { buildBody } from "../../../../src/core/build/build-body.ts";
import { drawBody } from "../../../../src/render/body-shapes.ts";
import { variantSpec } from "../../bodies.mjs";

type Frame = { toes?: number[]; t: number; phase: string; feet: number; flat: string; h: number; parts: Record<string, number[]> };
const $ = (id: string) => document.getElementById(id) as HTMLElement & HTMLInputElement & HTMLSelectElement;
const canvas = $("c") as unknown as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.11, 0.13, 0.15, 1);
const camera = new ArcRotateCamera("cam", -Math.PI / 2.4, 1.2, 2.6, new Vector3(0, 0.35, 0), scene);
camera.attachControl(canvas, true); (window as any).cam = camera; (window as any).rec = () => frames; (window as any).scene = scene; (window as any).at = (i: number) => { at = i; playing = false; show(i); return frames[i]?.t; }; camera.wheelPrecision = 80; camera.minZ = 0.01;
new HemisphericLight("sky", new Vector3(0, 1, 0), scene).intensity = 0.8;
new DirectionalLight("sun", new Vector3(-0.5, -1, 0.3), scene).intensity = 0.5;
const ground = MeshBuilder.CreateGround("ground", { width: 6, height: 6, subdivisions: 24 }, scene);
const gm = new StandardMaterial("g", scene); gm.diffuseColor = new Color3(0.32, 0.34, 0.36); gm.wireframe = false; ground.material = gm;
const grid = MeshBuilder.CreateGround("grid", { width: 6, height: 6, subdivisions: 30 }, scene);
const gw = new StandardMaterial("gw", scene); gw.wireframe = true; gw.emissiveColor = new Color3(0.45, 0.47, 0.5); gw.disableLighting = true; grid.material = gw; grid.position.y = 0.001;

const world = createWorld(scene, await loadEngine("rapier"));
let built: ReturnType<typeof buildBody> | null = null, frames: Frame[] = [], at = 0, playing = true;

async function load(file: string) {
  const record = await (await fetch(`./${file}`)).json();
  if (!built) { built = buildBody(variantSpec(record.model, record.variant), world, { position: [0, 0, 0] }); drawBody(built, scene, new Color3(0.62, 0.66, 0.72)); }
  frames = record.frames; at = 0;
  $("label").textContent = `${record.label} · ankle ${record.variant} · ${frames.length} frames over ${frames.at(-1)!.t.toFixed(2)} s`;
  $("scrub").max = String(frames.length - 1);
  show(0); sideOn();
}
function show(i: number) {
  const f = frames[i]; if (!f || !built) return;
  for (const [name, v] of Object.entries(f.parts)) {
    const s = built.segments.get(name); if (!s) continue;
    s.node.position.set(v[0]!, v[1]!, v[2]!);
    (s.node.rotationQuaternion ??= new Quaternion()).set(v[3]!, v[4]!, v[5]!, v[6]!);
  }
  // The toes as the trial had them: the drawn foot follows its rigid body's shapes.
  (["left", "right"] as const).forEach((side, k) => { const t = built!.toes[`foot.${side}`], r = f.toes?.[k];
    if (t && r !== undefined) t.bend = r; });
  const pelvis = f.parts["lowerTrunk"]; if (pelvis) camera.target.set(pelvis[0]!, 0.35, pelvis[2]!);
  $("scrub").value = String(i);
  $("read").textContent = `t ${f.t.toFixed(2)} s   phase ${f.phase}\nfeet carry ${(f.feet * 100).toFixed(0)}% of the weight   soles flat ${f.flat === "11" ? "both" : f.flat === "00" ? "neither" : "one"}\nheight ${(f.h * 100).toFixed(0)}% of standing`;
}
/** Looks at the body side on: across the line from its feet to its hands, read from the first frame. */
function sideOn() {
  const f = frames[0]; if (!f) return;
  const mid = (a: string, b: string) => [(f.parts[a]![0]! + f.parts[b]![0]!) / 2, (f.parts[a]![2]! + f.parts[b]![2]!) / 2];
  const [fx, fz] = mid("foot.left", "foot.right"), [hx, hz] = mid("hand.left", "hand.right");
  camera.alpha = Math.atan2(hz - fz, hx - fx) - Math.PI / 2; camera.beta = 1.35; camera.radius = 2.4;
}
$("side").onclick = sideOn;
$("run").onchange = () => { location.search = `?run=${encodeURIComponent($("run").value)}`; };
$("play").onclick = () => { playing = !playing; $("play").textContent = playing ? "Pause" : "Play"; };
$("scrub").oninput = () => { playing = false; $("play").textContent = "Play"; at = Number($("scrub").value); show(at); };
let clock = 0;
engine.runRenderLoop(() => {
  if (playing && frames.length) {
    clock += engine.getDeltaTime() / 1000 * Number($("speed").value);
    while (at < frames.length - 1 && frames[at + 1]!.t - frames[0]!.t <= clock) at++;
    if (at >= frames.length - 1) { at = 0; clock = 0; }
    show(at);
  }
  scene.render();
});
addEventListener("resize", () => engine.resize());
const asked = new URLSearchParams(location.search).get("run");
if (asked) $("run").value = asked;
await load($("run").value);
