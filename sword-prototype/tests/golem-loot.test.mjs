// Body parts as loot: the loot rule, the parts bin's codec, and a module fitted second-hand.
//
// **Every threshold in this file is provisional.** Nothing here has been checked against the
// owner's judgement, and this plan set exists because three body experiments each cleared a scalar
// proxy while that judgement stayed red. What is asserted is a *rule* and a *format* rather than a
// feel: a severed module either qualifies as loot or it does not, a damaged bin is either refused
// by name or it is not, and a fitted module either starts the bout worn or it does not.
//
// Two harnesses appear and they never share a column. The codec and the settlement are pure and
// run under Node with no engine at all -- `src/golem/parts-bin.ts` imports one type and no value,
// which is the same property `src/bout.ts` guards. The loot rule is asked of a **real assembled
// golem under real Havok**, because the fixture has to be able to actually sever something: an
// intact body cannot show a severing bug however real the bug is, and a hand-written stand-in for
// a module report would be a test agreeing with its own setup.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics, COLLIDES, LAYER } from "../src/physics.ts";
import { severs } from "../src/scoring.ts";
import { unitDefinition } from "../src/units.ts";
import { vitality } from "../src/bout.ts";
import {
  defaultGolemSetup,
  golemEffectorOption,
  golemSetupRefusal,
  isGolemEffectorOption,
} from "../src/golem/build.ts";
import {
  LOOTABLE_SLOTS,
  PARTS_BIN_KEY,
  PartsBin,
  decodePartsBin,
  encodePartsBin,
  moduleDurability,
  partsBinChecksum,
  partsBinLoot,
  settlePartsBin,
} from "../src/golem/parts-bin.ts";

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME_MS = 1000 / 60;

// ---------------------------------------------------------------------------------------
// A real assembled golem, standing, so that something can actually be cut off it.
// ---------------------------------------------------------------------------------------

const blankIntent = () => ({
  forward: 0, strafe: 0, turn: 0, actingHand: "primary",
  natural: { thrust: false, guard: false },
  posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
  primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
  secondary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
});

const scripted = (name, intent) => ({ name, decide: () => intent });

/**
 * One golem in a bare arena, driven by hand, with a count of every `sever` it is asked for.
 *
 * The same stand `tests/golem-arena.test.mjs` uses, plus the instrument this session's own trap
 * demands: **do not infer an event from a side effect that has a second cause**, so "the module
 * came off" is read from a wrapper on `sever` itself rather than from a limb that reads severed
 * (which the death path also sets) or from a striker that reads spent (which a disposal also does).
 */
async function standAGolem(t, { setup = defaultGolemSetup(), side = "left" } = {}) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);
  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"), leather: mat("leather"),
    brass: mat("brass"), hide: mat("hide"), wood: mat("wood"), arrowAccent: mat("arrow"),
  };
  const ground = MeshBuilder.CreateBox("ground", { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5;
  const slab = new PhysicsAggregate(ground, PhysicsShapeType.BOX,
    { mass: 0, friction: 0.9, restitution: 0.02 }, scene);
  slab.shape.filterMembershipMask = LAYER.WORLD;
  slab.shape.filterCollideMask = COLLIDES.WORLD;

  const intent = blankIntent();
  const golem = unitDefinition("golem").build({
    scene, side, origin: Vector3.Zero(), facing: 0, golem: setup,
    mind: scripted("bench", intent), materials,
  });
  t.after(() => { golem.dispose(); scene.dispose(); engine.dispose(); });

  const severCalls = [];
  const realSever = golem.sever.bind(golem);
  golem.sever = (limb, direction) => {
    severCalls.push({ key: limb.key, health: limb.health });
    realSever(limb, direction);
  };

  let clock = 0;
  const control = () => {
    golem.observe(golem, clock);
    golem.locomotion.beginControlStep();
    golem.control.driver.step(FIXED);
    const proposal = golem.locomotion.proposal(FIXED);
    golem.locomotion.commitPhysical(proposal, proposal.displacement, FIXED);
    golem.afterLocomotion(FIXED);
    clock += FIXED;
  };
  scene.onBeforePhysicsObservable.add(control);
  const run = (seconds) => {
    for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(FRAME_MS);
    }
  };
  return { scene, golem, intent, run, severCalls, get clock() { return clock; } };
}

