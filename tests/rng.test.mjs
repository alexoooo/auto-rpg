// The one seeded generator, pinned.
//
// `src/rng.ts` exists so that a Warrior policy, the golem mind, the random build generator and the
// tournament harness draw from the same stream without importing each other. The stream is pinned
// here by value, from a run of the function as it stood in `src/policies.ts` on 2026-09-05, so
// that "moved, not changed" is a test rather than a claim: every seeded bout, sweep and measurement
// recorded before the move is reproducible after it.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mulberry32, randomSeed } from "../src/rng.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const three = (seed) => {
  const random = mulberry32(seed);
  return [random(), random(), random()];
};

test("the_stream_is_the_one_the_policies_drew_from_before_the_move", () => {
  // Taken from the function as `src/policies.ts` carried it, 2026-09-05.
  assert.deepEqual(three(1), [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  assert.deepEqual(three(0xdeadbeef), [0.9413696140982211, 0.26719574979506433, 0.772033357527107]);
});

test("a_seed_is_taken_modulo_two_to_the_thirty_two", () => {
  assert.deepEqual(three(4294967296), three(0));
  assert.deepEqual(three(4294967295), [0.8964226141106337, 0.189478256739676, 0.7156526781618595]);
});

test("the_same_seed_repeats_and_a_different_seed_does_not", () => {
  assert.deepEqual(three(7), three(7));
  assert.notDeepEqual(three(7), three(8));
  for (const value of three(7)) assert.ok(value >= 0 && value < 1);
});

test("a_random_seed_is_an_unsigned_thirty_two_bit_integer", () => {
  for (let i = 0; i < 100; i++) {
    const seed = randomSeed();
    assert.equal(seed, seed >>> 0);
  }
});

test("every_seeded_mind_draws_from_this_file_and_carries_no_copy", () => {
  // The duplication this file replaced. A second copy is exactly what a byte-identical pin above
  // cannot see, so the absence is checked as text.
  for (const [rel, spelling] of [
    ["src/policies.ts", 'from "./rng.ts"'],
    ["src/golem/tactics.ts", 'from "../rng.ts"'],
  ]) {
    const source = read(rel);
    assert.ok(source.includes(spelling), `${rel} does not import ${spelling}`);
    assert.ok(!/function mulberry32/.test(source), `${rel} still carries its own mulberry32`);
  }
});
