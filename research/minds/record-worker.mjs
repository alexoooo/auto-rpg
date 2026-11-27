/**
 * **A bout for the fight record** (`record.mjs`), on a worker of the measuring command
 * (`measure.mjs`): each job is a bout of the tournament's protocol, its two entrants by side, and
 * its answer the bout's row. Two load hooks read the Mind's decisions and change none: the tree
 * search's root and the Options it weighed (`move-prior-hook.mjs`), and the Option the selection
 * took (`option-fork-hook.mjs`, given no Option to force).
 */
import { register } from "node:module";
import { parentPort } from "node:worker_threads";

register("./move-prior-hook.mjs", import.meta.url);
register("../option-fork-hook.mjs", import.meta.url);
await import("../../tests/harness/preload-data.mjs");
const { Logger } = await import("@babylonjs/core/Misc/logger.js");
const { EVALUATIONS, playCase } = await import("../../src/app/node/evaluation.ts");
const { DEFAULT_ENGINE } = await import("../../src/core/physics/engines.ts");
const { isRefused } = await import("../../src/core/refusal.ts");
const { graceAt } = await import("../../src/minds/option/situation/reach-memory.ts");
const { bodyOf, offeredOf, readingAt } = await import("../../src/minds/option/predictions/value/fitted-value.ts");
const { struckNumbers } = await import("../../src/skills/framework/profile/numbers.ts");
const { SIDES } = await import("../../src/game/arena/duel.ts");
const { playedBy } = await import("../skills/profile-origin.mjs");

// A worker's row is its message: Babylon's banner for each bout's scene is not.
Logger.LogLevels = Logger.NoneLogLevel;

/** An Option on offer as a reading's `offered` keeps it (`OFFERED`). */
const offeredLine = ({ kind, open, duration, dealt, taken }) => [kind, open ? 1 : 0, duration, dealt, taken];

/** The other side. */
const other = (side) => side === "left" ? "right" : "left";

/** Play bout `index` of the tournament's `protocol`, `entrants` (subjects) left and right, and give its row (`record.mjs`) without its key's play. */
async function playBout({ protocol, index, entrants }) {
  const cases = EVALUATIONS.tournament.protocols[protocol], condition = cases?.conditions[index];
  if (!condition) throw new Error(`the tournament has no bout ${index} on ${protocol}`);
  const world = cases.world(entrants.map((one) => one.value), condition, cases.engine ?? DEFAULT_ENGINE, entrants.map((one) => ({ character: one.character ?? {} })));
  if (isRefused(world)) throw new Error(world.refused);
  let duel = null;
  const roots = [], lives = [], deciding = { left: [], right: [] }, options = new Map();
  const optionOf = (name) => options.get(name) ?? options.set(name, options.size).get(name);
  globalThis.__searchLines = (root, at, edges) => {
    if (!duel || !root.focus) return;
    const offered = [];
    for (const pair of at.pairsAt(root)) { const terms = at.modelAt(pair, root); if (terms) offered.push(offeredOf(pair.option.kind, pair.option.open === true, terms)); }
    const reading = readingAt(root, graceAt(root), offered);
    if (!reading) return;
    const side = other(root.focus.side), row = { side, t: duel.clock, reading: { ...reading, offered: reading.offered.map(offeredLine) }, lines: edges.map(({ pair, step, runs, worth }) =>
      [optionOf(pair.option.name), Math.max(0, pair.target ?? 0), pair.option.kind, pair.option.open === true ? 1 : 0, step.terms.duration, step.terms.dealt, step.terms.taken, at.price(step, root), runs, worth]), ran: null };
    roots.push(row); deciding[side].push(row);
  };
  // The selection's pick, for the roots its side searched at this decision; a root searched at an earlier one took none.
  globalThis.__optionDecision = ({ side, pick }) => {
    if (!duel) return;
    for (const row of deciding[side]) if (row.t === duel.clock && pick) row.ran = [optionOf(pick[2]), pick[1]];
    deciding[side].length = 0;
  };
  const played = await playCase(world, cases.seconds, (built) => {
    duel = built.duel; const reader = cases.read(built, condition);
    return { afterStep() {
      reader.afterStep();
      const now = [duel.life("left"), duel.life("right")], last = lives[lives.length - 1];
      if (!last || now.some((life, k) => life !== last[k + 1])) lives.push([duel.clock, ...now]);
    }, get ended() { return reader.ended; }, reading: () => reader.reading() };
  }, {});
  if (isRefused(played)) throw new Error(played.refused);
  const sides = Object.fromEntries(SIDES.map((side, k) => {
    const { body, mind } = duel.duelists[side], spec = body.built.spec;
    return [side, { entrant: entrants[k].id, body: bodyOf(spec), numbers: struckNumbers(spec), played: playedBy(spec, mind) }];
  }));
  return { protocol, index, condition, sides, end: duel.clock, lives, options: [...options.keys()], roots };
}

parentPort.on("message", async (job) => {
  try { parentPort.postMessage({ result: await playBout(job) }); }
  catch (error) { parentPort.postMessage({ error: error?.stack ?? String(error) }); }
});
