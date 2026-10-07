/**
 * The first oracle: for one side of a bout, how it does when at every decision it tries a handful
 * of responses in forks of the true world (`rollout`, `rollouts.mjs`) and takes the best, beside
 * the same bout under its tactics alone.
 *
 *   node research/oracle.mjs [--left workshop-fighter] [--right workshop-rogue] [--all] [--gap 4]
 *     [--side left|right|both] [--every 0.5] [--horizon 2] [--seconds 120] [--blind 0] [--nudge 0.5]
 *     [--balance left,right] [--replay] [--workers 14] [--out research/runs/oracle]
 *
 * An instrument, not a mind: it holds the true world, which no mind may. Its forks play the
 * opponent's exact future, so it is clairvoyant; `--blind n` plays each response n times, each fork
 * nudged at both roots by `--nudge` N s in a level direction, and takes the mean.
 *
 * - **The trunk** is the oracle's bout, in this thread: the true world, the only one that advances
 *   for good. Its cap is `--seconds`, the arena's unless given.
 * - **A fork** is a load of the trunk's save at the decision (`Duel.save`), which costs the steps
 *   it plays out; `--replay` forks by playing the trunk's tape again from the start, which costs
 *   the bout up to the decision as well, and makes the same choices.
 * - **A decision**, every `--every` seconds of the trunk until its verdict: each response of
 *   `responsesAt` is held for one period in a fork and the side then handed back to its tactics
 *   for the rest of `--horizon` seconds. A response's value is the mean of `valueOf` over its
 *   forks, the choice is `chooseResponse`, and the trunk is given the choice and stepped a period.
 * - Every fork's poses at its fork (`at`) are the trunk's, or the oracle throws.
 *
 * It prints the harness, the search, and for each bout its row: the tactics' own bout and the
 * oracle's (winner, ending, seconds, each bar, the side's value at the end), the decisions taken,
 * the share that left the side's own tactics, each response's count, the mean over decisions of
 * the best value less `own`'s (what the search believed it gained), and the rollouts run with the
 * steps they took and the wall time. `--all` runs every matchup; with `--out` each oracle bout's recipe and
 * tape are written there, and the link that plays it is printed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { CAP_SECONDS, SIDES } from "../src/arena/duel.ts";
import { tapeHash } from "../src/arena/matchup.ts";
import { HUMANOID_MODELS as BODY_MODELS } from "../src/core/models.ts";
import { BOUT_HARNESS, buildBout } from "./bout.mjs";
import { defaultLanes, playBouts } from "./bout-pool.mjs";
import { rolloutPool } from "./rollout-pool.mjs";
import { chooseResponse, nudgesOf, poseDigest, responsesAt, valueOf } from "./rollouts.mjs";

const { values } = parseArgs({ options: {
  left: { type: "string", default: "workshop-fighter" }, right: { type: "string", default: "workshop-rogue" },
  all: { type: "boolean", default: false }, gap: { type: "string", default: "4" },
  side: { type: "string", default: "left" }, every: { type: "string", default: "0.5" }, horizon: { type: "string", default: "2" },
  seconds: { type: "string", default: String(CAP_SECONDS) }, blind: { type: "string", default: "0" }, nudge: { type: "string", default: "0.5" },
  balance: { type: "string" }, replay: { type: "boolean", default: false }, workers: { type: "string" }, out: { type: "string" },
} });
const gap = Number(values.gap), seconds = Number(values.seconds), blind = Number(values.blind), nudge = Number(values.nudge);
const sides = values.side === "both" ? SIDES : [values.side];
if (!sides.every((side) => SIDES.includes(side))) throw new Error(`--side is left, right or both, not ${values.side}`);
const balance = values.balance === undefined ? undefined : (([left, right = left]) => ({ left, right }))(values.balance.split(",").map(Number));
const matchups = values.all ? BODY_MODELS.flatMap((left) => BODY_MODELS.map((right) => ({ left, right }))) : [{ left: values.left, right: values.right }];
const lanes = Number(values.workers ?? defaultLanes());

const mean = (numbers) => numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
/** Who a bout's verdict put out: nobody at the cap, both in a draw before it, else the loser. */
const outOf = ({ winner, ending }) => ending === "time" || ending === "none" ? [] : winner === null ? [...SIDES] : SIDES.filter((side) => side !== winner);

