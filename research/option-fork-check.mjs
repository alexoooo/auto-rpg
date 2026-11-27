/**
 * **The option fork's check**: forks of one bout that each take a given Option (`rollout`'s
 * `option`, `rollouts.mjs`) reproduce the bout where the Option is the Mind's own choice, and move
 * it where it is another.
 *
 *   node research/option-fork-check.mjs [--bout 0] [--every 1] [--horizon 2] [--seconds 120] [--mind <mind.json>]
 *
 * It plays bout `--bout` of the match's `warrior` protocol (the empty-handed Warrior on himself at
 * the scorecard's gaps), the game's Mind for the man on both sides unless `--mind` names a config,
 * its cap `--seconds`. That is the trunk: it saves the bout before every step (`Duel.save`), and at
 * every `--every`th decision each side's Mind makes afresh with an Option to take, it keeps the
 * poses before the step it decided in, what it took and what else it was offered, and forks it
 * there twice at once, by a load of that step's save, `--horizon` s on, with
 * no nudge:
 *
 * - **its own**: the Option the Mind took there, named by its key. The fork must reach the trunk's
 *   poses at the fork, decide at the same time, find the same Option its own, take it, and end on
 *   the trunk's trace and poses to the bit. Any that does not is printed, and the script fails.
 * - **another**: the worst Option on offer there, the plainest other choice (the next best is often
 *   a twin of its own: the same run by another navigator). It too must start on the trunk's poses,
 *   or the script fails; it says how many were taken and how many ended on poses not the trunk's.
 *
 * It prints the harness, the bout, the decisions made and kept, the two counts, and the time the
 * trunk and the forks took. One bout in this thread, nothing on workers: light enough to run
 * beside other work, though not beside a reading of how long a Mind thinks.
 */
import { register } from "node:module";
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

register("./option-fork-hook.mjs", import.meta.url);
await import("../tests/harness/preload-data.mjs");
const { SIDES } = await import("../src/game/arena/duel.ts");
const { EVALUATIONS, buildBout } = await import("../src/app/node/evaluation.ts");
const { CONTEXT } = await import("../src/app/node/context.ts");
const { traceOf } = await import("../src/evaluation/trace.ts");
const { BOUT_ENGINE, BOUT_HARNESS } = await import("./bout.mjs");
const { poseDigest, rollout } = await import("./rollouts.mjs");

const { values } = parseArgs({ options: {
  bout: { type: "string", default: "0" }, every: { type: "string", default: "1" }, horizon: { type: "string", default: "2" },
  seconds: { type: "string", default: "120" }, mind: { type: "string" },
} });
const n = Number(values.bout), every = Number(values.every), seconds = Number(values.seconds);
const cases = EVALUATIONS.match.protocols.warrior, condition = cases.conditions[n];
if (!condition) throw new Error(`the warrior protocol has no bout ${n}`);
const mind = values.mind ? JSON.parse(readFileSync(values.mind, "utf8")) : CONTEXT.defaultMind("man", condition.loadout);
const [subject] = EVALUATIONS.match.subjects([{ id: "mind", label: "mind", value: mind }, { id: "mind2", label: "mind", value: mind }]);
const recipe = { ...cases.world([subject.value, subject.value], condition, BOUT_ENGINE, [{}, {}]).recipe, capSeconds: seconds };
const keyOf = (entry) => `${entry[0]}:${entry[1]}`;