const moduleLimbs = (golem, suffix) =>
  golem.limbs.filter((limb) => limb.key.startsWith(`${golem.side}.golem.${suffix}.`));

/**
 * Take a piece down the way a blow does, through the body's own armour seam.
 *
 * `Combat` scores a blow, hands the raw damage to `Combatant.applyDamage`, and only then asks
 * `severs` whether the socket goes. This is that path with the scoring taken out -- the scoring is
 * a `Striking`'s business and has its own tests -- and it matters that it is the *body's* seam and
 * not a write to `limb.health`, because `Golem.applyDamage` is where armour is spent and a plated
 * piece would take a different number of blows.
 */
const hack = (golem, limb, blows = 40) => {
  for (let blow = 0; blow < blows && limb.health > 0; blow += 1) {
    golem.applyDamage(limb, limb.maxHealth * 0.25);
  }
};

// ---------------------------------------------------------------------------------------
// The premise the whole loot rule rests on, taken from the real rule rather than assumed.
// ---------------------------------------------------------------------------------------

/**
 * **The struck piece is always at zero when the socket breaks.**
 *
 * This is why the rule cannot be read as "every part still has health above zero" -- read that way
 * it would be false of every sever that has ever happened -- and why it is read as *every part but
 * the one the blow destroyed*. The claim is about `severs` in `src/scoring.ts`, so it is asked of
 * `severs`, both ways round: a perfect blow on a piece with health left does not sever, and the
 * same blow on a piece at zero does.
 */
test("the_severing_rule_never_fires_while_the_struck_piece_still_has_health", () => {
  const perfect = { kind: "cut", quality: 0.95, damage: 40 };
  assert.equal(severs(perfect, 0.001, "sword"), false,
    "a piece with health left was severed, so the loot rule's premise is wrong");
  assert.equal(severs(perfect, 0, "sword"), true,
    "a piece at zero was not severed, so this fixture cannot exhibit the defect");
  // And the control that makes the pair say something: it is the health that decides, not the
  // blow. A feeble blow on a piece at zero does not take the socket either.
  assert.equal(severs({ kind: "slap", quality: 0.95, damage: 40 }, 0, "sword"), false);
});

// ---------------------------------------------------------------------------------------
// The loot rule, on a body that can actually be cut.
// ---------------------------------------------------------------------------------------

/**
 * A primary arm cut off at a known durability leaves exactly that entry, and nothing else does.
 *
 * The whole loop in one test, on a real assembled golem: the arm is taken down through the body's
 * own armour seam, its socket is broken by the same call `Combat` makes, and what the verdict then
 * reads is the module report. Three claims, and the second and third are what stop the first from
 * passing by accident -- an accessor that reported every module as loot would satisfy a test that
 * only looked at the arm.
 */
