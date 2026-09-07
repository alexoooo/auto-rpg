import test from "node:test";
import assert from "node:assert/strict";

import { biteFloorJ, biteMechanism, impactEnergyJ, scoreHit, severs } from "../src/scoring.ts";
import { CONFIG } from "../src/config.ts";
import { STRIKER_KINDS, WEAPON_KINDS } from "../src/hands.ts";

const T = CONFIG.combat;

/**
 * **This file was rewritten on 2026-09-06 and it is worth saying why in one place.**
 *
 * Every assertion in it used to be about a speed. `scoreHit` took a speed, compared it to a
 * floor in metres per second, divided it by `referenceSpeed`, clamped at 1 and multiplied by a
 * per-weapon scale -- so a 48 kg maul and a 0.65 kg fist arriving at the same speed differed
 * only by whatever number somebody had written in the row that day, and the thing being hit did
 * not enter at all. Session 03 of the style set replaced the whole surface with `E = 0.5 mu v^2`
 * and three joules-per-damage constants, so every test here now names two masses and a closing
 * speed, and most of them can state their answer as arithmetic rather than as an inequality.
 *
 * The three constants are anchored on the Warrior: a perfect 11 m/s cut with the 1.35 kg sword
 * on a 68 kg torso is 2.3 damage and a square club blow at the same speed is 1.7, both to the
 * digit they were before. That is what makes this a rewrite of the tests and not of the game.
 */

/** The mass every anchor in `CONFIG.combat` was read against: a Warrior's torso. */
const TORSO = CONFIG.body.torsoMass;
/**
 * A golem's arm link and its plain trunk core, the two ends of the range the model has to span.
 * Written out rather than imported from `src/golem/config.ts`, because what they pin is the
 * *prediction table* in `docs/plans/style-03-energy-scoring.md`: if the golem's link ever gets
 * heavier, this file should go on asserting what the table said and the entry should say the
 * link moved.
 */
const LINK = 9.4;
const CORE = 139;

/** The reduced mass, written out here so the tests below do not read the code they check. */
const reduced = (m, M) => (m * M) / (m + M);
const joules = (m, M, v) => 0.5 * reduced(m, M) * v * v;

/** A square, committed edge-on swing with the Warrior's own sword on a Warrior's torso. */
const cleanCut = (closingSpeed = T.referenceSpeed) => ({
  closingSpeed,
  strikerMassKg: CONFIG.sword.mass,
  partMassKg: TORSO,
  edgeAlignment: 1,
  bladeAlignment: 0,
  nearTip: false,
});

test("Warrior_torso_and_head_use_ten_and_five_durability", () => {
  assert.equal(CONFIG.body.partHealth, 5);
  assert.equal(CONFIG.body.partHealth * CONFIG.body.torsoHealth, 10);
  assert.equal(CONFIG.body.partHealth * CONFIG.body.pelvisHealth, 9);
});

// ---- the energy itself, before anything is scored -------------------------

/**
 * The anchoring table out of `CONFIG.combat`'s own header, reproduced from the masses.
 *
 * This is the test that would catch somebody moving `cutJoulesPerDamage` to make a sweep come
 * out and leaving the comment that derives it in place. Three figures is the width the table is
 * printed to; the constants themselves are pinned to the digit in the tests below.
 */
test("the reduced mass and the arriving energy are the table in the config header", () => {
  const rows = [
    { kind: "sword", massKg: CONFIG.sword.mass, mu: 1.32372, joulesAt11: 80.09, scored: 2.3 },
    { kind: "axe", massKg: CONFIG.axe.mass, mu: 1.37176, joulesAt11: 82.99, scored: 3.2 },
    { kind: "club", massKg: CONFIG.club.mass, mu: 3.23810, joulesAt11: 195.90, scored: 1.7 },
  ];
  for (const row of rows) {
    assert.ok(Math.abs(reduced(row.massKg, TORSO) - row.mu) < 5e-5,
      `${row.kind}'s reduced mass against a torso is ${reduced(row.massKg, TORSO)}`);
    const arriving = impactEnergyJ(row.massKg, TORSO, T.referenceSpeed);
    assert.ok(Math.abs(arriving - row.joulesAt11) < 5e-3,
      `${row.kind} arrives with ${arriving} J at ${T.referenceSpeed} m/s`);
    // And the third column is the second over the row's own constant, which is the whole of the
    // scoring rule for a square blow. Two figures, because that is what the table prints.
    const contact = { closingSpeed: T.referenceSpeed, strikerMassKg: row.massKg,
      partMassKg: TORSO, edgeAlignment: 1, bladeAlignment: 0, nearTip: false };
    assert.ok(Math.abs(scoreHit(contact, row.kind).damage - row.scored) < 5e-3,
      `${row.kind} scored ${scoreHit(contact, row.kind).damage}`);
  }
});

/**
 * The saturation the reduced mass carries with it, which is the reason there is no scale left.
 *
 * A striker can never give a part more than the part's own share. That is one line of algebra --
 * `mu -> M` as `m -> infinity` -- and it is the whole answer to the question the old rows kept
 * being asked in different words: why is a maul not four times a mace. On an arm link it is
 * not, because the link runs away; on a trunk it very nearly is.
 */
