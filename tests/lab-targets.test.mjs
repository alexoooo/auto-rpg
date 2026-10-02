/**
 * **The lab's targets** (`src/lab/targets.ts`): drawn by seed in their strata; a dummy that hangs
 * still against its own weight and gives way to a blow as a head on no neck does; and a target's
 * reading, which is the blow the rule read on its dummy, hung as its strike began, or how near the
 * hand's body passed (Node core stand, Rapier, 120 Hz, no assist, the arena's rules).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { buildBody } from "../src/core/build/build-body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { GUARD_ACTION } from "../src/core/mind/intent.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { impactEnergy } from "../src/core/rules/impact.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { blowDamage, rulebook } from "../src/core/rules/rulebook.ts";
import { energyShares } from "../src/core/rules/share.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { createWorld } from "../src/core/world.ts";
import { labActor } from "../src/lab/actor.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { drawTargets, dummySpec, hangDummy, readTarget, TARGET_BOX, TARGET_WATCH } from "../src/lab/targets.ts";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { coreStand, freshEngine } from "./harness/core-stand.mjs";

const RULES = rulebook("arena");
const WARRIOR = humanSpec("workshop-fighter");

test("targets_are_the_seeds_and_lie_in_their_strata", () => {
  const frame = { place: [0.5, 0, 2.45], heading: 0, stature: 1.8, head: 1.65 };
  const targets = drawTargets(1, 10, frame);
  assert.deepEqual(targets, [
    { at: [0.5, 1.65, 2.45], stratum: "control" },
    { at: [0.5914932372234761, 1.5873511679819785, 2.270984859624878], stratum: "high" },
    { at: [0.8463566965796054, 1.0264965763315559, 2.6186160433571786], stratum: "middle" },
    { at: [0.5812439796328545, 0.5382520798221231, 2.529467530809343], stratum: "low" },
    { at: [0.8562725208885968, 1.5699547428404912, 2.4338976057805124], stratum: "high" },
    { at: [0.24003218004479998, 1.0113857533782722, 2.415348115433008], stratum: "middle" },
    { at: [0.2512350571528077, 0.3124430265510455, 2.4460918023623526], stratum: "low" },
    { at: [0.42412590758875013, 1.4786377530894244, 2.546158889345825], stratum: "high" },
    { at: [0.2774289764650166, 1.0923218801035546, 2.285382695598528], stratum: "middle" },
    { at: [0.5650753952004015, 0.45576801865361627, 2.5575263176299634], stratum: "low" },
  ]);
  // Facing +z, across is x and along is z: each lies in the box, and in its own stratum's band and no other's.
  const within = (value, [low, high]) => low * frame.stature <= value && value <= high * frame.stature;
  for (const { at, stratum } of targets.slice(1)) {
    assert.ok(within(at[0] - frame.place[0], TARGET_BOX.across) && within(at[2] - frame.place[2], TARGET_BOX.along), `${stratum} at ${at}`);
    assert.deepEqual(Object.keys(TARGET_BOX.up).filter((band) => within(at[1], TARGET_BOX.up[band])), [stratum], `${stratum} at ${at}`);
  }
  // A seed names one list: the same again, and another seed's is another.
  assert.deepEqual(drawTargets(1, 10, frame), targets);
  assert.deepEqual(drawTargets(1, 4, frame), targets.slice(0, 4));
  assert.deepEqual(drawTargets(2, 4, frame), [
    { at: [0.5, 1.65, 2.45], stratum: "control" },
    { at: [0.6686606799252331, 1.478383224864956, 2.3869994356296957], stratum: "high" },
    { at: [0.5273277133703231, 1.183875003887806, 2.5851036609243603], stratum: "middle" },
    { at: [0.4994251330383122, 0.7624010106059722, 2.398608076060191], stratum: "low" },
  ]);
  assert.deepEqual(drawTargets(1, 0, frame), []);
  // Turned a quarter to the right it faces +x: along is x, and across, to its right, is -z.
  const turned = drawTargets(1, 10, { ...frame, heading: Math.PI / 2 });
  targets.forEach(({ at, stratum }, k) => {
    const across = at[0] - frame.place[0], along = at[2] - frame.place[2], to = turned[k].at;
    assert.equal(turned[k].stratum, stratum);
    assert.ok(Math.abs(to[0] - frame.place[0] - along) < 1e-12 && Math.abs(to[2] - frame.place[2] + across) < 1e-12 && to[1] === at[1], `${k}: ${to} from ${at}`);
  });
});

test("a_dummy_is_a_ball_of_its_attackers_head_and_every_number_is_the_attackers", () => {
  const spec = dummySpec(WARRIOR), head = WARRIOR.segments.find((segment) => segment.name === "head");
  assert.deepEqual(specProvenanceFaults(spec), []);
  const [ball] = spec.segments, r = head.shape.radius.value, m = head.mass.value;
  assert.deepEqual(
    { family: spec.family, model: spec.model, segments: spec.segments.map((segment) => segment.name), joints: spec.joints, mass: spec.mass.value, stature: spec.stature.value,
      kind: ball.shape.kind, radius: ball.shape.radius.value, centre: ball.shape.centre.value, com: ball.centreOfMass.value, kg: ball.mass.value,
      inertia: ball.inertia.value, surface: [ball.surface.stiffness.value, ball.surface.stiffness.unit], hp: spec.wounds.hp.value, vital: spec.wounds.vital, whole: spec.wounds.whole, balance: spec.attributes.balance.value },
    { family: "dummy", model: "workshop-fighter.dummy", segments: ["head"], joints: [], mass: m, stature: 2 * r,
      kind: "sphere", radius: r, centre: [0, 0, 0], com: [0, 0, 0], kg: m,
      inertia: [(2 / 5) * m * r * r, (2 / 5) * m * r * r, (2 / 5) * m * r * r], surface: [201e3, "N/m"], hp: WARRIOR.wounds.hp.value, vital: [], whole: ["head"], balance: WARRIOR.attributes.balance.value });
});

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the targets' tests");

/** The fist's surface, N/m: as stiff as the dummy's, a head's, so each takes half of a blow between them. */
const FIST_K = 201e3;

