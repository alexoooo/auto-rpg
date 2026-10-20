import { test } from "node:test";
import assert from "node:assert/strict";
import { MIND_NOTES, noteFaults, noteOf, notesOf, RATINGS } from "../src/ui/mind-notes.ts";
import { MINDS } from "../src/core/mind/controllers.ts";
import { BODY_MODELS } from "../src/core/models.ts";
import { HELD } from "../src/core/items/held.ts";

const TREE = { puncher: { note: "mind", held: { club: "club" }, bodies: { "workshop-fighter": { note: "warrior", held: { empty: "warrior empty" } } } } };

test("a mind's note is its most particular: character and loadout, then character, then loadout, then the mind's own", () => {
  assert.deepEqual(notesOf("puncher", "workshop-fighter", "empty", TREE), [
    { level: "body-held", note: "warrior empty" }, { level: "body", note: "warrior" }, { level: "mind", note: "mind" }]);
  assert.deepEqual(notesOf("puncher", "workshop-fighter", "club", TREE), [
    { level: "body", note: "warrior" }, { level: "held", note: "club" }, { level: "mind", note: "mind" }]);
  assert.equal(noteOf("puncher", "workshop-rogue", "club", TREE), "club");
  assert.equal(noteOf("puncher", "workshop-rogue", "empty", TREE), "mind");
  assert.equal(noteOf("counter", "workshop-rogue", "empty", TREE), null);
});

test("the notes file names only minds, characters and loadouts there are, and each note is text", () => {
  assert.deepEqual(noteFaults(MIND_NOTES), []);
  assert.deepEqual(noteFaults(TREE), []);
  // The check finds what it is for.
  assert.deepEqual(noteFaults({ nobody: {}, puncher: { colour: "red", held: { spear: "x" }, bodies: { giant: {}, reptile: { note: 3 } } } }), [
    "nobody: no mind nobody", "puncher: no level colour", "puncher.held: no loadout spear", "puncher.bodies.giant: no character giant",
    "puncher.bodies.reptile: a note is text"]);
});

test("the ratings name minds, characters and loadouts there are, each with a finite rating and interval and its bouts counted", () => {
  for (const entrant of RATINGS.entrants) {
    assert.ok(Object.hasOwn(MINDS, entrant.mind) && BODY_MODELS.includes(entrant.model) && HELD.includes(entrant.held), JSON.stringify(entrant));
    assert.ok([entrant.rating, ...entrant.interval].every(Number.isFinite) && entrant.interval[0] <= entrant.interval[1], JSON.stringify(entrant));
    assert.equal(entrant.wins + entrant.draws + entrant.losses, entrant.bouts, JSON.stringify(entrant));
  }
});
