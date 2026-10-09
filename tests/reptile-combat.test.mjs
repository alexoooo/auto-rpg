import test from "node:test";
import assert from "node:assert/strict";
import { mirrorTrial } from "../research/reptile-motion.mjs";

test("autonomous reptiles repeat damaging bites and verified releases across starting gaps", async t => {
  for (const gap of [1.5, 2, 3, 4]) {
    const row = await mirrorTrial(gap), message = JSON.stringify({ ...row, hits: row.hits.length });
    assert.deepEqual(row.falls, [null, null], message);
    const injury = ["fatal", "severed", "exhausted"].includes(row.verdict?.ending);
    assert.ok(injury || row.seconds === 60, message);
    assert.ok(injury || row.damagingCycles.every(count => count >= 5), message);
    assert.ok(row.biteDamage >= .05, message);
    assert.ok(row.cycles.every(cycles => cycles.every(cycle => cycle.support === 4)), message);
    assert.ok(row.hits.some(hit => hit.work > 0 && hit.sides.some(side => side.mechanism === "point")), message);
    assert.ok(row.compression <= .008, message);
    for (const assist of row.assist) assert.deepEqual(assist, { steps: 0, force: 0, moment: 0 });
    t.diagnostic(JSON.stringify({ gap, seconds: row.seconds, damagingCycles: row.damagingCycles,
      biteDamage: row.biteDamage, compression: row.compression, falls: row.falls, verdict: row.verdict }));
  }
});
