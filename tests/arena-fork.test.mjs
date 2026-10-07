/**
 * **A bout forks by a load, and rewinds by one**: a bout loaded with a save (`Duel.save`: its
 * recipe, the physics' bytes and its state, `src/core/state.ts`) goes on as the bout it was saved
 * from went on, in the bout it came from or in another of the same recipe. Node, core world,
 * Rapier, 120 Hz.
 *
 * The bout is the fighter against the rogue from 4.5 m apart, each with a balance of 25 %, each
 * seeing the other a step late, under a tape that orders the left side back before step 300
 * and hands it back to itself before step 420. It crosses blows thrown by a recipe and one placed.
 *
 * Each field of the bout's own state is sorted as a body's are (`tests/core-fork.test.mjs`): one
 * a fork is shown to need (`NEEDED`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Duel, SIDES } from "../src/arena/duel.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { FIGHTER } from "../src/core/mind/config.ts";
import { isClash, woundedIn } from "../src/core/rules/blows.ts";
import { GUARD_ACTION } from "../src/core/mind/intent.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { threatReader } from "../src/core/mind/threat.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { REPERTOIRE } from "../src/core/skills/strikes.ts";
import { deepFreeze, loadState, saveState } from "../src/core/state.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";
import { assertForks, fieldsOf, forgetting, forks, PHYSICS_ALONE, shows, STATE_ALONE, unsorted } from "./harness/fork.mjs";
import { traceOf } from "./harness/trace.mjs";

const { threatOf } = threatReader();

const RECIPE = deepFreeze({ left: "workshop-fighter", right: "workshop-rogue", gap: 3.75, balance: { left: 25, right: 25 }, senseDelay: 1 });
/** The same bout with both sides covering what threatens them (`RecipeFighterConfig.guard`). */
const COVERING = deepFreeze({ ...RECIPE, minds: { left: { ...FIGHTER, guard: "cover" }, right: { ...FIGHTER, guard: "cover" } } });
const BACK = { move: { x: -1, z: 0 }, face: null, attack: null };
const TAPE = deepFreeze([{ step: 300, side: "left", orders: BACK }, { step: 420, side: "left", orders: null }]);
/** Steps a twin's world has taken when its bout is built: a bout begins at whatever step its world is at. */
const LATE = 7;

/** The tables a bout's state points at: constants, which no load writes into. */
const TABLES = { REPERTOIRE, GUARD, GUARD_ACTION, STAND_ORDERS };
const frozenDeep = (value) => typeof value !== "object" || value === null || (Object.isFrozen(value) && Object.values(value).every(frozenDeep));
const tablesAsBuilt = JSON.stringify(TABLES);

/** What a body senses, but for the others' specs: what they are built from is no reading. */
const sensed = ({ time, side, out, others }) => ({ time, side, out, others: others.map(({ spec: _, ...other }) => other) });

/**
 * A bout of `recipe` in a world of its own, the arena's solids in it, as the fork fixture takes a
 * stand (`forks`): its root is the bout's state, and it saves and loads as a bout does. The trunk
 * is given `tape` to play; a twin is given none, and is built in a world that has stepped `LATE`
 * times already, so nothing of it is the trunk's but its recipe.
 */
async function bout(which = "trunk", recipe = RECIPE, tape = TAPE) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  if (which === "twin") for (let i = 0; i < LATE; i++) world.step();
  const heard = [];
  const duel = new Duel(world, recipe, { onBlow: (blow) => heard.push(blow) });
  if (which === "trunk") duel.play(tape);
  const sides = SIDES.map((side) => duel.duelists[side]);
  const seen = { landed: [], clashes: 0, severed: [], swung: new Set(), covered: new Set(), orders: [], withdrawn: false, verdict: null, heard };
  let counted = 0;
  return {
    world, duel, builts: sides.map(({ built }) => built), seen,
    root: duel.state, save: () => duel.save(), load: (saved) => duel.load(saved),
    advance: () => world.step(),
    read: () => ({
      steps: duel.steps, clock: duel.clock, verdict: duel.verdict, blows: duel.blows, tape: duel.tape,
      sides: sides.map(({ body, minded, pool, standing, built }) => ({
        ...shows(body), has: body.has, senses: sensed(body.view.senses), report: minded.skills.report, standing, bar: pool.bar(), ending: pool.ending(),
        parts: [...built.segments.keys()].map((part) => [pool.hp(part), pool.attached(part)]),
      })),
    }),
    watch() {
      for (; counted < duel.blows.length; counted++) {
        const blow = duel.blows[counted];
        if (isClash(blow)) seen.clashes += 1;
        else seen.landed.push(duel.steps);
        for (const side of woundedIn(blow)) if (side.wound.severed.length) seen.severed.push(side.fighter);
      }
      for (const { minded } of sides) if (minded.skills.report.strike.phase === "swing") seen.swung.add(minded.skills.report.strike.blow);
      for (const { side, body, minded } of sides) if (minded.kind === "recipe-fighter" && recipe.minds?.[side].guard === "cover" && threatOf(body.view)) seen.covered.add(side);
      seen.orders = duel.tape.map(({ step, orders }) => [step, orders !== null]);
      seen.withdrawn = sides.every(({ body }) => body.assist.withdrawn);
      seen.verdict = duel.verdict;
    },
    dispose() { duel.dispose(); world.dispose(); scene.dispose(); engine.dispose(); },
  };
}

