import test from "node:test";
import assert from "node:assert/strict";

import { biteFloor, scoreHit, severs } from "../src/scoring.ts";
import { CONFIG } from "../src/config.ts";
import { WEAPON_KINDS } from "../src/hands.ts";

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

test("the sword is unchanged by the other kinds existing", () => {
  // Every one of the eleven cases above calls `scoreHit` with one argument, and
  // that is the whole point of the kind being a defaulted parameter rather than
  // a field on `Contact`: the damage model this prototype was tuned against is
  // still exactly the damage model, and nothing about a club or an axe being
  // added is allowed to have moved it.
  const cut = cleanCut();
  assert.deepEqual(scoreHit(cut), scoreHit(cut, "sword"));

  // And the sword does not care which way round the blade was travelling, which
  // is what stayed true when `Contact.edgeAlignment` became signed for the axe's
  // sake. An arming sword is double-edged; both edges cut.
  assert.deepEqual(
    scoreHit({ ...cleanCut(9), edgeAlignment: -1 }),
    scoreHit({ ...cleanCut(9), edgeAlignment: 1 }),
  );
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

// ---- the axe, which cuts but is not a blade -------------------------------

test("an axe cuts with its bit and does nothing with its poll", () => {
  // The whole of what makes it an axe rather than a short heavy sword. A sword
  // is double-edged and the model has always taken the magnitude of the edge
  // alignment; an axe's bit is on +X and its poll is on -X, and a blow arriving
  // at -1 is the back of the head.
  const bit = scoreHit({ ...cleanCut(), edgeAlignment: 1 }, "axe");
  const poll = scoreHit({ ...cleanCut(), edgeAlignment: -1 }, "axe");

  assert.equal(bit.kind, "cut");
  assert.ok(bit.damage > 0);
  assert.equal(poll.kind, "slap", "the back of an axe head is not an edge");
  assert.equal(poll.damage, 0);
});

test("an axe cannot be thrust, however well it is driven", () => {
  // A sword's point does this for real damage. An axe has a corner there.
  const contact = { speed: 14, edgeAlignment: 0, bladeAlignment: 1, nearTip: true };
  assert.equal(scoreHit(contact, "sword").kind, "thrust");

  const axe = scoreHit(contact, "axe");
  assert.equal(axe.kind, "slap", "driving an axe forward is a shove");
  assert.equal(axe.damage, 0);
  assert.equal(severs(axe, -50, "axe"), false, "and a shove takes nothing off");
});

test("an axe placed well hurts more than a sword placed well", () => {
  const speed = 12;
  const square = { speed, edgeAlignment: 1, bladeAlignment: 0, nearTip: false };
  assert.ok(
    scoreHit(square, "axe").damage > scoreHit(square, "sword").damage,
    "a hand's width of edge carries the same arm speed further in than 840 mm of it",
  );
});

test("an axe shares the blade's floor and the blade's bar, and only its scale", () => {
  // Both of the other two were drafted and both were refused by the bench, which
  // is the finding rather than a simplification: an axe's own speed floor moved
  // 24 bouts' total damage by 15 points out of 3350, and its own sever bar
  // returned byte-identical numbers at 0.2 and at 0.4, because a chop that
  // empties a limb has already landed at a quality above either.
  // `docs/measurements.md` has the tables. This is here so that putting either
  // back is a decision somebody makes rather than one that happens.
  assert.equal(biteFloor("axe"), biteFloor("sword"));

  const emptied = { speed: 15, edgeAlignment: 1, bladeAlignment: 0, nearTip: false };
  assert.equal(
    severs(scoreHit(emptied, "axe"), 0, "axe"),
    severs(scoreHit(emptied, "sword"), 0, "sword"),
  );

  // What is left, and the whole of what makes it an axe in this table.
  assert.ok(CONFIG.combat.chopScale > CONFIG.combat.damageScale);
  const square = { speed: 12, edgeAlignment: 1, bladeAlignment: 0, nearTip: false };
  assert.ok(scoreHit(square, "axe").damage > scoreHit(square, "sword").damage);
});

// ---- what the table has to answer for every kind --------------------------

test("every kind has a floor, and it is the same one the caller must use", () => {
  // `combat.ts` skips a divide and three dot products for a contact too slow to
  // be worth anything -- and it skipped them on `minCutSpeed`, hard-coded, which
  // is the blade's number and nobody else's. So a club below 3.0 m/s never
  // reached `scoreHit` at all and `minCrushSpeed` did nothing in an actual fight
  // for the whole of the club's life, while passing its own unit test the entire
  // time. `biteFloor` exists so there is one answer rather than two.
  for (const kind of WEAPON_KINDS) {
    const floor = biteFloor(kind);
    assert.ok(floor > 0, `${kind} needs a floor`);
    const under = { speed: floor - 0.01, edgeAlignment: 1, bladeAlignment: 1, nearTip: true };
    assert.equal(
      scoreHit(under, kind).kind,
      "weak",
      `${kind} should report nothing below its own floor`,
    );
  }
  // And the one that was wrong, which is the reason the export exists: a club's
  // floor is *below* the blade's, and `combat.ts` used to gate every contact on
  // the blade's before `scoreHit` ever saw it.
  assert.equal(biteFloor("club"), CONFIG.combat.minCrushSpeed);
  assert.equal(biteFloor("sword"), CONFIG.combat.minCutSpeed);
  assert.ok(biteFloor("club") < biteFloor("sword"));
});

test("a bare hand is not an arming sword", () => {
  // Nothing ever asks: `Combat` subscribes to weapon bodies and there is no body
  // to weld to an empty hand. That is exactly how the old default survived three
  // sessions scoring a fist as a blade without anybody noticing, and a total
  // table has to answer rather than fall through.
  const hard = { speed: 30, edgeAlignment: 1, bladeAlignment: 1, nearTip: true };
  const fist = scoreHit(hard, "empty");
  assert.equal(fist.damage, 0);
  assert.equal(fist.kind, "slap");
  assert.equal(severs(fist, -500, "empty"), false);
});

test("no kind that scores nothing can ever take a limb off", () => {
  const hard = { speed: 40, edgeAlignment: 1, bladeAlignment: 1, nearTip: true };
  for (const kind of WEAPON_KINDS) {
    const score = scoreHit(hard, kind);
    if (score.damage > 0) continue;
    assert.equal(severs(score, -500, kind), false, `${kind} scores nothing and must sever nothing`);
  }
});

test("an arrow scores on how straight it arrived and on nothing else", () => {
  // All point, no edge. `edgeAlignment` is the number the whole sword model is
  // built on and an arrow does not read it: swapped end for end, the same shot
  // is worth exactly the same.
  const straight = scoreHit(
    { speed: 45, edgeAlignment: 1, bladeAlignment: 1, nearTip: true },
    "arrow",
  );
  const edgeless = scoreHit(
    { speed: 45, edgeAlignment: 0, bladeAlignment: 1, nearTip: false },
    "arrow",
  );
  assert.equal(straight.damage, edgeless.damage, "the edge axis means nothing to an arrow");
  assert.equal(straight.kind, "thrust");
  // And `nearTip` means nothing either: an arrow is its own point along its
  // whole length, which is why it is `how: "point"` rather than the blade's
  // thrust branch.
  assert.equal(straight.quality, edgeless.quality);

  // Broadside is a stick hitting somebody.
  const tumbling = scoreHit(
    { speed: 45, edgeAlignment: 1, bladeAlignment: 0.1, nearTip: true },
    "arrow",
  );
  assert.equal(tumbling.kind, "slap");
  assert.ok(tumbling.damage < straight.damage * 0.05, "and worth almost nothing");
});

test("a bow at half draw is worth about 40 % of a full one, and that needs its own reference", () => {
  // The knob this catches: `combat.referenceSpeed` is 11 m/s, a *blade's*
  // number. Scored against it, every arrow that arrives straight -- 22 m/s from
  // a bow at `minDraw` as much as 48 from a full one -- saturates the speed term
  // and does identical damage, and the draw is a control that changes nothing.
  const at = (speed) =>
    scoreHit({ speed, edgeAlignment: 0, bladeAlignment: 1, nearTip: false }, "arrow").damage;
  const full = at(CONFIG.arrow.speedMax);
  const half = at(CONFIG.arrow.speedMin);
  assert.ok(full > 0 && half > 0);
  assert.ok(half < full * 0.75, `a short draw is worth much less: ${half.toFixed(1)} vs ${full.toFixed(1)}`);
  assert.ok(half > full * 0.15, "but not nothing");
});

test("an arrow never takes a limb off, however hard it lands", () => {
  const best = scoreHit(
    { speed: 200, edgeAlignment: 1, bladeAlignment: 1, nearTip: true },
    "arrow",
  );
  assert.equal(best.quality, 1, "as well delivered as a blow can be");
  assert.equal(severs(best, -1000, "arrow"), false, "and it still leaves the arm on");
});

test("a bow is worth nothing swung, like the shields", () => {
  const swung = scoreHit(
    { speed: 30, edgeAlignment: 1, bladeAlignment: 1, nearTip: true },
    "bow",
  );
  assert.equal(swung.damage, 0);
  assert.equal(severs(swung, -100, "bow"), false);
});

test("an arrow needs far more speed than a blade before it is worth anything", () => {
  // The floor runs the other way from the club's. Everything a hand-held kind
  // does at 3 m/s is somebody leaning on it; an arrow at 3 m/s is one that has
  // run out of flight and is falling.
  assert.ok(biteFloor("arrow") > biteFloor("sword"));
  assert.ok(biteFloor("club") < biteFloor("sword"));
  const drifting = scoreHit(
    { speed: biteFloor("arrow") - 0.1, edgeAlignment: 0, bladeAlignment: 1, nearTip: false },
    "arrow",
  );
  assert.equal(drifting.kind, "weak");
  assert.equal(drifting.damage, 0);
});