/** A body of one ball of `kg`, 5 cm in radius, named `hand.right`: a fist and nothing else, its centre 5 cm over its node. */
const fistSpec = (kg) => ({
  family: "test", model: "fist", mass: q(kg, "kg"), stature: q(0.1),
  segments: [{ name: "hand.right", proximal: q([0, 0, 0]), distal: q([0, 0.1, 0]), mass: q(kg, "kg"), centreOfMass: q([0, 0.05, 0]),
    inertia: q([0.001, 0.001, 0.001], "kg m2"), shape: { kind: "sphere", centre: q([0, 0.05, 0]), radius: q(0.05) },
    surface: { stiffness: q(FIST_K, "N/m") } }],
  joints: [], wounds: { hp: q(1, "HP"), vital: [], whole: [] }, attributes: { balance: q(0, "%") },
});

/**
 * A dummy hung 1.5 m up in a world with gravity, between two steps or `inStep`, from a hook of the
 * world's first step; then a fist of 1 kg sent into it at 6 m/s.
 */
async function hung(inStep = false) {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  const at = [0, 1.5, 0.5];
  let dummy = inStep ? null : hangDummy(world, dummySpec(WARRIOR), at, RULES);
  if (inStep) {
    const hook = world.beforeStep(() => { dummy ??= hangDummy(world, dummySpec(WARRIOR), at, RULES); });
    world.step(1);
    hook.dispose();
  }
  const head = dummy.fighter.built.segments.get("head");
  const centre = () => [dummy.centre.x, dummy.centre.y, dummy.centre.z];
  return {
    world, dummy, at, centre, head,
    /** Build the fist 15 cm short of the dummy, level with its centre, send it, and watch the blows for half a second. */
    strike() {
      const spec = fistSpec(1), built = buildBody(spec, world, { position: [0, at[1] - 0.05, at[2] - dummy.radius - 0.05 - 0.15] });
      const fist = { id: "fist", side: "fist", built, pool: createPool(spec, RULES) };
      const watch = watchBlows(world, [fist, dummy.fighter], RULES);
      const hand = built.segments.get("hand.right");
      hand.body.applyImpulse(new Vector3(0, 0, 6), hand.node.position.add(new Vector3(0, 0.05, 0)));
      world.step(60);
      const blows = [...watch.blows];
      watch.dispose();
      return { blows, fistSpeed: hand.body.linearVelocityToRef(new Vector3()) };
    },
    dispose() { dummy.dispose(); world.dispose(); scene.dispose(); },
  };
}

