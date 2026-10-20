import { test } from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { ratedNotes, tournamentEntrants, tournamentJobs, tournamentTable, TOURNAMENT } from "../scripts/tournament.mjs";
import { bradleyTerry, ratingIntervals } from "../research/rating.mjs";
import { MINDS } from "../src/core/mind/controllers.ts";
import { modelSupportsMind } from "../src/core/models.ts";
import { noteFaults, noteOf } from "../src/ui/mind-notes.ts";

Logger.LogLevels = Logger.NoneLogLevel;

test("the ratings put a stronger entrant above a weaker one, the field's strengths centred on 1500, each inside its interval", () => {
  // a beats b three times in four, b beats c as often: a over b over c, and a's lead over c the larger.
  const games = [];
  for (const [i, j] of [[0, 1], [1, 2]]) for (const score of [1, 1, 1, 0]) games.push({ i, j, score });
  games.push({ i: 0, j: 2, score: .5 });
  const ratings = bradleyTerry(3, games);
  assert.ok(ratings[0] > ratings[1] && ratings[1] > ratings[2], JSON.stringify(ratings));
  assert.ok(Math.abs(ratings.reduce((t, x) => t + x, 0) / 3 - 1500) < 1e-9, "their mean, in log strength, is the field's");
  const intervals = ratingIntervals(3, games, { resamples: 50 });
  intervals.forEach(([low, high], k) => assert.ok(low <= high && low < ratings[k] + 1e-6 && ratings[k] - 1e-6 < high, `${k}: ${low} ${ratings[k]} ${high}`));
  // Fitted to every game at once: the order they came in counts for nothing.
  assert.deepEqual(bradleyTerry(3, [...games].reverse()), ratings);
});

test("every mind on every character and loadout it fits is an entrant, and each pair meets once on each side at each gap", () => {
  const entrants = tournamentEntrants();
  for (const { mind, model, loadout } of entrants) assert.ok(modelSupportsMind(model, MINDS[mind].config, loadout), `${mind} ${model} ${JSON.stringify(loadout)}`);
  assert.deepEqual([...new Set(entrants.map((entrant) => entrant.mind))].sort(), Object.keys(MINDS).sort(), "every mind plays");
  const some = entrants.slice(0, 4), jobs = tournamentJobs(some);
  assert.equal(jobs.length, 6 * 2 * TOURNAMENT.gaps.length);
  const met = new Map();
  for (const job of jobs) {
    const pair = [job.i, job.j].sort().join();
    met.set(pair, [...met.get(pair) ?? [], job.i]);
    assert.deepEqual([job.recipe.left, job.recipe.loadouts.left, job.recipe.minds.left], [some[job.i].model, some[job.i].loadout, MINDS[some[job.i].mind].config]);
  }
  for (const [pair, lefts] of met) assert.deepEqual(lefts.sort(), pair.split(",").map(Number).flatMap((k) => Array(TOURNAMENT.gaps.length).fill(k)).sort(), pair);
  assert.equal(new Set(jobs.map((job) => job.key)).size, jobs.length, "a bout is kept under a key of its own");
});

test("a table counts each entrant's bouts, and its notes are the rating at a leaf and the mean above it", () => {
  const entrants = [{ mind: "puncher", model: "workshop-fighter", loadout: { left: "empty", right: "empty" } }, { mind: "puncher", model: "workshop-rogue", loadout: { left: "empty", right: "empty" } }, { mind: "counter", model: "workshop-fighter", loadout: { left: "empty", right: "club" } }];
  const table = tournamentTable(entrants, [{ i: 0, j: 1, winner: "left" }, { i: 1, j: 0, winner: null }, { i: 2, j: 0, winner: "right" }]);
  assert.deepEqual(table.map(({ mind, model, wins, draws, losses, bouts }) => [mind, model, wins, draws, losses, bouts]), [
    ["puncher", "workshop-fighter", 2, 1, 0, 3], ["puncher", "workshop-rogue", 0, 1, 1, 2], ["counter", "workshop-fighter", 0, 0, 1, 1]]);
  const rows = [{ mind: "puncher", model: "workshop-fighter", loadout: { left: "empty", right: "empty" }, rating: 1600 }, { mind: "puncher", model: "workshop-rogue", loadout: { left: "empty", right: "empty" }, rating: 1500 },
    { mind: "puncher", model: "workshop-rogue", loadout: { left: "empty", right: "club" }, rating: 1401 }];
  const notes = ratedNotes({ puncher: { bodies: { "crypt-skeleton": { note: "kept" } } }, counter: { note: "kept" } }, rows, "2026-10-19");
  assert.deepEqual(noteFaults(notes), []);
  assert.equal(noteOf("puncher", "workshop-rogue", { left: "empty", right: "club" }, notes), "1401 2026-10-19");
  assert.equal(notes.puncher.bodies["workshop-rogue"].note, "1451 2026-10-19");
  assert.deepEqual([notes.puncher.loadouts["empty,empty"], notes.puncher.note], ["1550 2026-10-19", "1500 2026-10-19"]);
  assert.deepEqual([notes.puncher.bodies["crypt-skeleton"].note, notes.counter.note], ["kept", "kept"], "a note it does not rate is kept");
});
