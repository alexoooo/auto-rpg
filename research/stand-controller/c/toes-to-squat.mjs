/**
 * First check: from hands and toes (the statics' posture on the variant, placed direct), the bearing
 * solve toward fork B's deep squat (arms forward), the hands' share stepped down to none over
 * `steps` steps of `step` s, the feet bearing on their front edge while the heels are up; then B's
 * hold on the feet; then Stand up's climb once quiet on flat feet. Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 *   node toes-to-squat.mjs [--variant dorsi0.8] [--start 1] [--seeds 0-3] [--steps 3] [--step .2] [--hand .3] [--response .3] [--trace]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { deepTrial } from "../b/deep.mjs";
import { climbAfter } from "../b/climb.mjs";
import { phasedRun } from "../phased-rise.ts";

const { values } = parseArgs({ options: { variant: { type: "string" }, start: { type: "string" }, seeds: { type: "string" }, steps: { type: "string" }, step: { type: "string" },
  hand: { type: "string" }, response: { type: "string" }, trace: { type: "boolean" }, record: { type: "string" }, for: { type: "string" }, squat: { type: "string" } } });
const variant = values.variant ?? "dorsi0.8";
const start = JSON.parse(readFileSync(`./toes-${variant}.json`, "utf8")).find((m) => m.seed === Number(values.start ?? 1)).rec;
const squat = JSON.parse(readFileSync(values.squat ?? `../b/posture-${variant}-0.45-arms_to_1.5.json`, "utf8")).rec;
const steps = Number(values.steps ?? 3), step = Number(values.step ?? .2), hand0 = Number(values.hand ?? .3), response = Number(values.response ?? .3);
const aim = (hand, duration) => ({ kind: "bear", posture: squat.angles, duration, response, pitch: squat.pitch, toward: 0, height: squat.height / .98, along: 0, up: 0, shin: 0, hand, foot: .5 });
const plan = [...Array.from({ length: steps }, (_, k) => aim(+(hand0 * (1 - k / steps)).toFixed(3), step))];
const hold = aim(0, 100);

/** The transition and the hold as one controller, run by deepTrial's `after` from the first step. */
function controller() {
  let run = null; const climb = climbAfter({ quiet: .1 });
  return { at: 0, step(own, view, clock, kit, g, dt, state) {
    if (state.phase === "climb" || state.phase === "host") return climb.step(own, view, clock, kit, g, dt, state);
    if (!run) { run = phasedRun(own, view, { from: "fours", phases: plan, hold }, () => true); run.begin("left"); state.phase = "toes"; }
    const end = run.step(g, null, dt);
    if (run.state.phase >= plan.length && state.phase === "toes") { state.phase = "hold"; state.result.holdAt = +view.time.toFixed(2); }
    if (end === "failed") { state.result.failed = `${run.phase} at ${view.time.toFixed(2)}`; state.phase = "host"; return; }
    if (state.phase === "hold" && climb.when(g, state, dt)) { state.result.quietAt = +view.time.toFixed(2); climb.step(own, view, clock, kit, g, dt, state); }
  } };
}
console.log(`start: hands and toes #${values.start ?? 1}, centre ${start.height}, knee ${start.angles["knee.right flexion"]}; squat centre ${squat.height}; hands ${plan.map((p) => p.hand).join(" → ")} → 0, ${step} s each`);
const [lo, hi] = (values.seeds ?? "0-3").split("-").map(Number);
for (let seed = lo; seed <= hi; seed++) {
  // With --record, every other step's segment transforms and readings, for the viewer.
  const frames = [];
  const onStep = values.record ? (world, g, built, state) => {
    if (Math.round(world.time / world.dt) % 2 !== 0) return;
    const parts = {};
    for (const [name, s] of built.segments) parts[name] = [...s.node.position.asArray().map((v) => +v.toFixed(4)), ...s.node.rotationQuaternion.asArray().map((v) => +v.toFixed(5))];
    frames.push({ t: +world.time.toFixed(3), phase: state.phase, feet: +(g.footLoad[0] + g.footLoad[1]).toFixed(2), flat: `${+g.flat[0]}${+g.flat[1]}`, h: +g.height.toFixed(2), parts });
  } : null;
  const out = await deepTrial({ variant, seed, seconds: Number(values.for ?? 6), squat: start, trace: values.trace, after: controller(), onStep });
  if (values.record) writeFileSync(`${values.record}-${seed}.json`, JSON.stringify({ variant, model: "workshop-fighter", label: `hands and toes #${values.start ?? 1} → deep squat, seed ${seed}, hands ${plan.map((p) => p.hand).join("→")}→0, ${step} s each`, frames }));
  if (out.rows) console.table(out.rows);
  const { rows: _r, ...rest } = out; console.log(JSON.stringify(rest));
}
