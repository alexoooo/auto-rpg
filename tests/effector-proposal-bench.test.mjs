import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { proposalBench } from "../research/effector-proposal-bench.mjs";
Logger.LogLevels = Logger.ErrorLogLevel;

test("proposal diagnostic distinguishes target geometry from the physical motor response", async () => {
  const held = await proposalBench({ kind: "point" });
  const loose = await proposalBench({ kind: "point", force: 0 });
  assert.ok(held.samples.length > 150);
  assert.ok(held.final.followingError < .01, "the powered blade must reach its commanded pose");
  assert.ok(loose.final.followingError > .5, "zero effort must expose the mass falling away");
  assert.ok(Math.abs(held.final.requestError - loose.final.requestError) < .003,
    "request geometry must not be mistaken for physical tracking");
  assert.notDeepEqual(held.samples[0].requested, held.final.requested, "the proposal never advances");
  assert.deepEqual(held.damage, { left: 0, right: 0 });
  assert.deepEqual(loose.damage, { left: 0, right: 0 });
  for (const run of [held, loose]) for (const sample of run.samples) {
    for (const name of ["requestError", "followingError", "totalError"]) assert.ok(Number.isFinite(sample[name]));
    assert.ok(sample.totalError <= sample.requestError + sample.followingError + 1e-9);
  }
  for (const options of [{ kind: "cut" }, { terminal: "whip" }, { hand: "missing" }, { force: NaN }]) {
    await assert.rejects(proposalBench(options), /invalid proposal bench/);
  }
});
