// Arena combat targets measured on the Node Duel, rapier-coordinate, 120 Hz, zero balance.
import test from "node:test";
import assert from "node:assert/strict";
import { combatTrials, DEVELOPMENT_GAPS, CONFIRMATION_GAPS, HUMANOIDS } from "../research/reptile-combat.mjs";

const gaps = [...DEVELOPMENT_GAPS, ...CONFIRMATION_GAPS];
const message = row => JSON.stringify(row);

test("reptile mirrors end by injury within thirty seconds across development and fresh gaps", async t => {
  const rows = await combatTrials(gaps.map(gap => ({ gap })));
  for (const row of rows) {
    t.diagnostic(message(row));
    assert.ok(["fatal", "severed", "exhausted"].includes(row.verdict?.ending) && row.seconds <= 30, message(row));
    assert.deepEqual(row.falls, [null, null], message(row));
    assert.ok(row.damage.some(hp => hp > 0), message(row));
    assert.deepEqual(row.assist, [{ steps: 0, force: 0, moment: 0 }, { steps: 0, force: 0, moment: 0 }]);
  }
});

test("reptiles make two separate damaging engagements and remove half an HP against each humanoid", async t => {
  const jobs = (opponent, gaps) => gaps.flatMap(gap => ["left", "right"].map(side => ({ opponent, gap, side })));
  const development = await combatTrials(HUMANOIDS.flatMap(opponent => jobs(opponent, DEVELOPMENT_GAPS)));
  for (const opponent of HUMANOIDS) await t.test(opponent, async () => {
    const check = rows => {
      rows.forEach(row => t.diagnostic(message(row)));
      const failed = rows.filter(row => {
        const i = row.side === "left" ? 0 : 1;
        return row.engagements[i] < 2 || row.damage[i] < .5;
      });
      assert.deepEqual(failed, [], JSON.stringify({ opponent, failed }));
    };
    check(development.filter(row => row.opponent === opponent));
    check(await combatTrials(jobs(opponent, CONFIRMATION_GAPS)));
  });
});
