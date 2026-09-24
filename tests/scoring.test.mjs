import test from "node:test";
import assert from "node:assert/strict";

import { armourAgainst, armouredDamage, biteFloorJ, biteMechanism, cutEnergyJ, impactEnergyJ,
  scoreHit, severs } from "../src/scoring.ts";
import { CONFIG } from "../src/config.ts";
import { STRIKER_KINDS, WEAPON_KINDS } from "../src/hands.ts";
import { TERMINAL_BLADE, TERMINAL_MACE } from "../src/golem/config.ts";
import { RIBCAGE, SKELETAL_REACH, SKELETON_ARMOUR } from "../src/golem/skeleton/body.ts";

const T = CONFIG.combat;

/** A struck part as `severs` reads it, after the blow: what is left of it, out of ten. */
const struck = (health, maxHealth = 10) => ({ health, maxHealth });

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
 *
 * **Since physical contact session 05 each of those weapons arrives with a stone arm behind it.**
 * `Combat` prices the effective mass of the whole chain at the contact rather than a mass the
 * striker declared, and the prices were raised by what the chain adds (`CONFIG.combat`'s
 * header). So the Warrior fixtures below strike with `behindChain` of their own mass: the mass
 * whose reduced mass against a torso is the chain factor times the bare weapon's. Every anchor
 * then holds to the digit it did, and the bare weapon's figures are the anchor over the factor.
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

/**
 * What a stone golem's chain adds behind each mechanism: the factors `CONFIG.combat`'s prices and
 * floors were raised by when `Combat` began reading the effective mass (physical contact 05).
 * Written out, like `LINK` and `CORE`, so a price that moves without its table goes red here.
 */
const EDGE_CHAIN = 1.783;
const BLUNT_CHAIN = 3.786;
/**
 * The striker mass that arrives on a torso with `chain` times the bare weapon's reduced mass --
 * the Warrior's weapon with a stone arm behind it. `mu' = chain mu`, and `m' = mu' M / (M - mu')`.
 */
const behindChain = (massKg, chain) => {
  const mu = chain * reduced(massKg, TORSO);
  return (mu * TORSO) / (TORSO - mu);
};
const SWORD = behindChain(CONFIG.sword.mass, EDGE_CHAIN);
const AXE = behindChain(CONFIG.axe.mass, EDGE_CHAIN);
const CLUB = behindChain(CONFIG.club.mass, BLUNT_CHAIN);
const FIST = behindChain(CONFIG.arm.handMass, BLUNT_CHAIN);
/**
 * The tuning before the chain factors, for the two prediction tables that were printed at it for
 * bare masses. Only the price and the floor moved, so a table scored here is still a prediction.
 */
const PRE_CHAIN = { ...T,
  cutJoulesPerDamage: T.cutJoulesPerDamage / EDGE_CHAIN, cutFloorJ: T.cutFloorJ / EDGE_CHAIN,
  crushJoulesPerDamage: T.crushJoulesPerDamage / BLUNT_CHAIN,
  crushFloorJ: T.crushFloorJ / BLUNT_CHAIN };