test("a_dummy_hangs_still_and_gives_way_to_a_blow", async () => {
  const h = await hung();
  try {
    assert.equal(h.dummy.radius, WARRIOR.segments.find((segment) => segment.name === "head").shape.radius.value);
    // Its weight is held and nothing else: 10 s on it is where it hung.
    h.world.step(10 * 120);
    const drift = Math.hypot(...h.centre().map((x, k) => x - h.at[k]));
    assert.ok(drift < 1e-3, `it drifted ${drift} m in 10 s`);
    // Hung from inside a step, as a reading hangs it, it is held through that step too.
    const within = await hung(true);
    try {
      within.world.step(10 * 120);
      const moved = Math.hypot(...within.centre().map((x, k) => x - within.at[k]));
      assert.ok(moved < 1e-3, `hung in a step, it drifted ${moved} m in 10 s`);
    } finally { within.dispose(); }
    const { blows, fistSpeed } = h.strike();
    assert.equal(blows.length, 1, JSON.stringify(blows));
    const [blow] = blows, kg = h.head.rigid.mass;
    const [by, on] = blow.sides;
    assert.deepEqual(blow.sides.map(sideOf), [["fist", "hand.right", null, 0.5], ["dummy", "head", null, 0.5]]);
    // Two balls meet through their centres, so the masses the contact meets are the bodies' own: but
    // for the few millimetres the fist has dropped on its way, which put the contact that far off the line.
    assert.ok(Math.abs(by.kg - 1) < 0.01 && Math.abs(on.kg - kg) < 0.01, `${by.kg}, ${on.kg} kg of 1 and ${kg}`);
    assert.ok(Math.abs(blow.closing - 6) < 0.02, `${blow.closing} m/s`);
    assert.equal(blow.energy, impactEnergy(by.kg, on.kg, blow.closing));
    // Each takes its half of it, and is wounded by that much.
    const half = blowDamage(RULES, "blunt", 0.5 * blow.energy);
    assert.ok(half > 0);
    assert.deepEqual([by, on].map((side) => [side.damage, side.wound.taken]), [[half, [{ part: "hand.right", hp: half }]], [half, [{ part: "head", hp: half }]]]);
    // It moves off with the blow, as a head on no neck does: the fist's 6 N s is in the two of them, and it has not dropped.
    const moving = h.head.body.linearVelocityToRef(new Vector3());
    assert.ok(moving.z > 0.5 && Math.abs(fistSpeed.z + kg * moving.z - 6) < 0.06, `the dummy at ${moving.z} m/s, the fist at ${fistSpeed.z}`);
    assert.ok(Math.abs(moving.y) < 0.05 && h.centre()[2] - h.at[2] > 0.2, `it moves at ${moving} and is at ${h.centre()}`);
  } finally { h.dispose(); }
});

/**
 * A body of `loadout` standing as built, its right hand attacking each of `places` in turn (each
 * from the head's height), a target's reading closed before the next is asked for: what each read,
 * with the time its strike began, and where its ball was at each step before that.
 */
