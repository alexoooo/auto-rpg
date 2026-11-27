/**
 * **A bout for the fight record** (`record.mjs`), on a worker of the measuring command
 * (`measure.mjs`): each job is a bout of the tournament's protocol, its two entrants by side, and
 * its answer the bout's row. Two load hooks read the Mind's decisions and change none: the tree
 * search's root and the Options it weighed (`move-prior-hook.mjs`), and the Option the selection
 * took (`option-fork-hook.mjs`, given no Option to force).
 *
 * A job with `bank` (`{ every, folder, name }`, its saves named by `name`) also keeps states for the forked record's bank
 * (`bank.mjs`): of each side's decisions made afresh with an Option to take, every `every`th
 * (from a place set by the bout's), the bout as it stood before the step it was made in
 * (`Duel.save`), written to `folder`, and answered beside the row: its side, its time, the step
 * the save is at, the poses' digest there, what was on offer and what the Mind took. The bout
 * saves itself before every step to have it, which changes nothing it does but costs: a bout of
 * the Warrior's mirror took 660 worker-seconds so, against 145 without.
 */
import { register } from "node:module";
import { parentPort } from "node:worker_threads";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serialize } from "node:v8";
import { gzipSync } from "node:zlib";

register("./move-prior-hook.mjs", import.meta.url);
register("../option-fork-hook.mjs", import.meta.url);
await import("../../tests/harness/preload-data.mjs");
const { Logger } = await import("@babylonjs/core/Misc/logger.js");
const { EVALUATIONS, playCase } = await import("../../src/app/node/evaluation.ts");
const { DEFAULT_ENGINE } = await import("../../src/core/physics/engines.ts");
const { isRefused } = await import("../../src/core/refusal.ts");
const { bodyOf } = await import("../../src/minds/option/predictions/value/fitted-value.ts");
const { rootReading, sideOf } = await import("./root-reading.mjs");
const { struckNumbers } = await import("../../src/skills/framework/profile/numbers.ts");
const { SIDES } = await import("../../src/game/arena/duel.ts");
const { playedBy } = await import("../skills/profile-origin.mjs");
const { poseDigest } = await import("../rollouts.mjs");

// A worker's row is its message: Babylon's banner for each bout's scene is not.
Logger.LogLevels = Logger.NoneLogLevel;

/** Play bout `index` of the tournament's `protocol`, `entrants` (subjects) left and right, and give its row (`record.mjs`) without its key's play; with `bank`, and its states kept (`banked`). */
async function playBout({ protocol, index, entrants, bank = null }) {
  const cases = EVALUATIONS.tournament.protocols[protocol], condition = cases?.conditions[index];
  if (!condition) throw new Error(`the tournament has no bout ${index} on ${protocol}`);
  const world = cases.world(entrants.map((one) => one.value), condition, cases.engine ?? DEFAULT_ENGINE, entrants.map((one) => ({ character: one.character ?? {} })));
  if (isRefused(world)) throw new Error(world.refused);
  let duel = null;
  const roots = [], lives = [], deciding = { left: [], right: [] }, options = new Map();
  const optionOf = (name) => options.get(name) ?? options.set(name, options.size).get(name);
  globalThis.__searchLines = (root, at, edges) => {
    if (!duel) return;
    const reading = rootReading(root, at);
    if (!reading) return;
    const side = sideOf(root), row = { side, t: duel.clock, reading, lines: edges.map(({ pair, step, runs, worth }) =>
      [optionOf(pair.option.name), Math.max(0, pair.target ?? 0), pair.option.kind, pair.option.open === true ? 1 : 0, step.terms.duration, step.terms.dealt, step.terms.taken, at.price(step, root), runs, worth]), ran: null };
    roots.push(row); deciding[side].push(row);
  };
  // The bank's: the save before this step, its step and poses, each side's decisions with an Option to take, and those kept.
  let save = null, from = 0, at = null;
  const made = { left: 0, right: 0 }, banked = [];
  // The selection's pick, for the roots its side searched at this decision; a root searched at an earlier one took none.
  globalThis.__optionDecision = ({ side, time, offered, pick }) => {
    if (!duel) return;
    for (const row of deciding[side]) if (row.t === duel.clock && pick) row.ran = [optionOf(pick[2]), pick[1]];
    deciding[side].length = 0;
    if (!bank || !pick || offered.length === 0 || (made[side]++ + index) % bank.every !== 0) return;
    const file = `${bank.name}-${side}-${from}.v8.gz`;
    writeFileSync(join(bank.folder, file), gzipSync(serialize(save)));
    banked.push({ side, t: duel.clock, time, from, at, offered, pick, file });
  };
  if (bank) mkdirSync(bank.folder, { recursive: true });
  const keep = () => { save = duel.save(); from = duel.steps; at = poseDigest(SIDES.map((side) => duel.duelists[side].built)); };
  const played = await playCase(world, cases.seconds, (built) => {
    duel = built.duel; const reader = cases.read(built, condition);
    if (bank) keep();
    return { afterStep() {
      reader.afterStep();
      if (bank) keep();
      const now = [duel.life("left"), duel.life("right")], last = lives[lives.length - 1];
      if (!last || now.some((life, k) => life !== last[k + 1])) lives.push([duel.clock, ...now]);
    }, get ended() { return reader.ended; }, reading: () => reader.reading() };
  }, {});
  if (isRefused(played)) throw new Error(played.refused);
  const sides = Object.fromEntries(SIDES.map((side, k) => {
    const { body, mind } = duel.duelists[side], spec = body.built.spec;
    return [side, { entrant: entrants[k].id, body: bodyOf(spec), numbers: struckNumbers(spec), played: playedBy(spec, mind) }];
  }));
  return { protocol, index, condition, sides, end: duel.clock, lives, options: [...options.keys()], roots, ...(bank ? { banked } : {}) };
}

parentPort.on("message", async (job) => {
  try { parentPort.postMessage({ result: await playBout(job) }); }
  catch (error) { parentPort.postMessage({ error: error?.stack ?? String(error) }); }
});