/** A square, committed edge-on swing with the Warrior's own sword on a Warrior's torso. */
const cleanCut = (closingSpeed = T.referenceSpeed) => ({
  closingSpeed,
  strikerMassKg: SWORD,
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
 * printed to; the constants themselves are pinned to the digit in the tests below. Each price is
 * the energy over what it scored, times the chain factor, to the hundredth it is written to.
 */
test("the reduced mass and the arriving energy are the table in the config header", () => {
  const rows = [
    { kind: "sword", massKg: CONFIG.sword.mass, mu: 1.32372, joulesAt11: 80.09, scored: 2.3,
      chain: EDGE_CHAIN, price: T.cutJoulesPerDamage },
    { kind: "axe", massKg: CONFIG.axe.mass, mu: 1.37176, joulesAt11: 82.99, scored: 3.2,
      chain: EDGE_CHAIN, price: T.chopJoulesPerDamage },
    { kind: "club", massKg: CONFIG.club.mass, mu: 3.23810, joulesAt11: 195.90, scored: 1.7,
      chain: BLUNT_CHAIN, price: T.crushJoulesPerDamage },
  ];
  for (const row of rows) {
    assert.ok(Math.abs(reduced(row.massKg, TORSO) - row.mu) < 5e-5,
      `${row.kind}'s reduced mass against a torso is ${reduced(row.massKg, TORSO)}`);
    const arriving = impactEnergyJ(row.massKg, TORSO, T.referenceSpeed);
    assert.ok(Math.abs(arriving - row.joulesAt11) < 5e-3,
      `${row.kind} arrives with ${arriving} J at ${T.referenceSpeed} m/s`);
    assert.ok(Math.abs(row.price - (row.joulesAt11 / row.scored) * row.chain) < 0.01,
      `${row.kind}'s price is ${row.price}, not ${row.joulesAt11} / ${row.scored} x ${row.chain}`);
    // And the third column is the second over the row's own constant, which is the whole of the
    // scoring rule for a square blow -- for the weapon with a stone arm's chain behind it, and the
    // bare weapon scores that over the factor. Two figures, because that is what the table prints.
    const contact = { closingSpeed: T.referenceSpeed,
      strikerMassKg: behindChain(row.massKg, row.chain), partMassKg: TORSO, edgeAlignment: 1, bladeAlignment: 0, nearTip: false };
    assert.ok(Math.abs(scoreHit(contact, row.kind).damage - row.scored) < 5e-3,
      `${row.kind} scored ${scoreHit(contact, row.kind).damage}`);
    const bare = { ...contact, strikerMassKg: row.massKg };
    assert.ok(Math.abs(scoreHit(bare, row.kind).damage - row.scored / row.chain) < 5e-3,
      `the bare ${row.kind} scored ${scoreHit(bare, row.kind).damage}`);
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
 * `Combat` reads every striker's mass off its body at the contact (`effectiveMassAt`), so the
 * only way to arrive here is a fake in a test or a striker whose body carries no mass -- a static
 * or keyframed body built without one, which the walk reads as `Infinity`. Both are worth a name
 * and neither is worth a zero.
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
  // `cutFloorJ` is 10.62 J, which is the Warrior's own sword with a stone arm behind it on a
  // torso at 3.0 m/s -- the speed floor this replaced, restated. Stated in energy it is also a
  // statement about a golem's wrist blade on an arm link, and that is the point of the change.
  // The bare 1.35 kg blade needs 3.0 x sqrt(1.783) = 4.01 m/s.
  const floorSpeed = Math.sqrt(2 * T.cutFloorJ / reduced(SWORD, TORSO));
  assert.ok(Math.abs(floorSpeed - 3.0) < 0.01, `the blade's floor is ${floorSpeed} m/s on a torso`);
  const bareFloor = Math.sqrt(2 * T.cutFloorJ / reduced(CONFIG.sword.mass, TORSO));
  assert.ok(Math.abs(bareFloor - 4.01) < 0.01, `the bare blade's floor is ${bareFloor} m/s`);
  const score = scoreHit(cleanCut(floorSpeed - 0.01));
  assert.equal(score.kind, "weak");
  assert.equal(score.damage, 0);
  assert.ok(scoreHit(cleanCut(floorSpeed + 0.01)).damage > 0, "and just above it, something");
});

test("a square edge-on swing at reference speed is a cut at full quality, and it is 2.3", () => {
  const score = scoreHit(cleanCut());
  assert.equal(score.kind, "cut");
  assert.equal(score.quality, 1);
  // 0.5 x 1.32372 x 1.783 x 11^2 = 142.80 J over `cutJoulesPerDamage`'s 62.08. The number this
  // whole scoring model was anchored to, so that the game the prototype was tuned against is
  // still the game.
  assert.ok(Math.abs(score.damage - 2.3) < 5e-3, `a perfect cut is worth ${score.damage}`);
  assert.ok(Math.abs(score.damage - joules(SWORD, TORSO, 11) / T.cutJoulesPerDamage) < 1e-9);
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
  assert.equal(severs(cut, struck(0)), true);
  assert.equal(severs(cut, struck(12)), false, "a limb with health left stays on");
});

test("beating a limb to nothing with the flat leaves it ruined but attached, until it breaks", () => {
  const flat = scoreHit({ ...cleanCut(30), edgeAlignment: 0.3 });
  assert.equal(flat.kind, "slap");
  assert.ok(flat.damage > 0, "a flat blow that wounds nothing can say nothing about breaking");
  assert.equal(severs(flat, struck(0)), false, "the flat blow that empties a limb took it off");
  // The breaking point, 2026-09-22: a ruined limb that goes on being hit comes off, whatever hits
  // it. Bracketed on both sides, and scaled by the part, because a rule read at one point is a
  // rule that could be any rule through that point.
  const breaking = -T.severMargin * 10;
  assert.ok(breaking < 0, "a breaking point at empty would make the flat blow's bar mean nothing");
  assert.equal(severs(flat, struck(breaking)), true, "a limb beaten past its breaking point stayed on");
  assert.equal(severs(flat, struck(breaking + 1e-6)), false, "a limb broke short of its breaking point");
  assert.equal(severs(flat, struck(breaking, 20)), false, "a bigger part breaks no deeper than a small one");
  assert.equal(severs({ ...flat, damage: 0 }, struck(breaking * 10)), false,
    "a touch that wounded nothing broke a limb");
});

test("a thrust that empties a limb takes it off", () => {
  const thrust = scoreHit({ ...cleanCut(14), edgeAlignment: 0, bladeAlignment: 1, nearTip: true });
  assert.equal(thrust.kind, "thrust");
  assert.equal(severs(thrust, struck(0)), true);
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
  assert.equal(severs(score, struck(-500), "shield"), false, "a shield cannot take a limb off");
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
  assert.equal(severs(score, struck(-500), "buckler"), false, "a buckler cannot take a limb off");
  assert.deepEqual(score, scoreHit(hard, "shield"), "and it is scored exactly as a shield is");
});

// ---- the club, and every other blunt thing --------------------------------

/** A square blow with the Warrior's own club on a Warrior's torso. */
const clubBlow = (closingSpeed = T.referenceSpeed) => ({
  closingSpeed,
  strikerMassKg: CLUB,
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

  // 0.5 x 3.2381 x 3.786 x 11^2 = 741.68 J over `crushJoulesPerDamage`'s 436.29. The second of
  // the two anchors. Before the chain factors `crushJoulesPerDamage` was three and a third times
  // the blade's because the same joules spread over a club's face bruise where an edge parts; it
  // is seven now because a chain puts twice as much behind a heavy head as behind a blade.
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
  // `crushFloorJ` 29.67 J is the club's old 2.2 m/s floor on a torso, restated for the club
  // with a stone arm behind it. The bare 3.4 kg club needs 2.2 x sqrt(3.786) = 4.28 m/s.
  const floorSpeed = Math.sqrt(2 * T.crushFloorJ / reduced(CLUB, TORSO));
  assert.ok(Math.abs(floorSpeed - 2.2) < 0.01, `the club's floor is ${floorSpeed} m/s on a torso`);
  assert.equal(at(floorSpeed - 0.01), 0, "below its floor it is a nudge");
  assert.ok(Math.abs(at(8) - 4 * at(4)) < 1e-9, "and above it, the square of the speed");
});

test("a club takes a limb off by crushing through it", () => {
  const blow = scoreHit(clubBlow(16), "club");
  // The edge-quality clause has nothing to say about a weapon with no edge, so it is dropped
  // rather than failed. A club that could never sever could only win by flattening all thirteen
  // parts.
  assert.equal(severs(blow, struck(0), "club"), true);
  assert.equal(severs(blow, struck(5), "club"), false, "a limb with health left stays on");
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
 * before a line of this was written, which is what makes them a prediction. They are scored at
 * `PRE_CHAIN`, the tuning they were printed at: the chain moved the price, not the arithmetic.
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
      partMassKg, edgeAlignment: 0, bladeAlignment: 0, nearTip: false }, "club", PRE_CHAIN).damage;
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
  // mass is in the energy as well as in the derivation of the floor. On a torso, each with a stone
  // arm behind it, the blade needs 3.0 m/s and the club 2.2. Bare, the order flips (4.01 against
  // 4.28), because a chain couples more behind a heavy head than behind a blade.
  assert.ok(T.crushFloorJ > T.cutFloorJ,
    "the blunt floor is the higher number in joules, which is the surprising half");
  const speedFloor = (kind, massKg) =>
    Math.sqrt(2 * biteFloorJ(kind) / reduced(massKg, TORSO));
  assert.ok(speedFloor("club", CLUB) < speedFloor("sword", SWORD),
    "and the lower one in metres per second, which is what a fighter feels");

  const slow = 2.6;
  assert.equal(scoreHit(cleanCut(slow)).damage, 0, "a sword does nothing at this speed");
  assert.ok(scoreHit(clubBlow(slow), "club").damage > 0, "a club does");
});

// ---- the axe, which cuts but is not a blade -------------------------------

/** A square, committed chop with the Warrior's axe on a Warrior's torso. */
const chop = (closingSpeed = T.referenceSpeed) => ({
  closingSpeed,
  strikerMassKg: AXE,
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
  assert.equal(severs(axe, struck(-50), "axe"), false, "and a shove takes nothing off");
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
  assert.ok(AXE > SWORD, "with the same arm behind each");
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
    severs(scoreHit(emptied, "axe"), struck(0), "axe"),
    severs(scoreHit({ ...emptied, strikerMassKg: CONFIG.sword.mass }, "sword"), struck(0), "sword"),
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

test("a_fast_fist_crushes_never_cuts_and_severs_only_past_the_breaking_point", () => {
  const fist = scoreHit(
    { closingSpeed: 9, strikerMassKg: FIST, partMassKg: TORSO,
      edgeAlignment: 1, bladeAlignment: 1, nearTip: true },
    "empty",
  );
  assert.equal(fist.kind, "crush", "a fist hurts by mass, never by an imaginary edge");
  // 0.5 x (0.65 x 68 / 68.65) x 3.786 x 81 = 98.73 J over 436.29. It was 0.9 under the old
  // `fistScale` and it is 0.23 now, which is the largest single fall in this session and is the
  // model saying that a bare hand on a chest is not a quarter of a sword cut.
  assert.ok(Math.abs(fist.damage - 0.2263) < 5e-4, `a punch is worth ${fist.damage}`);
  assert.equal(severs(fist, struck(0), "empty"), false, "a punch never takes off a limb it empties");
  assert.equal(severs(fist, struck(-T.severMargin * 10), "empty"), true,
    "a limb already beaten past its breaking point stayed on under a punch");
});

test("a_slow_fist_is_a_shove_worth_nothing", () => {
  // The floor a fist actually feels moved from 3.5 m/s to 4.94, because a 0.65 kg hand carries
  // far less energy at a given speed than the 3.4 kg club the blunt floor is derived from. That
  // is a real change to the Warrior's punch and it is stated here rather than left to be found.
  const floorSpeed = Math.sqrt(2 * biteFloorJ("empty") / reduced(FIST, TORSO));
  assert.ok(Math.abs(floorSpeed - 4.94) < 0.01, `a fist's floor is ${floorSpeed} m/s on a torso`);
  const fist = scoreHit(
    { closingSpeed: floorSpeed - 0.01, strikerMassKg: FIST, partMassKg: TORSO,
      edgeAlignment: 1, bladeAlignment: 1, nearTip: true },
    "empty",
  );
  assert.equal(fist.kind, "slap");
  assert.equal(fist.damage, 0);
  assert.equal(severs(fist, struck(-500), "empty"), false);
});

test("no kind that scores nothing can ever take a limb off", () => {
  const hard = { closingSpeed: 40, strikerMassKg: 8, partMassKg: TORSO,
    edgeAlignment: 1, bladeAlignment: 1, nearTip: true };
  for (const kind of WEAPON_KINDS) {
    const score = scoreHit(hard, kind);
    if (score.damage > 0) continue;
    assert.equal(severs(score, struck(-500), kind), false, `${kind} scores nothing and must sever nothing`);
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

test("an arrow never takes off a limb it empties, however hard it lands", () => {
  const best = scoreHit({ ...shot(200), edgeAlignment: 1, nearTip: true }, "arrow");
  assert.equal(best.quality, 1, "as well delivered as a blow can be");
  assert.equal(severs(best, struck(0), "arrow"), false, "and it still leaves the arm on");
  // Past the breaking point nothing is being taken off by the arrow: the joint has gone.
  assert.equal(severs(best, struck(-T.severMargin * 10), "arrow"), true);
});

test("a bow is worth nothing swung, like the shields", () => {
  const swung = scoreHit(
    { closingSpeed: 30, strikerMassKg: CONFIG.bow.mass, partMassKg: TORSO,
      edgeAlignment: 1, bladeAlignment: 1, nearTip: true },
    "bow",
  );
  assert.equal(swung.damage, 0);
  assert.equal(severs(swung, struck(-100), "bow"), false);
});

test("an arrow needs far more speed than a blade before it is worth anything", () => {
  // **The floor runs the other way from the club's, and in joules it looks like the opposite of
  // what it is.** `pointFloorJ` is 1.12 J, the lowest of the three; but an arrow weighs 35
  // grams, so 1.12 J is 8.0 m/s for it while `cutFloorJ`'s 10.62 J is 4.01 m/s for a sword. A
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
  // 80.09 J for the bare sword, times the 1.783 a stone arm adds behind it.
  const swordE = joules(SWORD, TORSO, 11);
  assert.ok(Math.abs(swordE / EDGE_CHAIN - 80.09) < 5e-3);

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
  assert.ok(Math.abs(chopped.damage - joules(AXE, TORSO, 11) / T.chopJoulesPerDamage) < 1e-9);
  assert.ok(Math.abs(chopped.damage - 3.2) < 5e-3, `the perfect chop is ${chopped.damage}`);

  // The punch, at 9 m/s, which is what a Warrior's hand reaches. 0.6438 kg of reduced mass times
  // the 3.786 behind it is 98.73 J, and a chest costs 436.29 J a point. It was 0.9 under
  // `fistScale` and it is 0.23.
  const punch = scoreHit({ closingSpeed: 9, strikerMassKg: FIST, partMassKg: TORSO,
    edgeAlignment: 0, bladeAlignment: 0, nearTip: false }, "empty");
  assert.ok(Math.abs(punch.damage - joules(FIST, TORSO, 9) / T.crushJoulesPerDamage) < 1e-9);
  assert.ok(Math.abs(punch.damage - 0.226) < 5e-4, `the punch is ${punch.damage}`);
});

/**
 * The blade row of the prediction table, which is the row the whole set is aimed at.
 *
 * A golem's wrist blade is 1.30 kg and the two things it hits are a 9.4 kg arm link and a 139 kg
 * trunk core. The plan printed 1.3 and 1.5 at 9 m/s and 2.0 and 2.2 at 11, computed from these
 * masses before any of this existed. What it says is that a blade is nearly the same weapon
 * whatever it lands on -- a 1.30 kg edge is light against both -- which is exactly the contrast
 * with the maul two tests above. Scored at `PRE_CHAIN`, the tuning the table was printed at.
 */
test("a golem's blade is worth the same on a limb as on a trunk, to within a sixth", () => {
  const at = (partMassKg, speed) => scoreHit({ closingSpeed: speed, strikerMassKg: 1.30,
    partMassKg, edgeAlignment: 1, bladeAlignment: 0, nearTip: false }, "sword", PRE_CHAIN).damage;
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

// ---- the damage-shape dial ------------------------------------------------

/**
 * `damageSpeedExponent` is the dial AV asked for, and its whole safety argument is that the
 * shipped value takes a branch which is the old expression *to the bit*. These pin that, pin the
 * pivot's meaning, and pin the one property the dial exists to deliver.
 */
test("the_shipped_damage_exponent_is_kinetic_energy_to_the_bit", () => {
  assert.equal(T.damageSpeedExponent, 2);
  for (const v of [3.1, 5, 7.25, 11, 19.87]) {
    const contact = cleanCut(v);
    const expected = joules(SWORD, TORSO, v) / T.cutJoulesPerDamage;
    assert.equal(scoreHit(contact, "sword").damage, expected,
      `a clean cut at ${v} m/s must price exactly as energy over joules-per-damage`);
  }
});

// Every speed below is above `cutFloorJ`, which for this fixture is 3.00 m/s. Under the floor a
// clean cut scores exactly zero and every ratio these tests take is degenerate -- which is itself
// the point AT measured, and is why the numbers here are not the ones a bout actually sees.
test("the_damage_pivot_is_the_speed_the_exponent_leaves_alone", () => {
  const pivot = 5.0;
  const tuned = { ...T, damageSpeedExponent: 1, damagePivotSpeed: pivot };
  const atPivot = scoreHit(cleanCut(pivot), "sword", tuned).damage;
  const shipped = scoreHit(cleanCut(pivot), "sword").damage;
  assert.ok(Math.abs(atPivot - shipped) < 1e-9,
    `at the pivot speed the exponent must change nothing: ${atPivot} against ${shipped}`);
});

test("a_lower_damage_exponent_compresses_the_spread_between_a_slow_and_a_fast_blow", () => {
  const pivot = 5.0;
  const tuned = { ...T, damageSpeedExponent: 1, damagePivotSpeed: pivot };
  const slow = 4.0;
  const fast = 12.0;
  const spreadAt = (t) => scoreHit(cleanCut(fast), "sword", t).damage
    / scoreHit(cleanCut(slow), "sword", t).damage;
  // Squared against linear in speed, so the ratio of ratios is exactly the speed ratio itself.
  assert.ok(Math.abs(spreadAt(T) - (fast / slow) ** 2) < 1e-9, "shipped spread is the speed ratio squared");
  assert.ok(Math.abs(spreadAt(tuned) - fast / slow) < 1e-9, "at exponent 1 the spread is the speed ratio");
  assert.ok(spreadAt(tuned) < spreadAt(T), "the dial's whole purpose is a narrower spread");
});

test("the_damage_dial_leaves_mass_scaling_exactly_where_physics_puts_it", () => {
  const tuned = { ...T, damageSpeedExponent: 1, damagePivotSpeed: 5.0 };
  const heavy = { ...cleanCut(5.0), strikerMassKg: SWORD * 8 };
  const light = cleanCut(5.0);
  const ratio = scoreHit(heavy, "sword", tuned).damage / scoreHit(light, "sword", tuned).damage;
  const massRatio = reduced(SWORD * 8, TORSO) / reduced(SWORD, TORSO);
  assert.ok(Math.abs(ratio - massRatio) < 1e-9,
    `only the speed term bends: ${ratio} must be the reduced-mass ratio ${massRatio}`);
});

// ---- the draw, which an edge is paid for only when the owner says so ------

/**
 * **`drawFraction` is 0 in the tree and these tests are mostly about that.**
 *
 * `impactEnergyJ` squares the closing speed alone, on the argument at the head of `scoring.ts`:
 * only the normal component of a collision is lost to deformation. BU measured what that costs a
 * golem -- it makes blade speed by rotating, rotation is tangential, and the share of speed driven
 * into the surface *falls* from 0.39 at 2-4 m/s to 0.22 at 15-20, so its hardest and best-aligned
 * cuts are the ones the law pays least for. `drawFraction` exists so the owner can price that, and
 * defaults to nothing so the tree is unchanged until they do.
 *
 * The four tests below are the four things that have to be true for that default to be honest.
 */
const drawnCut = (closingSpeed, speed, edgeAlignment = 1) => ({
  closingSpeed, speed, edgeAlignment,
  strikerMassKg: SWORD,
  partMassKg: TORSO,
  bladeAlignment: 0,
  nearTip: false,
});

/** Runs `body` with `drawFraction` set, and puts it back however the body exits. */
const withDraw = (draw, body) => {
  const was = CONFIG.combat.drawFraction;
  CONFIG.combat.drawFraction = draw;
  try { return body(); } finally { CONFIG.combat.drawFraction = was; }
};

test("the_tree_ships_the_draw_the_owner_ruled_for", () => {
  // Pinned rather than read, because the constant is a physics decision the owner made on BV's
  // sweep and not a number a tuning pass may drift. Moving it moves every damage figure in
  // `docs/measurements.md` taken after 2026-09-17, so it should cost a deliberate edit here.
  assert.equal(CONFIG.combat.drawFraction, 0.3);
});

test("draw_is_not_paid_for_at_zero", () => {
  // A blow with four times as much sliding speed as pressing speed scores exactly what the same
  // press scores with no slide at all. That equality is the whole claim of the zero setting, and
  // it is what makes 0 a usable control for any cell that wants the pre-2026-09-17 law back.
  withDraw(0, () => {
    const sliding = scoreHit(drawnCut(T.referenceSpeed, T.referenceSpeed * 4));
    const pressing = scoreHit(cleanCut(T.referenceSpeed));
    assert.equal(sliding.damage, pressing.damage);
    assert.equal(cutEnergyJ(drawnCut(T.referenceSpeed, T.referenceSpeed * 4)),
      impactEnergyJ(SWORD, TORSO, T.referenceSpeed));
  });
});

test("the_shipped_draw_pays_a_sliding_cut_more_than_the_same_press", () => {
  // The other side of it, at the number that actually ships: the same pressing speed carrying a
  // slide four times as fast arrives with more energy than the press alone, and by the amount the
  // construction names -- hypot(press, 0.3 * slide) on a fully aligned edge.
  const press = T.referenceSpeed;
  const slide = press * 4;
  const drawn = cutEnergyJ(drawnCut(press, Math.hypot(press, slide)));
  assert.ok(drawn > impactEnergyJ(SWORD, TORSO, press));
  assert.ok(Math.abs(drawn - impactEnergyJ(SWORD, TORSO,
    Math.hypot(press, CONFIG.combat.drawFraction * slide))) < 1e-9);
});

test("a_contact_that_does_not_report_its_speed_is_never_repriced", () => {
  // Every call site written before the field existed omits it, and must keep scoring from the
  // press alone however the dial is set -- otherwise turning the dial silently reprices callers
  // that have no way to know about it.
  withDraw(1, () => {
    assert.equal(scoreHit(cleanCut(T.referenceSpeed)).damage,
      withDraw(0, () => scoreHit(cleanCut(T.referenceSpeed)).damage));
  });
});

test("the_draw_is_paid_only_to_an_edge_that_is_aligned", () => {
  withDraw(1, () => {
    const press = T.referenceSpeed;
    const slide = T.referenceSpeed * 3;
    // Held edge-on, the slide counts and the blow is worth more than its press alone.
    const pressAlone = impactEnergyJ(SWORD, TORSO, press);
    assert.ok(cutEnergyJ(drawnCut(press, slide, 1)) > pressAlone,
      "an aligned edge is paid for the slide");
    // Dragged flat, it is the side of a blade going past and it is paid nothing for the drag.
    assert.equal(cutEnergyJ(drawnCut(press, slide, 0)), pressAlone);
  });
});

test("a_club_is_never_paid_for_a_slide_whatever_the_dial_says", () => {
  // The argument the law rests on is exactly right for a blunt impact: a club that skids across
  // somebody transfers what it presses in with and nothing else. Only `how: "edge"` is repriced.
  const blunt = STRIKER_KINDS.filter((kind) => biteMechanism(kind) === "blunt");
  assert.ok(blunt.length > 0, "there is at least one blunt striker to check");
  withDraw(1, () => {
    for (const kind of blunt) {
      const fast = { ...drawnCut(6, 30), strikerMassKg: 4 };
      assert.equal(cutEnergyJ(fast, kind), impactEnergyJ(4, TORSO, 6),
        `${kind} is charged for its press alone`);
    }
  });
});

// ---- bone ------------------------------------------------------------------

/**
 * A club does relatively better against bone than against a person, and better again on the
 * ribcage.
 *
 * The overview's table as arithmetic, so a later change to the skeleton's masses or to
 * `SKELETON_ARMOUR` has to face it. Two things move the ratio and both are in here. Bone turns
 * half an edge and none of a club. And a part light enough to run away from a blow takes little
 * more from a heavy head than from a light edge, because the reduced mass saturates at the part's
 * own: so the ratio climbs with the part's mass, and the 10 kg ribcage is where a mace pulls
 * furthest ahead of a blade. A person's armour is one fraction for every blow, so on the human
 * forearm the ratio is the energies' alone. On 2026-09-22 the three ratios were 0.695 on a skeleton
 * forearm, 0.455 on a human's and 1.186 on the ribcage: the overview's 0.69, 0.45 and above 1.
 *
 * The human forearm is written out, as `LINK` and `CORE` are above: `MASSES` in
 * `src/golem/humanoid/arm.ts` is not exported, and the person is the control here rather than the
 * thing being tuned. The skeleton's masses and armour are imported, because they are.
 */
test("blunt_is_relatively_better_against_bone", () => {
  const HUMAN_FOREARM_KG = 2.0;
  const HUMAN_ARMOUR = 0.35;
  // Scored at `PRE_CHAIN`, the tuning the three ratios below were recorded at; the chain factors
  // divide the mace by 3.786 and the blade by 1.783 on every part alike, so they would move each
  // ratio by the same 0.471 and neither comparison.
  const hit = (strikerMassKg, partMassKg, by) => scoreHit({ closingSpeed: 10, strikerMassKg,
    partMassKg, edgeAlignment: 1, bladeAlignment: 0, nearTip: false }, by, PRE_CHAIN);
  const maceOverBlade = (partMassKg, armour) => {
    const blade = hit(TERMINAL_BLADE.mass, partMassKg, "sword");
    const mace = hit(TERMINAL_MACE.mass, partMassKg, "club");
    assert.deepEqual([blade.kind, mace.kind], ["cut", "crush"], `on ${partMassKg} kg`);
    return armouredDamage(mace.damage, armour(mace.kind))
      / armouredDamage(blade.damage, armour(blade.kind));
  };
  const bone = (kind) => armourAgainst(SKELETON_ARMOUR, kind);
  const skeletonForearm = maceOverBlade(SKELETAL_REACH.foreMass, bone);
  const humanForearm = maceOverBlade(HUMAN_FOREARM_KG, () => HUMAN_ARMOUR);
  const ribcage = maceOverBlade(RIBCAGE.coreMass, bone);
  assert.ok(skeletonForearm > humanForearm,
    `mace / blade is ${skeletonForearm.toFixed(3)} on a skeleton forearm and ${humanForearm.toFixed(3)} on a human's`);
  assert.ok(ribcage > skeletonForearm,
    `mace / blade is ${ribcage.toFixed(3)} on the ribcage and ${skeletonForearm.toFixed(3)} on a skeleton forearm`);
});
