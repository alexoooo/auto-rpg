/** Which way each hand's palm faces, and the feet's spread, in a placed start: the game's hands-and-knees (`fours`) and the statics' hands-and-toes. */
import "../../../tests/harness/preload-data.mjs";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { buildBody } from "../../../src/core/build/build-body.ts";
import { commandedBody } from "../../../src/core/mind/host.ts";
import { loadEngine } from "../../../src/core/engine/engines.ts";
import { createWorld } from "../../../src/core/world.ts";
import { armedWith } from "../../../src/core/items/held.ts";
import { humanoidSpec } from "../../../src/core/human/spec.ts";
import { placement } from "../../../research/rise-witness.mjs";
import { staticBody, posed, placeLike } from "../../../research/core-posture-trials.mjs";
import { variantSpec, cappedSpec } from "../bodies.mjs";

const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
/** Each hand's frame axes in world, from its rest: which of them points down tells which side of the hand is on the floor. */
function report(label, built) {
  const out = { label };
  for (const side of ["left", "right"]) {
    const s = built.segments.get(`hand.${side}`), turn = s.node.rotationQuaternion.multiply(Quaternion.Inverse(s.rest));
    const axes = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
    out[side] = Object.fromEntries(Object.entries(axes).map(([k, v]) => [k, +v.applyRotationQuaternion(turn).y.toFixed(2)]));
  }
  const l = built.segments.get("foot.left").node.position, r = built.segments.get("foot.right").node.position;
  out.feetApart = +Math.hypot(l.x - r.x, l.z - r.z).toFixed(2);
  console.log(JSON.stringify(out));
}
// Standing: the reference, to read the axes against.
{ const spec = armedWith(humanoidSpec("workshop-fighter"), "right", "empty"); const b = buildBody(spec, world, { position: [3, 0, 0] }); report("standing (reference)", b); }
// The game's hands and knees, as the staged route and the drill place it.
{ const spec = armedWith(humanoidSpec("workshop-fighter"), "right", "empty"); const b = buildBody(spec, world, placement("push-off-bear", spec, 1)); report("game's fours (placed)", b); }
// The statics' hands and toes, start 4, on the 0.8 rad ankle.
{ const start = JSON.parse(readFileSync("./toes-dorsi0.8.json", "utf8")).find((m) => m.seed === 4).rec;
  const spec = variantSpec("workshop-fighter", "dorsi0.8"), b = buildBody(spec, world, { position: [-3, 0, 0] }); const body = commandedBody(b, world, {});
  body.setLevel("held"); const st = await staticBody(cappedSpec(spec)); posed(st, start.posture); placeLike(st, b, .002); st.dispose(); report("statics hands and toes #4", b); }