test("a striker heavier than what it hits cannot give it more than its own share", () => {
  const enormous = impactEnergyJ(1e9, LINK, 10);
  assert.ok(Math.abs(enormous - 0.5 * LINK * 100) / enormous < 1e-6,
    "a mountain hitting a link gives it the link's own kinetic energy and no more");

  // The plan's claim, checked at the two masses it names. Same speed for both, so the only
  // thing moving is the mass: a maul is within a third of a mace on a limb, and pulls away by
  // four and a half times its own limb blow on a trunk while the mace gains only two and a half.
  const onLink = (m) => impactEnergyJ(m, LINK, 8);
  const onCore = (m) => impactEnergyJ(m, CORE, 8);
  assert.ok(onLink(48) / onLink(18) < 4 / 3,
    `48 kg on a link is ${(onLink(48) / onLink(18)).toFixed(3)} times 18 kg on the same link`);
  assert.ok(onCore(48) / onLink(48) >= 3,
    `48 kg gains only ${(onCore(48) / onLink(48)).toFixed(2)} times moving to a trunk`);
  assert.ok(onCore(18) / onLink(18) < 3,
    "and 18 kg gains less, which is the whole of the weapon triangle");
});

/**
 * An immovable part, which Havok reports as a mass of zero and `Combat` hands on as `Infinity`.
 *
 * The arithmetic has to be written out rather than left to the expression, because
 * `m * Infinity / (m + Infinity)` is `NaN` in JavaScript and a `NaN` damage would travel a long
 * way before anything noticed. What it means physically is that nothing recoils: the striker's
 * whole kinetic energy arrives.
 */
test("an immovable part takes the striker's own energy, and nothing about it is NaN", () => {
  const wall = impactEnergyJ(3.4, Infinity, 11);
  assert.ok(Number.isFinite(wall), `hitting an immovable part scored ${wall}`);
  assert.ok(Math.abs(wall - 0.5 * 3.4 * 121) < 1e-9);
  assert.ok(wall > impactEnergyJ(3.4, CORE, 11), "and it is the most a blow at that speed can be");
});

/**
 * A striker with no mass is a bug, and it is refused rather than scored.
 *
 * Every `Striking` in the program publishes `impactMassKg` and the field is required, so the
 * only way to arrive here is a fake in a test or a striker built from a config row that has not
 * been filled in. Both are worth a name and neither is worth a zero.
 */
test("a contact with no mass behind it, or no mass in front, is refused by name", () => {
  assert.throws(() => impactEnergyJ(0, TORSO, 11), /positive mass/);
  assert.throws(() => impactEnergyJ(undefined, TORSO, 11), /positive mass/);
  assert.throws(() => impactEnergyJ(Infinity, TORSO, 11), /positive mass/,
    "a striker of infinite mass is a mistake, not a very good blow");
  assert.throws(() => impactEnergyJ(1.35, 0, 11), /positive mass/);
  assert.throws(() => impactEnergyJ(1.35, TORSO, NaN), /finite closing speed/);
});

// ---- the blade ------------------------------------------------------------

test("a blade that arrives with too little behind it does not cut, however well it is aimed", () => {
  // `cutFloorJ` is 5.96 J, which is the Warrior's own sword on a torso at 3.0 m/s -- the speed
  // floor this replaced, restated. Stated in energy it is also a statement about a golem's
  // wrist blade on an arm link, and that is the point of the change.
  const floorSpeed = Math.sqrt(2 * T.cutFloorJ / reduced(CONFIG.sword.mass, TORSO));
  assert.ok(Math.abs(floorSpeed - 3.0) < 0.01, `the blade's floor is ${floorSpeed} m/s on a torso`);
  const score = scoreHit(cleanCut(floorSpeed - 0.01));
  assert.equal(score.kind, "weak");
  assert.equal(score.damage, 0);
  assert.ok(scoreHit(cleanCut(floorSpeed + 0.01)).damage > 0, "and just above it, something");
});

test("a square edge-on swing at reference speed is a cut at full quality, and it is 2.3", () => {
  const score = scoreHit(cleanCut());
  assert.equal(score.kind, "cut");
  assert.equal(score.quality, 1);
  // 0.5 x 1.32372 x 11^2 = 80.09 J over `cutJoulesPerDamage`. The number this whole scoring
  // model was anchored to, so that the game the prototype was tuned against is still the game.
  assert.ok(Math.abs(score.damage - 2.3) < 5e-3, `a perfect cut is worth ${score.damage}`);
  assert.ok(Math.abs(score.damage - joules(CONFIG.sword.mass, TORSO, 11) / T.cutJoulesPerDamage)
    < 1e-9);
});

test("the flat of the blade does not cut, no matter how fast it arrives", () => {
  const flat = scoreHit({ ...cleanCut(30), edgeAlignment: 0 });
  assert.equal(flat.kind, "slap");
  assert.equal(flat.damage, 0);
});

test("a slap still outranks a stationary blade, but only just", () => {
  const glancing = scoreHit({ ...cleanCut(20), edgeAlignment: 0.4 });
  assert.equal(glancing.kind, "slap");
  assert.ok(glancing.damage > 0, "a glancing blow is worth something");
  assert.ok(glancing.damage < scoreHit(cleanCut(20)).damage * 0.25);
});

