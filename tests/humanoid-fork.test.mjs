import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { captureBout, exactFork } from "./harness/fork.mjs";
import { poseHash } from "./harness/expert.mjs";
import { auditClosures } from "./harness/closure-audit.mjs";
import { humanSetup } from "../src/golem/humanoid/presets.ts";

Logger.LogLevels = Logger.ErrorLogLevel;

test("the human pose adapter exposes its tactical state and replays a mid-bout fork", async () => {
  const options = { left: "humanoid-duelist", right: "humanoid-duelist", seeds: [11, 22],
    leftGolem: humanSetup(), rightGolem: humanSetup("mace", "fist"),
    locomotionMode: "supported", separation: 2.2, maxSeconds: 10 };
  const live = createBout({ ...options, physics: await freshHavok() });
  let fork;
  try {
    for (let i = 0; i < 45; i++) live.step();
    fork = await exactFork(options, captureBout(live, { heap: true }));
    const audit = auditClosures(live.scene, live.forkWorld().roots,
      { scene: fork.scene, roots: fork.forkWorld().roots });
    assert.deepEqual(audit.findings, []);
    for (let i = 0; i < 120; i++) {
      live.step(); fork.step();
      assert.deepEqual(fork.left.control.driver.held, live.left.control.driver.held);
      assert.deepEqual(fork.right.control.driver.held, live.right.control.driver.held);
      assert.equal(poseHash(fork), poseHash(live), `frame ${i}`);
    }
  } finally { fork?.dispose(); live.dispose(); }
});
