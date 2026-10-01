/**
 * A bout forked (`research/rollouts.mjs`), and the oracle's arithmetic: a fork with no
 * branch is the bout; a fork leaves the bout at its step and not before; a fork by a load is the
 * fork by replay; the pool's workers answer
 * as the call does; and a row's value, the choice among values and the responses offered are what
 * they say. Node, core world, Rapier, 120 Hz; the Warrior against the Rogue.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildBout, playBout } from "../research/bout.mjs";
import { rolloutPool } from "../research/rollout-pool.mjs";
import { chooseResponse, responsesAt, rollout, valueOf } from "../research/rollouts.mjs";
import { centreOfToRef } from "../src/core/control/support.ts";

const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
const back = { move: { x: -1, z: 0 }, face: null, attack: null };

test("a_fork_with_no_branch_is_the_bout", async () => {
  const whole = await rollout({ recipe, from: 0, steps: 720 }), bout = await playBout(recipe, 6);
  assert.equal(bout.steps, 720);
  assert.deepEqual([whole.digest, whole.bars, whole.steps], [bout.digest, bout.bars, 720], "a fork at the start is the bout");
  // A fork half way ends where the bout ends; its trace began at the fork, so its digest is another.
  const half = await rollout({ recipe, from: 360, steps: 360 });
  assert.deepEqual([half.end, half.bars, half.centres, half.steps], [whole.end, whole.bars, whole.centres, 720]);
  assert.notEqual(half.digest, whole.digest);
  assert.notEqual(half.at, whole.at, "and its fork was not the start");
});

test("a_fork_leaves_the_bout_at_its_step_and_not_before", async () => {
  const plain = await rollout({ recipe, from: 360, steps: 360 });
  const branched = await rollout({ recipe, from: 360, branch: [{ step: 360, side: "left", orders: back }], steps: 360 });
  assert.equal(branched.at, plain.at, "the two were one bout to the fork");
  assert.notEqual(branched.digest, plain.digest);
  assert.ok(branched.centres[0][0] < plain.centres[0][0] - 0.3, `ordered back, the left side ends at x ${branched.centres[0][0]}, not ${plain.centres[0][0]}`);
  // The tape's orders from the fork on are dropped; those before it are kept.
  const dropped = await rollout({ recipe, tape: [{ step: 400, side: "left", orders: back }], from: 360, steps: 360 });
  assert.deepEqual(dropped, plain);
  const kept = await rollout({ recipe, tape: [{ step: 300, side: "left", orders: back }], from: 360, steps: 360 });
  assert.notEqual(kept.at, plain.at);
  await assert.rejects(rollout({ recipe, from: 360, branch: [{ step: 359, side: "left", orders: back }], steps: 360 }), /cannot order the past/);
  // A nudge is given at the fork: the poses there are the bout's, and what follows is not.
  const nudged = await rollout({ recipe, from: 360, steps: 360, nudges: [{ side: "right", impulse: [0.5, 0, 0] }] });
  assert.equal(nudged.at, plain.at);
  assert.notEqual(nudged.digest, plain.digest);
  assert.deepEqual(await rollout({ recipe, from: 360, steps: 360, nudges: [{ side: "right", impulse: [0, 0, 0] }] }), plain);
});

test("a_fork_by_load_is_the_fork_by_replay", async () => {
  // A tape with orders before both forks and one after both, which a fork drops.
  const tape = [{ step: 200, side: "right", orders: back }, { step: 320, side: "right", orders: null }, { step: 1000, side: "left", orders: back }];
  const skeleton = { left: "workshop-rogue", right: "crypt-skeleton", gap: 3 };
  /** `recipe`'s bout played to its step `from` under `tape`, saved. */
  const savedAt = async (recipe, tape, from) => {
    const { world, duel, dispose } = await buildBout(recipe);
    try {
      duel.play(tape);
      while (duel.steps < from) world.step();
      return duel.save();
    } finally { dispose(); }
  };
  const jobs = [];
  for (const from of [360, 900]) {
    const job = { recipe, tape, from, steps: 360, save: await savedAt(recipe, tape, from) };
    jobs.push(job, { ...job, branch: [{ step: from, side: "left", orders: back }] }, { ...job, nudges: [{ side: "right", impulse: [0.5, 0, 0] }] });
  }
  // Another recipe's among them: a thread keeps a bout for each.
  jobs.splice(2, 0, { recipe: skeleton, from: 120, steps: 120, save: await savedAt(skeleton, [], 120) });
  const replayed = [];
  for (const { save: _, ...job } of jobs) replayed.push(await rollout(job));
  assert.equal(new Set(replayed.map((row) => row.digest)).size, jobs.length, "the control: seven forks, seven bouts");
  // In this thread, each loaded into the bout the fork before it left.
  for (const [k, job] of jobs.entries()) assert.deepEqual(await rollout(job), replayed[k], `job ${k}`);
  // And on one worker, where each save has crossed a thread.
  const pool = rolloutPool(1);
  try { assert.deepEqual(await pool.run(jobs), replayed); } finally { await pool.close(); }
  // A save is the fork's own step's.
  await assert.rejects(rollout({ ...jobs[0], from: 300 }), /no fork at step 300/);
});