test("a point-first contact near the tip reads as a thrust", () => {
  const score = scoreHit({ ...cleanCut(9), edgeAlignment: 0, bladeAlignment: 1, nearTip: true });
  assert.equal(score.kind, "thrust");
  assert.ok(score.damage > 0);
});

test("the same motion away from the tip is a shove, not a thrust", () => {
  const score = scoreHit({ ...cleanCut(9), edgeAlignment: 0, bladeAlignment: 1, nearTip: false });
  assert.notEqual(score.kind, "thrust");
  assert.equal(score.damage, 0);
});

/**
 * **The ceiling is gone, and this is the test that used to assert it was there.**
 *
 * The old model divided by `referenceSpeed` and clamped at 1, so a cut at 44 m/s was worth
 * exactly a cut at 11 and the assertion read `absurd.damage === fast.damage`. Under energy
 * nothing saturates on the speed axis: a blade arriving four times as fast carries sixteen
 * times the energy and is worth sixteen times as much. What saturates instead is the *mass*
 * axis, which is the test two above this one, and that is a saturation the physics has rather
 * than one a row was given.
 */
test("damage rises with the square of the closing speed and nothing clamps it", () => {
  const at = (v) => scoreHit(cleanCut(v)).damage;
  assert.ok(at(11) > at(4), "faster cuts harder");
  assert.ok(Math.abs(at(22) - 4 * at(11)) < 1e-9, "twice the speed is four times the wound");
  assert.ok(Math.abs(at(44) - 16 * at(11)) < 1e-9, "and there is no ceiling to run into");
});

test("edge alignment is rewarded superlinearly", () => {
  const half = scoreHit({ ...cleanCut(), edgeAlignment: 0.5 });
  const full = scoreHit(cleanCut());
  assert.ok(
    half.damage < full.damage * 0.5 + 1e-9,
    "a half-turned edge should lose more than half the damage",
  );
});

/**
 * The rule that the tip speed a readout prints is not the speed a blow is scored at.
 *
 * `Combat.closingSpeedAt` projects the striker's own velocity on the contact normal, so a blade
 * sliding *along* something arrives at almost nothing however fast the tip is travelling. The
 * pure scorer sees only the projection, and this is the assertion that says a rake pays for the
 * little that went into the surface -- which is the half of Session 03 that Session 01's one
 * claim per stroke could not reach.
 */
test("a contact with no closing speed is nothing, whatever the tip was doing", () => {
  const grazing = scoreHit(cleanCut(0.05));
  assert.equal(grazing.kind, "weak");
  assert.equal(grazing.damage, 0);
  // Blunt says slap rather than weak, because the shove still lands; the damage is the same
  // nothing either way.
  assert.equal(scoreHit({ ...cleanCut(0.05), strikerMassKg: CONFIG.club.mass }, "club").kind,
    "slap");
  assert.equal(scoreHit({ ...cleanCut(0.05), strikerMassKg: CONFIG.club.mass }, "club").damage, 0);
});

test("a limb comes off only when a real cut empties it", () => {
  const cut = scoreHit(cleanCut());
  assert.equal(severs(cut, 0), true);
  assert.equal(severs(cut, 12), false, "a limb with health left stays on");
});

test("beating a limb to nothing with the flat leaves it ruined but attached", () => {
  const flat = scoreHit({ ...cleanCut(30), edgeAlignment: 0.3 });
  assert.equal(flat.kind, "slap");
  assert.equal(severs(flat, -50), false);
});

test("a thrust that empties a limb takes it off", () => {
  const thrust = scoreHit({ ...cleanCut(14), edgeAlignment: 0, bladeAlignment: 1, nearTip: true });
  assert.equal(thrust.kind, "thrust");
  assert.equal(severs(thrust, 0), true);
});

// ---- what a weapon that is not a sword is worth ---------------------------

test("the sword is unchanged by the other kinds existing", () => {
  // Every case above calls `scoreHit` with one argument, and that is the whole point of the kind
  // being a defaulted parameter rather than a field on `Contact`: the damage model this
  // prototype was tuned against is still exactly the damage model, and nothing about a club or
  // an axe being added is allowed to have moved it.
  const cut = cleanCut();
  assert.deepEqual(scoreHit(cut), scoreHit(cut, "sword"));

  // And the sword does not care which way round the blade was travelling, which is what stayed
  // true when `Contact.edgeAlignment` became signed for the axe's sake. An arming sword is
  // double-edged; both edges cut.
  assert.deepEqual(
    scoreHit({ ...cleanCut(9), edgeAlignment: -1 }),
    scoreHit({ ...cleanCut(9), edgeAlignment: 1 }),
  );
});

test("a shield scores nothing however hard it is swung", () => {
  const hard = { closingSpeed: 40, strikerMassKg: CONFIG.shield.mass, partMassKg: TORSO,
    edgeAlignment: 1, bladeAlignment: 1, nearTip: true };
  const score = scoreHit(hard, "shield");
  assert.equal(score.damage, 0);
  assert.equal(score.quality, 0);
  // A slap rather than a kind of its own: `combat.ts` applies its shove regardless of quality,
  // so a shield bash still moves what it hits, and the readout already has a word for a blow
  // that pushes without biting. `inert`'s `joulesPerDamage` is `Infinity`, which is the same
  // statement said in the row's own units.
  assert.equal(score.kind, "slap");
  assert.equal(severs(score, -500, "shield"), false, "a shield cannot take a limb off");
  assert.equal(biteMechanism("shield"), "none");
});

