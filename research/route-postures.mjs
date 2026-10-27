/**
 * **The staged route's postures as placed starts** (`docs/reference/rising.md#the-staged-route`):
 * each body plays the route from its front (`staged-down`, then each part in turn, as the Rise drill
 * plays it, `src/evaluation/technique.ts`), and the pose at each hand-over, the body read in the
 * posture the next part is begun from, is kept as that posture's placed start for the body
 * (`assets/research/posture-holds.json`), where the record has none: the root's turn and every
 * joint's angles, the height found again when it is placed (`groundPlacement`), the hips widened
 * where it overlaps itself (`widened`).
 *
 *   node research/route-postures.mjs [--seeds 1-8] [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { jointAngles } from "../src/core/build/joint-state.ts";
import { buildTechnique, TECHNIQUE_SPREAD, techniqueSpec } from "../src/evaluation/technique.ts";
import { groundPlacement } from "../src/lab/ground-starts.ts";

const RECORD = new URL("../assets/research/posture-holds.json", import.meta.url);
const CHAIN = ["staged-down", "staged-kneel-up", "staged-step-through", "staged-lunge"];
/** The posture each part after the first is begun from. */
const BEGUN = { "staged-kneel-up": "fours", "staged-step-through": "kneeling", "staged-lunge": "half-kneel" };
const MODELS = ["workshop-fighter", "workshop-rogue"];

const at = process.argv.indexOf("--seeds"), range = at < 0 ? "1-8" : process.argv[at + 1];
const [lo, hi] = range.split("-").map(Number), seeds = Array.from({ length: (hi ?? lo) - lo + 1 }, (_, k) => lo + k);
const write = process.argv.includes("--write");
const commit = execSync("git rev-parse --short=8 HEAD").toString().trim();

/** The body's pose now, as a placement: the root's turn from its rest, and each joint's angles within its range. */
function poseOf(body) {
  const root = body.segments.get("lowerTrunk");
  const rotation = root.node.rotationQuaternion.multiply(Quaternion.Inverse(root.rest)).normalize();
  const joints = {};
  for (const [name, joint] of body.joints) joints[name] = jointAngles(joint).map((angle, k) => Math.max(joint.spec.dofs[k].min.value, Math.min(joint.spec.dofs[k].max.value, angle)));
  return { position: [0, 0, 0], rotation: rotation.asArray(), joints };
}

const found = [];
for (const model of MODELS) for (const seed of seeds) {
  const built = await buildTechnique({ model, held: "empty", seed, start: { kind: "placed", posture: "front" }, chain: CHAIN }, "rapier");
  const caught = {};
  try {
    let closed = 0;
    while (!built.ended) {
      built.world.step(); built.afterStep();
      // A part done hands the body over in the posture the next is begun from: its pose then.
      const done = built.reading().links.slice(0, closed + 1).filter((link) => link.end === "done").length;
      if (done > closed) {
        const next = CHAIN[done];
        if (BEGUN[next] && built.reading().links[done - 1].position === BEGUN[next]) caught[BEGUN[next]] = poseOf(built.body);
        closed = done;
      }
    }
    const ends = built.reading().links.map((link) => `${link.technique.replace("staged-", "")}:${link.end}`).join(" ");
    console.log(model, seed, ends, Object.keys(caught).join(","));
    for (const [posture, placement] of Object.entries(caught)) found.push({ model, seed, posture, placement });
  } finally { built.dispose(); }
}

/** Of seeds 1 to 8, how many place `placement` clear (`groundPlacement`, its joints moved by each seed as the drill's, `TECHNIQUE_SPREAD`). */
const clear = (model, posture, placement) => {
  const spec = techniqueSpec({ model, held: "empty" });
  let count = 0;
  for (let seed = 1; seed <= 8; seed++) {
    if (!("refused" in groundPlacement(spec, { seed, ground: { start: "placed", posture, level: "open", degrees: null, impulse: null, foe: 0, gusts: false } }, placement, TECHNIQUE_SPREAD))) count++;
  }
  return count;
};

/**
 * `placement` with both hips and both shoulders abducted by as many `WIDEN` steps (up to `WIDEST`)
 * as it takes to place clear on six seeds of eight: a body kneeling with its thighs or feet
 * together, or its arms in against its trunk, as the route leaves one, overlaps itself.
 */
const WIDEN = .02, WIDEST = .3;
const widened = (model, posture, placement) => {
  const spec = techniqueSpec({ model, held: "empty" }), opened = spec.joints.filter((joint) => joint.name.startsWith("hip.") || joint.name.startsWith("shoulder."));
  for (let turn = 0; turn <= WIDEST + 1e-9; turn += WIDEN) {
    const joints = { ...placement.joints };
    for (const joint of opened) joints[joint.name] = joints[joint.name].map((angle, k) => joint.dofs[k].positive === "abduction" ? Math.min(joint.dofs[k].max.value, angle + turn) : angle);
    const tried = { ...placement, joints }, count = clear(model, posture, tried);
    if (count >= 6) return { placement: tried, clear: count, widened: turn };
  }
  return { placement, clear: clear(model, posture, placement), widened: 0 };
};

const record = JSON.parse(readFileSync(RECORD, "utf8"));
const added = [];
for (const model of MODELS) for (const posture of Object.values(BEGUN)) {
  if (record.some((one) => one.model === model && one.id === posture)) continue;
  // The first caught, in seed order, that places clear on as many seeds as any.
  const caught = found.filter((one) => one.model === model && one.posture === posture).map((one) => ({ ...one, ...widened(model, posture, one.placement) }));
  const best = caught.reduce((most, one) => one.clear > (most?.clear ?? -1) ? one : most, null);
  if (!best || best.clear === 0) { console.log(`${model}: no ${posture} caught that places`); continue; }
  console.log(`${model} ${posture}: seed ${best.seed}, clear on ${best.clear} of 8, hips and shoulders widened ${best.widened.toFixed(2)} rad (${caught.map((one) => `${one.seed}:${one.clear}`).join(" ")})`);
  added.push({ id: posture, model, source: { path: "research/route-postures.mjs", commit, from: "front", seed: best.seed, widened: Number(best.widened.toFixed(2)) }, placement: best.placement });
}
console.log(`adds ${added.map((one) => `${one.model} ${one.id} (seed ${one.source.seed})`).join(", ") || "nothing"}`);
if (write && added.length) writeFileSync(RECORD, `${JSON.stringify([...record, ...added], null, 2)}\n`);
