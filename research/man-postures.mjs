/**
 * **The posture audit's statics on Man's hands and feet** (`docs/reference/man-postures.md`): every
 * row (`ROWS`) searched on each envelope (`ENVELOPES`: the boot, the bare rigid foot and open hand,
 * and the bare foot with its toes on a passive hinge), as built, as `core-posture.mjs` searches it.
 * Each row from its seed posture (the toe's also with its toes bent, `TOES_BENT`); a row that holds
 * nothing so, from `--seeds` random postures; a row an envelope still holds nothing of, from every
 * other envelope's witness of it, its toes at rest (statics are one-sided: a witness is one whichever
 * search found it); every row's answer read again on the cone's friction.
 * The tables go to the console; the records to `research/runs/postures/envelopes.json`, and each
 * answer drawn, `research/runs/postures/<row>, <envelope>.svg`.
 *
 *   node research/man-postures.mjs [--workers 30] [--envelopes boot,barefoot,toe] [--rows 'stand;fours']
 *     [--seeds 8] [--evals 1500]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { defaultLanes } from "./bout-pool.mjs";
import { bestOf, pictureOf, runJobs } from "./core-posture-runs.mjs";
import { AUDITED, ENVELOPES, ROWS, rowName, STATICS_HARNESS, staticBody, TOE, TOES_BENT } from "./core-posture-trials.mjs";

const args = process.argv.slice(2);
const option = (name, otherwise) => { const at = args.indexOf(`--${name}`); return at < 0 ? otherwise : args[at + 1]; };
const lanes = Number(option("workers", defaultLanes()));
const seeds = Number(option("seeds", 8));
const evals = Number(option("evals", 1500));
const only = option("rows", null)?.split(";").map((name) => name.trim());
const envelopes = option("envelopes", ENVELOPES.join(",")).split(",");
for (const envelope of envelopes) if (!ENVELOPES.includes(envelope)) throw new Error(`no envelope ${envelope}`);
const OUT = new URL("./runs/postures/", import.meta.url);
// Every envelope's step solved a variable a row (`project`'s `solve`), the cheaper with hulls: one
// harness for all three, whose boot rounds apart from `core-posture.mjs`'s.
const run = (jobs) => runJobs(jobs, { lanes, out: OUT, defaults: { evals, solve: "variables" } });

const rows = ROWS.filter((row) => !only || only.includes(row.name))
  .flatMap((row) => (row.heights ?? [undefined]).map((height) => ({ row: row.name, height, name: rowName(row, height) })));
const keyOf = (r) => `${r.row}|${r.envelope}|${r.friction}`;

const started = Date.now();
const all = [];
// Witness first: each row from its seed, on every envelope; the toe's also with its toes bent.
const starts = (envelope) => (envelope === "toe" ? [TOE.rest, TOES_BENT] : [undefined]);
const witnessJobs = envelopes.flatMap((envelope) => rows.flatMap((r) => starts(envelope).map((toe) => ({ row: r.row, height: r.height, envelope, seed: 0, toe }))));
const witness = await run(witnessJobs);
all.push(...witness);
const held = new Set(witness.filter((w) => w.held).map((w) => `${w.row}|${w.envelope}`));
// What holds nothing from its seed: random seeds.
const globalJobs = envelopes.flatMap((envelope) => rows.filter((r) => !held.has(`${r.name}|${envelope}`))
  .flatMap((r) => Array.from({ length: seeds }, (_, s) => ({ row: r.row, height: r.height, envelope, seed: s + 1 }))));
all.push(...await run(globalJobs));
const bestOfAll = () => {
  const asBuilt = new Map();
  for (const record of all) asBuilt.set(keyOf(record), [...(asBuilt.get(keyOf(record)) ?? []), record]);
  return new Map([...asBuilt].map(([key, records]) => [key, bestOf(records)]));
};
// What an envelope still holds nothing of: from the others' witnesses, each posture's freedoms kept
// and its toes, if the envelope has them, at rest.
let best = bestOfAll();
const toeAngles = (envelope) => (envelope === "toe" ? [TOE.rest, TOE.rest] : []);
const freedomsOf = (posture, envelope) => posture.angles.slice(0, posture.angles.length - toeAngles(envelope).length);
const crossJobs = envelopes.flatMap((envelope) => rows.filter((r) => !best.get(`${r.name}|${envelope}|box`).held)
  .flatMap((r) => envelopes.filter((other) => other !== envelope && best.get(`${r.name}|${other}|box`).held).map((other) => {
    const from = best.get(`${r.name}|${other}|box`).posture;
    return { row: r.row, height: r.height, envelope, seed: 0, from: other, start: { ...from, angles: [...freedomsOf(from, other), ...toeAngles(envelope)] } };
  })));
const cross = await run(crossJobs.map(({ from, ...job }) => job));
all.push(...cross.map((record, i) => ({ ...record, from: crossJobs[i].from })));
best = bestOfAll();
// The cone's friction: each answer read again.
const coneJobs = envelopes.flatMap((envelope) => rows.map((r) => ({ row: r.row, height: r.height, envelope, friction: "cone", seed: 0, start: best.get(`${r.name}|${envelope}|box`).posture })));
const cone = await run(coneJobs);
all.push(...cone);
for (const record of cone) best.set(keyOf(record), bestOf([record]));
const of = (name, envelope, friction = "box") => best.get(`${name}|${envelope}|${friction}`);

const f2 = (v) => (v === null || v === undefined ? "-" : v.toFixed(2));
const verdict = (r) => (r.held ? "held" : !r.found ? "none found" : !r.balanced ? "unbalanced" : "too weak");
const cell = (r) => `${verdict(r)}${r.held ? ` ${f2(r.share)}` : ""}${r.from ? "*" : ""}`;
const fromOf = (r) => (r.from ? ` (from ${r.from})` : "");
const toesOf = (r) => (r.toes ? r.toes.map((t) => `${t.side[0]} ${f2(t.angle)}${t.ground === undefined ? "" : ` (${t.ground.toFixed(0)} N m)`}`).join("; ") : "-");

console.log(`Harness: ${STATICS_HARNESS}. Engine ${witness[0]?.engine.name}, ${witness[0]?.engine.revision}; limits ${witness[0]?.limitModel}. Body ${AUDITED}, as built, nothing in its hands, no assist. ${rows.length} rows on ${envelopes.join(", ")}; ${seeds} random seeds where a seed posture holds nothing, ${evals} evaluations a search. ${((Date.now() - started) / 1000).toFixed(0)} s on ${lanes} workers.\n`);
console.log("### The envelopes (friction: the bearing solve's box; held rows with their share)\n");
console.log(`| row | route | ${envelopes.join(" | ")} | flips |`);
console.log(`|---|---|${envelopes.map(() => "---|").join("")}---|`);
for (const r of rows) {
  const cells = envelopes.map((envelope) => of(r.name, envelope));
  const flips = new Set(cells.map((c) => c.held)).size > 1 ? "yes" : "";
  console.log(`| ${r.name} | ${cells[0].route} | ${cells.map(cell).join(" | ")} | ${flips} |`);
}
for (const envelope of envelopes) {
  console.log(`\n### ${envelope}\n`);
  console.log("| row | verdict | share | miss | margin, m | centre, m | binds | forces, N | toes, rad (ground's moment) | cone | seeds agree |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const a = of(r.name, envelope), c = of(r.name, envelope, "cone");
    const forces = Object.entries(a.forces).map(([name, f]) => `${name} ${f.toFixed(0)}`).join("; ") || "-";
    const binds = a.binds.slice(0, 3).join(", ") + (a.binds.length > 3 ? ", ..." : "");
    console.log(`| ${r.name} | ${verdict(a)}${fromOf(a)} | ${f2(a.share)} | ${f2(a.miss)} | ${f2(a.margin)} | ${f2(a.height)} | ${binds || "-"} | ${forces} | ${toesOf(a)} | ${cell(c)} | ${a.seeds.agree}/${a.seeds.of} |`);
  }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL("envelopes.json", OUT), JSON.stringify({ harness: STATICS_HARNESS, evals, seeds, envelopes, records: all, best: Object.fromEntries(best) }, null, 1));
for (const envelope of envelopes) {
  const body = await staticBody(undefined, undefined, envelope);
  for (const r of rows) writeFileSync(new URL(`${r.name.replaceAll(/[^\w @.,-]/g, "")}, ${envelope}.svg`, OUT), pictureOf(body, of(r.name, envelope)));
  body.dispose();
}
