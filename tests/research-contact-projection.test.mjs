import test from "node:test";
import assert from "node:assert/strict";
import { contactProjection } from "../research/contact-projection.mjs";

test("local rigid-body friction projection matches a welded load's measured sliding direction", async (t) => {
  for (const hz of [120, 1920]) for (const sense of [-1, 1]) {
    const result = await contactProjection({ hz, sense });
    assert.equal(result.replay, true); assert.equal(result.seconds, 1 / 120);
    assert.ok(result.actualImpulse[1] > 0, "the ground supplies positive support");
    assert.ok(sense * result.actualImpulse[0] < 0 && sense * result.actualImpulse[2] < 0);
    for (const metric of Object.values(result.metrics)) assert.equal(metric.rejected, 0);
    assert.ok(result.metrics["rigid-body"].directionError < .005, JSON.stringify(result.metrics));
    assert.ok(result.metrics.coupled.directionError > .04, "the constrained metric changes saturated friction direction");
    t.diagnostic(JSON.stringify({ hz, sense, actualImpulse: result.actualImpulse, metrics: result.metrics, digest: result.physicalDigest }));
  }
});

test("the friction projection fixture rejects undeclared rates and directions", async () => {
  for (const config of [{ hz: 0 }, { hz: 240 }, { sense: 0 }, { sense: NaN }]) {
    await assert.rejects(contactProjection(config), /invalid contact projection trial/);
  }
});
