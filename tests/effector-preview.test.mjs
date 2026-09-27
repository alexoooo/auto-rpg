import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { EffectorPreviewMind } from "../src/effector-preview.ts";
import { effectorPreviewFromSearch } from "../src/effector-preview-query.ts";
import { applyEffectorTrajectory, effectorTrajectory } from "../src/effector-trajectories.ts";
import { freshBodyCommand, setChannelFlags } from "../src/body-command.ts";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { captureBout, exactFork } from "./harness/fork.mjs";
import { poseHash } from "./harness/expert.mjs";
import { humanSetup } from "../src/golem/humanoid/presets.ts";
import { humanoidDuelist } from "../src/golem/humanoid/policy.ts";

Logger.LogLevels = Logger.ErrorLogLevel;
const options = { left: "humanoid-duelist", right: "idle", seeds: [11, 22],
  leftGolem: humanSetup("blade", "fist"), rightGolem: humanSetup(),
  locomotionMode: "supported", separation: 2.2, maxSeconds: 10 };

test("proposal preview requires an unambiguous opt-in arena URL", () => {
  for (const kind of ["sweep", "point", "soft"]) {
    assert.equal(effectorPreviewFromSearch(`?play=arena&channels=effector&effector-preview=${kind}`), kind);
  }
  assert.equal(effectorPreviewFromSearch("?play=arena"), null);
  assert.equal(effectorPreviewFromSearch("?effector-preview="), null);
  for (const query of ["?play=arena&effector-preview=sweep", "?channels=effector&effector-preview=sweep",
    "?play=dungeon&matchup=x&channels=effector&effector-preview=sweep",
    "?play=arena&channels=effector&effector-preview=unknown",
    "?play=arena&channels=effector&effector-preview=sweep&effector-preview=soft"]) {
    assert.throws(() => effectorPreviewFromSearch(query));
  }
});

test("preview overlays the shared proposal, forwards orders, alternates sockets and clears between cycles", async () => {
  const previous = setChannelFlags({ effector: true });
  const bout = createBout({ ...options, physics: await freshHavok() });
  try {
    bout.step();
    const view = bout.left.view, orders = { kind: "hold" };
    const command = freshBodyCommand();
    command.gait.forward = .37; command.trunk.crouch = .21;
    const calls = [];
    const base = { name: "base", obeysOrders: true, command: (v, dt, o) => { calls.push([v, dt, o]); return command; } };
    for (const kind of ["sweep", "point", "soft"]) {
      const preview = new EffectorPreviewMind(base, kind);
      assert.equal(preview.obeysOrders, true);
      assert.deepEqual(preview.command(view, .4, orders), command);
      const expected = structuredClone(command);
      applyEffectorTrajectory(expected, view, effectorTrajectory(kind, "primary"), .4 - .3);
      assert.deepEqual(preview.command(view, .6, orders), expected);
      assert.equal(command.effectors.primary.target, undefined, "overlay mutated its policy's output");
      assert.deepEqual(preview.command(view, 1.4, orders), command, "target leaked into rest");
      const secondary = structuredClone(command);
      applyEffectorTrajectory(secondary, view, effectorTrajectory(kind, "secondary"), 2.4 % 2 - .3);
      assert.deepEqual(preview.command(view, .1, orders), secondary);
    }
    assert.ok(calls.every(([v, , o]) => v === view && o === orders));
    assert.deepEqual(calls.map(([, dt]) => dt), Array(3).fill([.4, .6, 1.4, .1]).flat());
  } finally { bout.dispose(); setChannelFlags(previous); }
});

test("preview retains the wrapped tactical clock and trajectory through an exact physical fork", async () => {
  const previous = setChannelFlags({ effector: true });
  const live = createBout({ ...options, physics: await freshHavok(),
    leftMind: new EffectorPreviewMind(humanoidDuelist(options.seeds[0]), "soft") });
  let fork;
  try {
    for (let i = 0; i < 30; i++) live.step();
    fork = await exactFork(options, captureBout(live, { heap: true }),
      { leftMind: new EffectorPreviewMind(humanoidDuelist(options.seeds[0]), "soft") });
    assert.ok(live.left.control.driver.held.effectors.primary.target);
    for (let i = 0; i < 150; i++) {
      live.step(); fork.step();
      assert.deepEqual(fork.left.control.driver.held, live.left.control.driver.held);
      assert.equal(poseHash(fork), poseHash(live), `frame ${i}`);
    }
  } finally { fork?.dispose(); live.dispose(); setChannelFlags(previous); }
});
