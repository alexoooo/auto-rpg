/**
 * **The club check**: whether the fighter that strikes on the shared strike cycle (Scrapper) holds
 * its own against the fighter that strikes by recipe (Classic) when both hold the wooden club.
 * Each humanoid model meets itself, 192 mirrored pairs a model (`combatPairs`, the held-out split),
 * club in both right hands, under the arena-combat protocol (`COMBAT_PROTOCOL`: 60 s cap, recovery
 * continuing, balance 0 as every character's is).
 *
 *   node research/club-check.mjs --jobs <file>          # write the job manifest
 *   node research/arena-combat-run.mjs --jobs <file> --workers 8 --output <run.json>
 *   node research/club-check.mjs --report <run.json>    # the table and the bar
 *
 * The report gives, per model and pooled: the paired score with its Wilson 95 % interval, the score
 * by the candidate's side, the paired difference in driven-damage rate with its standard error,
 * Cohen's d of the paired bar margin, the endings and the falls. It passes when the pooled score
 * is at least .50 with its lower bound at least .45, no model's lower bound is under .40, and the
 * damage-rate difference is not below zero by more than 1.96 standard errors. A side split over 10
 * points makes the run invalid rather than passed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { combatPairs } from "./arena-combat.mjs";
import { combatCell } from "./combat-records.mjs";

/** The humanoid models the check runs on, each against itself. */
const MODELS = ["workshop-fighter", "workshop-rogue", "crypt-skeleton"];
/** Mirrored pairs a model: 384 bouts, a band near ±5 points on the score. */
const PAIRS = 192;
/** The bar (the module's comment). */
const BAR = { pooled: 0.5, pooledLower: 0.45, cellLower: 0.4, sideSplit: 0.1, z: 1.959963984540054 };

/** Every bout of the check: the held-out pairs once for each model, numbered apart so that the pooled rating keeps them distinct. */
function clubJobs() {
  return MODELS.flatMap((model, m) => combatPairs({ candidate: "scrapper", opponent: "classic", count: PAIRS }).map((job) => ({
    ...job, id: `${model}/${job.id}`, pair: m * PAIRS + job.pair,
    config: { ...job.config, recipe: { ...job.config.recipe, left: model, right: model, held: { left: "club", right: "club" } } },
  })));
}

const fixed = (v, n = 3) => v === null ? "n/a" : v.toFixed(n);

const { values } = parseArgs({ options: { jobs: { type: "string" }, report: { type: "string" } } });
if (values.jobs) {
  const jobs = clubJobs();
  writeFileSync(values.jobs, JSON.stringify(jobs, null, 1));
  console.log(`${jobs.length} jobs written to ${values.jobs}`);
} else if (values.report) {
  const run = JSON.parse(readFileSync(values.report, "utf8"));
  if (!run.complete) throw new Error(`${values.report} is not complete: ${run.rows.length} of ${run.jobs.length}`);
  if (run.failures.length) throw new Error(`${run.failures.length} trials failed`);
  const [harness] = run.rows.map((row) => row.result.harness);
  console.log(`Harness: ${harness.kind}, ${harness.engine}, ${harness.hz} Hz; scrapper (candidate) v classic, club v club, cap 60 s, recovery continuing.`);
  // The pooled cell reads every model as one body, so that its rows make one group.
  const humanoid = (row) => ({ ...row, result: { ...row.result, recipe: { ...row.result.recipe, left: "humanoid", right: "humanoid" } } });
  const cells = [...MODELS.map((model) => combatCell(model, run.rows.filter((row) => row.result.recipe.left === model))),
    combatCell("pooled", run.rows.map(humanoid))];
  console.log("| cell | bouts | score | Wilson 95 % | as left | as right | damage-rate diff (SE) | d bar margin | falls cand/opp | endings |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const c of cells) {
    console.log(`| ${c.name} | ${c.bouts} | ${fixed(c.score)} | ${fixed(c.score95[0])}-${fixed(c.score95[1])} | ${fixed(c.left)} | ${fixed(c.right)} | ${fixed(c.damageDelta.mean, 4)} (${fixed(c.damageDelta.standardError, 4)}) | ${fixed(c.d, 2)} | ${c.falls.join("/")} | ${JSON.stringify(c.endings)} |`);
  }
  const pooled = cells.at(-1), models = cells.slice(0, -1);
  const invalid = cells.filter((c) => c.split > BAR.sideSplit).map((c) => c.name);
  const failed = [
    ...(pooled.score < BAR.pooled ? [`pooled score ${fixed(pooled.score)} < ${BAR.pooled}`] : []),
    ...(pooled.score95[0] < BAR.pooledLower ? [`pooled lower bound ${fixed(pooled.score95[0])} < ${BAR.pooledLower}`] : []),
    ...models.filter((c) => c.score95[0] < BAR.cellLower).map((c) => `${c.name} lower bound ${fixed(c.score95[0])} < ${BAR.cellLower}`),
    ...(pooled.damageDelta.mean + BAR.z * pooled.damageDelta.standardError < 0 ? ["driven-damage rate below Classic's beyond its error"] : []),
  ];
  console.log(invalid.length ? `INVALID: side split over ${BAR.sideSplit * 100} points in ${invalid.join(", ")}`
    : failed.length ? `FAIL: ${failed.join("; ")}` : "PASS");
} else throw new Error("club-check needs --jobs <file> or --report <run.json>");
