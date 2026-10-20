import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../research/bout.mjs";
import { arenaPlayback } from "../src/arena/playback.ts";
import { physicalReading } from "../src/core/observation.ts";

const recipe = { left: "workshop-fighter", right: "workshop-rogue", gap: 4,
  balance: { left: 0, right: 0 }, recoverySeconds: null, capSeconds: .5 };
const frames = (playback, seconds) => { for (let i = 0; i < seconds * 60; i++) playback.advance(1 / 60); };
const fatal = fighter => fighter.pool.wound({ part: "head", damage: fighter.pool.max("head"), clean: false });

test("Arena playback lets a defeated body collapse, retains the verdict and stops after three seconds", async () => {
  const bout = await buildBout(recipe), playback = arenaPlayback(bout.duel, .1);
  const { left, right } = bout.duel.duelists, read = physicalReading(left.built);
  try {
    frames(playback, .25);
    assert.equal(bout.duel.verdict, null);
    assert.deepEqual([left.body.level, right.body.level], ["full", "full"]);
    const upright = read().centre.y;
    fatal(left); playback.advance(1 / 120);
    const verdict = bout.duel.verdict, at = bout.world.steps;
    assert.deepEqual([verdict?.winner, verdict?.ending], ["right", "fatal"]);
    playback.advance(1 / 120);
    assert.deepEqual([left.body.level, right.body.level], ["limp", "full"]);
    const bars = [left.pool.bar(), right.pool.bar()];
    frames(playback, 4);
    assert.equal(bout.world.steps, at + 3 * bout.world.hz);
    assert.equal(bout.duel.verdict, verdict);
    assert.deepEqual([left.pool.bar(), right.pool.bar()], bars);
    assert.ok(read().centre.y < upright - .15, "the released body falls under gravity");
    const fallen = [...read().centre.asArray()];
    playback.advance(60);
    assert.equal(bout.world.steps, at + 3 * bout.world.hz);
    assert.deepEqual(read().centre.asArray(), fallen);
  } finally { playback.dispose(); bout.dispose(); }
});

test("a mutual fatal draw releases both bodies", async () => {
  const bout = await buildBout(recipe), playback = arenaPlayback(bout.duel, .1);
  try {
    frames(playback, .25);
    for (const fighter of Object.values(bout.duel.duelists)) fatal(fighter);
    playback.advance(2 / 120);
    assert.deepEqual([bout.duel.verdict?.winner, bout.duel.verdict?.ending], [null, "fatal"]);
    assert.deepEqual(Object.values(bout.duel.duelists).map(fighter => fighter.body.level), ["limp", "limp"]);
  } finally { playback.dispose(); bout.dispose(); }
});

test("a bell result preserves live bodies and only page playback stops the world", async () => {
  const bout = await buildBout(recipe), playback = arenaPlayback(bout.duel, .1);
  try {
    frames(playback, .25);
    const loser = bout.duel.duelists.left;
    loser.pool.wound({ part: "hand.left", damage: loser.pool.max("hand.left") / 2, clean: false });
    frames(playback, .25);
    assert.deepEqual([bout.duel.verdict?.winner, bout.duel.verdict?.ending], ["right", "time"]);
    assert.deepEqual(Object.values(bout.duel.duelists).map(fighter => fighter.body.level), ["full", "full"]);
    frames(playback, 4);
    assert.equal(bout.duel.clock, .5 + 3);
    playback.dispose();
    const at = bout.world.steps;
    bout.world.step();
    assert.equal(bout.world.steps, at + 1);
  } finally { playback.dispose(); bout.dispose(); }
});
