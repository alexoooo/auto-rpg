// Two autonomous reptiles in a bout (`research/reptile-motion.mjs`): Node, core world, Rapier, 120 Hz.
// How many bites land and how much they wound is `reptile-combat-capability`'s.
import test from "node:test";
import assert from "node:assert/strict";
import { mirrorTrial } from "../research/reptile-motion.mjs";

test("autonomous reptiles bite on four paws, unassisted, until an injury or the cap", async () => {
  const row = await mirrorTrial(1.5), message = JSON.stringify({ ...row, hits: row.hits.length });
  assert.ok(row.hits.length > 0, `the fixture did not reach its case: the two never met (${message})`);
  const injury = ["fatal", "severed", "exhausted"].includes(row.verdict?.ending);
  assert.ok(injury || row.seconds === 60, message);
  assert.ok(row.cycles.every(cycles => cycles.every(cycle => cycle.support === 4)), message);
  for (const assist of row.assist) assert.deepEqual(assist, { steps: 0, force: 0, moment: 0 });
});
