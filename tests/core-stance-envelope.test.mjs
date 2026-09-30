/**
 * **The stance's envelope** (`src/core/control/stance-envelope.ts`, `assets/core/stance-envelope.json`):
 * the asset was measured on the core's own harness at the game's rate, so a change of engine or rate
 * fails here until `research/core-stance-envelope.mjs --write` measures it again; each human's fastest
 * walk and turn are the rule's reading of its own tables; the rule, sampled both sides; a body carries
 * its envelope, and none under another stance tuning; the lab's turn rate is inside every body's; and
 * at its fastest walk each human holds all five ways again, and its fastest turn both ways (Node core
 * stand, Rapier, 120 Hz). The control, run by hand: the Rogue's `walk` set to
 * 0.5 in the asset fails the rule's check, and at 0.5 its forward walk falls; the Warrior's `turn`
 * set to 2 fails it too, and walking 0.5 m/s it falls turning 2 rad/s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createBody } from "../src/core/body.ts";
import { fastestHeld, stanceEnvelope } from "../src/core/control/stance-envelope.ts";
import { PHYSICS_HZ } from "../src/core/engine/rapier.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { LAB_TURN_RATE } from "../src/core-lab/stance-mode.ts";
import { CORE_STANCE_HARNESS, turn, walk } from "../research/core-stance-trials.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const asset = JSON.parse(await readFile(new URL("../assets/core/stance-envelope.json", import.meta.url), "utf8"));

test("the_envelope_was_measured_on_the_cores_harness_at_the_games_rate", () => {
  assert.equal(asset.harness, CORE_STANCE_HARNESS);
  assert.equal(asset.hz, PHYSICS_HZ.value);
});

test("each_humans_fastest_walk_and_turn_are_the_rules_reading_of_its_tables", () => {
  for (const [model, entry] of Object.entries(asset.models)) {
    assert.equal(entry.walk, fastestHeld({ speeds: asset.speeds, ways: asset.ways.length, held: entry.held }), model);
    assert.equal(entry.turn, fastestHeld({ speeds: asset.rates, ways: asset.senses.length, held: entry.turnHeld }), model);
    const from = (key) => ({ kind: "source", source: "core-stance-envelope", where: `/models/${model}/${key}` });
    assert.deepEqual(stanceEnvelope(humanSpec(model)), {
      walk: { value: entry.walk, unit: "m/s", provenance: from("walk") },
      turn: { value: entry.turn, unit: "rad/s", provenance: from("turn") },
    });
  }
});

test("the_labs_turn_rate_is_inside_every_bodys_envelope", () => {
  for (const [model, entry] of Object.entries(asset.models)) assert.ok(LAB_TURN_RATE <= entry.turn, `${model}: ${LAB_TURN_RATE} over ${entry.turn} rad/s`);
});

test("the_rule_takes_the_fastest_speed_held_every_way_and_at_every_slower_one", () => {
  const speeds = [0.2, 0.3, 0.4];
  assert.equal(fastestHeld({ speeds, ways: 5, held: [5, 5, 5] }), 0.4);
  assert.equal(fastestHeld({ speeds, ways: 5, held: [5, 5, 4] }), 0.3);
  assert.equal(fastestHeld({ speeds, ways: 5, held: [5, 4, 5] }), 0.2);
  assert.equal(fastestHeld({ speeds, ways: 5, held: [4, 5, 5] }), 0);
});

test("a_body_carries_its_envelope_and_none_under_another_tuning", async () => {
  const stand = await coreStand(humanSpec("workshop-rogue"), { ground: true });
  try {
    const plain = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
    assert.deepEqual(plain.envelope, stanceEnvelope(stand.built.spec));
    plain.dispose();
    const tuned = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance: { track: 0.15 } });
    assert.equal(tuned.envelope, null);
    tuned.dispose();
  } finally { stand.dispose(); }
});

for (const model of Object.keys(asset.models)) {
  test(`${model}_holds_every_way_at_its_fastest_walk`, async () => {
    const speed = asset.models[model].walk;
    const fell = [];
    for (const degrees of asset.ways) if ((await walk({ model, degrees, speed, stance: {}, hz: asset.hz })).fell) fell.push(degrees);
    assert.deepEqual(fell, [], `${model} at ${speed} m/s`);
  });

  test(`${model}_turns_both_ways_at_its_fastest_turn`, async () => {
    const { walk: speed, turn: rate } = asset.models[model];
    const fell = [];
    for (const sense of asset.senses) if ((await turn({ model, speed, rate, sense, stance: {}, hz: asset.hz })).fell) fell.push(sense);
    assert.deepEqual(fell, [], `${model} walking ${speed} m/s, turning ${rate} rad/s`);
  });
}