test("a_severed_primary_is_loot_at_the_durability_it_had_when_its_socket_broke", async (t) => {
  const stand = await standAGolem(t);
  stand.run(1.0);
  const arm = moduleLimbs(stand.golem, "primary");
  assert.ok(arm.length >= 3, `the primary effector has ${arm.length} parts`);

  // Nothing has come off yet, and the report says so rather than being empty.
  const before = stand.golem.moduleReport();
  assert.equal(before.length, 5, `five slots, got ${before.map((m) => m.slot).join(", ")}`);
  assert.equal(before.some((module) => module.severed), false);
  assert.equal(before.some((module) => module.severedIntact), false);
  assert.deepEqual([...partsBinLoot(before)], []);
  const armBefore = before.find((module) => module.slot === "primary");
  assert.ok(Math.abs(armBefore.durability - 1) < 1e-9, `a fresh arm reads ${armBefore.durability}`);

  // One piece down, and the socket goes. The struck piece is the last of the chain, which is the
  // terminal -- so this is a blade cut off with the arm behind it still sound.
  const struck = arm[arm.length - 1];
  hack(stand.golem, struck);
  assert.ok(struck.health <= 0, `${struck.key} is at ${struck.health}`);
  const expected = moduleDurability(arm);
  assert.ok(expected > 0 && expected < 1, `a part-worn arm should read between 0 and 1, got ${expected}`);
  stand.golem.sever(struck, new Vector3(1, 0.2, 0));

  // Instrumented at the sever itself: exactly one, and it named the piece the blow found.
  assert.deepEqual(stand.severCalls.map((call) => call.key), [struck.key]);

  const after = stand.golem.moduleReport();
  const armAfter = after.find((module) => module.slot === "primary");
  assert.equal(armAfter.severed, true);
  assert.equal(armAfter.severedIntact, true);
  assert.ok(Math.abs(armAfter.durability - expected) < 1e-9,
    `the snapshot reads ${armAfter.durability} against ${expected} taken before the sever`);
  // The snapshot survives the zeroing `sever` does on its way past, which is the whole reason it
  // is a snapshot: every part of the module reads zero health now.
  for (const limb of arm) assert.equal(limb.health, 0, limb.key);
  assert.ok(armAfter.durability > 0,
    "the module report reads the arm as worthless, so the snapshot was taken after the zeroing");

  // And the other four slots are untouched, which is what makes the loot list exactly one long.
  const loot = partsBinLoot(after);
  assert.equal(loot.length, 1, `loot: ${JSON.stringify(loot)}`);
  assert.equal(loot[0].id, defaultGolemSetup().primary.chain === "wrist"
    ? "effector.wrist.blade" : loot[0].id);
  assert.ok(Math.abs(loot[0].durability - expected) < 1e-9);
  assert.ok(golemEffectorOption(loot[0].id), `${loot[0].id} is not on the shelf`);
});

/**
 * A module cut to pieces is debris, and the golem's own report is what says so.
 *
 * The other half of the rule, and the fixture is the same body with one extra blow -- which is the
 * point: the difference between loot and debris has to be a difference in what happened to the
 * module and not a difference in how the test was set up. Two pieces at zero rather than one, and
 * the same sever call, and nothing is collected.
 */
test("a_module_cut_to_pieces_is_debris_and_leaves_nothing_in_the_bin", async (t) => {
  const stand = await standAGolem(t);
  stand.run(1.0);
  const arm = moduleLimbs(stand.golem, "primary");
  assert.ok(arm.length >= 3);
  const struck = arm[arm.length - 1];
  hack(stand.golem, arm[0]);
  hack(stand.golem, struck);
  assert.equal(arm.filter((limb) => limb.health <= 0).length, 2,
    "the fixture has to have two pieces down for this to be about being cut to pieces");
  stand.golem.sever(struck, new Vector3(1, 0.2, 0));

  const report = stand.golem.moduleReport();
  const armAfter = report.find((module) => module.slot === "primary");
  assert.equal(armAfter.severed, true, "the socket still broke");
  assert.equal(armAfter.severedIntact, false, "an arm with two pieces down is debris");
  assert.deepEqual([...partsBinLoot(report)], []);
});

/**
 * A golem that fell apart because it died hands over nothing.
 *
 * `Golem.die` breaks the locomotion module's socket -- a stone body does not crumple, it comes
 * apart -- and that is a module coming off with every part sound. Read as "a socket broke and the
 * parts have health", a pair of legs would be collected from every corpse in the game, which is a
 * reward for winning rather than for cutting something off. The rule reads *which* joint broke, and
 * this is the test that says the distinction is live.
 */
