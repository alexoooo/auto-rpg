// The arena (`src/arena/duel.ts`): a bout of two bodies runs to its verdict, under its recipe and
// its orders (Node, core world, Rapier, 120 Hz). How well its minds fight is
// `arena-core-capability`'s; its solids are `arena-solids`', its links `arena-link`'s.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { addArenaSolids } from "../src/arena/room.ts";
import { CAP_SECONDS, Duel } from "../src/arena/duel.ts";
import { readTape, tapeHash } from "../src/arena/matchup.ts";
import { commandsBody } from "../src/core/body.ts";
import { stanceEnvelope } from "../src/core/control/stance-envelope.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";
import { playBout } from "../research/bout.mjs";

async function arena() {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  return { scene, world, dispose: () => { world.dispose(); scene.dispose(); } };
}

test("a_bout_in_the_arena_runs_to_its_verdict", async () => {
  const { world, dispose } = await arena();
  let duel;
  try {
    // The Warrior against the Rogue, whatever its ending.
    duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue" });
    const verdict = duel.run(CAP_SECONDS + 1);
    assert.ok(verdict, "the bout is decided by its cap");
    const { left, right } = duel.duelists;
    if (verdict.winner) {
      const winner = duel.duelists[verdict.winner], loser = verdict.winner === "left" ? right : left;
      assert.ok(verdict.ending === "time" ? winner.pool.bar() > loser.pool.bar() : winner.standing && !loser.standing,
        `the verdict names the side that is up: ${JSON.stringify(verdict)}`);
    } else {
      assert.ok(verdict.ending === "time" ? left.pool.bar() === right.pool.bar() : !left.standing && !right.standing,
        `a draw is both down, or both even at the cap: ${JSON.stringify(verdict)}`);
    }
    const time = duel.clock;
    world.step(world.hz);
    assert.deepEqual(duel.verdict, verdict, "and it stands once given");
    assert.ok(duel.clock > time);
    // A replay is a new bout in the same world: the last one's bodies are gone, and nothing is in the way.
    duel.dispose();
    duel = new Duel(world, { left: "crypt-skeleton", right: "workshop-fighter" });
    duel.run(1);
    assert.equal(duel.verdict, null);
    for (const side of ["left", "right"]) {
      const { body } = duel.duelists[side];
      assert.ok(body.view.head.y > 1 && Math.abs(body.view.stance.centre.x) > 1, `the replay's ${side} stands where it was built`);
    }
  } finally { duel?.dispose(); dispose(); }
});

test("a_side_that_is_down_is_out_and_the_other_wins", async () => {
  /** The Warrior against the Rogue for 3 s, the left shoved back by `impulse` N s a kilogram at its middle trunk half a second in. */
  const shoved = async (impulse) => {
    const { world, dispose } = await arena();
    const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue" });
    try {
      duel.run(0.5);
      const { left, right } = duel.duelists, trunk = left.built.segments.get("middleTrunk");
      const mass = [...left.built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0);
      trunk.body.applyImpulse(new Vector3(-impulse * mass, 0, 0), centreOfToRef(trunk, new Vector3()));
      const verdict = duel.run(2.5);
      return { verdict: verdict && { winner: verdict.winner, ending: verdict.ending }, down: [left.body.view.down, right.body.view.down], standing: [left.standing, right.standing] };
    } finally { duel.dispose(); dispose(); }
  };
  const felled = await shoved(1.5);
  assert.deepEqual(felled.down, [true, false], `the fixture did not reach its case: ${JSON.stringify(felled)}`);
  assert.deepEqual(felled, { verdict: { winner: "right", ending: "fallen" }, down: [true, false], standing: [false, true] });
  // The control: a shove it holds decides nothing.
  const held = await shoved(0.1);
  assert.deepEqual(held.down, [false, false], `the control did not reach its case: ${JSON.stringify(held)}`);
  assert.deepEqual(held, { verdict: null, down: [false, false], standing: [true, true] });
});

