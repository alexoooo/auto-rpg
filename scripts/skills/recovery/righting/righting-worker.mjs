import { parentPort } from "node:worker_threads";
import { rulebook } from "../../../../src/combat/rulebook.ts";
// One righting trial for `scripts/skills/recovery/righting/righting.mjs`: a quadruped's game mind playing a
// candidate recipe (its way up by recipe's research `tuning`), on a body built lying under stand
// orders (Node stand), or in a fight forked where its righting took the body (Node Arena Duel).
// Rapier, 120 Hz, the game's delay. As a worker thread it takes { id, ...trial } and answers
// { id, result }.
import "../../../../tests/harness/preload-data.mjs";
import { Quaternion, Vector3 } from "../../../../src/core/math/vector.ts";
import { coreStand } from "../../../../tests/harness/core-stand.mjs";
import { createMind } from "../../../../src/minds/seat/create-mind.ts";
import { GAME, defaultMind } from "../../../../src/app/catalog.ts";
import { optionsOf } from "../../../../src/minds/option/assembly/config.ts";
import { quadrupedSpec } from "../../../../src/core/bodies/quadruped/spec.ts";
import { modelSpec } from "../../../../src/core/bodies/models.ts";
import { STAND_ORDERS } from "../../../../src/minds/orders.ts";
import { buildBout } from "../../../../src/app/node/evaluation.ts";
import { loadState } from "../../../../src/core/state.ts";
import { deserialize } from "node:v8";
import { readFileSync } from "node:fs";

/** What a fork's bodies hold: nothing, and the Warrior's sword. */
const BARE = Object.freeze({ left: "empty", right: "empty" }), SWORD = Object.freeze({ left: "empty", right: "sword" });

/** The model's game mind, bare, its way up by recipe playing `recipe`. */
const withRecipe = (model, recipe) => {
  const base = defaultMind(model, BARE);
  return { ...base, options: optionsOf(base, GAME.partLookup).map((option) => option.skill?.kind === "righting-recipe" ? { ...option, skill: { kind: "righting-recipe", tuning: recipe } } : option) };
};

/**
 * The righting by recipe's run in a minded body's skills (`rightingByRecipe`), its ground executor's, read as it
 * is each time: its phase (idle before the executor is made, on the mind's first step) and how it lay.
 */
export const rightingOf = (minded) => {
  const run = () => minded.skills.state.actions.executors.find((executor) => executor?.run && "mirrored" in executor.run)?.run;
  return { get phase() { return run()?.phase ?? "idle"; }, get lie() { return run()?.lie ?? null; } };
};

/**
 * **The fight a fork is of**: `model`, bare, against the Warrior `gap` m away holding `held` (a sword
 * unless `"empty"`); its mind's righting `recipe` where one is given.
 */
export const forkBout = (model, gap, recipe, held = "sword") => {
  const his = held === "empty" ? BARE : SWORD;
  return { left: model, right: "man", gap, loadouts: { left: BARE, right: his },
    ...recipe ? { minds: { left: withRecipe(model, recipe), right: defaultMind("man", his) } } : {} };
};

const forksRead = new Map();
/**
 * A fork's fight played on with `recipe`: the save loaded as `Duel.load` does, into the same bout
 * built with the candidate's mind, which holds the same state; its record a stand trial's.
 */
async function fightTrial(model, recipe, file, fork, seconds) {
  if (!forksRead.has(file)) forksRead.set(file, deserialize(readFileSync(file)));
  const { gap, held, save } = forksRead.get(file)[fork];
  const { duel, world, dispose } = await buildBout(forkBout(model, gap, recipe, held));
  try {
  world.physics.load(save.physics); loadState(duel.state, save.state); duel.senses.show(); world.loaded();
  const body = duel.duelists.left.body, righting = rightingOf(duel.duelists.left.minded), trunk = body.built.segments.get("trunk"), rest = Quaternion.Inverse(trunk.rest), up = new Vector3();
  const from = duel.clock, last = 2;
  let played = false, handed = null, down = 0, lie = null, plays = 0, was = righting.phase;
  while (duel.clock < from + seconds && !duel.verdict) {
    world.step();
    if (righting.phase === "play" && was !== "play") plays++;
    was = righting.phase;
    if (righting.phase === "play" && !played) { played = true; lie = righting.lie; }
    if (played && handed === null && righting.phase === "idle" && !body.down) handed = duel.clock - from;
    if (duel.clock > from + seconds - last && body.down) down += 1 / 120;
  }
  up.set(0, 1, 0).applyRotationQuaternionToRef(trunk.pose.rotation.multiply(rest), up);
  const result = { up: up.y, height: trunk.pose.position.y, down, handed, retries: Math.max(0, plays - 1), lie, verdict: duel.verdict ? duel.verdict.winner : null };
  return result;
  } finally { dispose(); }
}

/** How a trial's body is built lying, before its heading: the trunk turned about the body's z. */
export const LYING = { back: [0, 0, 1, 0], left: [0, 0, Math.SQRT1_2, Math.SQRT1_2], right: [0, 0, -Math.SQRT1_2, Math.SQRT1_2], tilted: [0, 0, Math.sin(-1.2), Math.cos(-1.2)] };

/**
 * A trial: `data` (a body file) built `lying` at `heading` rad, `seconds` played; or the `fork`th of
 * `forks` (`righting-forks.mjs`), its fight from where the righting took the body. Its record: the
 * trunk's up and height at the end, the seconds down in the last two, when the righting handed the
 * body back, how often it played its poses again and how it first read the body lying; a fight's, its
 * verdict.
 */
export async function trial({ data, model, recipe, lying, heading = 0, forks, fork, seconds }) {
  if (fork !== undefined) return fightTrial(model, recipe, forks, fork, seconds);
  const turn = new Quaternion(0, Math.sin(heading / 2), 0, Math.cos(heading / 2));
  // The body from `data`, holding its model's character's skills as a fight's does: a body holding none runs no way up.
  const spec = { ...quadrupedSpec(data, model, `${model}-anatomy`), skills: modelSpec(model).skills };
  const stand = await coreStand(spec, { groundSize: 100, position: [0, .3, 0], rotation: turn.multiply(new Quaternion(...LYING[lying])).asArray() });
  try {
  const config = withRecipe(model, recipe);
  const mind = createMind(GAME, stand.built, stand.world, config, { rules: rulebook("arena"), name: model, orders: () => STAND_ORDERS });
  try {
  const righting = rightingOf(mind), trunk = stand.built.segments.get("trunk"), rest = Quaternion.Inverse(trunk.rest), up = new Vector3();
  const steps = Math.round(seconds * 120), last = 240;
  let played = false, handed = null, down = 0, lie = null, plays = 0, was = righting.phase;
  for (let i = 1; i <= steps; i++) {
    stand.step();
    if (righting.phase === "play" && was !== "play") plays++;
    was = righting.phase;
    if (righting.phase === "play" && !played) { played = true; lie = righting.lie; }
    if (played && handed === null && righting.phase === "idle" && !mind.body.down) handed = i / 120;
    if (i > steps - last && mind.body.down) down += 1 / 120;
  }
  up.set(0, 1, 0).applyRotationQuaternionToRef(trunk.pose.rotation.multiply(rest), up);
  const result = { up: up.y, height: trunk.pose.position.y, down, handed, retries: Math.max(0, plays - 1), lie };
  return result;
  } finally { mind.body.dispose(); }
  } finally { stand.dispose(); }
}

if (parentPort) {
  parentPort.on("message", async (job) => {
    try { parentPort.postMessage({ id: job.id, result: await trial(job) }); }
    catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
  });
}