test("a buckler is a shield: it shoves and it scores nothing", () => {
  // Same rule, and deliberately the same rule. A buckler punch is a real technique and this
  // refuses it anyway -- see `scoring.ts` -- because the moment a shield scores, every policy
  // holding one has an offensive option nobody designed and the guard stops being a guard.
  const hard = { closingSpeed: 20, strikerMassKg: 2.0, partMassKg: TORSO,
    edgeAlignment: 1, bladeAlignment: 1, nearTip: true };
  const score = scoreHit(hard, "buckler");
  assert.equal(score.damage, 0, "a buckler does no damage however hard it arrives");
  assert.equal(score.quality, 0);
  assert.equal(score.kind, "slap");
  assert.equal(severs(score, -500, "buckler"), false, "a buckler cannot take a limb off");
  assert.deepEqual(score, scoreHit(hard, "shield"), "and it is scored exactly as a shield is");
});

// ---- the club, and every other blunt thing --------------------------------

/** A square blow with the Warrior's own club on a Warrior's torso. */
const clubBlow = (closingSpeed = T.referenceSpeed) => ({
  closingSpeed,
  strikerMassKg: CONFIG.club.mass,
  partMassKg: TORSO,
  edgeAlignment: 0,
  bladeAlignment: 0,
  nearTip: false,
});

test("a club does not care how it is held, and a square blow is 1.7", () => {
  // The whole character of the weapon. A sword swung flat is a shove; a club has no flat, so the
  // same motion at the same speed is worth the same either way.
  const along = scoreHit({ ...clubBlow(18), edgeAlignment: 1 }, "club");
  const across = scoreHit({ ...clubBlow(18), bladeAlignment: 1, nearTip: true }, "club");
  assert.equal(along.kind, "crush");
  assert.deepEqual(along, across);

  // 0.5 x 3.2381 x 11^2 = 195.90 J over `crushJoulesPerDamage`'s 115.24. The second of the two
  // anchors, and the reason `crushJoulesPerDamage` is three times the blade's: the same joules
  // spread over a club's face bruise where an edge parts.
  const square = scoreHit(clubBlow(), "club");
  assert.ok(Math.abs(square.damage - 1.7) < 5e-3, `a square club blow is worth ${square.damage}`);
  assert.equal(square.quality, 1, "there is nothing to place, so nothing to place badly");
});

test("a club is worth less than a perfect cut and more than a bad one", () => {
  const speed = 14;
  const club = scoreHit(clubBlow(speed), "club");
  const perfect = scoreHit(cleanCut(speed));
  const clumsy = scoreHit({ ...cleanCut(speed), edgeAlignment: 0.35 });

  assert.ok(club.damage < perfect.damage, "a club should not out-damage a placed cut");
  assert.ok(club.damage > clumsy.damage, "but it should beat a cut nobody aimed");
});

test("a club still rises with speed, and still has a floor", () => {
  const at = (speed) => scoreHit(clubBlow(speed), "club").damage;
  // `crushFloorJ` 7.84 J is the club's old 2.2 m/s floor on a torso, restated.
  const floorSpeed = Math.sqrt(2 * T.crushFloorJ / reduced(CONFIG.club.mass, TORSO));
  assert.ok(Math.abs(floorSpeed - 2.2) < 0.01, `the club's floor is ${floorSpeed} m/s on a torso`);
  assert.equal(at(floorSpeed - 0.01), 0, "below its floor it is a nudge");
  assert.ok(Math.abs(at(8) - 4 * at(4)) < 1e-9, "and above it, the square of the speed");
});

test("a club takes a limb off by crushing through it", () => {
  const blow = scoreHit(clubBlow(16), "club");
  // The edge-quality clause has nothing to say about a weapon with no edge, so it is dropped
  // rather than failed. A club that could never sever could only win by flattening all thirteen
  // parts.
  assert.equal(severs(blow, 0, "club"), true);
  assert.equal(severs(blow, 5, "club"), false, "a limb with health left stays on");
});

/**
 * **One blunt row for a bead, a fist, a club, a mace, a maul and a ram plate**, and this is the
 * test that says it is one row.
 *
 * Until 2026-09-06 there were five: `crushScale`, `fistScale`, `ramScale`, `clubReferenceMassKg`
 * and `fistReferenceMassKg`, plus a whip row deliberately made blind to mass so a half-kilogram
 * bead would not be scored as a sixth of a club. Every one of those was a way of writing down a
 * mass ratio in a table. `0.5 mu v^2` writes them all down at once, and the whip's exception
 * answers itself: 0.57 kg at 20 m/s beats 3.4 kg at 11 on a limb, because that is what the
 * arithmetic says and not because a row was told to ignore the bead's weight.
 *
 * The numbers are the prediction table in `docs/plans/style-03-energy-scoring.md`, printed to
 * one decimal there and asserted to that width here -- they were computed from these masses
 * before a line of this was written, which is what makes them a prediction.
 */