test("a_bout's_minds_are_its_recipe's", async () => {
  /**
   * The Warrior against the Rogue under `minds`, `side` shoved down, away from the other, half a
   * second in: at the verdict, whether the command layers have each body, and who has the felled one.
   */
  const felled = async (side, minds) => {
    const { world, dispose } = await arena();
    const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue", ...minds });
    try {
      duel.run(0.5);
      const { left, right } = duel.duelists, { built } = duel.duelists[side], trunk = built.segments.get("middleTrunk");
      const mass = [...built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0);
      trunk.body.applyImpulse(new Vector3((side === "left" ? -1.5 : 1.5) * mass, 0, 0), centreOfToRef(trunk, new Vector3()));
      const verdict = duel.run(2.5);
      assert.ok(duel.duelists[side].body.view.down, `the fixture did not reach its case: the ${side} side is not down`);
      assert.deepEqual([verdict?.ending, verdict?.winner], ["fallen", side === "left" ? "right" : "left"]);
      return { commanded: [commandsBody(left.body), commandsBody(right.body)], felled: duel.duelists[side].body.has };
    } finally { duel.dispose(); dispose(); }
  };
  const bare = { ...RECIPE_FIGHTER, subs: [] };
  // The game's mind hands its felled body to a sub-mind; the recipe fighter hands it to another; one
  // whose recipe gives it no sub-minds keeps its body. Each side has its own.
  const game = [await felled("left", {}), await felled("right", {})];
  assert.deepEqual(game.map(({ commanded }) => commanded), [[false, true], [true, false]]);
  assert.ok(game.every(({ felled }) => felled !== "nobody"), JSON.stringify(game));
  assert.deepEqual((await felled("left", { minds: { left: bare, right: RECIPE_FIGHTER } })).commanded, [true, true]);
  const recipe = await felled("right", { minds: { left: bare, right: RECIPE_FIGHTER } });
  assert.deepEqual(recipe.commanded, [true, false]);
  assert.ok(recipe.felled !== "nobody" && game.every(({ felled }) => felled !== recipe.felled),
    `the recipe's sub-mind is its own: ${recipe.felled}, the game's ${game.map(({ felled }) => felled)}`);
  assert.deepEqual((await felled("right", { minds: { left: RECIPE_FIGHTER, right: bare } })).commanded, [true, true]);
});

test("a_fighters_aim_rides_in_its_named_actions", async () => {
  const thrown = async (mark) => {
    const { world, dispose } = await arena();
    const config = { ...RECIPE_FIGHTER, actions: RECIPE_FIGHTER.actions.map(action => ({ ...action, regions: [{ kind: "mark", mark }] })) };
    // Armed: the recipe's bare hand commits too seldom for this fixture.
    const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-fighter", gap: 3, held: { left: "club", right: "club" }, minds: { left: config, right: RECIPE_FIGHTER } });
    try {
      duel.play([{ step: 0, side: "right", orders: STAND_ORDERS }]);
      const report = () => duel.duelists.left.minded.skills.report;
      let committed;
      while (!committed && duel.clock < 20) {
        world.step();
        committed = report().actions.find(action => action.phase === "commit") ?? report().ledger.find(record => record.committed);
      }
      assert.ok(committed, `the fixture did not reach its case: no ${mark} action physically committed`);
      return committed.target;
    } finally { duel.dispose(); dispose(); }
  };
  assert.deepEqual(await thrown("high"), { kind: "body", body: "right", region: { kind: "mark", mark: "high" } });
  assert.deepEqual(await thrown("middle"), { kind: "body", body: "right", region: { kind: "mark", mark: "middle" } });
});
test("a_bout_capped_before_a_blow_lands_is_a_draw", async () => {
  // Every pairing: each side's bar is of its own parts, and two whole bodies are even whatever they are.
  for (const [left, right] of [["workshop-fighter", "workshop-rogue"], ["workshop-rogue", "crypt-skeleton"], ["crypt-skeleton", "workshop-fighter"]]) {
    const row = await playBout({ left, right, capSeconds: 1 }, 2);
    assert.deepEqual([row.winner, row.ending, row.bars, row.blows], [null, "time", [1, 1], 0], `${left} v ${right}`);
  }
});