async function strikeAt(loadout, places) {
  const stand = await coreStand(loadoutSpec(loadout), { ground: true });
  const actor = labActor(stand.built, stand.world);
  const head = actor.body.view.head.y;
  const targets = places.map((place) => ({ at: place(head), stratum: "control" }));
  const readings = [];
  let open = null, thrown = 0, counted = 0, began = null, before = [];
  const tactics = {
    name: "attack",
    decide: () => ({ move: null, face: 0, hands: { left: GUARD_ACTION, right: readings.length < targets.length && thrown === counted ? { kind: "attack", target: targets[readings.length].at } : GUARD_ACTION } }),
  };
  actor.drive(tactics, { watch(sight) {
    if (readings.length >= targets.length) return;
    open ??= readTarget(actor, targets[readings.length], "right", RULES);
    const { phase } = sight.report.strike;
    thrown = sight.report.strike.thrown.right;
    if (began === null && (phase === "chamber" || phase === "swing")) began = stand.world.time;
    if (began === null) before.push(open.ball);
    const reading = open.step(sight);
    if (!reading) return;
    readings.push({ ...reading, began, ended: stand.world.time, before });
    open.dispose();
    open = null; began = null; counted = thrown; before = [];
  } });
  try {
    for (let i = 0; i < stand.seconds(15 * targets.length) && readings.length < targets.length && !actor.body.view.down; i++) stand.step(1);
    return { head, readings, down: actor.body.view.down };
  } finally { open?.dispose(); actor.dispose(); stand.dispose(); }
}

/** A blow's side without its measures. */
const sideOf = ({ fighter, segment, item, share }) => [fighter, segment, item, share];
const CLUB = { model: "workshop-fighter", right: "club", left: "empty" }, BARE = { model: "workshop-fighter", right: "empty", left: "empty" };
/**
 * A reading's record without its measures: what was struck at, with what, and whether anything was
 * read: its blow's two sides, and which of them the dummy's and the body's are.
 */
const record = ({ target, hand, strike, hung, fell, blow, took, gave }) => ({
  target, hand, strike: strike?.name ?? null, hung, fell,
  blow: blow && blow.sides.map(sideOf), took: took && blow.sides.indexOf(took), gave: gave && blow.sides.indexOf(gave),
});
/** The club's blow on a dummy: the club's side takes none of it, the dummy's head all. */
const CLUBBED = { blow: [["attacker", "hand.right", "wooden club", 0], ["dummy", "head", null, 1]], took: 1, gave: 0 }, UNSTRUCK = { blow: null, took: null, gave: null };

test("a_target_where_the_recipe_lands_is_struck_and_one_out_of_its_height_is_missed_by_that_much", async () => {
  // The club's recipe lands at the head's height, 1.05 m off: the skill closes the last of 1.3 m itself.
  const struck = await strikeAt(CLUB, [(head) => [0, head, 1.3]]);
  assert.equal(struck.down, false);
  const [hit] = struck.readings;
  assert.deepEqual(record(hit), {
    target: { at: [0, struck.head, 1.3], stratum: "control" }, hand: "right", strike: "searched right club blow", hung: true, fell: false,
    ...CLUBBED,
  });
  assert.equal(hit.nearest, 0);
  assert.ok(hit.took.damage > 0 && hit.took.damage === blowDamage(RULES, "blunt", hit.blow.energy), `${hit.took.damage} HP of ${hit.blow.energy} J`);
  assert.equal(hit.blow.energy, impactEnergy(hit.gave.kg, hit.took.kg, hit.blow.closing));
  // The blow is the strike's own, and the watch outlasts the pushes by its seconds.
  assert.ok(hit.began <= hit.blow.time && hit.blow.time <= hit.ended, `struck at ${hit.blow.time} s of ${hit.began} to ${hit.ended}`);
  assert.ok(Math.abs(hit.seconds - hit.ended) < 1e-9 && hit.ended - hit.blow.time >= TARGET_WATCH - 0.25, `${hit.seconds} s`);
  // Where the head stood is inside the club's window, and its hand went as fast as it goes.
  assert.ok(Math.abs(hit.strike.off.along) < 0.05 && Math.abs(hit.strike.off.across) < 0.05 && hit.strike.peak > 5, JSON.stringify(hit.strike));

  // The same strike at a target 1.3 m lower: the skill reads no height, so the club passes over it.
  // The club's swell passes 0.28 m off and the knuckles 0.72: the reading is of the hand's whole body.
  const missed = await strikeAt(CLUB, [(head) => [0, head - 1.3, 1.3]]);
  const [miss] = missed.readings;
  assert.deepEqual(record(miss), { ...record(hit), target: { at: [0, missed.head - 1.3, 1.3], stratum: "control" }, ...UNSTRUCK });
  assert.ok(miss.nearest > 0.2 && miss.nearest < 0.4, `it passed ${miss.nearest} m off`);
  assert.deepEqual(miss.strike, hit.strike);
});

