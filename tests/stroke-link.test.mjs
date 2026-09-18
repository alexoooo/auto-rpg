import assert from "node:assert/strict";
import test from "node:test";

import { GOLEM_TACTICS } from "../src/golem/tactics.ts";
import { strokeLink } from "../src/golem/stroke-link.ts";

/** A posed table, so no test here depends on what the tree currently ships. */
const posed = { chamberReach: -0.7, cutRoll: 0.3, strokeSeconds: 0.15 };
const shipped = (row) => posed[row] ?? 0;

test("no_link_is_silence_rather_than_a_note_about_nothing", () => {
  const link = strokeLink(null, shipped);
  assert.equal(link.note, "");
  assert.deepEqual(link.apply, []);
});

test("a_good_link_applies_and_says_loudly_that_it_did", () => {
  const link = strokeLink("chamberReach:0.15,cutRoll:0", shipped);
  assert.deepEqual([...link.apply], [
    { row: "chamberReach", value: 0.15 }, { row: "cutRoll", value: 0 },
  ]);
  assert.match(link.note, /^STROKE OVERRIDDEN: chamberReach 0\.15, cutRoll 0\./);
  assert.match(link.note, /not the stroke the tree ships/);
  // The note has to name the limit, because a dial that silently does nothing on some minds is
  // worse than no dial, and a v3 mind on a committed arc froze its shape before this ran.
  assert.match(link.note, /v2 minds \(golem-fencer\) only/);
});

test("one_bad_pair_refuses_the_whole_link_and_names_every_reason", () => {
  // Three of the four numbers somebody asked for is a page that will be used to report a result
  // nobody can reproduce, so nothing is applied at all.
  const link = strokeLink("chamberReach:0.15,nonsense:1,strokeSeconds:0", shipped);
  assert.deepEqual(link.apply, [], "a refused link applied something");
  assert.match(link.note, /refused and NOTHING was applied/);
  assert.match(link.note, /"nonsense" is not one of/);
  assert.match(link.note, /"strokeSeconds" is a duration/, "it stopped at the first reason");
  assert.match(link.note, /Running the shipped stroke\.$/);
});

test("a_link_that_names_nothing_is_refused_rather_than_treated_as_absent", () => {
  for (const raw of ["", " ", ",,", " , , "]) {
    const link = strokeLink(raw, shipped);
    assert.deepEqual(link.apply, []);
    assert.equal(link.note, "The tactic link was refused -- it named nothing.");
  }
});

test("a_link_asking_for_what_already_ships_says_so_instead_of_claiming_an_override", () => {
  // The failure this prevents is a person opening two tabs to compare, typing the shipped value
  // into one of them, and reading "STROKE OVERRIDDEN" on a page that is running the default.
  const link = strokeLink("chamberReach:-0.7", shipped);
  assert.deepEqual(link.apply, []);
  assert.match(link.note, /asked for the shipped stroke: chamberReach -0\.7/);
  assert.match(link.note, /Nothing was overridden/);
  assert.doesNotMatch(link.note, /OVERRIDDEN:/);
});

test("a_mixed_link_applies_every_row_and_announces_only_the_ones_that_moved", () => {
  // Both rows are written -- the caller should not have to diff -- but the note names the change,
  // because a note listing a row that did not move reads as a change that did not happen.
  const link = strokeLink("chamberReach:-0.7,cutRoll:0", shipped);
  assert.deepEqual([...link.apply], [
    { row: "chamberReach", value: -0.7 }, { row: "cutRoll", value: 0 },
  ]);
  assert.match(link.note, /^STROKE OVERRIDDEN: cutRoll 0\./);
  assert.doesNotMatch(link.note, /chamberReach/);
});

test("the_shipped_table_is_what_the_page_actually_compares_against", () => {
  // `main.ts` passes a reader onto `GOLEM_TACTICS`, so the no-op branch has to compare against the
  // live table rather than a constant baked in here. Asking for what ships must be a no-op.
  const live = (row) => GOLEM_TACTICS[row];
  const same = strokeLink(`chamberReach:${GOLEM_TACTICS.chamberReach}`, live);
  assert.deepEqual(same.apply, []);
  assert.match(same.note, /Nothing was overridden/);
  const moved = strokeLink(`chamberReach:${GOLEM_TACTICS.chamberReach + 0.5}`, live);
  assert.equal(moved.apply.length, 1);
  assert.match(moved.note, /STROKE OVERRIDDEN/);
});