test("a_bout's_recipe_is_plain_data_that_builds_the_same_bout", async () => {
  const recipe = { left: "workshop-rogue", right: "crypt-skeleton", gap: 3, capSeconds: 1 };
  const { world, dispose } = await arena();
  let duel;
  try {
    duel = new Duel(world, structuredClone(recipe));
    assert.deepEqual(duel.recipe, recipe);
    assert.ok(Object.isFrozen(duel.recipe));
    const { left, right } = duel.duelists;
    assert.deepEqual([left.model, right.model], ["workshop-rogue", "crypt-skeleton"]);
    const apart = right.body.view.stance.centre.x - left.body.view.stance.centre.x;
    assert.ok(Math.abs(apart - 3) < 0.05, `they stand the recipe's gap apart: ${apart}`);
    const verdict = duel.run(2);
    assert.deepEqual([verdict?.ending, verdict?.time], ["time", 1], "and its cap is the recipe's");
  } finally { duel?.dispose(); dispose(); }
});

test("a_side's_right_hand_is_empty_unless_its_recipe_arms_it", async () => {
  const names = (duelist) => (duelist.built.spec.held ?? []).map((held) => [held.segment, held.item.name]);
  const built = async (held) => {
    const { world, dispose } = await arena();
    const duel = new Duel(world, { left: "workshop-fighter", right: "crypt-skeleton", ...held });
    try { return [names(duel.duelists.left), names(duel.duelists.right)]; } finally { duel.dispose(); dispose(); }
  };
  assert.deepEqual(await built({}), [[], []]);
  assert.deepEqual(await built({ held: { left: "empty", right: "club" } }), [[], [["hand.right", "wooden club"]]]);
  assert.deepEqual(await built({ held: { left: "club", right: "empty" } }), [[["hand.right", "wooden club"]], []]);
  await assert.rejects(built({ held: { left: "sword", right: "club" } }), /a hand holds nothing called sword/);
  // Two with nothing in their hands fight with them: a blow between them has no item in it, and each side of it is wounded.
  const row = await playBout({ left: "workshop-fighter", right: "workshop-rogue", gap: 3, held: { left: "empty", right: "empty" } }, 30, [], { blows: true });
  assert.ok(row.landed.length > 0, "the fixture did not reach its case: the two never meet");
  assert.ok(row.landed.every((blow) => blow.sides.every((side) => side.item === null)), "no blow of theirs names an item");
  assert.ok(row.landed.some((blow) => blow.sides.every((side) => side.wound !== null)), "and one wounds both its sides");
});

test("a_warrior_that_turns_to_its_foe_from_standing_keeps_its_feet", async () => {
  // The duel's right side turns to its foe as it sets off; a Warrior turned faster than its walk
  // follows runs away sideways and falls within 3 s (`stanceEnvelope`'s turns, measured from setting off).
  const row = await playBout({ left: "workshop-rogue", right: "workshop-fighter", gap: 4, held: { left: "empty", right: "empty" } }, 4);
  assert.deepEqual([row.ending, row.fallen], ["none", []]);
});

test("the_same_bout_built_twice_is_the_same_to_the_bit", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  // Ten seconds: the two have met, and blows have landed.
  const first = await playBout(recipe, 10), second = await playBout(recipe, 10);
  assert.ok(first.blows + first.clashes > 0, "the fixture reaches contact between the two");
  assert.deepEqual(second, first);
  // The control: a bout that differs differs in its digest.
  const other = await playBout({ ...recipe, gap: 4.001 }, 10);
  assert.notEqual(other.digest, first.digest);
});

test("each_side_of_a_bout_sees_the_other_and_closes_on_it", async () => {
  const { world, dispose } = await arena();
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue" });
  try {
    const { left, right } = duel.duelists;
    const seen = (duelist) => duelist.body.view.senses.others.map((other) => [other.id, other.side, other.spec.model, other.out]);
    assert.deepEqual(seen(left), [["right", "right", "workshop-rogue", false]]);
    assert.deepEqual(seen(right), [["left", "left", "workshop-fighter", false]]);
    assert.deepEqual([left.body.view.senses.side, right.body.view.senses.side], ["left", "right"]);
    const gap = () => right.body.view.stance.centre.x - left.body.view.stance.centre.x;
    const before = gap();
    duel.run(3);
    assert.ok(gap() < before - 0.5, `they close: ${before} to ${gap()}`);
    // Each sees the other where its own reading has it.
    const other = left.body.view.senses.others[0].centre, own = right.body.view.stance.centre;
    assert.ok(Math.hypot(other.x - own.x, other.y - own.y, other.z - own.z) < 1e-9);
  } finally { duel.dispose(); dispose(); }
});