/** `side`'s oracle bout of `recipe`: its row, its tape and its decisions. */
async function oracleBout(recipe, side, pool) {
  const { world, duel, dispose } = await buildBout(recipe);
  try {
    const builts = SIDES.map((each) => duel.duelists[each].built);
    const every = Math.round(Number(values.every) * world.hz), horizon = Math.round(Number(values.horizon) * world.hz);
    const decisions = [], cost = { rollouts: 0, steps: 0 };
    while (!duel.verdict) {
      const from = duel.steps, at = poseDigest(builts), responses = responsesAt(duel, side);
      const trials = blind > 0 ? Array.from({ length: blind }, (_, trial) => nudgesOf(from, trial, nudge)) : [[]];
      const fork = values.replay ? { tape: [...duel.tape] } : { save: duel.save() };
      const jobs = responses.flatMap(({ orders }) => trials.map((nudges) => ({
        recipe, ...fork, from, steps: horizon, nudges,
        branch: orders ? [{ step: from, side, orders }, { step: from + every, side, orders: null }] : [{ step: from, side, orders: null }],
      })));
      const rows = await pool.run(jobs);
      for (const row of rows) if (row.at !== at) throw new Error(`a fork at step ${from} did not reach the trunk's world: ${row.at}, not ${at}`);
      cost.rollouts += rows.length;
      // A replay steps from the bout's start; a load, from the fork.
      cost.steps += rows.reduce((sum, row) => sum + row.steps - (values.replay ? 0 : row.from), 0);
      const worth = responses.map((_, k) => mean(rows.slice(k * trials.length, (k + 1) * trials.length).map((row) => valueOf(row, side))));
      const best = chooseResponse(worth);
      decisions.push({ step: from, choice: responses[best].name, gain: worth[best] - worth[0] });
      duel.order(side, responses[best].orders);
      for (let step = 0; step < every && !duel.verdict; step++) world.step();
    }
    const { winner, ending } = duel.verdict, bars = SIDES.map((each) => duel.duelists[each].pool.bar());
    return { winner, ending, seconds: duel.clock, bars, value: valueOf({ bars, out: outOf(duel.verdict) }, side), tape: [...duel.tape], decisions, cost };
  } finally { dispose(); }
}

console.log(`${BOUT_HARNESS}; gap ${gap} m, cap ${seconds} s${balance ? `, balance ${balance.left} / ${balance.right} %` : ", every character's own balance"}`);
console.log(`The search: at every ${values.every} s one of own, attack, hold, close, back, left, right, held for ${values.every} s and then the side's own tactics, valued ${values.horizon} s on; `
  + (blind > 0 ? `blind: each response in ${blind} forks nudged ${nudge} N s at both roots, the mean taken` : "clairvoyant: each response in one fork of the true world")
  + (values.replay ? "; a fork by replay" : "; a fork by a load"));

const started = Date.now();
const bouts = matchups.flatMap((matchup) => sides.map((side) => ({ recipe: { ...matchup, gap, capSeconds: seconds, ...(balance ? { balance } : {}) }, side })));
// Each bout under its tactics alone, then the oracle's bouts side by side: their trunks in this thread, their forks on the pool.
const owns = await playBouts(bouts.map(({ recipe }) => ({ recipe })), lanes);
const pool = rolloutPool(lanes);
let results;
try {
  results = await Promise.all(bouts.map(async ({ recipe, side }, k) => {
    const began = Date.now(), own = owns[k], oracle = await oracleBout(recipe, side, pool);
    return { recipe, side, own: { ...own, value: valueOf({ bars: own.bars, out: outOf(own) }, side) }, oracle, wall: (Date.now() - began) / 1000 };
  }));
} finally { await pool.close(); }

const names = ["own", "attack", "hold", "close", "back", "left", "right"];
/** `n` to `places`, a value that rounds to nothing written without a sign. */
const fixed = (n, places) => (Math.abs(n) < 0.5 * 10 ** -places ? 0 : n).toFixed(places);
const told = (row) => `${row.winner ?? "draw"} | ${row.ending} | ${row.seconds.toFixed(2)} | ${row.bars.map((bar) => bar.toFixed(3)).join(" / ")} | ${fixed(row.value, 3)}`;
console.log(`\n${results.length} oracle bouts on ${lanes} workers in ${((Date.now() - started) / 1000).toFixed(0)} s.\n`);
console.log("| Left | Right | Side | Tactics: winner | Ending | Seconds | Bars | Value | Oracle: winner | Ending | Seconds | Bars | Value | Decisions | Left its tactics, % | " + names.join(" | ") + " | Believed gain a decision | Rollouts | Their steps | Wall, s |");
console.log("|" + "---|".repeat(20 + names.length));
for (const { recipe, side, own, oracle, wall } of results) {
  const { decisions, cost } = oracle, count = (name) => decisions.filter((decision) => decision.choice === name).length;
  console.log(`| ${recipe.left} | ${recipe.right} | ${side} | ${told(own)} | ${told(oracle)} | ${decisions.length} | ${(100 * (1 - count("own") / decisions.length)).toFixed(0)} | `
    + `${names.map(count).join(" | ")} | ${fixed(mean(decisions.map((decision) => decision.gain)), 3)} | ${cost.rollouts} | ${cost.steps} | ${wall.toFixed(0)} |`);
}
const better = results.filter(({ own, oracle }) => oracle.value > own.value).length, worse = results.filter(({ own, oracle }) => oracle.value < own.value).length;
console.log(`\nOf ${results.length} sides the oracle's bout ended better than the tactics' own by its value in ${better}, worse in ${worse}, the same in ${results.length - better - worse}.`);
console.log(`Mean value at the end: the tactics ${fixed(mean(results.map(({ own }) => own.value)), 3)}, the oracle ${fixed(mean(results.map(({ oracle }) => oracle.value)), 3)}.`);

if (values.out) {
  mkdirSync(values.out, { recursive: true });
  console.log("");
  for (const { recipe, side, oracle } of results) {
    const file = `${values.out}/${recipe.left}-${recipe.right}-${side}.json`;
    writeFileSync(file, JSON.stringify({ recipe, tape: oracle.tape }));
    console.log(`${file}: ?play=arena&matchup=${recipe.left},${recipe.right}&gap=${recipe.gap}&cap=${recipe.capSeconds}${recipe.balance ? `&balance=${recipe.balance.left},${recipe.balance.right}` : ""}${tapeHash(oracle.tape)}`);
  }
}