test("every blunt striker is the same row, and the prediction table is what it says", () => {
  const table = [
    { what: "mace, 18 kg", massKg: 18, speed: 9, onLink: 2.2, onCore: 5.6 },
    { what: "maul, 48 kg", massKg: 48, speed: 8, onLink: 2.2, onCore: 9.9 },
    { what: "stone fist, 8 kg", massKg: 8, speed: 9, onLink: 1.5, onCore: 2.7 },
    { what: "plate bash, 16.6 kg", massKg: 16.6, speed: 6.3, onLink: 1.0, onCore: 2.6 },
    { what: "whip bead, 0.57 kg", massKg: 0.57, speed: 20, onLink: 0.9, onCore: 1.0 },
  ];
  for (const row of table) {
    const at = (partMassKg) => scoreHit({ closingSpeed: row.speed, strikerMassKg: row.massKg,
      partMassKg, edgeAlignment: 0, bladeAlignment: 0, nearTip: false }, "club").damage;
    assert.ok(Math.abs(at(LINK) - row.onLink) < 0.05,
      `${row.what} on a link scored ${at(LINK).toFixed(2)}, not ${row.onLink}`);
    assert.ok(Math.abs(at(CORE) - row.onCore) < 0.05,
      `${row.what} on a core scored ${at(CORE).toFixed(2)}, not ${row.onCore}`);
  }

  // And the four blunt names are one row to the byte, which is the claim the table above rests
  // on: a whip is a club is a fist is a ram plate, and only the masses differ.
  const contact = { closingSpeed: 9, strikerMassKg: 8, partMassKg: LINK,
    edgeAlignment: 0, bladeAlignment: 0, nearTip: false };
  for (const kind of ["whip", "empty", "ram"]) {
    assert.equal(biteMechanism(kind), "blunt");
    assert.equal(biteFloorJ(kind), biteFloorJ("club"));
    assert.equal(scoreHit(contact, kind).damage, scoreHit(contact, "club").damage);
  }
});

test("a club's floor is lower than a blade's, in joules and in metres per second", () => {
  // A blade arriving slowly is a blade being leaned on. A club arriving slowly is still several
  // kilograms of wood -- and stated in joules that is now true *twice*, because the club's own
  // mass is in the energy as well as in the derivation of the floor. On a torso the blade needs
  // 3.0 m/s and the club 2.2.
  assert.ok(T.crushFloorJ > T.cutFloorJ,
    "the blunt floor is the higher number in joules, which is the surprising half");
  const speedFloor = (kind, massKg) =>
    Math.sqrt(2 * biteFloorJ(kind) / reduced(massKg, TORSO));
  assert.ok(speedFloor("club", CONFIG.club.mass) < speedFloor("sword", CONFIG.sword.mass),
    "and the lower one in metres per second, which is what a fighter feels");

  const slow = 2.6;
  assert.equal(scoreHit(cleanCut(slow)).damage, 0, "a sword does nothing at this speed");
  assert.ok(scoreHit(clubBlow(slow), "club").damage > 0, "a club does");
});

// ---- the axe, which cuts but is not a blade -------------------------------

/** A square, committed chop with the Warrior's axe on a Warrior's torso. */
const chop = (closingSpeed = T.referenceSpeed) => ({
  closingSpeed,
  strikerMassKg: CONFIG.axe.mass,
  partMassKg: TORSO,
  edgeAlignment: 1,
  bladeAlignment: 0,
  nearTip: false,
});

test("an axe cuts with its bit and does nothing with its poll", () => {
  // The whole of what makes it an axe rather than a short heavy sword. A sword is double-edged
  // and the model has always taken the magnitude of the edge alignment; an axe's bit is on +X
  // and its poll is on -X, and a blow arriving at -1 is the back of the head.
  const bit = scoreHit(chop(), "axe");
  const poll = scoreHit({ ...chop(), edgeAlignment: -1 }, "axe");

  assert.equal(bit.kind, "cut");
  assert.ok(Math.abs(bit.damage - 3.2) < 5e-3, `a square chop is worth ${bit.damage}`);
  assert.equal(poll.kind, "slap", "the back of an axe head is not an edge");
  assert.equal(poll.damage, 0);
});

test("an axe cannot be thrust, however well it is driven", () => {
  // A sword's point does this for real damage. An axe has a corner there.
  const contact = { ...chop(14), edgeAlignment: 0, bladeAlignment: 1, nearTip: true };
  assert.equal(scoreHit({ ...contact, strikerMassKg: CONFIG.sword.mass }, "sword").kind, "thrust");

  const axe = scoreHit(contact, "axe");
  assert.equal(axe.kind, "slap", "driving an axe forward is a shove");
  assert.equal(axe.damage, 0);
  assert.equal(severs(axe, -50, "axe"), false, "and a shove takes nothing off");
});

/**
 * An axe placed well hurts more than a sword placed well, and since 2026-09-06 for two reasons
 * rather than one.
 *
 * It always had the cheaper constant -- a hand's width of edge against 840 mm of it -- and now
 * it also has 50 grams more mass, which the old model could not see at all. The test asserts
 * both halves separately, because collapsing them into one inequality is how a change to
 * `chopJoulesPerDamage` could be hidden by a change to `CONFIG.axe.mass`.
 */
