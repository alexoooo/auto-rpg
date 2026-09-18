// Fit the style model's tables from tournament rows that carry an exchange log, and write them
// out as the checked-in module `src/golem/style-model-tables.ts`. Session 09 of the style set.
//
//   node scripts/calibrate-style-model.mjs --in a.jsonl[,b.jsonl] [--out src/golem/style-model-tables.ts]
//                                           [--shrink 4] [--prune 20]
//
// This is `calibrate-duel-model.mjs` over the other vocabulary, and the two are deliberately two
// files rather than one with a flag: what differs is not a parameter of the fit but *which sides
// of a row are data*. A window written by the third executor is keyed `heavy/reach/gap/theirs/mine`
// and named in fifteen options; one written by the second is keyed with four segments and named in
// eight. A run with both in it -- every league in this set -- carries both on the same rows, so a
// mixed file has to be sorted before it is fitted or it fits a mixture.
//
// **The sort is on the key's own shape and not on a list of policy names.** Five segments is a
// style-model state and nothing else writes one, so the collector needs no registry, cannot fall
// behind one, and picks up a mind that plays the third executor the day it is added -- which the
// tactician of this session and the learner of the next both are. Four-segment records are counted
// and refused by name rather than dropped quietly: a log taken before Session 09 keys a styled
// side with four segments too, and fitting those would fit every reach pair together while
// claiming to tell them apart.
//
// The rows want `--exchanges`, and they want `--explore` as well. The planner's session learned
// this the hard way and its lesson is on the tin of `src/golem/planner.ts`: a style's own log is
// not an experiment, because a style closes where its rules close and parries where its rules
// parry, so a table fitted from it says that closing is where one gets hit. At `--explore 0.5`
// every open option is named from every state the styles reach, and the fit sees what each costs.
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { fitDuelModel } from "../src/golem/duel-model.ts";
import { STYLE_MODEL_VERSION, STYLE_VOCABULARY, allStyleStates, styleStateKey } from "../src/golem/style-model.ts";
import { STYLE_OPTIONS } from "../src/golem/tactics-v3.ts";
import { pruneTransitions, renderTablesModule } from "./calibrate-duel-model.mjs";
import { EXCHANGE_WINDOW_SECONDS, readRows } from "./tournament.mjs";

/** What the rendered module calls itself; the shape is `DUEL_NAMING` in the script beside this. */
export const STYLE_NAMING = Object.freeze({
  script: "scripts/calibrate-style-model.mjs",
  title: "Style model tables",
  source: "src/golem/style-model.ts",
  module: "./style-model.ts",
  type: "StyleModelTables",
  constant: "STYLE_MODEL_TABLES",
});

/** How many `/`-separated segments a style-model state key has. */
export const STYLE_KEY_SEGMENTS = 5;

/**
 * Read the third executor's exchange records out of one or more row files.
 *
 * A side belongs to this model when its windows are keyed with five segments; see the header
 * above for why that is the test rather than a list of policy names. `stale` counts the sides
 * whose windows are keyed with four, which are the second executor's and are somebody else's
 * data unless the run predates Session 09, in which case they are nobody's.
 */
export function collectStyleRecords(paths) {
  const records = [];
  let bouts = 0;
  let skipped = 0;
  let others = 0;
  let stale = 0;
  let seed = null;
  const policies = {};
  for (const path of paths) {
    const { header, rows } = readRows(path);
    if (seed === null) seed = header.seed;
    for (const row of rows) {
      const log = row.exchanges;
      if (!log) { skipped += 1; continue; }
      let any = false;
      for (const side of ["left", "right"]) {
        if (!log[side] || log[side].length === 0) continue;
        const segments = log[side][0].state.split("/").length;
        if (segments !== STYLE_KEY_SEGMENTS) {
          others += 1;
          if (row[side].policy in STALE_POLICIES) stale += 1;
          continue;
        }
        any = true;
        policies[row[side].policy] = (policies[row[side].policy] ?? 0) + log[side].length;
        for (const record of log[side]) records.push(record);
      }
      if (any) bouts += 1; else skipped += 1;
    }
  }
  return { records, bouts, skipped, others, stale, policies, seed: seed ?? 0 };
}

/**
 * The four styles by name, used for one message and nothing else: a run whose *styles* wrote
 * four-segment windows is a run taken before Session 09, and saying so is more useful than
 * reporting it as "sides that were not the third executor".
 */
const STALE_POLICIES = Object.freeze({
  "golem-form": true, "golem-skirmisher": true, "golem-guardian": true, "golem-brawler": true,
});

/** What the fit saw: how many of the 8,640 state-option cells have a record, and how deep. */
export function coverage(records) {
  const seen = new Set();
  const states = new Set();
  const options = {};
  for (const r of records) {
    seen.add(`${r.state}|${r.option}`);
    states.add(r.state);
    options[r.option] = (options[r.option] ?? 0) + 1;
  }
  const all = allStyleStates();
  return {
    cells: seen.size, ofCells: all.length * STYLE_OPTIONS.length,
    states: states.size, ofStates: all.length,
    reachable: all.filter((s) => states.has(styleStateKey(s))).length,
    options,
  };
}

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  const sources = flag("in", "").split(",").map((s) => s.trim()).filter(Boolean);
  if (sources.length === 0) throw new Error("--in wants one or more row files with an exchange log");
  for (const source of sources) if (!existsSync(source)) throw new Error(`${source} does not exist`);
  const out = resolve(flag("out", "src/golem/style-model-tables.ts"));
  const shrink = Number(flag("shrink", 4));
  const prune = Number(flag("prune", 20));
  const { records, bouts, skipped, others, stale, policies, seed } = collectStyleRecords(sources);
  if (records.length === 0) {
    throw new Error(
      "no five-segment exchange windows in the rows: run the tournament with --exchanges and a mind on the"
      + (stale > 0
        ? ` third executor. ${stale} styled sides wrote four-segment windows, which is a log taken before Session 09.`
        : " third executor."));
  }
  const seen = coverage(records);
  const tables = fitDuelModel(records, {
    seed, date: new Date().toISOString().slice(0, 10), bouts, windowSeconds: EXCHANGE_WINDOW_SECONDS, shrink,
  }, STYLE_VOCABULARY);
  tables.transitions = pruneTransitions(tables.transitions, prune);
  tables.transitionsCoarse = pruneTransitions(tables.transitionsCoarse, prune);
  const text = renderTablesModule(tables,
    { sources: sources.map((s) => s.replace(/\\/g, "/")), prune, naming: STYLE_NAMING });
  writeFileSync(out, text);
  console.log(`${records.length} windows from ${bouts} bouts (${skipped} rows with no five-segment side, `
    + `${others} sides on another vocabulary${stale > 0 ? `, ${stale} of them styles logged before Session 09` : ""}), `
    + `version ${STYLE_MODEL_VERSION}`);
  console.log(`policies: ${Object.entries(policies).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`options: ${Object.entries(seen.options).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`coverage: ${seen.states} of ${seen.ofStates} states, ${seen.cells} of ${seen.ofCells} state-option cells`);
  console.log(`${Object.keys(tables.outcomes).length} outcome cells, ${Object.keys(tables.transitions).length} transition rows, ${(text.length / 1024).toFixed(0)} KB -> ${out}`);
}
