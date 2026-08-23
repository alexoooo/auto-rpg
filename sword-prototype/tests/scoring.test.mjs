import test from "node:test";
import assert from "node:assert/strict";

import { scoreHit, severs } from "../src/scoring.ts";
import { CONFIG } from "../src/config.ts";

const T = CONFIG.combat;

/** A square, committed edge-on swing. */
const cleanCut = (speed = T.referenceSpeed) => ({
  speed,
  edgeAlignment: 1,
  bladeAlignment: 0,
  nearTip: false,
});

test("a blade moving too slowly does not cut, however well it is aimed", () => {
  const score = scoreHit({ ...cleanCut(), speed: T.minCutSpeed - 0.01 });
  assert.equal(score.kind, "weak");
  assert.equal(score.damage, 0);
});

test("a square edge-on swing at reference speed is a cut at full quality", () => {
  const score = scoreHit(cleanCut());
  assert.equal(score.kind, "cut");
  assert.equal(score.quality, 1);
  assert.ok(score.damage > 0);
});

test("the flat of the blade does not cut, no matter how fast it arrives", () => {
  const flat = scoreHit({ speed: 30, edgeAlignment: 0, bladeAlignment: 0, nearTip: false });
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
  const score = scoreHit({ speed: 9, edgeAlignment: 0, bladeAlignment: 1, nearTip: true });
  assert.equal(score.kind, "thrust");
  assert.ok(score.damage > 0);
});

test("the same motion away from the tip is a shove, not a thrust", () => {
  const score = scoreHit({ speed: 9, edgeAlignment: 0, bladeAlignment: 1, nearTip: false });
  assert.notEqual(score.kind, "thrust");
  assert.equal(score.damage, 0);
});

test("damage rises with speed and then saturates", () => {
  const slow = scoreHit(cleanCut(T.minCutSpeed + 1));
  const fast = scoreHit(cleanCut(T.referenceSpeed));
  const absurd = scoreHit(cleanCut(T.referenceSpeed * 4));

  assert.ok(fast.damage > slow.damage, "faster cuts harder");
  assert.equal(
    absurd.damage,
    fast.damage,
    "past the reference speed the model deliberately stops paying out",
  );
});

test("edge alignment is rewarded superlinearly", () => {
  const half = scoreHit({ ...cleanCut(), edgeAlignment: 0.5 });
  const full = scoreHit(cleanCut());
  assert.ok(
    half.damage < full.damage * 0.5 + 1e-9,
    "a half-turned edge should lose more than half the damage",
  );
});

test("a limb comes off only when a real cut empties it", () => {
  const cut = scoreHit(cleanCut());
  assert.equal(severs(cut, 0), true);
  assert.equal(severs(cut, 12), false, "a limb with health left stays on");
});

test("beating a limb to nothing with the flat leaves it ruined but attached", () => {
  const flat = scoreHit({ speed: 30, edgeAlignment: 0.3, bladeAlignment: 0, nearTip: false });
  assert.equal(flat.kind, "slap");
  assert.equal(severs(flat, -50), false);
});

test("a thrust that empties a limb takes it off", () => {
  const thrust = scoreHit({ speed: 14, edgeAlignment: 0, bladeAlignment: 1, nearTip: true });
  assert.equal(thrust.kind, "thrust");
  assert.equal(severs(thrust, 0), true);
});

// ---- what a weapon that is not a sword is worth ---------------------------

test("the sword is unchanged by the other two existing", () => {
  // Every one of the eleven cases above calls `scoreHit` with one argument, and
  // that is the whole point of the kind being a defaulted parameter rather than
  // a field on `Contact`: the damage model this prototype was tuned against is
  // still exactly the damage model, and nothing about a club being added is
  // allowed to have moved it.
  const cut = cleanCut();
  assert.deepEqual(scoreHit(cut), scoreHit(cut, "sword"));
});

