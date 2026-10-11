/**
 * **The stance's, the stride's and the SIMBICON walk's envelopes**
 * (`src/core/control/stance-envelope.ts`, `assets/core/stance-envelope.json`,
 * `assets/core/stride-envelope.json`, `assets/core/simbicon-envelope.json`): each asset was measured
 * on the parent-axis Rapier reference harness at the game's rate; this battery does not establish
 * coordinate-engine or reduced-balance capability. Each body's fastest walk and its turn at each
 * speed are the rule's reading of its own tables, by each walk; the rules, sampled both sides; a
 * body carries its envelope, and none under another stance tuning or while it is measured, and the
 * stride and the SIMBICON walk their own where the body has one; the lab's turn rate is inside every body's at the
 * Routine's pace; and at its fastest walk each body, as a fight plays it with each thing it holds,
 * holds all five ways again, and its fastest turn there both ways, begun as the walk sets off and
 * under way, by each walk (Node core stand, Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createBody } from "../src/core/body.ts";
import { fastestHeld, paceRound, simbiconEnvelope, stanceEnvelope, strideEnvelope, turnAt } from "../src/core/control/stance-envelope.ts";
import { PHYSICS_HZ } from "../src/core/world.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { modelSpec } from "../src/core/models.ts";
import { simbicon } from "../src/core/skills/simbicon.ts";
import { stride } from "../src/core/skills/stride.ts";
import { LAB_TURN_RATE } from "../src/lab/stance-mode.ts";
import { TURN_PACE } from "../src/lab/track.ts";
import { CORE_STANCE_HARNESS, turn, walk } from "../research/core-stance-trials.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const read = async (file) => JSON.parse(await readFile(new URL(`../assets/core/${file}`, import.meta.url), "utf8"));
const asset = await read("stance-envelope.json");
/** Each walk's table, the source its numbers cite, the rule that reads it, and the skill a trial walks by. */
const WALKS = [
  { name: "stance", asset, source: "core-stance-envelope", envelope: stanceEnvelope, legs: null },
  { name: "stride", asset: await read("stride-envelope.json"), source: "stride-envelope", envelope: strideEnvelope, legs: "stride" },
  { name: "simbicon", asset: await read("simbicon-envelope.json"), source: "simbicon-envelope", envelope: simbiconEnvelope, legs: "simbicon" },
];

for (const { name, asset } of WALKS) test(`the_${name}_envelope_was_measured_on_the_cores_harness_at_the_games_rate`, () => {
  assert.equal(asset.harness, CORE_STANCE_HARNESS);
  assert.equal(asset.hz, PHYSICS_HZ.value);
});

for (const { name, asset, source, envelope } of WALKS) test(`each_bodys_fastest_${name}_walk_and_its_turns_are_the_rules_reading_of_its_tables`, () => {
  for (const [model, entry] of Object.entries(asset.models)) {
    assert.equal(entry.walk, fastestHeld({ speeds: asset.speeds, ways: asset.ways.length * asset.holds.length, held: entry.held }), model);
    // A turn at every speed up to the fastest walk, and none past it.
    const upTo = asset.speeds.filter((speed) => speed <= entry.walk);
    assert.equal(entry.turnHeld.length, upTo.length, model);
    const ways = asset.senses.length * asset.holds.length * asset.afters.length;
    assert.deepEqual(entry.turns, entry.turnHeld.map((held) => fastestHeld({ speeds: asset.rates, ways, held })), model);
    const at = (where) => ({ kind: "source", source, where });
    assert.deepEqual(envelope(modelSpec(model)), {
      walk: { value: entry.walk, unit: "m/s", provenance: at(`/models/${model}/walk`) },
      turns: upTo.map((speed, i) => ({
        speed: { value: speed, unit: "m/s", provenance: at(`/speeds/${i}`) },
        turn: { value: entry.turns[i], unit: "rad/s", provenance: at(`/models/${model}/turns/${i}`) },
      })),
    });
  }
});