test("a_reading_is_one_targets_own", async () => {
  // Two targets in turn: the first where the recipe lands, the second a metre under it.
  const { head, readings, down } = await strikeAt(CLUB, [(h) => [0, h, 1.3], (h) => [0, h - 1, 1.3]]);
  assert.equal(down, false);
  assert.deepEqual(readings.map(record), [
    { target: { at: [0, head, 1.3], stratum: "control" }, hand: "right", strike: "searched right club blow", hung: true, fell: false,
      ...CLUBBED },
    { target: { at: [0, head - 1, 1.3], stratum: "control" }, hand: "right", strike: "searched right club blow", hung: true, fell: false, ...UNSTRUCK },
  ]);
  const [first, second] = readings;
  assert.ok(first.blow.time < first.ended && first.ended < second.began, `${first.blow.time}, ${first.ended}, ${second.began}`);
  assert.ok(second.nearest > 0.1, `it passed ${second.nearest} m off`);
});

test("a_reading_is_of_the_blow_that_cost_its_dummy_most", async () => {
  // A target 10 cm under the head's height: the fist and the forearm behind it land in one step,
  // two blows, and the forearm's, the lighter, is the one the rule reads first.
  const { head, readings, down } = await strikeAt(BARE, [(h) => [0, h - 0.1, 1.3]]);
  assert.equal(down, false);
  const [reading] = readings;
  const stiffness = (name) => loadoutSpec(BARE).segments.find((segment) => segment.name === name).surface.stiffness.value;
  const shares = energyShares([stiffness("hand.right"), stiffness("head")]);
  assert.deepEqual(record(reading), {
    target: { at: [0, head - 0.1, 1.3], stratum: "control" }, hand: "right", strike: "searched right straight", hung: true, fell: false,
    blow: [["attacker", "hand.right", null, shares[0]], ["dummy", "head", null, shares[1]]], took: 1, gave: 0,
  });
  assert.ok(reading.blow.energy > 10 && reading.nearest === 0, `${reading.blow.energy} J`);
});

test("a_target_is_a_place_and_no_body_until_its_strike_begins", async () => {
  // A target where the left hand comes up into its guard, struck at with the right: a body there
  // from the first is bumped by the guard, and stands in the way of the feet being set.
  const { readings, down } = await strikeAt(BARE, [(head) => [-0.12, head - 0.2, 0.45]]);
  assert.equal(down, false);
  const [reading] = readings;
  // Until the strike began its ball was the place it was drawn at, whatever passed through it.
  assert.ok(reading.before.length > 0);
  assert.deepEqual(reading.before, reading.before.map(() => ({ centre: reading.target.at, radius: reading.before[0].radius })));
  // Hung as the strike began, the fist passed it by and the forearm behind it brushed it: nothing
  // before the strike is a blow of its, and the arm's touch in the strike is one, shared by the two surfaces.
  const stiffness = (name) => loadoutSpec(BARE).segments.find((segment) => segment.name === name).surface.stiffness.value;
  const shares = energyShares([stiffness("forearm.right"), stiffness("head")]);
  assert.deepEqual(record(reading), {
    target: reading.target, hand: "right", strike: "searched right straight", hung: true, fell: false,
    blow: [["attacker", "forearm.right", null, shares[0]], ["dummy", "head", null, shares[1]]], took: 1, gave: 0,
  });
  assert.ok(reading.began <= reading.blow.time && reading.blow.time <= reading.ended, `touched at ${reading.blow.time} s of ${reading.began} to ${reading.ended}`);
  assert.ok(reading.nearest > 0 && reading.nearest < 0.1, `it passed ${reading.nearest} m off`);
});

