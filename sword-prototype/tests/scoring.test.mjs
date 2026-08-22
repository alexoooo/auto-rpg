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