test("a shield scores nothing however hard it is swung", () => {
  const hard = { speed: 40, edgeAlignment: 1, bladeAlignment: 1, nearTip: true };
  const score = scoreHit(hard, "shield");
  assert.equal(score.damage, 0);
  assert.equal(score.quality, 0);
  // A slap rather than a kind of its own: `combat.ts` applies its shove
  // regardless of quality, so a shield bash still moves what it hits, and the
  // readout already has a word for a blow that pushes without biting.
  assert.equal(score.kind, "slap");
  assert.equal(severs(score, -500, "shield"), false, "a shield cannot take a limb off");
});

test("a buckler is a shield: it shoves and it scores nothing", () => {
  // Same rule, and deliberately the same rule. A buckler punch is a real
  // technique and this refuses it anyway -- see `scoring.ts` -- because the
  // moment a shield scores, every policy holding one has an offensive option
  // nobody designed and the guard stops being a guard.
  const hard = { speed: 20, edgeAlignment: 1, bladeAlignment: 1, nearTip: true };
  const score = scoreHit(hard, "buckler");
  assert.equal(score.damage, 0, "a buckler does no damage however hard it arrives");
  assert.equal(score.quality, 0);
  assert.equal(score.kind, "slap");
  assert.equal(severs(score, -500, "buckler"), false, "a buckler cannot take a limb off");
  assert.deepEqual(score, scoreHit(hard, "shield"), "and it is scored exactly as a shield is");
});

test("a club does not care how it is held", () => {
  // The whole character of the weapon. A sword swung flat is a shove; a club has
  // no flat, so the same motion at the same speed is worth the same either way.
  const along = scoreHit({ speed: 18, edgeAlignment: 1, bladeAlignment: 0, nearTip: false }, "club");
  const across = scoreHit({ speed: 18, edgeAlignment: 0, bladeAlignment: 1, nearTip: true }, "club");
  assert.equal(along.kind, "crush");
  assert.deepEqual(along, across);
  assert.ok(along.damage > 0);
});

test("a club is worth less than a perfect cut and more than a bad one", () => {
  const speed = 14;
  const club = scoreHit({ speed, edgeAlignment: 0, bladeAlignment: 0, nearTip: false }, "club");
  const perfect = scoreHit({ speed, edgeAlignment: 1, bladeAlignment: 0, nearTip: false });
  const clumsy = scoreHit({ speed, edgeAlignment: 0.35, bladeAlignment: 0, nearTip: false });

  assert.ok(club.damage < perfect.damage, "a club should not out-damage a placed cut");
  assert.ok(club.damage > clumsy.damage, "but it should beat a cut nobody aimed");
});

test("a club still rises with speed, and still has a floor", () => {
  const at = (speed) =>
    scoreHit({ speed, edgeAlignment: 0, bladeAlignment: 0, nearTip: false }, "club").damage;
  assert.equal(at(CONFIG.combat.minCrushSpeed - 0.01), 0, "below its floor it is a nudge");
  assert.ok(at(8) > at(4));
  assert.equal(at(CONFIG.combat.referenceSpeed + 20), at(CONFIG.combat.referenceSpeed));
});

test("a club takes a limb off by crushing through it", () => {
  const blow = scoreHit({ speed: 16, edgeAlignment: 0, bladeAlignment: 0, nearTip: false }, "club");
  // The edge-quality clause has nothing to say about a weapon with no edge, so
  // it is dropped rather than failed. A club that could never sever could only
  // win by flattening all thirteen parts.
  assert.equal(severs(blow, 0, "club"), true);
  assert.equal(severs(blow, 5, "club"), false, "a limb with health left stays on");
});

test("a club's floor is lower than a blade's", () => {
  // A blade arriving slowly is a blade being leaned on. A club arriving slowly is
  // still several kilograms of wood.
  assert.ok(CONFIG.combat.minCrushSpeed < CONFIG.combat.minCutSpeed);
  const slow = { speed: 2.6, edgeAlignment: 1, bladeAlignment: 0, nearTip: false };
  assert.equal(scoreHit(slow).damage, 0, "a sword does nothing at this speed");
  assert.ok(scoreHit(slow, "club").damage > 0, "a club does");
});
