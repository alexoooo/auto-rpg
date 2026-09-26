/**
 * A body release's bout baselines, read from two finished runs with every bout of one trajectory
 * counted once.
 *
 *     node research/stat-sweep.mjs --stat size --levels 1 --pairs 192 --trace --workers 8 --dir DIR/control
 *     node research/idle-dummy.mjs --attackers roster --naive --trace --workers 8 --dir DIR/idle
 *     node research/release-baseline.mjs --control DIR/control --idle DIR/idle > DIR/baseline.md
 *
 * Skill ceiling 01's Measure section (`docs/plans/2026-09-25-skill-ceiling-01-body-release-1.md`),
 * and session 07's for release 2: the probe-mind control row and the idle-dummy matrix.
 *
 * **Why distinct trajectories.** Every bout of one mind pairing plays the same opening whatever its
 * seeds (`docs/analysis/2026-09-25-rate-control-clock.md`), and a pairing whose seeds reach nothing
 * plays one bout however often it is run. Both runs are traced (`--trace`, `trajectoryTracer` in
 * `research/side-mirror.mjs`), and this counts the distinct final hashes per pairing, and per cell.
 *
 * **Why clustered.** The control row's intervals take the unordered mind pairings as clusters (ten,
 * from the four probe minds) and put a t interval on their means, which is what
 * `docs/analysis/2026-09-25-release-120.md` calls "clustered". A pairing is the unit its bouts are not
 * independent within. The naive 95 % interval, over bouts, is printed beside it.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { clustered } from "./fall-loop.mjs";
import { idleMarkdown, summarizeIdle } from "./idle-dummy.mjs";
import { HARNESS } from "./stat-sweep.mjs";

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const other = (side) => (side === "left" ? "right" : "left");

export const readRows = (dir) => readFileSync(join(dir, "results.jsonl"), "utf8").split("\n").filter(Boolean)
  .map((line) => JSON.parse(line)).filter((row) => row.status === "ok");

/** Naive 95 % half-width over independent values. */
function naive(values) {
  const m = mean(values);
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, values.length - 1));
  return { mean: m, half: 1.96 * sd / Math.sqrt(values.length), n: values.length };
}

const pairingOf = (row) => [...row.minds].sort().join(" ~ ");

/**
 * The control row's figures: pooled over every bout, naive and clustered by pairing, and one line
 * per unordered pairing. A bout's figures are its own and need no side: damage and falls are per
 * body (the mean of the two), a draw scores the modified corner a half.
 */
export function controlBaseline(rows) {
  if (rows.some((row) => !row.trajectory)) throw new Error("the control run was not traced (--trace)");
  const bout = (row) => ({
    score: row.winner === null ? 0.5 : row.winner === row.modified ? 1 : 0,
    damage: (row.sides.left.damage + row.sides.right.damage) / 2,
    falls: (row.sides.left.knockdowns + row.sides.right.knockdowns) / 2,
    fallsPerMin: (row.sides.left.knockdowns + row.sides.right.knockdowns) / 2 / (row.seconds / 60),
    seconds: row.seconds,
    decided: row.winner === null ? 0 : 1,
    overtime: row.overtime ? 1 : 0,
  });
  const pairings = new Map();
  for (const row of rows) {
    const key = pairingOf(row);
    const entry = pairings.get(key) ?? { key, rows: [] };
    entry.rows.push(row);
    pairings.set(key, entry);
  }
  const fields = ["score", "damage", "falls", "fallsPerMin", "seconds", "decided", "overtime"];
  const per = [...pairings.values()].sort((a, b) => a.key.localeCompare(b.key)).map(({ key, rows: own }) => {
    const figures = own.map(bout);
    const [a] = key.split(" ~ ");
    // The pairing's first-named mind's score, a draw a half; a mirror reads 50 by construction.
    const firstScore = mean(own.map((row) => {
      const aSide = row.minds[0] === a ? row.modified : other(row.modified);
      return row.winner === null ? 0.5 : row.winner === aSide ? 1 : 0;
    }));
    return { key, bouts: own.length, distinct: new Set(own.map((row) => row.trajectory)).size,
      outcomes: new Set(own.map((row) => `${row.winner}|${row.seconds}|${row.vitality.join(",")}`)).size,
      firstScore, medianSeconds: median(own.map((row) => row.seconds)),
      ...Object.fromEntries(fields.map((f) => [f, mean(figures.map((x) => x[f]))])) };
  });
  const all = rows.map(bout);
  const pooled = Object.fromEntries(fields.map((f) => [f, {
    naive: naive(all.map((x) => x[f])), clustered: clustered(per.map((p) => p[f])) }]));
  return { bouts: rows.length, distinct: new Set(rows.map((row) => row.trajectory)).size,
    medianSeconds: median(rows.map((row) => row.seconds)), pooled, pairings: per };
}