test("a_turn_is_the_slowest_listed_speeds_at_or_above_the_walk_and_a_bends_pace_the_most_any_speed_carries_round", () => {
  const q = (value) => ({ value, unit: "", provenance: { kind: "source", source: "core-stance-envelope", where: "" } });
  const envelope = { walk: q(0.5), turns: [[0.2, 2], [0.3, 2], [0.4, 2], [0.5, 0.5]].map(([speed, turn]) => ({ speed: q(speed), turn: q(turn) })) };
  assert.equal(turnAt(envelope, 0), 2);
  assert.equal(turnAt(envelope, 0.4), 2);
  assert.equal(turnAt(envelope, 0.41), 0.5);
  assert.equal(turnAt(envelope, 0.5), 0.5);
  assert.equal(turnAt(envelope, 0.7), 0.5);
  // A 0.3 m bend: 0.4 m/s turning 2 carries 0.6 round it, so 0.4; 0.5 turning 0.5 carries 0.15.
  assert.equal(paceRound(envelope, 0.3), 0.4);
  // A 0.1 m bend: 0.2 m/s at 2 carries exactly 0.2.
  assert.equal(paceRound(envelope, 0.1), 0.2);
  // A wide bend, or none: the fastest walk.
  assert.equal(paceRound(envelope, 4), 0.5);
  assert.equal(paceRound(envelope, Infinity), 0.5);
});

test("the_labs_turn_rate_is_inside_every_bodys_envelope_at_the_routines_pace", () => {
  for (const model of Object.keys(asset.models)) {
    const held = turnAt(stanceEnvelope(modelSpec(model)), TURN_PACE);
    assert.ok(LAB_TURN_RATE <= held, `${model}: ${LAB_TURN_RATE} over ${held} rad/s at ${TURN_PACE} m/s`);
  }
});

test("the_rule_takes_the_fastest_speed_held_every_way_and_at_every_slower_one", () => {
  const speeds = [0.2, 0.3, 0.4];
  assert.equal(fastestHeld({ speeds, ways: 5, held: [5, 5, 5] }), 0.4);
  assert.equal(fastestHeld({ speeds, ways: 5, held: [5, 5, 4] }), 0.3);
  assert.equal(fastestHeld({ speeds, ways: 5, held: [5, 4, 5] }), 0.2);
  assert.equal(fastestHeld({ speeds, ways: 5, held: [4, 5, 5] }), 0);
});

test("a_body_carries_its_envelope_and_none_under_another_tuning_and_the_stride_and_the_simbicon_walk_their_own_where_the_body_has_one", async () => {
  const stand = await coreStand(humanSpec("workshop-rogue"), { ground: true });
  try {
    const plain = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
    assert.deepEqual(plain.envelope, stanceEnvelope(stand.built.spec));
    assert.deepEqual(stride(plain).envelope, strideEnvelope(stand.built.spec));
    assert.deepEqual(simbicon(plain).envelope, simbiconEnvelope(stand.built.spec));
    plain.dispose();
    const tuned = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance: { track: 0.15 } });
    assert.equal(tuned.envelope, null);
    assert.equal(stride(tuned).envelope, null);
    assert.equal(simbicon(tuned).envelope, null);
    tuned.dispose();
    const measuring = createBody(stand.built, stand.world, { servoSeconds: 0.1, measuring: true });
    assert.equal(measuring.envelope, null);
    assert.equal(stride(measuring).envelope, null);
    assert.equal(simbicon(measuring).envelope, null);
    measuring.dispose();
  } finally { stand.dispose(); }
});

// A body that held no speed every way has no walk to hold again.
for (const { name, asset, legs } of WALKS) for (const model of Object.keys(asset.models).filter((m) => asset.models[m].walk > 0)) {
  test(`${model}_holds_every_way_at_its_fastest_${name}_walk`, async () => {
    const speed = asset.models[model].walk;
    const fell = [];
    for (const held of asset.holds) for (const degrees of asset.ways) if ((await walk({ model, degrees, speed, held, stance: {}, hz: asset.hz, legs })).fell) fell.push(`${held} ${degrees}`);
    assert.deepEqual(fell, [], `${model} at ${speed} m/s`);
  });

  test(`${model}_turns_both_ways_at_its_fastest_turn_at_its_fastest_${name}_walk_from_setting_off_and_under_way`, async () => {
    const { walk: speed, turns } = asset.models[model], rate = turns[turns.length - 1];
    const fell = [];
    for (const held of asset.holds) for (const after of [asset.afters[0], asset.afters.at(-1)]) for (const sense of asset.senses) {
      if ((await turn({ model, speed, rate, sense, held, after, stance: {}, hz: asset.hz, legs })).fell) fell.push(`${held} ${after} ${sense}`);
    }
    assert.deepEqual(fell, [], `${model} walking ${speed} m/s, turning ${rate} rad/s`);
  });
}
