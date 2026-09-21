import test from "node:test";
import assert from "node:assert/strict";
import { needleMind } from "../src/golem/lab-needle.ts";
import { originalMind } from "../src/golem/lab-baselines.ts";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { namedBuild } from "../src/golem/roster.ts";

async function fixture(build = "default") {
  const bout = createBout({ left: "idle", right: "idle", seeds: [7, 8], maxSeconds: 1,
    leftGolem: namedBuild(build).setup, rightGolem: namedBuild("default").setup,
    locomotionMode: "supported", physics: await freshHavok() });
  bout.step();
  const view = bout.left.view;
  // A published close-range fixture: move the opponent's ground and all published sockets together.
  const delta = view.self.ground.z + view.self.hands.primary.reach * 0.65 - view.opponent.ground.z;
  view.opponent.ground.z += delta;
  view.opponent.shoulder.z += delta;
  for (const hand of Object.values(view.opponent.hands)) hand.shoulder.z += delta;
  return bout;
}

test("needle alternates chambers, extensions and recovery while retaining other channels", async () => {
  const bout = await fixture();
  try {
    const view = bout.left.view, needle = needleMind(7), base = originalMind("golem-duelist", 7);
    let extensions = 0, chambers = 0, differences = 0;
    for (let i = 0; i < 720; i++) {
      view.clock = i / 240;
      const actual = needle.decide(view, 1 / 240), original = base.decide(view, 1 / 240);
      assert.deepEqual({ ...actual, primary: original.primary, actingHand: original.actingHand }, original);
      if (JSON.stringify(actual.primary) !== JSON.stringify(original.primary)) differences++;
      if (actual.primary.thrust) extensions++;
      if (actual.primary.reach === -0.8 && !actual.primary.thrust) chambers++;
    }
    assert.ok(differences > 100); assert.ok(extensions > 30); assert.ok(chambers > 100);
  } finally { bout.dispose(); }
});

test("needle preserves the entire baseline command for unsupported and lost primary hands", async () => {
  for (const build of ["maul", "whip", "ram-capped", "default"]) {
    const bout = await fixture(build);
    try {
      const view = bout.left.view;
      if (build === "default") view.self.hands.primary.lost = true;
      const needle = needleMind(7), base = originalMind("golem-duelist", 7);
      for (let i = 0; i < 300; i++) {
        view.clock = i / 240;
        assert.deepEqual(needle.decide(view, 1 / 240), base.decide(view, 1 / 240), build);
      }
    } finally { bout.dispose(); }
  }
});

test("needle aims higher for a taller observed head and abandons a lost-hand stroke", async () => {
  const bout = await fixture();
  try {
    const view = bout.left.view, low = needleMind(7), high = needleMind(7), continuedBase = originalMind("golem-duelist", 7);
    let a, b;
    for (let i = 0; i < 90; i++) {
      view.clock = i / 240;
      a = low.decide(view, 1 / 240);
      continuedBase.decide(view, 1 / 240);
      view.opponent.crownHeight += 0.3;
      b = high.decide(view, 1 / 240);
      view.opponent.crownHeight -= 0.3;
    }
    assert.ok(b.primary.pointerY > a.primary.pointerY);
    view.self.hands.primary.lost = true;
    const base = originalMind("golem-duelist", 7), fallback = needleMind(7);
    for (let i = 0; i < 100; i++) {
      assert.deepEqual(fallback.decide(view, 1 / 240), base.decide(view, 1 / 240));
    }
    // The already-active controller must not keep writing the experimental chamber after loss.
    assert.deepEqual(low.decide(view, 1 / 240), continuedBase.decide(view, 1 / 240));
  } finally { bout.dispose(); }
});
