import test from "node:test";
import assert from "node:assert/strict";
import { OBSERVATION_NAMES, networkMind, validateNetwork } from "../src/golem/lab-policy.ts";
import { originalMind } from "../src/golem/lab-baselines.ts";
import { createEnvironment, recording } from "../research/lab/environment.mjs";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { namedBuild } from "../src/golem/roster.ts";

const model = () => ({ version: 2, surface: "residual", baseline: "golem-duelist", hz: 12,
  scope: "dual-strikers", observationNames: OBSERVATION_NAMES,
  layers: [{ activation: "linear", weights: Array.from({ length: 22 }, () => OBSERVATION_NAMES.map(() => 0)),
    bias: Array(22).fill(0.75) }] });

test("scoped student exactly preserves baseline physics outside its declared weapon niche", async () => {
  const run = async (build, left) => {
    const env = await createEnvironment({ seed: 71, maxSeconds: 0.5, trace: true, leftBuild: build, rightBuild: build, left });
    try {
      while (!env.state().terminated && !env.state().truncated) env.step();
      return recording(env).steps;
    } finally { env.close(); }
  };
  for (const build of ["default", "maul", "whip", "ram-blade"]) {
    assert.deepEqual(await run(build, { kind: "network", model: model() }),
      await run(build, { kind: "baseline", name: "golem-duelist" }), build);
  }
  const unscoped = model(); delete unscoped.scope;
  for (const build of ["two-blades", "fists"]) {
    const actual = await run(build, { kind: "network", model: model() });
    assert.deepEqual(actual, await run(build, { kind: "network", model: unscoped }), build);
    assert.notDeepEqual(actual, await run(build, { kind: "baseline", name: "golem-duelist" }), "fixture must exercise the learned residual");
  }
});

test("scoped student falls back immediately after either hand is lost", async () => {
  const bout = createBout({ left: "idle", right: "idle", seeds: [7, 8], maxSeconds: 1,
    leftGolem: namedBuild("two-blades").setup, rightGolem: namedBuild("two-blades").setup,
    locomotionMode: "supported", physics: await freshHavok() });
  try {
    bout.step();
    const view = bout.left.view;
    for (const hand of ["primary", "secondary"]) {
      const student = networkMind(model(), 7), base = originalMind("golem-duelist", 7);
      for (let i = 0; i < 60; i++) { view.clock = i / 240; student.decide(view, 1 / 240); base.decide(view, 1 / 240); }
      view.self.hands[hand].lost = true;
      assert.deepEqual(student.decide(view, 1 / 240), base.decide(view, 1 / 240));
      view.self.hands[hand].lost = false;
    }
  } finally { bout.dispose(); }
});

test("only the explicit residual scope is accepted", () => {
  assert.throws(() => validateNetwork({ ...model(), scope: "whatever" }), /scope/);
  assert.throws(() => validateNetwork({ ...model(), surface: "direct" }), /scope/);
  validateNetwork(model());
});
