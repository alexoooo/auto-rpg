import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../research/worker.mjs";
import { runJobs } from "../research/runner.mjs";
import { PROTOCOL } from "../research/schedule.mjs";
import { NAMED_BUILDS } from "../src/golem/roster.ts";
import { withAttributeSetting } from "../src/golem/attributes.ts";

test("fresh-Havok measurements agree serially and in isolated workers; passive and active fixtures differ", async () => {
  const manifest = { builds: NAMED_BUILDS, protocol: { ...PROTOCOL, maxSeconds: 5 } };
  const job = { id: "test", round: 0, block: "test", left: "golem-duelist", right: "idle",
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
  // The fixture: the walker on the maul build against an idle stone default, forty seconds, on two
  // seed pairs whose counts differ, the one with more falls as `fallen` and the other as the
  // control that the count is read off the body. Until 2026-09-27 the pair differed in the idle
  // body's stability instead, with the brawler as the attacker; the brawler was retired then, and
  // neither the duelist nor the walker on the default build separates x0.5 stability from x1 at all
  // -- over seeds 44 to 59 and twenty seconds, both read identical counts on every pair, and the
  // duelist never fells the idle body.
  // Measured (Node bout runner through `research/worker.mjs`, 2026-09-27): seeds 46/47, nine falls
  // for 28.3 s down, the walker itself down once; seeds 44/45, three for 8.7 s.
  const manifest = { builds: NAMED_BUILDS, protocol: { ...PROTOCOL, maxSeconds: 40 } };
  const job = { id: "down", round: 0, block: "down", left: "golem-walker", right: "idle",
    leftBuild: "maul", rightBuild: "default" };
  const fallen = await execute({ ...job, seeds: [46, 47] }, manifest);
  const control = await execute({ ...job, seeds: [44, 45] }, manifest);
  assert.ok(fallen.sides.right.knockdowns >= 2 && fallen.sides.right.knockdowns > control.sides.right.knockdowns,
    `the fixture no longer exhibits: ${fallen.sides.right.knockdowns} falls against the control's ${control.sides.right.knockdowns}`);
  // A count on the edge into fallen, not on every fallen frame: each fall costs over a second down,
  // so an edge count is well under two a second of time down, and a frame count reads sixty.
  assert.ok(fallen.sides.right.knockdowns <= 2 * fallen.sides.right.downSeconds,
    `${fallen.sides.right.knockdowns} knockdowns in ${fallen.sides.right.downSeconds} s down is a count of frames`);
  assert.ok(fallen.sides.right.downSeconds > 0 && fallen.sides.right.downSeconds <= fallen.seconds);
  // The count is the fallen corner's and not the bout's, so the two corners read differently.
  assert.ok(fallen.sides.left.knockdowns < fallen.sides.right.knockdowns,
    `the walker's ${fallen.sides.left.knockdowns} against the idle body's ${fallen.sides.right.knockdowns}: the count is the fallen corner's, not the bout's`);
  assert.ok(fallen.sides.left.downSeconds < fallen.sides.right.downSeconds);
  assert.ok(control.sides.right.downSeconds > 0 && control.sides.right.downSeconds < fallen.sides.right.downSeconds,
    `the control is down ${control.sides.right.downSeconds} s, against ${fallen.sides.right.downSeconds}`);
});

test("the worker counts the modules each corner lost and the real blows it landed, each from that corner's own record", async () => {
  // The fixture: the duelist against a duelist at toughness x0.5, beside the same bout at x1 as the
  // control that the count is read off the body -- the first pair from 72 up on which the soft corner
  // alone loses exactly one module in ten seconds and the x1 control keeps every one. Until
  // 2026-09-27 it was the champion against a brawler (both retired then), for which 72 and 73 was
  // the first such pair with the arms built at guard. On the duelist mirror 72 and 73 exhibits too
  // (Node bout runner through `research/worker.mjs`, 2026-09-27).
  const base = NAMED_BUILDS.find((build) => build.name === "default");
  const builds = [...NAMED_BUILDS, { name: "soft", setup: withAttributeSetting(base.setup, { toughness: 0.5 }) }];
  const manifest = { builds, protocol: { ...PROTOCOL, maxSeconds: 10 } };
  const found = await firstExhibiting(72, 8, async (seeds) => {
    const job = { id: "sever", round: 0, block: "sever", left: "golem-duelist", right: "golem-duelist",
      leftBuild: "default", rightBuild: "soft", seeds };
    return { soft: await execute(job, manifest), plain: await execute({ ...job, rightBuild: "default" }, manifest) };
  }, ({ soft, plain }) => soft.sides.right.severs === 1 && plain.sides.right.severs === 0);
  assert.ok(found, "no pair from 72 to 87 has the x0.5 corner lose one module and the x1 control none");
  const { soft } = found;
  assert.equal(soft.sides.left.severs, 0, "and the count is the corner's own, not the bout's");
  // The same bout's contacts, and of them the real blows: the ones above the weapon's energy floor,
  // one for each alignment the runner filed. So each corner's real blows are some of its contacts
  // and not all of them, and neither corner's pair is the other's. Measured on the pairs above:
  // [[34, 15], [23, 17]] at 240 Hz, [[112, 53], [65, 44]] at 120, left then right; [[125, 49],
  // [103, 37]] at 120 with the arms built at guard; [[74, 17], [67, 13]] on the duelist mirror.
  const counts = ["left", "right"].map((side) => [soft.sides[side].hits, soft.sides[side].realBlows]);
  for (const [hits, realBlows] of counts) {
    assert.ok(realBlows > 0 && realBlows < hits, `real blows and contacts read ${JSON.stringify(counts)}`);
  }
  assert.notDeepEqual(counts[0], counts[1], `the two corners' counts are one record: ${JSON.stringify(counts)}`);
});

test("a traced bout is the bout untraced, and its trajectory is the side mirror's", async () => {
  const { playMirror } = await import("../research/side-mirror-worker.mjs");
  const protocol = { ...PROTOCOL, maxSeconds: 5 };
  const manifest = { builds: NAMED_BUILDS, protocol };
  const job = { id: "trace", round: 0, block: "trace", left: "golem-duelist", right: "golem-duelist",
    leftBuild: "default", rightBuild: "default", seeds: [44, 45] };
  const plain = await execute(job, manifest);
  const traced = await execute(job, { ...manifest, trace: true });
  assert.equal(plain.trajectory, undefined, "no trace unless asked for");
  const { trajectory, prefixes, ...rest } = traced;
  assert.deepEqual(rest, plain, "tracing moves nothing in the bout");
  assert.match(trajectory, /^[0-9a-f]{16}$/);
  // The mirror worker with no `build` plays the default golem on both sides: the same bout.
  const mirror = await playMirror(job, { protocol });
  assert.equal(trajectory, mirror.trajectory, "one trajectory means one thing in both workers");
  assert.deepEqual(prefixes, mirror.prefixes);
  // Control: another seed pair is another trajectory, so the equal hashes above are not a constant.
  const other = await execute({ ...job, seeds: [46, 47] }, { ...manifest, trace: true });
  assert.notEqual(other.trajectory, trajectory);
});