test("legs_that_came_off_because_the_golem_died_are_not_loot", async (t) => {
  const stand = await standAGolem(t);
  stand.run(1.0);
  const head = moduleLimbs(stand.golem, "head");
  const fatal = head.find((limb) => limb.fatal === true);
  assert.ok(fatal, "the head module declares a fatal part");
  hack(stand.golem, fatal);
  stand.golem.sever(fatal, new Vector3(0, 1, 0));
  assert.equal(stand.golem.alive, false);

  const report = stand.golem.moduleReport();
  const legs = report.find((module) => module.slot === "locomotion");
  assert.equal(legs.severed, true, "a dead golem's carrier has let go");
  assert.equal(legs.severedIntact, false, "the legs came off because the body died, not because of a blow");
  // The head is severed by a blow and intact by the rule, and is still not loot -- the slot is not
  // one a module can be salvaged from. That is the pair that makes the slot filter say something.
  const headModule = report.find((module) => module.slot === "head");
  assert.equal(headModule.severedIntact, true);
  assert.deepEqual([...partsBinLoot(report)], []);
  assert.deepEqual([...LOOTABLE_SLOTS], ["primary", "secondary"]);
});

/**
 * A module fitted from the bin starts the bout worn, and looks it.
 *
 * Both halves in one place because they are the same number arriving in two forms. The **rule**
 * half is health: every part of the fitted module starts at that fraction of its own maximum, which
 * is what makes a second-hand blade wear through sooner and what costs the body a slice of its own
 * vitality bar. The **presentation** half is the surface binding hanging off every shell mesh,
 * which is what the salvaged damage-wear shader reads -- and it is checked here because until this
 * session `GolemSurfaceBinding.healthRatio` had a reader and no writer at all.
 *
 * The fresh golem beside it is the control. Without it, a build that ignored `durability` entirely
 * would pass the first half of this test at durability 1.
 */
test("a_golem_fitted_from_the_bin_starts_worn_and_its_shells_carry_that_wear", async (t) => {
  const base = defaultGolemSetup();
  const worn = {
    ...base,
    primary: { ...base.primary, salvage: "1", durability: 0.4 },
  };
  assert.equal(golemSetupRefusal(worn), null);

  const fresh = await standAGolem(t);
  const stand = await standAGolem(t, { setup: worn, side: "right" });

  const armOf = (golem) => moduleLimbs(golem, "primary");
  for (const limb of armOf(fresh.golem)) {
    assert.equal(limb.health, limb.maxHealth, `${limb.key} was built worn and nothing asked for it`);
  }
  for (const limb of armOf(stand.golem)) {
    assert.ok(Math.abs(limb.health - limb.maxHealth * 0.4) < 1e-9,
      `${limb.key} was built at ${limb.health} of ${limb.maxHealth}`);
  }
  // The secondary was not fitted from the bin and is untouched, which is what makes this about one
  // module rather than about a scale applied to a whole body.
  for (const limb of moduleLimbs(stand.golem, "secondary")) {
    assert.equal(limb.health, limb.maxHealth, limb.key);
  }
  const report = stand.golem.moduleReport().find((module) => module.slot === "primary");
  assert.ok(Math.abs(report.durability - 0.4) < 1e-9, `the fitted arm reports ${report.durability}`);

  // A worn arm costs the whole body a slice of its bar, which is the trade a salvaged part is.
  assert.ok(vitality(stand.golem.limbs) < vitality(fresh.golem.limbs) - 1e-6,
    "a body wearing a half-spent arm read exactly as sound as one that was not");

  // Presentation. Every shell of the fitted module carries a binding at the fitted ratio, and every
  // shell of a fresh one carries a binding at one -- so the field has a writer for both cases and
  // the shader is not being handed a default that happens to look right.
  const bindings = (golem, suffix) => moduleLimbs(golem, suffix).flatMap((limb) => {
    const part = golem.costume.filter((mesh) => mesh.metadata?.golemSurfaceBinding?.targetId === limb.key);
    return part.map((mesh) => mesh.metadata.golemSurfaceBinding);
  });
  const wornShells = bindings(stand.golem, "primary");
  assert.ok(wornShells.length > 0, "the primary module drew no shell at all");
  for (const binding of wornShells) {
    assert.ok(Math.abs(binding.healthRatio - 0.4) < 1e-9,
      `${binding.primitiveId} is drawn at ${binding.healthRatio}`);
    assert.equal(binding.relief, "none");
    assert.ok(binding.extentsM.every((extent) => extent > 0), binding.primitiveId);
  }
  for (const binding of bindings(fresh.golem, "primary")) {
    assert.equal(binding.healthRatio, 1, binding.primitiveId);
  }

  // And it is live: hacking at the fitted arm drives the drawn ratio down on the next substep.
  const struck = armOf(stand.golem)[0];
  const drawnBefore = wornShells[0].healthRatio;
  hack(stand.golem, struck, 1);
  stand.run(0.05);
  const drawn = moduleLimbs(stand.golem, "primary")
    .filter((limb) => limb.key === struck.key)
    .flatMap(() => wornShells.filter((binding) => binding.targetId === struck.key));
  assert.ok(drawn.length > 0, "the struck piece drew no shell");
  for (const binding of drawn) {
    assert.ok(binding.healthRatio < drawnBefore - 1e-6,
      `the struck piece is still drawn at ${binding.healthRatio}`);
  }
});