/** Each idle cell's distinct trajectories, and its outright wins counted once per trajectory. */
export function idleDistinct(rows, overtimeSeconds) {
  const cells = new Map();
  for (const row of rows) {
    const cell = cells.get(row.cell) ?? { attacker: row.attacker, dummy: row.dummy, mind: row.attackerSide === "left" ? row.left : row.right, seen: new Map() };
    if (!cell.seen.has(row.trajectory)) cell.seen.set(row.trajectory, row);
    cells.set(row.cell, cell);
  }
  return [...cells.values()].map((c) => {
    const firsts = [...c.seen.values()];
    const outright = firsts.filter((row) => row.winner === row.attackerSide && row.seconds < overtimeSeconds).length;
    return { attacker: c.attacker, dummy: c.dummy, mind: c.mind, distinct: firsts.length, outrightDistinct: outright };
  });
}

function controlMarkdown(c, header) {
  const f = (x, d = 2, k = 1) => (x === null || Number.isNaN(x) ? "--" : (k * x).toFixed(d));
  const ci = (i, d = 2, k = 1) => `${f(i.mean, d, k)} +- ${i.half === null ? "--" : f(i.half, d, k)}`;
  const row = (label, key, d = 2, k = 1) => `| ${label} | ${ci(c.pooled[key].naive, d, k)} | ${ci(c.pooled[key].clustered, d, k)} |`;
  return [
    `## Control row: ${header.minds.join(", ")}, x1 against x1`, "",
    `${HARNESS}; cap ${header.protocol.maxSeconds} s; build \`${header.build}\`; ${c.bouts} bouts (${header.blocks} side-swapped blocks); seed ${header.seed}; research fingerprint ${header.fingerprint.slice(0, 12)}.`,
    `${c.distinct} distinct trajectories in ${c.bouts} bouts. Median bout ${f(c.medianSeconds, 1)} s.`, "",
    "| Figure | Naive 95 % (bouts) | Clustered 95 % (10 pairings, t on 9 df) |", "| --- | ---: | ---: |",
    row("Modified corner's win share, %", "score", 1, 100),
    row("Damage dealt a body a bout", "damage"),
    row("Falls a body a bout", "falls"),
    row("Falls a body a minute", "fallsPerMin"),
    row("Bout length, s", "seconds", 1),
    row("Decided, %", "decided", 1, 100),
    row("Past the overtime mark, %", "overtime", 1, 100), "",
    "By unordered pairing (the first-named mind's score; a mirror is 50 by construction):", "",
    "| Pairing | Bouts | Distinct | Outcomes | First's score % | Damage / body | Falls / body | Mean s | Median s | Decided % |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...c.pairings.map((p) => `| ${p.key} | ${p.bouts} | ${p.distinct} | ${p.outcomes} | ${f(p.firstScore, 1, 100)} | ${f(p.damage)} | ${f(p.falls)} | ${f(p.seconds, 1)} | ${f(p.medianSeconds, 1)} | ${f(p.decided, 1, 100)} |`),
    ""].join("\n");
}

async function main() {
  const { values } = parseArgs({ options: { control: { type: "string" }, idle: { type: "string" } } });
  const { CONFIG } = await import("../src/config.ts");
  const out = [];
  if (values.control) {
    const dir = resolve(values.control);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    out.push(controlMarkdown(controlBaseline(readRows(dir)), manifest));
  }
  if (values.idle) {
    const dir = resolve(values.idle);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    const rows = readRows(dir);
    out.push(idleMarkdown(summarizeIdle(rows), { protocol: manifest.protocol, blocks: manifest.blocks,
      seed: manifest.seed, fingerprint: manifest.fingerprint.slice(0, 12) }));
    if (rows.every((row) => row.trajectory)) {
      out.push("Distinct trajectories a cell, and outright wins counted once per trajectory:", "",
        "| Attacker | Mind | Dummy | Distinct | Outright (distinct) |", "| --- | --- | --- | ---: | ---: |",
        ...idleDistinct(rows, CONFIG.bout.overtimeSeconds).map((c) =>
          `| ${c.attacker} | ${c.mind} | ${c.dummy} | ${c.distinct} | ${c.outrightDistinct} |`), "");
    }
  }
  console.log(out.join("\n"));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
