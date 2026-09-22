// The body fingerprint's own tests: it repeats, it sees a stone change without smearing it onto
// the human family, and its comparison says which section did what.
//
// **What these cannot show** is the property the instrument exists for, which is that a digest
// taken in one process equals the digest taken in another. That is a check across two processes
// and two commits, made by hand with the command line in `tests/harness/body-fingerprint.mjs`,
// whose docstring records the result. Everything here runs in one realm.
import test from "node:test";
import assert from "node:assert/strict";

import { CHAIN_REACH } from "../src/golem/config.ts";
import {
  BOUTS,
  compareFingerprints,
  comparisonFails,
  fingerprintBench,
  fingerprintBout,
} from "./harness/body-fingerprint.mjs";

test("a_fingerprint_is_the_same_twice_in_one_process", async () => {
  const bout = await fingerprintBout(BOUTS[0]);
  assert.equal(await fingerprintBout(BOUTS[0]), bout, `${BOUTS[0].name} did not repeat`);
  assert.match(bout, /^[0-9a-f]{64}$/);
  const bench = await fingerprintBench("bench", "effector.wrist.blade");
  assert.equal(await fingerprintBench("bench", "effector.wrist.blade"), bench,
    "bench:effector.wrist.blade did not repeat");
  await assert.rejects(fingerprintBench("stand", "effector.wrist.blade"), /no bench kind "stand"/);
});

// **`CHAIN_REACH.foreMass`, and not `CHAIN_WRIST.wristMass`.** The wrist link is cast to
// `max(wristMass, carryRatio * carried)`, and under a blade the carry term wins, so moving the
// wrist's own mass is a no-op and a test built on it would pass for the wrong reason. The forearm
// is read at build by `buildArmCore`, which the wrist chain shares with the reach chain; the
// anatomical chain reads nothing of `CHAIN_REACH`.
test("a_stone_mass_moves_the_stone_sections_and_not_the_human_ones", async () => {
  const read = async () => ({
    wrist: await fingerprintBench("bench", "effector.wrist.blade"),
    anatomical: await fingerprintBench("bench", "effector.anatomical.blade"),
  });
  const before = await read();
  const saved = CHAIN_REACH.foreMass;
  let after;
  try {
    // Restored from the saved value in `finally` rather than divided back: `x * 1.01 / 1.01`
    // need not be the double `x` was.
    CHAIN_REACH.foreMass = saved * 1.01;
    after = await read();
  } finally {
    CHAIN_REACH.foreMass = saved;
  }
  assert.notEqual(after.wrist, before.wrist, "the wrist section did not move");
  assert.equal(after.anatomical, before.anatomical, "the anatomical section moved with a stone mass");
});

test("compare_reports_moved_gone_and_new", () => {
  const before = { version: 1, sections: { a: "01", b: "02", c: "03", d: "04" } };
  const after = { version: 1, sections: { a: "11", b: "12", c: "03", e: "05" } };

  const plain = compareFingerprints(before, after);
  assert.deepEqual(plain, [
    { name: "a", status: "MOVED" },
    { name: "b", status: "MOVED" },
    { name: "c", status: "same" },
    { name: "d", status: "GONE" },
    { name: "e", status: "new" },
  ]);
  assert.equal(comparisonFails(plain), true);

  // Both `a` and `b` moved, and only `b` is excused: a pattern that excused everything would pass
  // a test that looked only at the allowed row.
  assert.deepEqual(compareFingerprints(before, after, /^b/), [
    { name: "a", status: "MOVED" },
    { name: "b", status: "moved (allowed)" },
    { name: "c", status: "same" },
    { name: "d", status: "GONE" },
    { name: "e", status: "new" },
  ]);

  // A `GONE` is never excused, and a run whose only moves are allowed and whose only additions
  // are new passes.
  assert.deepEqual(compareFingerprints(before, after, /^[bd]/)
    .filter((row) => row.name === "d"), [{ name: "d", status: "GONE" }]);
  const grown = { version: 1, sections: { a: "01", b: "12", c: "03", d: "04", e: "05" } };
  const allowed = compareFingerprints(before, grown, "^b");
  assert.deepEqual(allowed, [
    { name: "a", status: "same" },
    { name: "b", status: "moved (allowed)" },
    { name: "c", status: "same" },
    { name: "d", status: "same" },
    { name: "e", status: "new" },
  ]);
  assert.equal(comparisonFails(allowed), false);

  // A partial run is refused as a baseline, and compared as an `after` over its own prefix alone,
  // so the sections it skipped do not read `GONE`.
  const partial = { version: 1, partial: true, only: "b", sections: { b: "02" } };
  assert.throws(() => compareFingerprints(partial, after), /cannot be a baseline/);
  assert.deepEqual(compareFingerprints(before, partial), [{ name: "b", status: "same" }]);
  assert.throws(() => compareFingerprints(before, { version: 2, sections: {} }), /not comparable/);
});