// ---------------------------------------------------------------------------------------
// The codec: it refuses damaged data rather than substituting defaults.
// ---------------------------------------------------------------------------------------

const shelf = isGolemEffectorOption;
const anyOption = () => true;
const goodId = "effector.wrist.blade";

const sample = Object.freeze([
  Object.freeze({ key: "1", id: goodId, durability: 0.625 }),
  Object.freeze({ key: "2", id: goodId, durability: 1 }),
]);

test("the_parts_bin_codec_round_trips_exactly", () => {
  assert.ok(shelf(goodId), `${goodId} is not on this build's shelf, so this fixture is wrong`);
  const reading = decodePartsBin(encodePartsBin(sample), shelf);
  assert.equal(reading.refusal, null);
  assert.deepEqual(reading.entries.map((entry) => ({ ...entry })), sample.map((entry) => ({ ...entry })));
  // An empty bin round-trips too, and is not the same value as no bin at all.
  const empty = decodePartsBin(encodePartsBin([]), shelf);
  assert.equal(empty.refusal, null);
  assert.deepEqual([...empty.entries], []);
});

/**
 * Every way a stored bin can be damaged, refused by name.
 *
 * **A refusal and never a repair.** Each row states what was done to the payload and what the
 * refusal has to mention; `entries` must be null in every one of them, because a codec that
 * returned a plausible list *and* a complaint would be a substitution wearing a warning label. The
 * precedent is the guided playtest's save, which refused a stale record rather than silently
 * repairing it, and the failure this avoids is the shield that shipped as a club: a chain of tests
 * with a default branch at the end.
 */
