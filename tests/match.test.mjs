import { test } from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { MATCH, matchJobs, matchScore, readMatchMind } from "../scripts/match.mjs";
import { playBouts } from "../research/bout-pool.mjs";
import { PRESETS } from "../src/core/mind/controllers.ts";

Logger.LogLevels = Logger.NoneLogLevel;

test("a match mind is named by a preset, a kind or its config, and one that cannot play the protocol's bodies is refused", () => {
  const preset = readMatchMind("puncher"), kind = readMatchMind("direct"), json = readMatchMind(JSON.stringify(PRESETS.puncher.config));
  assert.deepEqual([preset.config, kind.config.kind, json.config], [PRESETS.puncher.config, "direct", PRESETS.puncher.config]);
  // One config is one digest however it is named, and another config another.
  assert.equal(json.digest, preset.digest);
  assert.notEqual(kind.digest, preset.digest);
  assert.throws(() => readMatchMind("crawl"), /workshop-fighter/);
  assert.throws(() => readMatchMind('{"kind":"nobody"}'), /no mind/);
});

test("a match plays every condition of its protocol with a loadout both minds fit, once with each mind on each side", () => {
  const options = readMatchMind("options"), puncher = readMatchMind("puncher"), scrapper = readMatchMind("scrapper");
  // The Puncher punches, and a punch is thrown by a hand that holds nothing.
  assert.deepEqual([options.held, puncher.held], [MATCH.held, ["empty"]]);
  for (const [a, b] of [[options, scrapper], [puncher, options]]) {
    const jobs = matchJobs(a, b), held = MATCH.held.filter((one) => a.held.includes(one) && b.held.includes(one));
    const conditions = MATCH.bodies.length ** 2 * held.length * MATCH.gaps.length;
    assert.equal(jobs.length, 2 * conditions);
    const seen = new Map();
    for (const { recipe, a: side } of jobs) {
      const other = side === "left" ? "right" : "left";
      assert.deepEqual([recipe.minds[side], recipe.minds[other]], [a.config, b.config], "a's mind is on the side its job names");
      assert.ok(held.includes(recipe.held.left) && recipe.held.right === recipe.held.left, `${a.label} v ${b.label}: ${JSON.stringify(recipe.held)}`);
      const key = [recipe[side], recipe[other], recipe.held.left, recipe.held.right, recipe.gap].join();
      seen.set(key, [...seen.get(key) ?? [], side]);
      assert.deepEqual([recipe.capSeconds, recipe.recoverySeconds], [MATCH.capSeconds, MATCH.recoverySeconds]);
    }
    assert.equal(seen.size, conditions, `${a.label} v ${b.label}`);
    for (const [key, sides] of seen) assert.deepEqual(sides.sort(), ["left", "right"], key);
  }
  assert.throws(() => matchJobs(puncher, { ...options, held: ["club"] }), /no loadout both fit/);
});

test("a match's score counts a win for the side its mind played, and a draw a half", () => {
  const row = (a, winner, held) => ({ a, winner, ending: winner ? "fallen" : "time", recipe: { left: "workshop-fighter", right: "workshop-rogue", held: { left: held, right: held }, gap: 4 } });
  const score = matchScore([row("left", "left", "empty"), row("right", "left", "empty"), row("right", null, "club")]);
  assert.deepEqual(score.all, { bouts: 3, wins: 1, draws: 1, losses: 1, score: .5 });
  assert.deepEqual([score.side.left.score, score.side.right.score], [1, .25]);
  assert.deepEqual(Object.keys(score.bodies).sort(), ["workshop-fighter v workshop-rogue", "workshop-rogue v workshop-fighter"]);
  assert.deepEqual(score.ending, { "won by fallen": { bouts: 1, wins: 1, draws: 0, losses: 0, score: 1 },
    "lost by fallen": { bouts: 1, wins: 0, draws: 0, losses: 1, score: 0 }, draw: { bouts: 1, wins: 0, draws: 1, losses: 0, score: .5 } });
});

test("a match's bout is one the arena plays", async () => {
  const [job] = matchJobs(readMatchMind("puncher"), readMatchMind("direct"));
  const [row] = await playBouts([{ recipe: { ...job.recipe, capSeconds: 0.5 } }], 1);
  assert.ok(row.steps > 0 && /^[0-9a-f]+$/.test(row.digest), JSON.stringify({ steps: row.steps, digest: row.digest }));
});

test("a bout that throws ends the run, and leaves no worker waiting", async () => {
  const [job] = matchJobs(readMatchMind("puncher"), readMatchMind("puncher"));
  await assert.rejects(playBouts([{ recipe: { ...job.recipe, left: "nobody" } }, { recipe: { ...job.recipe, capSeconds: 0.5 } }], 2), /nobody/);
});