test("a_side_is_out_to_the_other_once_the_bout_is_decided", async () => {
  const { world, dispose } = await arena();
  // A cap of 3 s: both sides are walking at each other under way as the bell goes, and still apart.
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 3 });
  try {
    const { left, right } = duel.duelists;
    const out = () => [left.body.view.senses.out, right.body.view.senses.out, left.body.view.senses.others[0].out, right.body.view.senses.others[0].out];
    const at = () => [left, right].map((duelist) => duelist.body.view.stance.centre.x);
    duel.run(2.5);
    assert.deepEqual(out(), [false, false, false, false]);
    const walking = at();
    assert.equal(duel.run(1)?.ending, "time");
    const [l, r] = at();
    assert.ok(l > walking[0] + 0.15 && r < walking[1] - 0.15, `the fixture's two walk at each other to the bell: ${walking} to ${[l, r]}`);
    // Its own it knows at once; the other is shown it at the next step, and both then stand.
    assert.deepEqual(out(), [true, true, false, false]);
    world.step();
    assert.deepEqual(out(), [true, true, true, true]);
    // A walk under way stops within a second, and a side that is out then walks no further.
    world.step(120);
    const before = at();
    world.step(120);
    for (const [k, x] of at().entries()) assert.ok(Math.abs(x - before[k]) < 0.05, `a side that is out walks no further: ${before[k]} to ${x}`);
  } finally { duel.dispose(); dispose(); }
});

test("a_bout's_sense_delay_is_a_dial_that_changes_the_bout", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  const now = await playBout(recipe, 10), late = await playBout({ ...recipe, senseDelay: 24 }, 10);
  assert.notEqual(late.digest, now.digest);
  assert.deepEqual(await playBout({ ...recipe, senseDelay: 0 }, 10), { ...now, recipe: { ...recipe, senseDelay: 0 } });
});

test("a_side_under_orders_does_what_it_is_told_and_the_other_fights_on", async () => {
  const { world, dispose } = await arena();
  // The bout counts its own steps, not the world's.
  world.step(7);
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue" });
  try {
    const { left, right } = duel.duelists, x = (duelist) => duelist.body.view.stance.centre.x;
    const start = x(left), there = x(right);
    duel.order("left", STAND_ORDERS);
    duel.run(4);
    assert.equal(duel.steps, 480);
    assert.ok(Math.abs(x(left) - start) < 0.05, `ordered to stand, it stands: ${start} to ${x(left)}`);
    assert.ok(x(right) < there - 0.6, `while the other side walks at it: ${there} to ${x(right)}`);
    assert.equal(left.minded.kind, "options");
    assert.deepEqual([left.minded.skills.report.actions, left.minded.skills.report.ledger], [[], []], "and it throws nothing unasked");
    assert.deepEqual(duel.tape, [{ step: 0, side: "left", orders: STAND_ORDERS }]);
    duel.order("left", { move: null, face: null });
    assert.equal(duel.tape.length, 1, "an order repeated is not recorded again");
    duel.order("left", null);
    assert.deepEqual(duel.tape[1], { step: 480, side: "left", orders: null });
    const held = x(left);
    duel.run(3);
    assert.ok(x(left) > held + 0.3, `handed back, it walks at the other side: ${held} to ${x(left)}`);
    // A tape played takes the place of one still queued.
    assert.equal(duel.verdict, null);
    const now = duel.steps;
    duel.play([{ step: now + 4000, side: "right", orders: STAND_ORDERS }]);
    duel.play([{ step: now + 2, side: "left", orders: STAND_ORDERS }]);
    world.step(2);
    assert.equal(duel.tape.length, 2, "an order is given before the step it names, not sooner");
    world.step();
    assert.deepEqual(duel.tape.slice(2), [{ step: now + 2, side: "left", orders: STAND_ORDERS }]);
  } finally { duel.dispose(); dispose(); }
});

