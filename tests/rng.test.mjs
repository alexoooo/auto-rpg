// The one seeded generator, pinned by value: a changed stream changes every seeded level.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mulberry32 } from "../src/rng.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const three = (seed) => {
  const random = mulberry32(seed);
  return [random(), random(), random()];
};

test("the_stream_is_pinned", () => {
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

test("every_seeded_generator_is_this_file_and_nothing_carries_a_copy", () => {
  // A second copy is exactly what a byte-identical pin above cannot see, so the absence is checked as text,
  // over every source file. The control: the level generator draws from this file, so the walk reads real users.
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
  const sources = walk("src").filter((rel) => rel.endsWith(".ts") && rel !== "src/rng.ts");
  assert.ok(sources.includes("src/dungeon/level.ts") && read("src/dungeon/level.ts").includes('from "../rng.ts"'));
  for (const rel of sources) assert.ok(!/function mulberry32/.test(read(rel)), `${rel} carries its own mulberry32`);
});