test("a_target_in_the_bodys_place_is_hung_once_the_body_has_stepped_off_it", async () => {
  // A target in the middle of the chest: the skill steps back to its distance, and the place is
  // clear as the strike begins.
  const { readings, down } = await strikeAt(BARE, [(head) => [0, head - 0.35, 0]]);
  assert.equal(down, false);
  assert.deepEqual(readings.map(record), [{ target: { at: [0, readings[0].target.at[1], 0], stratum: "control" }, hand: "right", strike: "searched right straight", hung: true, fell: false, ...UNSTRUCK }]);
});

/**
 * A strike at a place ahead, read as one at a target where the body's head is as the strike
 * begins: the head fills the place through the strike. `shoved`, the body is thrown off the place
 * by 150 N s through its chest as the pushes end, so the place is clear for the rest of the watch.
 */
async function strikeFromInside(shoved) {
  const stand = await coreStand(loadoutSpec(BARE), { ground: true });
  const actor = labActor(stand.built, stand.world);
  const ahead = [0, actor.body.view.head.y, 0.8], chest = stand.built.segments.get("upperTrunk"), head = stand.built.segments.get("head");
  let open = null, reading = null, ball = null, thrown = 0, clear = 0;
  actor.drive({ name: "attack", decide: () => ({ move: null, face: 0, hands: { left: GUARD_ACTION, right: thrown ? GUARD_ACTION : { kind: "attack", target: ahead } } }) }, { watch(sight) {
    if (shoved && !thrown && sight.report.strike.thrown.right) chest.body.applyImpulse(new Vector3(0, 0, -150), chest.node.position);
    thrown = sight.report.strike.thrown.right;
    if (reading) return;
    if (!open) {
      if (sight.report.strike.phase !== "chamber" && sight.report.strike.phase !== "swing") return;
      const { x, y, z } = sight.view.head;
      open = readTarget(actor, { at: [x, y, z], stratum: "control" }, "right", RULES);
    }
    ball = open.ball;
    // The steps of the watch at which the head is off the place by more than the ball and a hand's breadth.
    if (thrown && head.body.gapTo(ball.centre) - ball.radius > 0.1) clear += 1;
    reading = open.step(sight);
  } });
  try {
    for (let i = 0; i < stand.seconds(15) && !reading && !actor.body.view.down; i++) stand.step(1);
    // Down, the body is not its mind's to step: the reading is closed as it stands.
    return { reading: reading ?? open.fall(), ball, clear, down: actor.body.view.down };
  } finally { open?.dispose(); actor.dispose(); stand.dispose(); }
}

test("a_dummy_is_not_hung_in_a_place_the_body_fills", async () => {
  // Made inside the head, the solver would throw the head and the dummy apart, which is no blow.
  const { reading, ball, clear, down } = await strikeFromInside(false);
  assert.equal(down, false);
  assert.deepEqual(record(reading), { target: reading.target, hand: "right", strike: "searched right straight", hung: false, fell: false, ...UNSTRUCK });
  assert.equal(clear, 0);
  // Its ball stayed the place it was drawn at, and the hand's body was never off it by half a metre.
  assert.deepEqual(ball, { centre: reading.target.at, radius: ball.radius });
  assert.ok(reading.nearest !== null && reading.nearest < 0.5, `${reading.nearest}`);
});

test("a_dummy_is_not_hung_once_its_strikes_pushes_have_ended", async () => {
  // The same, the body thrown off the place as the pushes end, and down within the watch: the
  // place is clear from then on, and a dummy hung then would be there for no strike.
  const { reading, ball, clear, down } = await strikeFromInside(true);
  assert.ok(clear > 10, `the place was clear for ${clear} steps of the watch`);
  assert.deepEqual(record(reading), { target: reading.target, hand: "right", strike: "searched right straight", hung: false, fell: down, ...UNSTRUCK });
  assert.deepEqual(ball, { centre: reading.target.at, radius: ball.radius });
});