test("an axe placed well hurts more than a sword placed well, on both counts", () => {
  const speed = 12;
  assert.ok(scoreHit(chop(speed), "axe").damage > scoreHit(cleanCut(speed)).damage);
  assert.ok(T.chopJoulesPerDamage < T.cutJoulesPerDamage,
    "a hand's width of edge carries the same joules further in than 840 mm of it");
  assert.ok(CONFIG.axe.mass > CONFIG.sword.mass, "and it is the heavier of the two");
  // Same mass on both, so only the constant is left: the ratio the row is worth on its own.
  const sameMass = { ...cleanCut(speed) };
  assert.ok(Math.abs(scoreHit(sameMass, "axe").damage / scoreHit(sameMass, "sword").damage
    - T.cutJoulesPerDamage / T.chopJoulesPerDamage) < 1e-9);
});

test("an axe shares the blade's floor and the blade's bar, and only its constant", () => {
  // Both of the other two were drafted and both were refused by the bench, which is the finding
  // rather than a simplification: an axe's own speed floor moved 24 bouts' total damage by 15
  // points out of 3350, and its own sever bar returned byte-identical numbers at 0.2 and at 0.4,
  // because a chop that empties a limb has already landed at a quality above either.
  // `docs/measurements.md` has the tables. This is here so that putting either back is a
  // decision somebody makes rather than one that happens.
  assert.equal(biteFloorJ("axe"), biteFloorJ("sword"));
  assert.equal(biteMechanism("axe"), biteMechanism("sword"));

  const emptied = chop(15);
  assert.equal(
    severs(scoreHit(emptied, "axe"), 0, "axe"),
    severs(scoreHit({ ...emptied, strikerMassKg: CONFIG.sword.mass }, "sword"), 0, "sword"),
  );
});

// ---- what the table has to answer for every kind --------------------------

/**
 * Every kind names one of four mechanisms and one floor, and `combat.ts` uses the same two.
 *
 * `combat.ts` skips a divide and three dot products for a contact too slight to be worth
 * anything -- and it skipped them on `minCutSpeed`, hard-coded, which was the blade's number and
 * nobody else's. So a club below 3.0 m/s never reached `scoreHit` at all and `minCrushSpeed` did
 * nothing in an actual fight for the whole of the club's life, while passing its own unit test
 * the entire time. `biteFloorJ` and `biteMechanism` exist so there is one answer rather than
 * two, and the early-out now asks for both.
 */
test("every kind names a mechanism and a floor, and they are the ones the caller must use", () => {
  const mechanisms = new Set(["edge", "point", "blunt", "none"]);
  for (const kind of STRIKER_KINDS) {
    const how = biteMechanism(kind);
    assert.ok(mechanisms.has(how), `${kind} named the mechanism ${how}`);
    const floor = biteFloorJ(kind);
    assert.ok(floor > 0, `${kind} needs a floor`);
    // Just under the floor, with everything else perfect: nothing but the shove survives, and
    // only a blunt row reports the shove.
    const under = { closingSpeed: Math.sqrt(2 * (floor - 1e-6) / reduced(4, TORSO)),
      strikerMassKg: 4, partMassKg: TORSO, edgeAlignment: 1, bladeAlignment: 1, nearTip: true };
    const score = scoreHit(under, kind);
    assert.equal(score.damage, 0, `${kind} scored under its own floor`);
    // Blunt says slap because the shove still lands; everything else says weak. **An inert row
    // is on the weak side of that line and it is deliberate**: a shield below the floor is a
    // shield resting on somebody, and it was weak before 2026-09-06 as well. Above the floor it
    // is a slap, which is the branch the shield test higher up reads.
    assert.equal(score.kind, how === "blunt" ? "slap" : "weak",
      `${kind} should report nothing below its own floor`);
  }
  // And the one that was wrong, which is the reason the export exists.
  assert.ok(biteFloorJ("arrow") < biteFloorJ("sword"));
  assert.ok(biteFloorJ("sword") < biteFloorJ("club"));
});

test("a_fast_fist_crushes_but_never_cuts_or_severs", () => {
  const fist = scoreHit(
    { closingSpeed: 9, strikerMassKg: CONFIG.arm.handMass, partMassKg: TORSO,
      edgeAlignment: 1, bladeAlignment: 1, nearTip: true },
    "empty",
  );
  assert.equal(fist.kind, "crush", "a fist hurts by mass, never by an imaginary edge");
  // 0.5 x (0.65 x 68 / 68.65) x 81 = 26.08 J over 115.24. It was 0.9 under the old `fistScale`
  // and it is 0.23 now, which is the largest single fall in this session and is the model
  // saying that a bare hand on a chest is not a quarter of a sword cut. The entry reports it.
  assert.ok(Math.abs(fist.damage - 0.2263) < 5e-4, `a punch is worth ${fist.damage}`);
  assert.equal(severs(fist, -500, "empty"), false, "a punch never takes a limb off");
});

test("a_slow_fist_is_a_shove_worth_nothing", () => {
  // The floor a fist actually feels moved from 3.5 m/s to 4.94, because a 0.65 kg hand carries
  // far less energy at a given speed than the 3.4 kg club the blunt floor is derived from. That
  // is a real change to the Warrior's punch and it is stated here rather than left to be found.
  const floorSpeed = Math.sqrt(2 * biteFloorJ("empty") / reduced(CONFIG.arm.handMass, TORSO));
  assert.ok(Math.abs(floorSpeed - 4.94) < 0.01, `a fist's floor is ${floorSpeed} m/s on a torso`);
  const fist = scoreHit(
    { closingSpeed: floorSpeed - 0.01, strikerMassKg: CONFIG.arm.handMass, partMassKg: TORSO,
      edgeAlignment: 1, bladeAlignment: 1, nearTip: true },
    "empty",
  );
  assert.equal(fist.kind, "slap");
  assert.equal(fist.damage, 0);
  assert.equal(severs(fist, -500, "empty"), false);
});

