/**
 * **The lab's sections** (`src/lab/hud/sections.ts`): which of them are closed, as the text the
 * page keeps between scenarios.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { collapsedFrom, collapsedText, SECTIONS } from "../src/lab/hud/sections.ts";

test("every_set_of_closed_sections_reads_back_from_the_text_kept", () => {
  for (let mask = 0; mask < 1 << SECTIONS.length; mask++) {
    const closed = SECTIONS.filter((_, i) => mask & (1 << i));
    assert.deepEqual(collapsedFrom(collapsedText(closed), SECTIONS), closed, collapsedText(closed));
  }
});

test("text_that_names_no_section_closes_none", () => {
  assert.deepEqual(collapsedFrom(null, SECTIONS), []);
  assert.deepEqual(collapsedFrom("", SECTIONS), []);
  // A name is a whole word: one a section's name begins, or one of another page's, closes nothing.
  assert.deepEqual(collapsedFrom("viewer elsewhere read", SECTIONS), []);
  assert.deepEqual(collapsedFrom("elsewhere view viewer", SECTIONS), ["view"]);
  // In the sections' order, whatever the text's.
  assert.deepEqual(collapsedFrom("readout scenario", SECTIONS), ["scenario", "readout"]);
});
