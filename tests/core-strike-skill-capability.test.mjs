/**
 * **The repertoire's club blow thrown** (`src/core/skills/strikes.ts`, through `research/core-blow.mjs`,
 * Node core stand, Rapier, 120 Hz): at its place it reads what its record says, and thrown with the
 * strike skill's steer it follows a head that moved across under it, its body standing after.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { STEER } from "../src/core/skills/strike.ts";
import { REPERTOIRE } from "../src/core/skills/strikes.ts";
import { evaluateBlow } from "../research/core-blow.mjs";

const CLUB = REPERTOIRE.find((recipe) => recipe.model === "workshop-fighter" && recipe.held === "wooden club" && recipe.band === "high");

test("the_repertoires_club_blow_reads_at_its_place_what_its_record_says", {
  todo: "the repertoire's readings were measured on capsule hands, and the club blow at its place now nets less than its record",
}, async () => {
  // As written, on a 20 m ground at the game's rate: the first of the eight its net is the mean of.
  const { readings, net } = CLUB, read = readings.at120;
  const blow = await evaluateBlow({ model: CLUB.model, held: CLUB.held, band: CLUB.band, strike: CLUB.strike, ahead: CLUB.place.ahead, hz: 120, ground: 20 });
  assert.deepEqual({ fell: blow.fell, stood: blow.stood, cost: blow.cost }, { fell: false, stood: true, cost: 0 });
  assert.equal(+(blow.done - blow.cost).toFixed(3), read.runs[0]);
  assert.equal(read.runs.length, 8);
  assert.ok(Math.abs(net - read.runs.reduce((sum, run) => sum + run, 0) / 8) < 1e-3 && net === read.net, `it nets ${net} of ${read.runs}`);
  assert.ok(net > 0.5, `${net} HP`);
});

test("the_repertoires_club_blow_follows_a_head_that_moved_across_under_it", async () => {
  // The Warrior's club at a head, the target 12 cm to the left once the blow is committed: on the
  // stand, as written, it does 0.09 HP unturned and 0.93 turned (`docs/reference/blows.md#steered`).
  const thrown = (steer) => evaluateBlow({ model: CLUB.model, held: CLUB.held, band: CLUB.band, strike: CLUB.strike, ahead: CLUB.place.ahead,
    off: { across: -0.12 }, seen: true, steer });
  const [turned, unturned] = [await thrown(STEER), await thrown(0)], at = CLUB.readings.at120.runs[0];
  assert.deepEqual({ fell: turned.fell, stood: turned.stood }, { fell: false, stood: true });
  assert.ok(turned.done > 0.7 * at && unturned.done < 0.2 * at, `turned ${turned.done}, unturned ${unturned.done}, at its place ${at}`);
});
