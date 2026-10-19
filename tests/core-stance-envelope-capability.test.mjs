/**
 * **Each body holds its walk's envelope again** (`src/core/control/stance-envelope.ts`,
 * `assets/core/stance-envelope.json`, `assets/core/stride-envelope.json`,
 * `assets/core/simbicon-envelope.json`, `assets/core/simbicon-run-envelope.json`), measured on the
 * Node core stand, Rapier, 120 Hz, and not a gate (`tests/experimental.json`): at its fastest walk
 * each body, as a fight plays it with each thing it holds, holds all five ways again; at the
 * fastest walk forward it turns at, its fastest turn there both ways, begun as the walk sets off and
 * under way, by each walk; and where an asset measured each way, each way at its fastest that way.
 * The stance's and the stride's tables count a turn held where the body stayed up, not where it
 * faced round (`turnedAsAsked`): read under that rule, the stance walk's turns are 1 rad/s where its
 * table says 2 to 4. The tables' own rules are `core-stance-envelope.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { turnedAsAsked } from "../src/core/control/stance-envelope.ts";
import { turn, walk } from "../research/core-stance-trials.mjs";

const read = async (file) => JSON.parse(await readFile(new URL(`../assets/core/${file}`, import.meta.url), "utf8"));
/** Each walk's table and the skill a trial walks by. */
const WALKS = [
  { name: "stance", asset: await read("stance-envelope.json"), legs: null },
  { name: "stride", asset: await read("stride-envelope.json"), legs: "stride" },
  { name: "simbicon", asset: await read("simbicon-envelope.json"), legs: "simbicon" },
  { name: "simbicon-run", asset: await read("simbicon-run-envelope.json"), legs: "simbicon-run" },
];

// A body that held no speed every way has no walk to hold again.
for (const { name, asset, legs } of WALKS) for (const model of Object.keys(asset.models).filter((m) => asset.models[m].walk > 0)) {
  test(`${model}_holds_every_way_at_its_fastest_${name}_walk`, async () => {
    const speed = asset.models[model].walk;
    const fell = [];
    for (const held of asset.holds) for (const degrees of asset.ways) if ((await walk({ model, degrees, speed, held, stance: {}, hz: asset.hz, legs, setOff: asset.setOff, rest: asset.rest })).fell) fell.push(`${held} ${degrees}`);
    assert.deepEqual(fell, [], `${model} at ${speed} m/s`);
  });
}

// A body that turned at no speed has no turn to hold again.
for (const { name, asset, legs } of WALKS) for (const model of Object.keys(asset.models).filter((m) => asset.models[m].turns.some((t) => t > 0))) {
  test(`${model}_turns_both_ways_at_its_fastest_turn_at_the_fastest_${name}_walk_forward_it_turns_at_from_setting_off_and_under_way`, async () => {
    const { turns } = asset.models[model], i = turns.findLastIndex((t) => t > 0), speed = asset.speeds[i], rate = turns[i];
    const fell = [];
    for (const held of asset.holds) for (const after of [asset.afters[0], asset.afters.at(-1)]) for (const sense of asset.senses) {
      const r = await turn({ model, speed, rate, sense, held, after, stance: {}, hz: asset.hz, legs });
      if (r.fell || !turnedAsAsked(r.lag)) fell.push(`${held} ${after} ${sense}${r.fell ? "" : ` lagging ${r.lag.toFixed(2)} rad`}`);
    }
    assert.deepEqual(fell, [], `${model} walking ${speed} m/s, turning ${rate} rad/s`);
  });
}

// Where an asset measured each way, each body holds each way at its fastest that way, with each thing held at its own where the asset measured it.
for (const { name, asset, legs } of WALKS) for (const model of Object.keys(asset.models).filter((m) => asset.models[m].byWay)) {
  test(`${model}_holds_each_way_at_its_fastest_${name}_walk_that_way`, async () => {
    const entry = asset.models[model], trials = [];
    for (const held of asset.holds) {
      const { byWay } = entry.holds?.[held] ?? entry;
      asset.ways.forEach((degrees, i) => { if (byWay[i] > 0) trials.push({ held, degrees, speed: byWay[i] }); });
    }
    const falls = [];
    for (const trial of trials) if ((await walk({ model, ...trial, stance: {}, hz: asset.hz, legs, setOff: asset.setOff, rest: asset.rest })).fell) falls.push(`${trial.held} ${trial.degrees} at ${trial.speed}`);
    assert.deepEqual(falls, [], model);
  });
}
