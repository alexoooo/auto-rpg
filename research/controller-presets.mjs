/**
 * **The presets against Classic**: the Puncher and the Scrapper against Classic, on the Warrior against itself, bare-handed and with
 * the wooden club in both right hands. 192 mirrored held-out pairs a cell (`combatPairs`), under the
 * arena-combat protocol (`COMBAT_PROTOCOL`: 60 s cap, recovery continuing, balance 0 as every
 * character's is).
 *
 *   node research/controller-presets.mjs --jobs <file>          # write the job manifest
 *   node research/arena-combat-run.mjs --jobs <file> --workers 8 --output <run.json>
 *   node research/controller-presets.mjs --report <run.json>    # the table
 *
 * The report gives, per cell, what the club check gives (`combatCell`). It sets no bar: the table
 * is the record's figures (`docs/reference/controller-presets.md`). A side split over 10 points marks the cell invalid.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { combatPairs } from "./arena-combat.mjs";
import { combatCell } from "./combat-records.mjs";

/** The fighter presets, each a candidate against Classic. */
const CANDIDATES = ["puncher", "scrapper"];
/** What both sides hold. */
const HELD = ["empty", "club"];
/** The model both sides are. */
const MODEL = "workshop-fighter";
/** Mirrored pairs a cell: 384 bouts, a band near ±5 points on the score. */
const PAIRS = 192;
/** A cell whose candidate scores more than this apart by side is invalid. */
const SIDE_SPLIT = 0.1;

const cells = CANDIDATES.flatMap((candidate) => HELD.map((held) => ({ candidate, held })));

/** Every bout: the held-out pairs once for each cell, numbered apart so that each pair stays distinct. */
function presetJobs() {
  return cells.flatMap(({ candidate, held }, c) => combatPairs({ candidate, opponent: "classic", count: PAIRS }).map((job) => ({
    ...job, id: `${candidate}/${held}/${job.id}`, pair: c * PAIRS + job.pair,
    config: { ...job.config, recipe: { ...job.config.recipe, left: MODEL, right: MODEL, held: { left: held, right: held } } },
  })));
}

const fixed = (v, n = 3) => v === null ? "n/a" : v.toFixed(n);

const { values } = parseArgs({ options: { jobs: { type: "string" }, report: { type: "string" } } });
if (values.jobs) {
  const jobs = presetJobs();
  writeFileSync(values.jobs, JSON.stringify(jobs, null, 1));
  console.log(`${jobs.length} jobs written to ${values.jobs}`);
} else if (values.report) {
  const run = JSON.parse(readFileSync(values.report, "utf8"));
  if (!run.complete) throw new Error(`${values.report} is not complete: ${run.rows.length} of ${run.jobs.length}`);
  if (run.failures.length) throw new Error(`${run.failures.length} trials failed`);
  const [harness] = run.rows.map((row) => row.result.harness);
  console.log(`Harness: ${harness.kind}, ${harness.engine}, ${harness.hz} Hz; ${MODEL} v ${MODEL}, each preset (candidate) v classic, cap 60 s, recovery continuing.`);
  const rows = cells.map(({ candidate, held }) => combatCell(`${candidate}, ${held}`,
    run.rows.filter((row) => row.id.startsWith(`${candidate}/${held}/`))));
  console.log("| cell | bouts | score | Wilson 95 % | as left | as right | damage-rate diff (SE) | d bar margin | falls cand/opp | endings |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const c of rows) {
    console.log(`| ${c.name} | ${c.bouts} | ${fixed(c.score)} | ${fixed(c.score95[0])}-${fixed(c.score95[1])} | ${fixed(c.left)} | ${fixed(c.right)} | ${fixed(c.damageDelta.mean, 4)} (${fixed(c.damageDelta.standardError, 4)}) | ${fixed(c.d, 2)} | ${c.falls.join("/")} | ${JSON.stringify(c.endings)} |`);
  }
  const invalid = rows.filter((c) => c.split > SIDE_SPLIT).map((c) => c.name);
  console.log(invalid.length ? `INVALID: side split over ${SIDE_SPLIT * 100} points in ${invalid.join(", ")}` : "Every cell within the side split.");
} else throw new Error("controller-presets needs --jobs <file> or --report <run.json>");
