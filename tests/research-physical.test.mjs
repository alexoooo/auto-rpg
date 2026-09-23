import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../research/worker.mjs";
import { runJobs } from "../research/runner.mjs";
import { PROTOCOL } from "../research/schedule.mjs";
import { NAMED_BUILDS } from "../src/golem/roster.ts";
import { SEARCH_FIELDS, SEARCH_PARENTS } from "../src/golem/research-candidates.ts";
import { withAttributeSetting } from "../src/golem/attributes.ts";

test("fresh-Havok measurements agree serially and in isolated workers; passive and active fixtures differ", async () => {
  const manifest = { builds: NAMED_BUILDS, candidates: [], protocol: { ...PROTOCOL, maxSeconds: 5 } };
  const job = { id: "test", round: 0, block: "test", left: "golem-fencer", right: "idle",
    leftBuild: "default", rightBuild: "default", seeds: [44, 45] };
  const a = await execute(job, manifest);
  const b = await execute(job, manifest);
  assert.deepEqual(a, b);
  assert.equal(a.sides.right.descriptors.attackRate, 0);
  assert.ok(a.sides.left.descriptors.attackRate > 0);
  assert.equal(a.sides.right.descriptors.retreatFraction, 0);
  const directory = mkdtempSync(join(tmpdir(), "ai-physical-"));
  try {
    const rows = await runJobs(directory, manifest, [job, { ...job, id: "second", block: "second" }], { workers: 2 });
    assert.deepEqual(rows.find((r) => r.id === "test"), a);
    assert.deepEqual(rows.find((r) => r.id === "second"), { ...a, id: "second", block: "second" });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("the candidate adapter preserves each unchanged parent's physical bout", async () => {
  for (const parent of Object.keys(SEARCH_PARENTS)) {
    const candidate = { name: "golem-researched-control", label: "Control", parent,
      parameters: Object.fromEntries(SEARCH_FIELDS.map((key) => [key, SEARCH_PARENTS[parent][key]])) };
    const manifest = { builds: NAMED_BUILDS, candidates: [candidate], protocol: { ...PROTOCOL, maxSeconds: 5 } };
    const job = { id: "parent", round: 0, block: "control", left: parent, right: "golem-fencer",
      leftBuild: "default", rightBuild: "default", seeds: [44, 45] };
    const expected = await execute(job, manifest);
    const actual = await execute({ ...job, left: candidate.name }, manifest);
    assert.deepEqual(actual, { ...expected, left: candidate.name }, parent);
  }
});

test("the worker counts a corner's knockdowns and its time down from that corner's own body", async () => {
  // Measured, 2026-09-23: on these seeds the brawler fells an idle stone body at stability x0.5
  // once, about two seconds in, and it is fallen or rising for 7.9 of the ten seconds; the same
  // body at x1 stays up. The x1 bout is the control that the count is read off the body.
  const base = NAMED_BUILDS.find((build) => build.name === "default");
  const builds = [...NAMED_BUILDS, { name: "shaky", setup: withAttributeSetting(base.setup, { stability: 0.5 }) }];
  const manifest = { builds, candidates: [], protocol: { ...PROTOCOL, maxSeconds: 10 } };
  const job = { id: "down", round: 0, block: "down", left: "golem-brawler", right: "idle",
    leftBuild: "default", rightBuild: "shaky", seeds: [44, 45] };
  const shaky = await execute(job, manifest);
  // Exactly one, because a count that fired on every fallen frame rather than on the edge into
  // one would read hundreds.
  assert.equal(shaky.sides.right.knockdowns, 1, "the shaky corner went down once");
  assert.ok(shaky.sides.right.downSeconds > 0 && shaky.sides.right.downSeconds <= shaky.seconds);
  assert.equal(shaky.sides.left.knockdowns, 0, "and the count is the fallen corner's, not the bout's");
  assert.equal(shaky.sides.left.downSeconds, 0);
  const steady = await execute({ ...job, rightBuild: "default" }, manifest);
  assert.equal(steady.sides.right.knockdowns, 0, "the control: the same bout at x1 stays up");
  assert.equal(steady.sides.right.downSeconds, 0);
});
