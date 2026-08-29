import assert from "node:assert/strict";
import test from "node:test";

import { saveConstruct } from "../src/construct/codec.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../src/construct/warden.ts";
import { CONSTRUCT_LIBRARY_MAX_BYTES, CONSTRUCT_LIBRARY_MAX_DEPTH, CONSTRUCT_LIBRARY_MAX_ENTRIES,
  CONSTRUCT_LIBRARY_STORAGE_KEY, encodeConstructLibrary, loadConstructLibrary,
  parseConstructLibrary, replaceConstructLibraryEntry, storeConstructLibrary } from "../src/forge/library.ts";

const saved = (name) => saveConstruct(
  name,
  wardenBlueprint("crossbow"),
  wardenControl("crossbow"),
  wardenProgram("crossbow"),
  WARDEN_SENSORS,
);

test("the_local_library_refuses_raw_bytes_depth_unknown_keys_and_excess_entries_before_publication", () => {
  assert.throws(() => parseConstructLibrary("x".repeat(CONSTRUCT_LIBRARY_MAX_BYTES + 1), WARDEN_SENSORS),
    /source exceeds maximum 4000000 bytes/);
  const nested = "[".repeat(CONSTRUCT_LIBRARY_MAX_DEPTH + 1);
  assert.throws(() => parseConstructLibrary(nested, WARDEN_SENSORS), /maximum nesting depth 66/);
  assert.throws(() => parseConstructLibrary('{"version":1,"entries":[],"surplus":true}', WARDEN_SENSORS),
    /unknown field "surplus"/);
  const entry = saved("Repeated");
  assert.throws(() => encodeConstructLibrary(Array(CONSTRUCT_LIBRARY_MAX_ENTRIES + 1).fill(entry), WARDEN_SENSORS),
    /maximum 32 entries/);
});

test("the_local_library_revalidates_nested_saved_keys_and_digest_claims", () => {
  const entry = structuredClone(saved("Strict Warden"));
  entry.blueprint.parts[0].surplus = true;
  assert.throws(() => parseConstructLibrary(JSON.stringify({ version: 1, entries: [entry] }), WARDEN_SENSORS),
    /entry\[0\].*unknown field "surplus"/);

  delete entry.blueprint.parts[0].surplus;
  entry.digests.program = "00000000";
  assert.throws(() => parseConstructLibrary(JSON.stringify({ version: 1, entries: [entry] }), WARDEN_SENSORS),
    /entry\[0\].*program digest/);
});

test("a_library_replacement_validates_completely_then_uses_one_storage_write", () => {
  let source = encodeConstructLibrary([saved("Existing")], WARDEN_SENSORS);
  let writes = 0;
  const storage = {
    getItem: (key) => key === CONSTRUCT_LIBRARY_STORAGE_KEY ? source : null,
    setItem: (key, value) => {
      assert.equal(key, CONSTRUCT_LIBRARY_STORAGE_KEY);
      writes += 1;
      source = value;
    },
  };
  const prior = loadConstructLibrary(storage, WARDEN_SENSORS);
  const next = replaceConstructLibraryEntry(prior, saved("Second"), WARDEN_SENSORS);
  storeConstructLibrary(storage, next, WARDEN_SENSORS);
  assert.equal(writes, 1);
  assert.deepEqual(loadConstructLibrary(storage, WARDEN_SENSORS).map(({ name }) => name), ["Existing", "Second"]);

  const invalid = structuredClone(saved("Broken"));
  invalid.program.rules[0].condition.surplus = true;
  assert.throws(() => storeConstructLibrary(storage, [...next, invalid], WARDEN_SENSORS), /program digest|unknown field "surplus"/);
  assert.equal(writes, 1, "an invalid replacement must not reach setItem");
  assert.deepEqual(loadConstructLibrary(storage, WARDEN_SENSORS).map(({ name }) => name), ["Existing", "Second"]);
});

test("replacing_a_name_is_atomic_and_preserves_the_other_canonical_entries", () => {
  const first = saved("Slot");
  const other = saved("Other");
  const replacement = saveConstruct("Slot", wardenBlueprint("sword"), wardenControl("sword"),
    wardenProgram("sword"), WARDEN_SENSORS);
  const next = replaceConstructLibraryEntry([first, other], replacement, WARDEN_SENSORS);
  assert.deepEqual(next.map(({ name }) => name), ["Other", "Slot"]);
  assert.equal(next[1].digests.blueprint, replacement.digests.blueprint);
  assert.equal(parseConstructLibrary(encodeConstructLibrary(next, WARDEN_SENSORS), WARDEN_SENSORS).length, 2);
});
