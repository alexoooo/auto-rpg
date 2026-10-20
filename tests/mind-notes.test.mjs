import { test } from "node:test";
import assert from "node:assert/strict";
import { MIND_NOTES, noteFaults, noteOf, notesOf, RATINGS, readRatings } from "../src/ui/mind-notes.ts";
import { BUILD_IDENTITY } from "../src/build-identity.ts";
import { recordingIdentity } from "../src/core/recording.ts";
import { MINDS } from "../src/core/mind/controllers.ts";
import { BODY_MODELS } from "../src/core/models.ts";
import { LOADOUTS, loadoutKey } from "../src/core/items/held.ts";

const TREE = { puncher: { note: "mind", loadouts: { "empty,club": "club" }, bodies: { "workshop-fighter": { note: "warrior", loadouts: { "empty,empty": "warrior empty" } } } } };

test("a mind's note is its most particular: character and loadout, then character, then loadout, then the mind's own", () => {
  assert.deepEqual(notesOf("puncher", "workshop-fighter", { left: "empty", right: "empty" }, TREE), [
    { level: "body-loadout", note: "warrior empty" }, { level: "body", note: "warrior" }, { level: "mind", note: "mind" }]);
  assert.deepEqual(notesOf("puncher", "workshop-fighter", { left: "empty", right: "club" }, TREE), [
    { level: "body", note: "warrior" }, { level: "loadout", note: "club" }, { level: "mind", note: "mind" }]);
  assert.equal(noteOf("puncher", "workshop-rogue", { left: "empty", right: "club" }, TREE), "club");
  assert.equal(noteOf("puncher", "workshop-rogue", { left: "empty", right: "empty" }, TREE), "mind");
  assert.equal(noteOf("counter", "workshop-rogue", { left: "empty", right: "empty" }, TREE), null);
});

test("the notes file names only minds, characters and loadouts there are, and each note is text", () => {
  assert.deepEqual(noteFaults(MIND_NOTES), []);
  assert.deepEqual(noteFaults(TREE), []);
  // The check finds what it is for.
  assert.deepEqual(noteFaults({ nobody: {}, puncher: { colour: "red", loadouts: { spear: "x" }, bodies: { giant: {}, reptile: { note: 3 } } } }), [
    "nobody: no mind nobody", "puncher: no level colour", "puncher.loadouts: no loadout spear", "puncher.bodies.giant: no character giant",
    "puncher.bodies.reptile: a note is text"]);
});

test("the ratings name minds, characters and loadouts there are, each with a finite rating and interval and its bouts counted", () => {
  for (const entrant of RATINGS.entrants) {
    assert.ok(Object.hasOwn(MINDS, entrant.mind) && BODY_MODELS.includes(entrant.model) && LOADOUTS.some((loadout) => loadoutKey(loadout) === loadoutKey(entrant.loadout)), JSON.stringify(entrant));
    assert.ok([entrant.rating, ...entrant.interval].every(Number.isFinite) && entrant.interval[0] <= entrant.interval[1], JSON.stringify(entrant));
    assert.equal(entrant.wins + entrant.draws + entrant.losses, entrant.bouts, JSON.stringify(entrant));
  }
});

test("a stale tournament table is refused with its reason rather than displayed as current ratings", () => {
  const identity = recordingIdentity(BUILD_IDENTITY, "arena-tournament/1", { fixture: true });
  const table = { date: "2026-10-20", commit: null, harness: "fixture", protocol: "fixture", identity,
    entrants: [{ mind: "options", model: "workshop-fighter", loadout: { left: "empty", right: "empty" }, rating: 1500, interval: [1400, 1600], bouts: 2, wins: 1, draws: 0, losses: 1 }] };
  assert.deepEqual(readRatings(table), { ...table, unavailable: null });
  for (const [changed, reason] of [[undefined, /no build/], [{ ...identity, build: `sha256:${"0".repeat(64)}` }, /different source/], [{ ...identity, protocol: "arena-tournament/0" }, /another protocol/]]) {
    const rejected = readRatings({ ...table, identity: changed });
    assert.deepEqual(rejected.entrants, []);
    assert.match(rejected.unavailable, reason);
  }
});