test("the_parts_bin_codec_refuses_damaged_data_rather_than_substituting_defaults", () => {
  const good = encodePartsBin(sample);
  const parsed = JSON.parse(good);
  const reseal = (parts) => JSON.stringify({
    bin: 1, sum: partsBinChecksum(JSON.stringify(parts)), parts,
  });

  const rows = [
    ["empty text", "", /empty text/],
    ["not JSON", "{not json", /not JSON/],
    ["an array rather than a record", "[]", /not a record/],
    ["a version this build does not write",
      JSON.stringify({ ...parsed, bin: 2 }), /version 2/],
    ["no checksum at all",
      JSON.stringify({ bin: 1, parts: parsed.parts }), /no checksum/],
    ["a checksum that does not match its contents",
      JSON.stringify({ ...parsed, sum: "deadbeef" }), /checksum is deadbeef/],
    ["contents edited under a checksum that was not",
      JSON.stringify({ ...parsed, parts: [{ ...parsed.parts[0], durability: 1 }] }), /checksum/],
    ["a part list that is not a list",
      JSON.stringify({ bin: 1, sum: "00000000", parts: { key: "1" } }), /not an array/],
    ["an entry that is not a record", reseal(["blade"]), /entry 0 is not a record/],
    ["an entry with no key", reseal([{ id: goodId, durability: 1 }]), /not a positive integer/],
    ["a key that is not a minted integer",
      reseal([{ key: "<img>", id: goodId, durability: 1 }]), /not a positive integer/],
    ["two entries claiming one key",
      reseal([{ key: "1", id: goodId, durability: 1 }, { key: "1", id: goodId, durability: 1 }]),
      /repeats the key "1"/],
    ["an entry naming no module", reseal([{ key: "1", durability: 1 }]), /names no module/],
    ["an entry naming a module this build does not have",
      reseal([{ key: "1", id: "effector.wrist.trebuchet", durability: 1 }]), /does not offer/],
    ["a durability above one",
      reseal([{ key: "1", id: goodId, durability: 1.4 }]), /not a fraction above zero/],
    ["a durability of zero",
      reseal([{ key: "1", id: goodId, durability: 0 }]), /not a fraction above zero/],
    ["a durability that is not a number",
      reseal([{ key: "1", id: goodId, durability: "half" }]), /not a fraction above zero/],
    ["a durability that is not finite",
      reseal([{ key: "1", id: goodId, durability: null }]), /not a fraction above zero/],
  ];

  for (const [what, payload, expected] of rows) {
    const reading = decodePartsBin(payload, shelf);
    assert.equal(reading.entries, null, `${what} was accepted`);
    assert.match(reading.refusal ?? "", expected, `${what} was refused by the wrong sentence`);
  }

  // The control the rows above need in order to say anything: the *undamaged* payload, through the
  // same call, is accepted. Without it every row would pass against a codec that refused
  // everything, which is the shape of green test this directory calls the worst one available.
  assert.equal(decodePartsBin(good, shelf).refusal, null);
  // And the shelf predicate is load-bearing rather than decorative: the same payload that is
  // refused against this build's shelf is accepted against one that knows everything.
  const unknown = reseal([{ key: "1", id: "effector.wrist.trebuchet", durability: 1 }]);
  assert.match(decodePartsBin(unknown, shelf).refusal ?? "", /does not offer/);
  assert.equal(decodePartsBin(unknown, anyOption).refusal, null);
});

// ---------------------------------------------------------------------------------------
// The settlement: what wore out, what is gone, and what was taken.
// ---------------------------------------------------------------------------------------

test("a_bout_carries_a_fitted_entrys_wear_forward_and_drops_one_that_reached_zero", () => {
  const bin = [
    { key: "1", id: goodId, durability: 0.9 },
    { key: "2", id: goodId, durability: 0.5 },
    { key: "3", id: goodId, durability: 0.7 },
  ];
  const after = settlePartsBin(bin, {
    fitted: [
      { key: "1", durability: 0.62, severed: false },
      { key: "2", durability: 0, severed: false },
      { key: "3", durability: 0.4, severed: true },
    ],
    taken: [{ id: goodId, durability: 0.33 }],
  });
  assert.deepEqual(after.map((entry) => ({ ...entry })), [
    // Fitted and worn: carried forward at what is left of it.
    { key: "1", id: goodId, durability: 0.62 },
    // "2" reached zero in the bout and is gone; "3" was severed and is on the arena floor.
    // The take is appended with a key minted against what survived, so it cannot collide.
    { key: "2", id: goodId, durability: 0.33 },
  ]);
  // An entry nobody fitted is untouched, including its key.
  const untouched = settlePartsBin(bin, { fitted: [], taken: [] });
  assert.deepEqual(untouched.map((entry) => ({ ...entry })), bin);
  // A take of nothing at all adds nothing, which is what a lost bout hands over.
  assert.deepEqual(settlePartsBin(bin, { fitted: [], taken: [] }).length, 3);
});

