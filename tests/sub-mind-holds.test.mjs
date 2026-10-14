import test from "node:test";
import assert from "node:assert/strict";
import { hosting } from "../src/core/mind/sub-mind.ts";

function fixture() {
  const trace = [], state = { high: false, low: true, holding: true, endAt: Infinity, steps: 0 };
  const host = { name: "host", state: {}, look() { trace.push("look"); }, act() { trace.push("host.step"); },
    release() { trace.push("host.end"); }, resume() { trace.push("host.begin"); }, step() { throw Error("unreachable"); } };
  const sub = name => ({ name, state: {}, wants: () => state[name], begin() { trace.push(`${name}.begin`); },
    end() { trace.push(`${name}.end`); }, holds: () => name === "low" && state.holding,
    step() { trace.push(`${name}.step`); if (name === "low" && ++state.steps >= state.endAt) state.holding = false; } });
  const mind = hosting(host, [sub("high"), sub("low")]);
  return { state, trace, mind, step() { trace.length = 0; mind.step({}, 1 / 120); return [...trace]; } };
}

test("a nonyielding lower sub-mind keeps the body until its first safe boundary", () => {
  const f = fixture();
  assert.deepEqual(f.step(), ["look", "host.end", "low.begin", "low.step"]);
  f.state.high = true;
  assert.deepEqual(f.step(), ["look", "low.step"]);
  f.state.holding = false;
  assert.deepEqual(f.step(), ["look", "low.end", "high.begin", "high.step"]);
  assert.equal(f.mind.has, "high");
});

test("a chain yields at its first ending and the new owner commands that same step", () => {
  const f = fixture(); f.state.endAt = 2;
  f.step(); f.state.high = true;
  assert.deepEqual(f.step(), ["look", "low.step"]);
  assert.deepEqual(f.step(), ["look", "low.end", "high.begin", "high.step"]);
  assert.equal(f.state.steps, 2);
});

test("holding never keeps a body for a sub-mind that no longer wants it", () => {
  const f = fixture(); f.step(); f.state.low = false;
  assert.deepEqual(f.step(), ["look", "low.end", "host.begin", "host.step"]);
  assert.equal(f.mind.has, "host");
});

test("idling interrupts even a holder and resume starts from the current wants", () => {
  const f = fixture(); f.step(); f.trace.length = 0; f.mind.idle();
  assert.deepEqual(f.trace, ["low.end"]); assert.equal(f.mind.has, "nobody");
  f.state.high = true;
  assert.deepEqual(f.step(), ["look", "high.begin", "high.step"]);
});
