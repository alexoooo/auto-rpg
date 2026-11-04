import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "../src/core/math/vector.ts";
import { modelSpec } from "../src/core/models.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { perceiver } from "../src/core/option/percepts.ts";
import { brace, hold } from "../src/core/option/rest.ts";

test("lying retains an opportunity cost against a foe with no modelled hand attack", () => {
  // The Skeleton on its back, a reptile beside it, both still; then on its feet, the reptile out of every reach.
  const spec = modelSpec("crypt-skeleton"), foe = modelSpec("reptile"), reading = perceiver();
  const at = (down, away) => reading.at({ spec, hz: 120, delay: 0, rules: rulebook("arena"), strikes: [], measured: [],
    focus: { spec: foe, centre: new Vector3(0, 0.3, away), velocity: new Vector3(), segments: new Map(), down: false, time: 0 },
    sight: { view: { down, ground: down ? { position: "back" } : null, head: new Vector3(0, down ? 0.2 : 1.7, 0), stance: { centre: new Vector3(), velocity: new Vector3() },
      senses: { life: 1 }, time: 0.15 }, report: { ledger: [], actions: [] } } });
  const lying = at(true, 1), lies = (seconds) => brace(null).model(lying, { until: seconds }).taken;
  assert.equal(lying.posture, "back", "the fixture lies on its back");
  assert.ok(lies(2) > 0, "losing the ability to attack must still make lying down costly");
  assert.ok(lies(4) > lies(2), "lying longer loses more opportunity");
  const standing = hold({}).model(at(false, 10), { until: 2 });
  assert.ok(standing !== null && lies(2) > standing.taken, `lying 2 s costs more than standing as long out of reach: ${lies(2)} against ${standing?.taken}`);
});