/** A bout's digest of the poses it steps through, `steps` of them from where it stands. */
function stepped(stand, steps) {
  const trace = traceOf(stand.builts);
  for (let i = 0; i < steps; i++) { stand.advance(); trace.take(); }
  return trace.digest();
}

/** The bout's state and physics loaded, and nothing shown of them: the senses show the step the bout was at. */
const UNSHOWN = { load: (stand, saved) => { stand.world.physics.load(saved.physics); loadState(stand.root, saved.state); } };

/** The fields of the bout's own state a fork is shown to need, under the run that shows it. */
const NEEDED = {
  // Saved every half second to its verdict: the orders, the wounds and the end.
  bout: [
    "start", "startStep", "verdict", "given", "tape", "queued",
    "senses > left > frames", "senses > right > frames",
    "watch > blows",
    ...["hp", "attached", "ending"].map((field) => `right > pool > ${field}`),
  ],
  // Saved at every step about its first blow: what one step leaves the next.
  blow: ["senses > left > at", "senses > right > at", "watch > touches > touching", "watch > touches > last"],
};
/**
 * What of a bout's state is sorted elsewhere: the world's, and each body's and its mind's, a
 * fighter's skills' (`tests/core-fork.test.mjs`); and the left side's pool, which is the right's,
 * where the part comes off.
 */
const SORTED_ELSEWHERE = ["world", "left > body", "left > mind", "right > body", "right > mind", "left > pool"];

test("a_bout_forks_at_any_step", async () => {
  const controls = { physics: PHYSICS_ALONE, state: STATE_ALONE, unshown: UNSHOWN, ...forgetting(NEEDED.bout) };
  const run = await forks(bout, 60, 240, (trunk) => trunk.duel.verdict !== null, controls);
  assertForks(run, ["physics", "state", "unshown", ...NEEDED.bout]);
  // The fixture reaches a bout's whole course: both orders given, blows of both kinds thrown, landed and clashed, a part taken off, the verdict, and the assists withdrawn at it.
  const { landed, clashes, severed, swung, orders, withdrawn, verdict, heard } = run.seen;
  assert.deepEqual(orders, [[300, true], [420, false]]);
  assert.deepEqual([...swung].sort(), ["placed", "recipe"]);
  assert.ok(landed.length > 0 && clashes > 0 && heard.length === landed.length + clashes, `${landed.length} blows, ${clashes} clashes, ${heard.length} heard`);
  assert.deepEqual(severed, ["right"], "the right side loses a part: `NEEDED.bout` shows a pool's fields on that side");
  assert.ok(verdict !== null && withdrawn && run.steps.at(-1) > verdict.time * 120, `forked past the verdict at ${verdict?.time} s: from ${run.steps.at(-1)}`);
  assert.ok(Object.isFrozen(verdict), "a verdict is a record: a load puts another in its place");
  assert.ok(run.steps.length >= 20, `${run.steps.length} forks`);
  // At every step about the first blow: a fork from the step before it lands it.
  const first = landed[0], about = await forks(bout, 1, 5, 12, forgetting(NEEDED.blow), first - 6);
  assertForks(about, NEEDED.blow);
  assert.equal(about.seen.landed[0], first);
});

test("a_bout_forks_across_a_cover", async () => {
  const covering = (which) => bout(which, COVERING);
  // The first step a side covers a threat at, found on a bout of its own.
  const scout = await covering();
  let first = 0;
  try {
    while (scout.seen.covered.size === 0 && scout.duel.verdict === null) { scout.advance(); scout.watch(); first++; }
    assert.ok(scout.seen.covered.size > 0, "a side covers before the verdict");
  } finally { scout.dispose(); }
  // Forked at every step from before the cover to after it is held: the hand's goal follows its threat across each.
  const run = await forks(covering, 1, 5, 40, { physics: PHYSICS_ALONE, state: STATE_ALONE }, first - 6);
  assertForks(run, ["physics", "state"]);
  assert.ok(run.seen.covered.size > 0 && run.steps[0] < first && run.steps.at(-1) > first + 20, `forked from ${run.steps[0]} to ${run.steps.at(-1)} about the cover at ${first}`);
});

