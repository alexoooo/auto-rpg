// How the reptiles fight each other, measured and not a gate (`tests/experimental.json`): Node,
// core world, Rapier, 120 Hz.
import test from "node:test";
import assert from "node:assert/strict";
import { mirrorTrial } from "../research/reptile-motion.mjs";

// How many bites land and how much they wound in one bout swing with its opening: one of these gaps
// may give two damaging bites a side where the next gives twelve. What the bites come to is read
// over the four bouts together, each side's damaging bites and the damage they did.
test("autonomous reptiles repeat damaging bites and verified releases across starting gaps", async t => {
  const damaging = [0, 0];
  let damage = 0;
  for (const gap of [1.5, 2, 3, 4]) {
    const row = await mirrorTrial(gap), message = JSON.stringify({ ...row, hits: row.hits.length });
    assert.deepEqual(row.falls, [null, null], message);
    const injury = ["fatal", "severed", "exhausted"].includes(row.verdict?.ending);
    assert.ok(injury || row.seconds === 60, message);
    row.damagingCycles.forEach((count, i) => { damaging[i] += count; });
    damage += row.biteDamage;
    assert.ok(row.cycles.every(cycles => cycles.every(cycle => cycle.support === 4)), message);
    assert.ok(row.hits.some(hit => hit.work > 0 && hit.sides.some(side => side.mechanism === "point")), message);
    assert.ok(row.compression <= .008, message);
    for (const assist of row.assist) assert.deepEqual(assist, { steps: 0, force: 0, moment: 0 });
    t.diagnostic(JSON.stringify({ gap, seconds: row.seconds, damagingCycles: row.damagingCycles,
      biteDamage: row.biteDamage, compression: row.compression, falls: row.falls, verdict: row.verdict }));
  }
  assert.ok(damaging.every(count => count >= 15) && damage >= .2, JSON.stringify({ damaging, damage }));
});
