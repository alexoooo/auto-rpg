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

/**
 * The first consecutive seed pair from `from` up, trying at most `pairs` of them, whose bout and
 * control satisfy `exhibits`; null if none do. A counter is only tested by a fixture that exhibits
 * what it counts, and which seeds do is a property of the dynamics rather than of the counter: the
 * pairs below were moved by hand at almost every session that changed a body, and then by
 * the solver's rate (seeds 44/45 give the brawler and the x0.5 body the same four falls as x1 at
 * 120 Hz, and 50/51 no sever at all). So the rule that used to choose the seeds is the fixture, and
 * the test fails only when no pair within reach satisfies it.
 */
async function firstExhibiting(from, pairs, run, exhibits) {
  for (let seed = from; seed < from + 2 * pairs; seed += 2) {
    const found = await run([seed, seed + 1]);
    if (exhibits(found)) return found;
  }
  return null;
}

test("the worker counts a corner's knockdowns and its time down from that corner's own body", async () => {
  // The fixture: the brawler against an idle stone body at stability x0.5, beside the same bout at
  // x1 as the control that the count is read off the body -- the first pair from 44 up on which
  // x0.5 goes down at least twice and more often than x1, over fifteen seconds. Measured (Node
  // bout runner through `research/worker.mjs`, 2026-09-25): at 240 Hz that is 44 and 45, eight
  // falls for 12.73 s against five for 8.90; at 120 it is 50 and 51, four for 5.78 against two for
  // 3.77. (Ten seconds found no pair from 44 to 123 at 240; session 08 had 50 and 51 there.)
  const base = NAMED_BUILDS.find((build) => build.name === "default");
  const builds = [...NAMED_BUILDS, { name: "shaky", setup: withAttributeSetting(base.setup, { stability: 0.5 }) }];
  const manifest = { builds, candidates: [], protocol: { ...PROTOCOL, maxSeconds: 15 } };
  const found = await firstExhibiting(44, 8, async (seeds) => {
    const job = { id: "down", round: 0, block: "down", left: "golem-brawler", right: "idle",
      leftBuild: "default", rightBuild: "shaky", seeds };
    return { shaky: await execute(job, manifest), steady: await execute({ ...job, rightBuild: "default" }, manifest) };
  }, ({ shaky, steady }) => shaky.sides.right.knockdowns >= 2
    && shaky.sides.right.knockdowns > steady.sides.right.knockdowns);
  assert.ok(found, "no pair from 44 to 59 has the x0.5 body go down at least twice and more often than x1");
  const { shaky, steady } = found;
  // A count on the edge into fallen, not on every fallen frame: each fall here costs at least 1.45 s
  // down (fewest measured, both rates), so an edge count is well under two a second of time down, and
  // a frame count reads sixty.
  assert.ok(shaky.sides.right.knockdowns <= 2 * shaky.sides.right.downSeconds,
    `${shaky.sides.right.knockdowns} knockdowns in ${shaky.sides.right.downSeconds} s down is a count of frames`);
  assert.ok(shaky.sides.right.downSeconds > 0 && shaky.sides.right.downSeconds <= shaky.seconds);
  assert.equal(shaky.sides.left.knockdowns, 0, "and the count is the fallen corner's, not the bout's");
  assert.equal(shaky.sides.left.downSeconds, 0);
  assert.ok(steady.sides.right.downSeconds > 0 && steady.sides.right.downSeconds < shaky.sides.right.downSeconds,
    `the steadier body is down ${steady.sides.right.downSeconds} s, against ${shaky.sides.right.downSeconds}`);
});

test("the worker counts the modules each corner lost and the real blows it landed, each from that corner's own record", async () => {
  // The fixture: the champion against a brawler at toughness x0.5, beside the same bout at x1 as the
  // control that the count is read off the body -- the first pair from 50 up on which the soft corner
  // alone loses exactly one module in ten seconds and the x1 control keeps every one. Measured (Node
  // bout runner through `research/worker.mjs`, 2026-09-25): at 240 Hz that is 50 and 51; at 120 it
  // is 52 and 53, where 50 and 51 sever nothing.
  const base = NAMED_BUILDS.find((build) => build.name === "default");
  const builds = [...NAMED_BUILDS, { name: "soft", setup: withAttributeSetting(base.setup, { toughness: 0.5 }) }];
  const manifest = { builds, candidates: [], protocol: { ...PROTOCOL, maxSeconds: 10 } };
  const found = await firstExhibiting(50, 8, async (seeds) => {
    const job = { id: "sever", round: 0, block: "sever", left: "golem-champion", right: "golem-brawler",
      leftBuild: "default", rightBuild: "soft", seeds };
    return { soft: await execute(job, manifest), plain: await execute({ ...job, rightBuild: "default" }, manifest) };
  }, ({ soft, plain }) => soft.sides.right.severs === 1 && plain.sides.right.severs === 0);
  assert.ok(found, "no pair from 50 to 65 has the x0.5 corner lose one module and the x1 control none");
  const { soft } = found;
  assert.equal(soft.sides.left.severs, 0, "and the count is the corner's own, not the bout's");
  // The same bout's contacts, and of them the real blows: the ones above the weapon's energy floor,
  // one for each alignment the runner filed. So each corner's real blows are some of its contacts
  // and not all of them, and neither corner's pair is the other's. Measured on the pairs above:
  // [[34, 15], [23, 17]] at 240 Hz, [[112, 53], [65, 44]] at 120, left then right.
  const counts = ["left", "right"].map((side) => [soft.sides[side].hits, soft.sides[side].realBlows]);
  for (const [hits, realBlows] of counts) {
    assert.ok(realBlows > 0 && realBlows < hits, `real blows and contacts read ${JSON.stringify(counts)}`);
  }
  assert.notDeepEqual(counts[0], counts[1], `the two corners' counts are one record: ${JSON.stringify(counts)}`);
});
