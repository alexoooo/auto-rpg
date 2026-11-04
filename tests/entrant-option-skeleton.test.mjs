import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "../src/core/math/vector.ts";
import { modelSpec } from "../src/core/models.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { perceiver } from "../src/core/option/percepts.ts";

test("recovery retains an opportunity cost against a foe with no modelled hand attack", () => {
  const spec = modelSpec("crypt-skeleton"), foe = modelSpec("reptile");
  const reading = perceiver();
  const cost = (seconds, stands) => {
    return reading.at({ spec, hz: 120, rules: rulebook("arena"), strikes: [], measured: [],
      focus: { spec: foe, centre: new Vector3(0, 0.3, 1), segments: new Map(), down: false, time: 0 },
      sight: { view: { head: new Vector3(0, 1.7, 0), stance: { centre: new Vector3() },
        senses: { life: 1 }, time: 0.15 }, report: { ledger: [], actions: [] } },
      riseFrom: () => ({ seconds, stands, shelter: 0 }) }).predictions.downCostAt("back");
  };
  const ordinary = cost(2, 1);
  assert.ok(ordinary > 0, "losing the ability to attack must still make lying down costly");
  assert.ok(cost(4, 1) > ordinary, "a longer recovery loses more opportunity");
  assert.ok(cost(2, 0.5) > ordinary, "failed attempts lose more opportunity");
  assert.equal(cost(2, 0), 1, "no route up costs the life that remains");
});