test("no kind that scores nothing can ever take a limb off", () => {
  const hard = { closingSpeed: 40, strikerMassKg: 8, partMassKg: TORSO,
    edgeAlignment: 1, bladeAlignment: 1, nearTip: true };
  for (const kind of WEAPON_KINDS) {
    const score = scoreHit(hard, kind);
    if (score.damage > 0) continue;
    assert.equal(severs(score, -500, kind), false, `${kind} scores nothing and must sever nothing`);
  }
});

// ---- the arrow, and the point mechanism -----------------------------------

/** A shaft arriving point-first on a Warrior's torso. */
const shot = (closingSpeed) => ({
  closingSpeed,
  strikerMassKg: CONFIG.arrow.mass,
  partMassKg: TORSO,
  edgeAlignment: 0,
  bladeAlignment: 1,
  nearTip: false,
});

test("an arrow scores on how straight it arrived and on nothing else", () => {
  // All point, no edge. `edgeAlignment` is the number the whole sword model is built on and an
  // arrow does not read it: swapped end for end, the same shot is worth exactly the same.
  const straight = scoreHit({ ...shot(45), edgeAlignment: 1, nearTip: true }, "arrow");
  const edgeless = scoreHit(shot(45), "arrow");
  assert.equal(straight.damage, edgeless.damage, "the edge axis means nothing to an arrow");
  assert.equal(straight.kind, "thrust");
  // And `nearTip` means nothing either: an arrow is its own point along its whole length, which
  // is why it is `how: "point"` rather than the blade's thrust branch.
  assert.equal(straight.quality, edgeless.quality);

  // Broadside is a stick hitting somebody. **The energy is taken again at the axial speed rather
  // than scaled by the alignment**, which is why a tenth of the alignment is a hundredth of the
  // energy: 45 m/s at a tenth is 4.5 m/s of arrival, 0.35 J, under the 1.12 J it costs a point
  // to get in at all. So a badly tumbling shaft is not worth a fraction of a hit -- it is worth
  // nothing, and says so.
  const tumbling = scoreHit({ ...shot(45), bladeAlignment: 0.1 }, "arrow");
  assert.equal(tumbling.kind, "weak");
  assert.equal(tumbling.damage, 0);

  // Half-turned rather than sideways: 13.5 m/s of arrival gets in, and the alignment squared is
  // 0.09, which is under the quarter that separates a thrust from a shove. A slap worth a
  // sixteenth of the clean shot.
  const turned = scoreHit({ ...shot(45), bladeAlignment: 0.3 }, "arrow");
  assert.equal(turned.kind, "slap");
  assert.ok(turned.damage > 0 && turned.damage < straight.damage * 0.1,
    `a half-turned shaft scored ${turned.damage}`);
});

test("a bow at half draw is worth about 40 % of a full one, and that needs no reference", () => {
  // The knob this used to catch: `combat.referenceSpeed` is 11 m/s, a *blade's* number. Scored
  // against it, every arrow that arrives straight -- 22 m/s from a bow at `minDraw` as much as
  // 48 from a full one -- saturated the speed term and did identical damage, and the draw was a
  // control that changed nothing. It needed a reference of its own then. Under energy there is
  // no reference at all: the square of the speed is the answer and a half draw is 0.21 of a
  // full one before the floor, a little more after it.
  const at = (speed) => scoreHit(shot(speed), "arrow").damage;
  const full = at(CONFIG.arrow.speedMax);
  const half = at(CONFIG.arrow.speedMin);
  assert.ok(full > 0 && half > 0);
  assert.ok(half < full * 0.75, `a short draw is worth much less: ${half.toFixed(2)} vs ${full.toFixed(2)}`);
  assert.ok(half > full * 0.15, "but not nothing");
});

test("an arrow never takes a limb off, however hard it lands", () => {
  const best = scoreHit({ ...shot(200), edgeAlignment: 1, nearTip: true }, "arrow");
  assert.equal(best.quality, 1, "as well delivered as a blow can be");
  assert.equal(severs(best, -1000, "arrow"), false, "and it still leaves the arm on");
});

test("a bow is worth nothing swung, like the shields", () => {
  const swung = scoreHit(
    { closingSpeed: 30, strikerMassKg: CONFIG.bow.mass, partMassKg: TORSO,
      edgeAlignment: 1, bladeAlignment: 1, nearTip: true },
    "bow",
  );
  assert.equal(swung.damage, 0);
  assert.equal(severs(swung, -100, "bow"), false);
});