// The trunk: a save before every step. A kept decision is forked at once from the save before the
// step it was made in, so no save is held; the trunk's own trace from there is compared once it is
// played. The forks play in a bout of their own (`rollout`), so the trunk forking does not move it.
const began = Date.now();
const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE });
const builts = SIDES.map((side) => duel.duelists[side].built), horizon = Math.round(Number(values.horizon) * world.hz);
const made = { left: 0, right: 0 }, open = [], failed = [];
let decided = [], kept = 0, reproduced = 0, others = 0, otherTaken = 0, moved = 0, forkSeconds = 0;
const watch = ({ side, time, offered, pick }) => {
  if (!pick || made[side]++ % every !== 0) return;
  const rest = offered.filter((entry) => keyOf(entry) !== keyOf(pick));
  decided.push({ side, time, own: keyOf(pick), name: pick[2], other: rest.at(-1) ?? null });
};
/** What `own`, the fork that took the Mind's own Option, does wrong beside the trunk (`one`), once the trunk has played its horizon. */
function faultsOf(own, one) {
  const faults = [];
  if (own.at !== one.at) faults.push("not at the trunk's poses at the fork");
  if (!own.chose) faults.push("no decision afresh");
  else {
    if (own.chose.time !== one.time) faults.push(`decided at ${own.chose.time}, not ${one.time}`);
    if (own.chose.own !== one.own) faults.push(`its own was ${own.chose.own}`);
    if (!own.chose.taken) faults.push("not taken");
  }
  if (own.steps !== one.steps || own.digest !== one.digest || own.end !== one.end)
    faults.push(`ended at step ${own.steps} on ${own.digest} ${own.end}, the trunk at ${one.steps} on ${one.digest} ${one.end}`);
  return faults;
}
try {
  globalThis.__optionDecision = watch;
  while (!duel.verdict) {
    const from = duel.steps, save = duel.save(), at = poseDigest(builts);
    decided = [];
    world.step();
    // A fork's trace takes the poses after each of its steps, as this one does from here.
    for (const decision of decided) {
      const forked = Date.now(), fork = (key) => rollout({ recipe, save, from, steps: horizon, option: { side: decision.side, key } });
      const forks = { own: await fork(decision.own), other: decision.other && await fork(keyOf(decision.other)) };
      forkSeconds += (Date.now() - forked) / 1000;
      open.push({ ...decision, from, at, forks, trace: traceOf(builts) });
    }
    for (const one of open) one.trace.take();
    for (const one of open.filter((each) => duel.verdict || duel.steps >= each.from + horizon)) {
      open.splice(open.indexOf(one), 1);
      const trunk = { ...one, steps: duel.steps, digest: one.trace.digest(), end: poseDigest(builts) }, faults = faultsOf(one.forks.own, trunk);
      kept++;
      if (!faults.length) reproduced++;
      else failed.push(`${one.side} at step ${one.from} (${one.time.toFixed(3)} s), ${one.own} ${one.name}: ${faults.join("; ")}`);
      if (!one.other) continue;
      others++;
      if (one.forks.other.at !== one.at) failed.push(`${one.side} at step ${one.from}: the fork taking ${keyOf(one.other)} was not at the trunk's poses at the fork`);
      if (one.forks.other.chose?.taken) otherTaken++;
      if (one.forks.other.end !== trunk.end) moved++;
    }
  }
} finally { globalThis.__optionDecision = undefined; dispose(); }

console.log(`${BOUT_HARNESS}; the warrior protocol's bout ${n}: gap ${condition.gap} m, cap ${seconds} s; ${values.mind ?? "the game's Mind for the man"} on both sides`);
console.log(`The trunk: ${duel.verdict.winner ?? "draw"} by ${duel.verdict.ending} at ${duel.clock.toFixed(2)} s; decisions with an Option to take ${made.left} left, ${made.right} right; kept every ${every === 1 ? "one" : `${every}th`}, ${kept}`);
console.log(`Its own Option: ${reproduced} of ${kept} forks reproduced the trunk to the bit.`);
console.log(`Another Option: ${others} forks, ${otherTaken} taken, ${moved} ended on poses not the trunk's.`);
console.log(`The forks: ${kept + others} of ${(horizon / world.hz).toFixed(1)} s in ${forkSeconds.toFixed(0)} s, ${(forkSeconds / Math.max(1, kept + others)).toFixed(2)} s a fork; the whole ${((Date.now() - began) / 1000).toFixed(0)} s.`);
if (failed.length) { console.log(failed.slice(0, 20).join("\n")); process.exitCode = 1; }
