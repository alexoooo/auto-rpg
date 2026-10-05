import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("the pinned multibody tree rejects two-axis anatomy and has different three-axis limit coordinates", () => {
  const run = (representation, freedoms, x = 1, y = 1) => {
    const output = execFileSync(process.execPath, ["research/control-foundation-joint-shapes.mjs", representation, String(freedoms), String(x), String(y)],
      { encoding: "utf8", timeout: 30000, stdio: "pipe" });
    return JSON.parse(output.trim().split("\n").findLast((line) => line.startsWith("{")));
  };
  const unsupported = run("multibody", 2);
  assert.deepEqual(unsupported.outcome, { supported: false, phase: "step", error: "RuntimeError: unreachable" });
  const two = run("impulse", 2).outcome;
  assert.equal(two.supported, true); assert.equal(two.replayExact, true);
  assert.ok(two.rows.every((r) => Math.abs(r.angles[2]) < 1e-6));
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const representation of ["impulse", "multibody"]) {
    const result = run(representation, 3, x, y), o = result.outcome;
    assert.equal(o.supported, true); assert.equal(o.replayExact, true);
    assert.ok(Math.abs(o.first.angles[0] - x * .4) < .001);
    for (const row of o.rows) {
      assert.ok(Math.abs(row.angles[1] - y * .4) < .001);
      assert.ok(Math.abs(row.limits[2][0] + .02) < 1e-8 && Math.abs(row.limits[2][1] - .02) < 1e-8);
      if (representation === "impulse") assert.ok(Math.abs(row.angles[2]) <= .021);
      else assert.ok(Math.abs(row.angles[2]) > .08 && Math.sign(row.angles[2]) === -x * y, JSON.stringify(result));
    }
  }
});
