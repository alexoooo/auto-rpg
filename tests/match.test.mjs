import { test } from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { MATCH, PROTOCOLS, matchJobs, matchScore, readMatchMind } from "../scripts/match.mjs";
import { playBouts } from "../research/bout-pool.mjs";
import { EMPTY_LOADOUT, loadoutKey } from "../src/core/items/held.ts";
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

for (const [name, protocol] of Object.entries(PROTOCOLS)) test(`a match plays every condition of the ${name} protocol with a loadout both minds fit, once with each mind on each side`, () => {
  const options = readMatchMind("options", protocol), puncher = readMatchMind("classic", protocol), scrapper = readMatchMind("behaviours", protocol);
  assert.deepEqual(options.loadouts, protocol.loadouts);
  const gaps = protocol.levels.reduce((sum, { gaps }) => sum + gaps.length, 0);
  for (const [a, b] of [[options, scrapper], [puncher, options]]) {
    const jobs = matchJobs(a, b, protocol), loadouts = protocol.loadouts.filter((one) => a.loadouts.some((loadout) => loadoutKey(loadout) === loadoutKey(one)) && b.loadouts.some((loadout) => loadoutKey(loadout) === loadoutKey(one)));
    const conditions = protocol.bodies.length ** 2 * loadouts.length * gaps;
    assert.equal(jobs.length, 2 * conditions);
    const seen = new Map();
    for (const { recipe, a: side } of jobs) {
      const other = side === "left" ? "right" : "left";
      assert.deepEqual([recipe.minds[side], recipe.minds[other]], [a.config, b.config], "a's mind is on the side its job names");
      assert.ok(loadouts.includes(recipe.loadouts.left), `${a.label} v ${b.label}: ${JSON.stringify(recipe.loadouts)}`);
      assert.deepEqual(recipe.loadouts.right, recipe.loadouts.left);
      const key = [recipe[side], recipe[other], loadoutKey(recipe.loadouts.left), loadoutKey(recipe.loadouts.right), recipe.level, recipe.gap].join();
      seen.set(key, [...seen.get(key) ?? [], side]);
      assert.deepEqual([recipe.capSeconds, recipe.recoverySeconds], [protocol.capSeconds, protocol.recoverySeconds]);
      assert.ok(protocol.levels.some(({ level, gaps: at }) => level === recipe.level && at.includes(recipe.gap)), `${recipe.level} ${recipe.gap}`);
    }
    assert.equal(seen.size, conditions, `${a.label} v ${b.label}`);
    for (const [key, sides] of seen) assert.deepEqual(sides.sort(), ["left", "right"], key);
  }
  assert.throws(() => matchJobs({ ...puncher, loadouts: [EMPTY_LOADOUT] }, { ...options, loadouts: [{ left: "empty", right: "club" }] }), /no loadout both fit/);
});

test("the Puncher plays the standard loadouts with a free hand to punch, and no sword-and-buckler match", () => {
  assert.deepEqual(readMatchMind("puncher").loadouts.map(loadoutKey), ["empty,empty", "empty,club", "empty,sword"]);
  assert.throws(() => readMatchMind("puncher", PROTOCOLS["sword-and-buckler"]), /does not fit/);
  assert.equal(MATCH, PROTOCOLS.standard);
});

test("a match's score counts a win for the side its mind played, and a draw a half", () => {
  const row = (a, winner, held) => ({ a, winner, ending: winner ? "fallen" : "time", recipe: { left: "workshop-fighter", right: "workshop-rogue", loadouts: { left: { left: "empty", right: held }, right: { left: "empty", right: held } }, gap: 4 } });
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

test("a worker on another build is rejected before its row reaches a result consumer", async () => {
  const [job] = matchJobs(readMatchMind("puncher"), readMatchMind("puncher"));
  const previous = process.env.AUTO_RPG_BUILD_IDENTITY;
  let accepted = 0;
  try {
    process.env.AUTO_RPG_BUILD_IDENTITY = `sha256:${"0".repeat(64)}`;
    await assert.rejects(playBouts([{ recipe: { ...job.recipe, capSeconds: .05 } }, { recipe: { ...job.recipe, capSeconds: .05 } }], 2, () => accepted++), /different source, assets or solver/);
    assert.equal(accepted, 0);
  } finally {
    if (previous === undefined) delete process.env.AUTO_RPG_BUILD_IDENTITY;
    else process.env.AUTO_RPG_BUILD_IDENTITY = previous;
  }
});

test("a result consumer that throws rejects the run and leaves no worker waiting", async () => {
  const [job] = matchJobs(readMatchMind("puncher"), readMatchMind("puncher"));
  await assert.rejects(playBouts([{ recipe: { ...job.recipe, capSeconds: .05 } }, { recipe: { ...job.recipe, capSeconds: .05 } }], 2, () => { throw new Error("result consumer refused row"); }), /result consumer refused row/);
});