test("the_pool_answers_as_the_call_does", async () => {
  const jobs = [
    { recipe, from: 0, steps: 120 },
    { recipe, from: 120, steps: 120, branch: [{ step: 120, side: "left", orders: back }] },
    { recipe, from: 120, steps: 240, nudges: [{ side: "right", impulse: [0.5, 0, 0] }] },
    { recipe: { left: "workshop-rogue", right: "crypt-skeleton", gap: 3 }, from: 60, steps: 120 },
  ];
  const pool = rolloutPool(2);
  try {
    const rows = await pool.run(jobs);
    for (const [k, job] of jobs.entries()) assert.deepEqual(rows[k], await rollout(job), `job ${k}`);
    assert.equal(new Set(rows.map((row) => row.digest)).size, 4, "four jobs, four bouts");
  } finally { await pool.close(); }
});

test("the_oracle's_arithmetic", () => {
  // A row's value to a side: its bar less its foe's, a point more with its foe out, a point less out itself.
  const row = (out) => ({ bars: [0.5, 0.25], out });
  assert.deepEqual([[], ["left"], ["right"], ["left", "right"]].map((out) => [valueOf(row(out), "left"), valueOf(row(out), "right")]),
    [[0.25, -0.25], [-0.75, 0.75], [1.25, -1.25], [0.25, -0.25]]);
  assert.equal(chooseResponse([0, 0, 0]), 0);
  assert.equal(chooseResponse([0, 0.1, 0.1]), 1, "the first of equals");
  assert.equal(chooseResponse([0.2, 0.1, 0.3]), 2);
});

test("the_responses_are_made_from_where_the_two_stand", async () => {
  // The bout's first step: the left side at x = -2 and its foe at x = 2, so toward its foe is +x and its own right is -z.
  const { world, duel, dispose } = await buildBout(recipe);
  try {
    world.step();
    const responses = responsesAt(duel, "left"), named = Object.fromEntries(responses.map(({ name, orders }) => [name, orders]));
    assert.deepEqual(responses.map(({ name }) => name), ["own", "attack", "hold", "close", "back", "left", "right"]);
    assert.equal(named.own, null, "its own tactics come first, and are no orders");
    const toward = named.close.move;
    assert.ok(toward.x > 0.999 && Math.abs(Math.hypot(toward.x, toward.z) - 1) < 1e-12, `toward its foe: ${JSON.stringify(toward)}`);
    assert.deepEqual(named.close, { move: toward, face: null, attack: null });
    assert.deepEqual(named.hold, { move: null, face: toward, attack: null });
    assert.deepEqual(named.back, { move: { x: -toward.x, z: -toward.z }, face: toward, attack: null });
    assert.deepEqual(named.right, { move: { x: toward.z, z: -toward.x }, face: toward, attack: null });
    assert.ok(named.right.move.z < -0.999, "facing +x, its right is -z");
    assert.deepEqual(named.left, { move: { x: -named.right.move.x, z: -named.right.move.z }, face: toward, attack: null });
    const head = centreOfToRef(duel.duelists.right.built.segments.get("head"), new Vector3());
    assert.deepEqual(named.attack, { move: null, face: toward, attack: [head.x, head.y, head.z] });
    assert.ok(head.x > 1.8 && head.y > 1.4, `its foe's head, at ${head}`);
    // The right side's are the mirror: toward its foe is -x.
    assert.ok(responsesAt(duel, "right")[3].orders.move.x < -0.999);
  } finally { dispose(); }
});