test("module_durability_is_the_modules_own_health_and_is_clamped_at_both_ends", () => {
  assert.equal(moduleDurability([]), 1);
  assert.equal(moduleDurability([{ health: 4, maxHealth: 4 }]), 1);
  assert.equal(moduleDurability([{ health: 0, maxHealth: 4 }]), 0);
  // Weighted by what each part is worth rather than averaged over the parts: half of a big slab
  // gone matters more than a whole bearing.
  assert.equal(moduleDurability([{ health: 8, maxHealth: 8 }, { health: 0, maxHealth: 2 }]), 0.8);
  // A part driven past zero by the blow that finished it does not lend health to its neighbours.
  assert.equal(moduleDurability([{ health: -40, maxHealth: 4 }, { health: 4, maxHealth: 4 }]), 0.5);
  assert.throws(() => moduleDurability([{ health: 1, maxHealth: 0 }]), /maxHealth/);
});

// ---------------------------------------------------------------------------------------
// The store: `localStorage` can throw and can come back empty.
// ---------------------------------------------------------------------------------------

/** A map that behaves like `Storage`, optionally breaking whichever call the test is about. */
const fakeStorage = (initial = null, breaks = {}) => {
  let held = initial;
  return {
    getItem: () => { if (breaks.read) throw new Error("blocked"); return held; },
    setItem: (_key, value) => { if (breaks.write) throw new Error("quota"); held = value; },
    removeItem: () => { if (breaks.remove) throw new Error("blocked"); held = null; },
    get raw() { return held; },
  };
};

test("a_parts_bin_renders_correctly_with_no_stored_value_and_survives_storage_that_throws", () => {
  // No storage at all: a harness, or a browser that would not hand one over.
  const none = new PartsBin(null, shelf);
  assert.deepEqual([...none.entries], []);
  assert.equal(none.refusal, null, "no bin is not a damaged bin");

  // Storage with nothing in it yet: the first run, and not a failure.
  const first = new PartsBin(fakeStorage(null), shelf);
  assert.deepEqual([...first.entries], []);
  assert.equal(first.refusal, null);

  // Storage that throws on every call. Every one of these is wrapped, so nothing here throws and
  // the bin in hand is empty with a sentence.
  const blocked = new PartsBin(fakeStorage(null, { read: true }), shelf);
  assert.deepEqual([...blocked.entries], []);
  assert.match(blocked.refusal ?? "", /refused to read/);

  const full = new PartsBin(fakeStorage(null, { write: true }), shelf);
  full.replace(sample);
  assert.deepEqual(full.entries.map((entry) => entry.key), ["1", "2"]);
  assert.match(full.refusal ?? "", /refused to keep/);
  // And a remove that throws is not a state a person can act on, so it says nothing and empties
  // what is in hand.
  const stuck = new PartsBin(fakeStorage(encodePartsBin(sample), { remove: true }), shelf);
  assert.equal(stuck.entries.length, 2);
  stuck.reset();
  assert.deepEqual([...stuck.entries], []);
  assert.equal(stuck.refusal, null);
});

test("a_damaged_stored_bin_is_refused_by_name_and_never_read_as_empty", () => {
  const storage = fakeStorage(JSON.stringify({ bin: 1, sum: "deadbeef", parts: [] }));
  const bin = new PartsBin(storage, shelf);
  assert.deepEqual([...bin.entries], []);
  assert.match(bin.refusal ?? "", /checksum/);
  // The difference this session insists on: an empty bin with no sentence and an empty bin *with*
  // one are two different states, and only the second one is a refusal the screen shows.
  assert.notEqual(bin.refusal, new PartsBin(fakeStorage(null), shelf).refusal);

  // A bin written after a refusal is a good bin: the sentence goes with the write.
  bin.replace(sample);
  assert.equal(bin.refusal, null);
  assert.equal(decodePartsBin(storage.raw, shelf).refusal, null);
  assert.equal(new PartsBin(storage, shelf).entries.length, 2);

  // And the key really is where it says it is, so a person clearing site data clears this.
  const keyed = fakeStorage(null);
  const written = new PartsBin(keyed, shelf);
  written.replace(sample);
  const seen = [];
  new PartsBin({ getItem: (key) => { seen.push(key); return keyed.raw; }, setItem: () => {}, removeItem: () => {} }, shelf);
  assert.deepEqual(seen, [PARTS_BIN_KEY]);
});
