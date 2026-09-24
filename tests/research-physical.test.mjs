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
  // three times, and it is fallen or rising for 2.40 of the ten seconds; the same body at x1 stays
  // up. The x1 bout is the control that the count is read off the body. (It was once, and 7.9 s
  // down, while an idle mind never asked to get up; since physical contact session 02 the body
  // rises on its own and is felled again, and a rise is put down only by what fells a standing body.)
  const base = NAMED_BUILDS.find((build) => build.name === "default");
  const builds = [...NAMED_BUILDS, { name: "shaky", setup: withAttributeSetting(base.setup, { stability: 0.5 }) }];
  const manifest = { builds, candidates: [], protocol: { ...PROTOCOL, maxSeconds: 10 } };
  const job = { id: "down", round: 0, block: "down", left: "golem-brawler", right: "idle",
    leftBuild: "default", rightBuild: "shaky", seeds: [44, 45] };
  const shaky = await execute(job, manifest);
  // Exactly three, because a count that fired on every fallen frame rather than on the edge into
  // one would read hundreds.
  assert.equal(shaky.sides.right.knockdowns, 3, "the shaky corner went down three times");
  assert.ok(shaky.sides.right.downSeconds > 0 && shaky.sides.right.downSeconds <= shaky.seconds);
  assert.equal(shaky.sides.left.knockdowns, 0, "and the count is the fallen corner's, not the bout's");
  assert.equal(shaky.sides.left.downSeconds, 0);
  const steady = await execute({ ...job, rightBuild: "default" }, manifest);
  assert.equal(steady.sides.right.knockdowns, 0, "the control: the same bout at x1 stays up");
  assert.equal(steady.sides.right.downSeconds, 0);
});

test("the worker counts the modules each corner lost and the real blows it landed, each from that corner's own record", async () => {
  // Measured, 2026-09-23, after physical contact session 02 let a rise relocate: on these seeds the
  // champion ends a brawler at toughness x0.5 in 3.87 s and takes one of its modules off on the way;
  // the same brawler at x1 keeps every module through the ten-second cap. The x1 bout is the control
  // that the count is read off the body. (Before the relocation it was two modules in 7.73 s.)
  const base = NAMED_BUILDS.find((build) => build.name === "default");
  const builds = [...NAMED_BUILDS, { name: "soft", setup: withAttributeSetting(base.setup, { toughness: 0.5 }) }];
  const manifest = { builds, candidates: [], protocol: { ...PROTOCOL, maxSeconds: 10 } };
  const job = { id: "sever", round: 0, block: "sever", left: "golem-champion", right: "golem-brawler",
    leftBuild: "default", rightBuild: "soft", seeds: [46, 47] };
  const soft = await execute(job, manifest);
  assert.equal(soft.sides.right.severs, 1, "the soft corner lost one module");
  assert.equal(soft.sides.left.severs, 0, "and the count is the corner's own, not the bout's");
  // The same bout's contacts, and of them the real blows: the ones above the weapon's energy floor,
  // one for each alignment the runner filed. Measured the same day: 48 contacts and 17 real blows on
  // the left, 41 and 19 on the right, so neither count is the other and neither corner's is the other's.
  assert.deepEqual(["left", "right"].map((side) => [soft.sides[side].hits, soft.sides[side].realBlows]), [[48, 17], [41, 19]]);
  const plain = await execute({ ...job, rightBuild: "default" }, manifest);
  assert.equal(plain.sides.right.severs, 0, "the control: the same bout at x1 keeps them all");
});
