import test from "node:test";
import assert from "node:assert/strict";
import { AUTHORIZATION, remainingAllowance, fixtures, compare, TEACHER_OPPONENTS } from "../research/lab/wave4-protocol.mjs";
import { aimReachResidual, DIRECT_FIELDS, controlledMind, LAB_VERSION } from "../src/golem/lab-policy.ts";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { namedBuild } from "../src/golem/roster.ts";
import { createEnvironment, recording } from "../research/lab/environment.mjs";
import { OBSERVATION_NAMES, validateNetwork } from "../src/golem/lab-policy.ts";

test("new campaign allowance is capped cumulatively and per job", () => {
  assert.equal(remainingAllowance(AUTHORIZATION.maxMs - 150, 1000), 150);
  assert.equal(remainingAllowance(AUTHORIZATION.maxMs, 1000), 0);
  for (const [used, request] of [[-1, 1], [0, 3600001], [NaN, 1]]) assert.throws(() => remainingAllowance(used, request));
});
test("wave4 teacher holdouts and seed bands are independent", () => {
  const pools = [fixtures("studentSelection", 2), fixtures("studentConfirmation", 8), fixtures("ppoSelection", 2),
    fixtures("ppoConfirmation", 4), fixtures("counterTrain", 2, "needle"), fixtures("counterSelection", 4, "needle"),
    fixtures("counterConfirmation", 32, "needle"), fixtures("counterConfirmation", 32, "paired")];
  const seeds = pools.flat().map((r) => r.seed);
  assert.equal(new Set(seeds).size, seeds.length);
  assert.ok(pools[1].every((r) => !TEACHER_OPPONENTS.includes(r.opponent)));
  assert.equal(pools[1].length * 2, 128);
});
test("confirmation rejects incomplete, truncated and unmatched evidence", () => {
  const base = fixtures("studentConfirmation", 8).flatMap((r) => ["left", "right"].map((side) => ({ ...r, side, score: 0, terminated: true, truncated: false })));
  assert.equal(compare(base.map((r) => ({ ...r, score: 1 })), base).eligible, true);
  assert.equal(compare(base, base).eligible, false);
  assert.throws(() => compare(base.slice(1), base));
  assert.throws(() => compare(base.map((r, i) => ({ ...r, truncated: i === 0 })), base));
});
test("restricted residual modifies only aim and reach, preserving whole baseline timing record", async () => {
  const a = Array(DIRECT_FIELDS.length).fill(1), masked = aimReachResidual(a);
  assert.deepEqual(DIRECT_FIELDS.filter((_, i) => masked[i]), ["primary.pointerX", "primary.pointerY", "primary.reach", "secondary.pointerX", "secondary.pointerY", "secondary.reach"]);
  const bout = createBout({ left: "idle", right: "idle", seeds: [1, 2], maxSeconds: 1,
    leftGolem: namedBuild("two-blades").setup, rightGolem: namedBuild("two-blades").setup,
    locomotionMode: "supported", physics: await freshHavok() });
  try {
    bout.step();
    const restricted = controlledMind("residual", 1, () => a, "golem-duelist", "aim-reach");
    const zero = controlledMind("residual", 1, () => Array(a.length).fill(0), "golem-duelist");
    for (let i = 0; i < 40; i++) {
      const actual = structuredClone(restricted.decide(bout.left.view, 1/240));
      const baseline = structuredClone(zero.decide(bout.left.view, 1/240));
      for (const hand of ["primary", "secondary"]) for (const axis of ["pointerX", "pointerY", "reach"]) actual[hand][axis] = baseline[hand][axis];
      assert.deepEqual(actual, baseline);
    }
  } finally { bout.dispose(); }
});

test("restricted residual training adapter and exported policy have identical physical traces", async () => {
  const model = { version: LAB_VERSION, surface: "residual", baseline: "golem-duelist", hz: 12,
    residualMode: "aim-reach", observationNames: OBSERVATION_NAMES,
    layers: [{ activation: "linear", weights: Array.from({ length: 22 }, () => OBSERVATION_NAMES.map(() => 0)), bias: Array(22).fill(0.8) }] };
  const run = async (external, mode) => {
    const env = await createEnvironment({ seed: 71, maxSeconds: 1, trace: true, leftBuild: "two-blades", rightBuild: "two-blades",
      surface: "residual", controlBaseline: "golem-duelist", residualMode: mode, left: { kind: "network", model } });
    try {
      while (!env.state().terminated && !env.state().truncated) env.step(external ? model.layers[0].bias : null);
      return recording(env).steps.map(({ action, ...row }) => row);
    } finally { env.close(); }
  };
  assert.deepEqual(await run(true, "aim-reach"), await run(false, "aim-reach"));
  assert.notDeepEqual(await run(true, undefined), await run(false));
  assert.throws(() => validateNetwork({ ...model, surface: "direct" }), /residual mode/);
});