test("a_bout_plays_again_from_its_recipe_and_its_tape", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  const back = { move: { x: -1, z: 0 }, face: null };
  // The left side is ordered back once its walk is under way, then left to itself; the right is ordered to face it.
  const tape = [{ step: 200, side: "left", orders: back }, { step: 360, side: "left", orders: null },
    { step: 480, side: "right", orders: { move: null, face: { x: -1, z: -0 } } }];
  const first = await playBout(recipe, 8, tape), second = await playBout(recipe, 8, first.tape);
  // A side is given its orders as JSON carries them, a negative zero as zero: the tape that has been
  // through a link's fragment is the bout's tape, and plays the bout.
  const carried = readTape(tapeHash(tape));
  assert.equal(carried.length, 3);
  assert.deepEqual(first.tape, carried);
  assert.notDeepEqual(tape, carried, "the fixture's negative zero is what the fragment does not carry");
  assert.deepEqual(second, first);
  // The controls: no tape, and the same orders a step later, are other bouts.
  const untold = await playBout(recipe, 8);
  assert.deepEqual(untold.tape, []);
  assert.notEqual(untold.digest, first.digest);
  const late = tape.map((entry, i) => i === 0 ? { ...entry, step: 201 } : entry);
  assert.notEqual((await playBout(recipe, 8, late)).digest, first.digest);
});

test("a_side_out_of_the_fight_is_no_longer_under_its_orders", async () => {
  const { world, dispose } = await arena();
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue", capSeconds: 1 });
  try {
    // Ordered to walk away, the left side walks until the bell; then it stands, as the right does.
    duel.order("left", { move: { x: -1, z: 0 }, face: null });
    const { left } = duel.duelists;
    assert.notEqual(duel.run(), null);
    assert.equal(duel.verdict.ending, "time");
    const { report } = left.minded.skills;
    assert.equal(report.pace, stanceEnvelope(left.built.spec).walk.value, "it was walking as fast as its envelope lets it as the bell went");
    world.step();
    assert.equal(left.minded.skills.report.pace, 0, "and stands once it is out");
    assert.equal(duel.tape.length, 1, "its orders were not taken back: it is the tactics that set them aside");
  } finally { duel.dispose(); dispose(); }
});

test("a_side's_assist_is_its_balance_in_its_own_weight_and_none_at_zero", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  const weight = (duelist) => [...duelist.built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0) * 9.80665;
  const none = await playBout({ ...recipe, balance: { left: 0, right: 0 } }, 10);
  assert.deepEqual(none.assist, [[0, 0], [0, 0]]);
  const helped = await playBout({ ...recipe, balance: { left: 25, right: 10 } }, 10);
  assert.notEqual(helped.digest, none.digest);
  for (const [force, moment] of helped.assist) assert.ok(force > 0 && moment > 0, `each side is given some: ${force}, ${moment}`);
  const { world, dispose } = await arena();
  const built = [];
  try {
    // With no balance in the recipe, each side's is its character's.
    const own = new Duel(world, recipe);
    built.push(own);
    for (const duelist of Object.values(own.duelists)) {
      const percent = duelist.built.spec.attributes.balance.value;
      assert.ok(Math.abs(duelist.body.assist.most.force / weight(duelist) - percent / 100) < 1e-9, `${duelist.model}'s own ${percent} %`);
    }
  } finally { for (const duel of built) duel.dispose(); dispose(); }
  const second = await arena();
  const duel = new Duel(second.world, { ...recipe, balance: { left: 25, right: 10 }, balancePercent: { force: 0.02, moment: 0.004 } });
  try {
    // Each side's own balance, at what the recipe's per cent is, in its own weight.
    for (const [side, percent] of [["left", 25], ["right", 10]]) {
      const duelist = duel.duelists[side], most = duelist.body.assist.most;
      assert.ok(Math.abs(most.force / weight(duelist) - percent * 0.02) < 1e-9, `${side}'s force`);
      assert.ok(Math.abs(most.moment / weight(duelist) - percent * 0.004) < 1e-9, `${side}'s moment`);
      assert.ok(duelist.body.assist.on);
    }
    duel.run();
    for (const duelist of Object.values(duel.duelists)) assert.equal(duelist.body.assist.on, false, "withdrawn at the verdict");
  } finally { duel.dispose(); second.dispose(); }
});
