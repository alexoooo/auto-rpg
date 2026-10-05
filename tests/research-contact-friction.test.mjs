import test from "node:test";
import assert from "node:assert/strict";
import { slidingSlab } from "../research/contact-friction.mjs";

test("the installed rigid-body engine uses patch translation and independent twist friction", async (t) => {
  const rows = [], reference = new Map();
  for (const engine of ["rapier", "rapier-coordinate"]) for (const hz of [120, 1920]) {
    for (const spin of [-3, 0, 3]) for (const sense of [-1, 1]) {
      const row = await slidingSlab({ engine, hz, spin, sense });
      const { engine: name, revision, ...physical } = row, key = JSON.stringify([hz, spin, sense]);
      if (name === "rapier") reference.set(key, physical);
      else assert.deepEqual(physical, reference.get(key), "angular-limit selection cannot change this jointless fixture");
      assert.equal(row.replay, true);
      assert.ok(row.patch.linear < .03 && row.patch.angular < .25, JSON.stringify(row));
      for (const model of [row.patch, row.point]) {
        assert.ok(model.minLoad > 2, "all four supports carry positive load");
        assert.ok(model.normalResidual < 2e-8 && model.minSlip > .1);
      }
      if (spin) {
        assert.ok(row.point.linear > 1 && row.point.angular > 20, "per-point friction cannot stand in for patch friction");
        assert.equal(Math.sign(row.finalSpin[1]), Math.sign(spin), "the measurement excludes twist stopping");
      } else {
        assert.ok(row.point.linear < .001 && row.point.angular < .002);
      }
      assert.deepEqual(row.samples.map((sample) => sample.time), [0, 1 / 120, 2 / 120, 3 / 120]);
      rows.push({ engine, hz, spin, sense, patch: row.patch, point: row.point });
    }
  }
  t.diagnostic(JSON.stringify(rows));
});

test("per-point friction follows the installed solver's effective-mass projection", async (t) => {
  const reference = new Map(), readings = [];
  for (const engine of ["rapier-coulomb", "rapier-coordinate-coulomb"]) for (const hz of [120, 1920]) {
    for (const spin of [-3, 0, 3]) for (const sense of [-1, 1]) {
      const row = await slidingSlab({ engine, hz, spin, sense }), model = row.projectedPoint;
      assert.ok(model.linear < .05 && model.angular < .25, JSON.stringify(row));
      assert.ok(model.normalResidual < 2e-8 && model.minLoad > 2 && model.minSlip > .1);
      assert.ok(row.point.linear > .4, "opposing slip alone does not model the two-axis impulse projection");
      if (spin) assert.ok(row.point.angular > 18 && row.patch.angular > 30);
      const { engine: name, revision, ...physical } = row, key = JSON.stringify([hz, spin, sense]);
      if (name === "rapier-coulomb") reference.set(key, physical);
      else assert.deepEqual(physical, reference.get(key));
      assert.equal(row.replay, true);
      readings.push({ engine, hz, spin, sense, projectedPoint: model });
    }
  }
  t.diagnostic(JSON.stringify(readings));
});
