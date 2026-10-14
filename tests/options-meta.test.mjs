/**
 * **A meta-controller chooses among options** (`metaController`, `src/core/mind/options/meta.ts`):
 * the available one of the highest worth; it keeps a running option that does not yield, decides
 * afresh on an event, on its rethink interval and when the running option is over, and begins and
 * ends each option it takes up and gives up. Stub options and situations, no physics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DECIDING, metaController } from "../src/core/mind/options/meta.ts";

/** A standing option whose availability, yielding and end are set from outside, and which logs its begins and ends. */
const stub = (name, log) => {
  const flags = { available: true, yields: true, ended: false };
  return {
    name, posture: "standing", state: {}, flags,
    available: () => flags.available, yields: () => flags.yields, ended: () => flags.ended,
    begin() { log.push(`begin ${name}`); }, end() { log.push(`end ${name}`); },
    step: () => ({ move: null, face: 0, actions: [] }),
  };
};
const at = (time, changes = {}) => ({ sight: null, time, down: false, orders: null, focus: null, apart: Infinity, threat: null, ...changes });

test("a_meta_controller_takes_the_available_option_of_highest_worth", () => {
  const log = [], [a, b, c] = ["a", "b", "c"].map((name) => stub(name, log));
  const meta = metaController([a, b, c], [1, 3, 2]);
  assert.equal(meta.decide(at(0))?.name, "b");
  // Asked again within the step, it does not decide again.
  b.flags.available = false;
  assert.equal(meta.decide(at(0))?.name, "b");
  // Unavailable, the running option is given up at once for the best that is.
  assert.equal(meta.decide(at(1 / 120))?.name, "c");
  c.flags.available = a.flags.available = false;
  assert.equal(meta.decide(at(2 / 120)), null);
  assert.deepEqual(log, ["begin b", "end b", "begin c", "end c"]);
  assert.deepEqual(meta.state, { running: -1, decided: 2 / 120, next: 2 / 120 + DECIDING.rethink, event: meta.state.event, offers: [] });
});

test("a_meta_controller_decides_afresh_on_its_interval_and_on_an_event", () => {
  const log = [], [low, high] = ["low", "high"].map((name) => stub(name, log));
  high.flags.available = false;
  const meta = metaController([low, high], [1, 2]);
  assert.equal(meta.decide(at(0))?.name, "low");
  // A better option comes on offer: it is taken up at the next interval, not before.
  high.flags.available = true;
  assert.equal(meta.decide(at(.1))?.name, "low");
  assert.equal(meta.decide(at(DECIDING.rethink))?.name, "high");
  // An event decides at once: a threat, after the better one went away.
  high.flags.available = false;
  meta.decide(at(.25));
  high.flags.available = true;
  assert.equal(meta.decide(at(.26))?.name, "low");
  assert.equal(meta.decide(at(.27, { threat: { region: "head" } }))?.name, "high");
  assert.deepEqual(log, ["begin low", "end low", "begin high", "end high", "begin low", "end low", "begin high"]);
});

test("a_meta_controller_keeps_a_running_option_that_does_not_yield_or_is_worth_keeping", () => {
  const log = [], [first, second] = ["first", "second"].map((name) => stub(name, log));
  second.flags.available = false;
  const meta = metaController([first, second], [1, 1 + DECIDING.keep / 2]);
  assert.equal(meta.decide(at(0))?.name, "first");
  second.flags.available = true;
  // Worth less than its keep more, the other does not displace it.
  assert.equal(meta.decide(at(1))?.name, "first");
  const strong = metaController([first, second], [1, 2]);
  second.flags.available = false;
  strong.decide(at(0));
  second.flags.available = true;
  // Worth more, it waits while the running option does not yield, and takes over once it does.
  first.flags.yields = false;
  assert.equal(strong.decide(at(1))?.name, "first");
  assert.equal(strong.decide(at(2))?.name, "first");
  first.flags.yields = true;
  assert.equal(strong.decide(at(3))?.name, "second");
});

test("a_meta_controller_begins_an_ended_option_afresh", () => {
  const log = [], [only, other] = ["only", "other"].map((name) => stub(name, log));
  other.flags.available = false;
  const meta = metaController([only, other], [2, 1]);
  meta.decide(at(0));
  // Run its course and still the best on offer, it is ended and begun again in one decision, within the interval.
  only.flags.ended = true;
  assert.equal(meta.decide(at(.01))?.name, "only");
  assert.deepEqual(log, ["begin only", "end only", "begin only"]);
  // Run its course and off offer, the next best is taken up.
  only.flags.available = false;
  other.flags.available = true;
  assert.equal(meta.decide(at(.02))?.name, "other");
  assert.deepEqual(log, ["begin only", "end only", "begin only", "end only", "begin other"]);
});