test("a_bout_rewinds", async () => {
  const tape = JSON.parse(JSON.stringify(TAPE)), given = JSON.stringify(tape);
  const stand = await bout("trunk", RECIPE, tape), { duel } = stand;
  try {
    // To its very start, saved before its first step.
    const start = duel.save(), first = stepped(stand, 360), was = saveState(duel.state);
    assert.deepEqual(duel.tape.map(({ step }) => step), [300]);
    duel.load(start);
    assert.deepEqual([duel.steps, duel.clock, duel.tape, duel.verdict], [0, 0, [], null]);
    assert.equal(JSON.stringify(tape), given, "the tape it was given to play is not written into");
    assert.equal(stepped(stand, 360), first);
    assert.deepEqual(saveState(duel.state), was);
    // And in the middle, across its first blows and its verdict.
    stepped(stand, 600);
    const saved = duel.save(), on = stepped(stand, 600), then = saveState(duel.state), blows = [...duel.blows], [blow] = blows;
    const told = JSON.stringify(blows), verdict = duel.verdict;
    assert.ok(verdict !== null, `no verdict by step ${duel.steps}`);
    assert.ok(blows.length > 0 && Object.isFrozen(blow) && Object.isFrozen(blow.point) && blow.sides.every((side) => Object.isFrozen(side) && Object.isFrozen(side.wound ?? side)),
      "a blow landed, and is frozen as it landed");
    duel.load(saved);
    assert.deepEqual([duel.steps, duel.blows.length], [960, 0]);
    assert.equal(stepped(stand, 600), on);
    assert.deepEqual(saveState(duel.state), then);
    assert.equal(JSON.stringify(duel.blows), told);
    assert.equal(JSON.stringify(blows), told, "the blows it had landed are as they were");
    assert.deepEqual(duel.verdict, verdict);
    assert.equal(stand.seen.heard.length, 2 * blows.length, "the blows landed again, and were heard again");
  } finally { stand.dispose(); }
});

test("a_load_is_of_the_same_recipe", async () => {
  const mirrored = { ...RECIPE, left: RECIPE.right, right: RECIPE.left };
  const from = await bout(), offered = await bout("trunk", mirrored), twin = await bout("trunk", mirrored), taken = await bout("trunk", mirrored);
  try {
    stepped(from, 600);
    const saved = from.duel.save();
    assert.equal(stepped(offered, 300), stepped(twin, 300));
    assert.throws(() => offered.duel.load(saved), /another bout's recipe/);
    // Refused, it is untouched: it steps on as its twin does.
    assert.equal(stepped(offered, 300), stepped(twin, 300));
    assert.deepEqual(saveState(offered.duel.state), saveState(twin.duel.state));
    // The control: the physics alone takes it, the two worlds having the same counts of bodies, joints and colliders.
    assert.doesNotThrow(() => taken.world.physics.load(saved.physics));
    // A bout of other minds is of another recipe: a mind's memory is its kind's, and its sub-minds'.
    const minds = await bout("twin", { ...RECIPE, minds: { left: { ...FIGHTER, subs: [] }, right: FIGHTER } });
    try {
      assert.throws(() => minds.duel.load(saved), /another bout's recipe/);
      assert.throws(() => from.duel.load(minds.duel.save()), /another bout's recipe/);
    } finally { minds.dispose(); }
    // And a bout of the same recipe takes it whatever the order its recipe's keys were written in.
    const again = await bout("twin", { senseDelay: RECIPE.senseDelay, balance: { right: 25, left: 25 }, gap: RECIPE.gap, right: RECIPE.right, left: RECIPE.left });
    try {
      again.duel.load(saved);
      assert.equal(stepped(again, 300), stepped(from, 300));
    } finally { again.dispose(); }
  } finally { from.dispose(); offered.dispose(); twin.dispose(); taken.dispose(); }
});

test("the_tables_a_state_points_at_are_frozen_and_unchanged", () => {
  for (const [name, table] of Object.entries(TABLES)) assert.ok(frozenDeep(table), `${name} is frozen deep`);
  assert.equal(JSON.stringify(TABLES), tablesAsBuilt, "after the bouts above were saved, loaded and rewound");
});

test("every_field_of_a_bouts_state_is_sorted", async () => {
  const stand = await bout();
  try {
    const under = (field, path) => field === path || field.startsWith(`${path} > `);
    const fields = fieldsOf(stand.root).filter((field) => !SORTED_ELSEWHERE.some((path) => under(field, path)));
    assert.deepEqual(unsorted(fields, Object.values(NEEDED).flat(), []), []);
    // What is sorted elsewhere is there: each side's body, mind and pool, and the world's.
    assert.deepEqual(SORTED_ELSEWHERE.filter((path) => !fieldsOf(stand.root).some((field) => under(field, path))), []);
  } finally { stand.dispose(); }
});