test("an arrow needs far more speed than a blade before it is worth anything", () => {
  // **The floor runs the other way from the club's, and in joules it looks like the opposite of
  // what it is.** `pointFloorJ` is 1.12 J, the lowest of the three; but an arrow weighs 35
  // grams, so 1.12 J is 8.0 m/s for it while `cutFloorJ`'s 5.96 J is 3.0 m/s for a sword. A
  // floor in joules is a statement about a wound and a floor in metres per second is a statement
  // about a weapon, and the two orders disagree exactly because the masses do.
  assert.ok(biteFloorJ("arrow") < biteFloorJ("sword"), "in joules the point's floor is lowest");
  const speedFloor = (kind, massKg) => Math.sqrt(2 * biteFloorJ(kind) / reduced(massKg, TORSO));
  const arrowFloor = speedFloor("arrow", CONFIG.arrow.mass);
  assert.ok(Math.abs(arrowFloor - 8.0) < 0.01, `an arrow's floor is ${arrowFloor} m/s on a torso`);
  assert.ok(arrowFloor > speedFloor("sword", CONFIG.sword.mass),
    "and in metres per second it is the highest, which is the number a fletcher would quote");

  const drifting = scoreHit(shot(arrowFloor - 0.1), "arrow");
  assert.equal(drifting.kind, "weak");
  assert.equal(drifting.damage, 0);
});

// ---- the two rows the entry quotes ----------------------------------------

/**
 * The Warrior's four blows, at the numbers this session left them at.
 *
 * Every one is `0.5 mu v^2` over one of three constants and every one is written out beside its
 * assertion, so a change to any constant lands here as a number a reader can check by hand
 * rather than as an inequality that quietly still holds. Three of the four were pinned to the
 * digit by construction; the punch is the one that moved, and it moved a long way.
 */
test("the Warrior's cut, thrust, chop and punch, with the arithmetic beside them", () => {
  const swordE = joules(CONFIG.sword.mass, TORSO, 11);
  assert.ok(Math.abs(swordE - 80.09) < 5e-3);

  const cut = scoreHit(cleanCut());
  assert.ok(Math.abs(cut.damage - swordE / T.cutJoulesPerDamage) < 1e-9);
  assert.ok(Math.abs(cut.damage - 2.3) < 5e-3, `the perfect cut is ${cut.damage}`);

  // A thrust at the same speed is the same number, because a square thrust is quality 1 exactly
  // as a square cut is and the two share `cutJoulesPerDamage`. What separates them is what it
  // takes to be square: a cut wants the edge aligned and a thrust wants the shaft aligned and
  // the contact inside `thrustTipZone`.
  const thrust = scoreHit({ ...cleanCut(), edgeAlignment: 0, bladeAlignment: 1, nearTip: true });
  assert.equal(thrust.kind, "thrust");
  assert.ok(Math.abs(thrust.damage - cut.damage) < 1e-9);

  const chopped = scoreHit(chop(), "axe");
  assert.ok(Math.abs(chopped.damage - joules(CONFIG.axe.mass, TORSO, 11) / T.chopJoulesPerDamage)
    < 1e-9);
  assert.ok(Math.abs(chopped.damage - 3.2) < 5e-3, `the perfect chop is ${chopped.damage}`);

  // The punch, at 9 m/s, which is what a Warrior's hand reaches. 0.6438 kg of reduced mass is
  // 26.08 J, and a chest costs 115.24 J a point. It was 0.9 under `fistScale` and it is 0.23.
  const punch = scoreHit({ closingSpeed: 9, strikerMassKg: CONFIG.arm.handMass, partMassKg: TORSO,
    edgeAlignment: 0, bladeAlignment: 0, nearTip: false }, "empty");
  assert.ok(Math.abs(punch.damage - joules(CONFIG.arm.handMass, TORSO, 9) / T.crushJoulesPerDamage)
    < 1e-9);
  assert.ok(Math.abs(punch.damage - 0.226) < 5e-4, `the punch is ${punch.damage}`);
});

/**
 * The blade row of the prediction table, which is the row the whole set is aimed at.
 *
 * A golem's wrist blade is 1.30 kg and the two things it hits are a 9.4 kg arm link and a 139 kg
 * trunk core. The plan printed 1.3 and 1.5 at 9 m/s and 2.0 and 2.2 at 11, computed from these
 * masses before any of this existed. What it says is that a blade is nearly the same weapon
 * whatever it lands on -- a 1.30 kg edge is light against both -- which is exactly the contrast
 * with the maul two tests above.
 */
test("a golem's blade is worth the same on a limb as on a trunk, to within a sixth", () => {
  const at = (partMassKg, speed) => scoreHit({ closingSpeed: speed, strikerMassKg: 1.30,
    partMassKg, edgeAlignment: 1, bladeAlignment: 0, nearTip: false }, "sword").damage;
  const rows = [
    { speed: 9, onLink: 1.3, onCore: 1.5 },
    { speed: 11, onLink: 2.0, onCore: 2.2 },
  ];
  for (const row of rows) {
    assert.ok(Math.abs(at(LINK, row.speed) - row.onLink) < 0.05,
      `a blade at ${row.speed} on a link scored ${at(LINK, row.speed).toFixed(2)}`);
    assert.ok(Math.abs(at(CORE, row.speed) - row.onCore) < 0.05,
      `a blade at ${row.speed} on a core scored ${at(CORE, row.speed).toFixed(2)}`);
    assert.ok(at(CORE, row.speed) / at(LINK, row.speed) < 7 / 6,
      "a light edge barely notices what it is hitting");
  }
});
