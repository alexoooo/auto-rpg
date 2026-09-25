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
  // Measured, 2026-09-25, after physical contact session 10's balance response: on these seeds the
  // brawler fells an idle stone body at stability x0.5 eight times, and it is fallen or rising for
  // 12.73 of the fifteen seconds; the same body at x1 goes down five times, for 8.90. The x1 bout is
  // the control that the count is read off the body. The rule below found no pair from 44 to 123 for
  // any probe mind inside ten seconds, where each mind plays an idle body out almost alike whatever
  // the seed and x0.5 and x1 mostly fall alike, so the cap went to fifteen and the rule's first pair
  // is 44 and 45 (`.review/seed-search.mjs` with `SECONDS=15`). Before that, session 08 had it on 50
  // and 51 at ten seconds: five times for 7.98 s against twice for 3.77. At no gain no probe mind fells x0.5 at least twice and x1 never on any pair from 44
  // to 123, which was the rule until now (`.review/seed-search.mjs`), so the rule became the first
  // pair from 44 up on which x0.5 falls at least twice and more often than x1; the brawler felled
  // both alike on every pair before 50. Before that repair session 08 had moved it to the champion
  // on 44 and 45 and to the duelist on 54 and 55; session 06 had moved it from the duelist on 50 and
  // 51 (four times, 2.60 s, after session 05 moved it from three and 2.43 s). (Until then it was the
  // brawler on 44 and 45: once, and 7.9 s down, while an idle mind never asked to get up; then three
  // times and 2.40 s once the body rose on its own; four times once a stone body lay at 0.55 of its
  // strength.)
  const base = NAMED_BUILDS.find((build) => build.name === "default");
  const builds = [...NAMED_BUILDS, { name: "shaky", setup: withAttributeSetting(base.setup, { stability: 0.5 }) }];
  const manifest = { builds, candidates: [], protocol: { ...PROTOCOL, maxSeconds: 15 } };
  const job = { id: "down", round: 0, block: "down", left: "golem-brawler", right: "idle",
    leftBuild: "default", rightBuild: "shaky", seeds: [44, 45] };
  const shaky = await execute(job, manifest);
  // Exactly eight, because a count that fired on every fallen frame rather than on the edge into
  // one would read hundreds.
  assert.equal(shaky.sides.right.knockdowns, 8, "the shaky corner went down eight times");
  assert.ok(shaky.sides.right.downSeconds > 0 && shaky.sides.right.downSeconds <= shaky.seconds);
  assert.equal(shaky.sides.left.knockdowns, 0, "and the count is the fallen corner's, not the bout's");
  assert.equal(shaky.sides.left.downSeconds, 0);
  const steady = await execute({ ...job, rightBuild: "default" }, manifest);
  assert.equal(steady.sides.right.knockdowns, 5, "the control: the same bout at x1 goes down five times");
  assert.ok(steady.sides.right.downSeconds > 0 && steady.sides.right.downSeconds < shaky.sides.right.downSeconds,
    `the steadier body is down ${steady.sides.right.downSeconds} s, against ${shaky.sides.right.downSeconds}`);
});

test("the worker counts the modules each corner lost and the real blows it landed, each from that corner's own record", async () => {
  // Measured, 2026-09-24, after physical contact session 07 let contact lift and push a standing
  // body: on these seeds the champion takes one module off a brawler at toughness x0.5 inside the
  // ten-second cap, and the same brawler at x1 keeps every module through it. The x1 bout is the
  // control that the count is read off the body. A fixture has to exhibit a sever for a sever counter
  // to be tested, so when a change to a body moves which seeds do, the seeds move rather than the
  // assertion: they were 46 and 47, then 50 and 51 from the rise gate's repair, then 52 and 53 from
  // session 04's density, then 54 and 55 from session 05's effective mass, then 64 and 65 from
  // session 06's push, then back to 50 and 51 from session 07's contact press, where session 08's
  // lines left them. Session 08's repair -- a blow's height reaching the ledger and no blow gain --
  // keeps them there, and so does session 10's balance response. The search is this job
  // run over consecutive pairs from 50 up, keeping the first on which the soft corner alone loses
  // exactly one module and the x1 control loses none.
  const base = NAMED_BUILDS.find((build) => build.name === "default");
  const builds = [...NAMED_BUILDS, { name: "soft", setup: withAttributeSetting(base.setup, { toughness: 0.5 }) }];
  const manifest = { builds, candidates: [], protocol: { ...PROTOCOL, maxSeconds: 10 } };
  const job = { id: "sever", round: 0, block: "sever", left: "golem-champion", right: "golem-brawler",
    leftBuild: "default", rightBuild: "soft", seeds: [50, 51] };
  const soft = await execute(job, manifest);
  assert.equal(soft.sides.right.severs, 1, "the soft corner lost one module");
  assert.equal(soft.sides.left.severs, 0, "and the count is the corner's own, not the bout's");
  // The same bout's contacts, and of them the real blows: the ones above the weapon's energy floor,
  // one for each alignment the runner filed. Measured after session 10's balance response: 34
  // contacts and 15 real blows on the left, 23 and 17 on the right (48/24 and 37/14 before it), so
  // neither count is the other and neither corner's is the other's.
  assert.deepEqual(["left", "right"].map((side) => [soft.sides[side].hits, soft.sides[side].realBlows]), [[34, 15], [23, 17]]);
  const plain = await execute({ ...job, rightBuild: "default" }, manifest);
  assert.equal(plain.sides.right.severs, 0, "the control: the same bout at x1 keeps them all");
});
