/**
 * **The stance's envelope** (`src/core/control/stance-envelope.ts`, `assets/core/stance-envelope.json`):
 * the asset was measured on the core's own harness at the game's rate, so a change of engine or rate
 * fails here until `research/core-stance-envelope.mjs --write` measures it again; each human's fastest
 * walk is the rule's reading of its own table; the rule, sampled both sides; a body carries its
 * envelope, and none under another stance tuning; and at its fastest walk each human holds all five
 * ways again (Node core stand, Rapier, 120 Hz). The control, run by hand: the Rogue's `walk` set to
 * 0.5 in the asset fails the rule's check, and at 0.5 its forward walk falls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createBody } from "../src/core/body.ts";
import { fastestHeld, stanceEnvelope } from "../src/core/control/stance-envelope.ts";
import { PHYSICS_HZ } from "../src/core/engine/rapier.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { CORE_STANCE_HARNESS, walk } from "../research/core-stance-trials.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const asset = JSON.parse(await readFile(new URL("../assets/core/stance-envelope.json", import.meta.url), "utf8"));

test("the_envelope_was_measured_on_the_cores_harness_at_the_games_rate", () => {
  assert.equal(asset.harness, CORE_STANCE_HARNESS);
  assert.equal(asset.hz, PHYSICS_HZ.value);
});

test("each_humans_fastest_walk_is_the_rules_reading_of_its_table", () => {
  for (const [model, entry] of Object.entries(asset.models)) {
    assert.equal(entry.walk, fastestHeld({ speeds: asset.speeds, ways: asset.ways.length, held: entry.held }), model);
    assert.deepEqual(stanceEnvelope(humanSpec(model)).walk, {
      value: entry.walk, unit: "m/s", provenance: { kind: "source", source: "core-stance-envelope", where: `/models/${model}/walk` },
    });
  }
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
}
