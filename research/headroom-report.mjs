/**
 * The headroom audit's tables, from its run directories (skill ceiling session 05; the write-up is
 * `docs/analysis/2026-09-26-headroom.md`, whose tables this prints).
 *
 *     node research/headroom-report.mjs [--runs research/runs] [--headroom headroom-headroom] [--json out.json]
 *
 * Reads, where present: `headroom-headroom` (the bouts), `headroom-drills/<body>-1s` and
 * `<body>-gi` (the drills), `headroom-orderings`, `headroom-footwork`, `headroom-idle-gate`,
 * `headroom-attributes-expert` and `headroom-attributes-duelist-<build>`. A directory still being written
 * is read as far as it has got, and every table says how many bouts or runs it holds.
 *
 * Harnesses: the Node bout runner through the research runner for every bout table, and the Node
 * bout runner and fork harness for the drills (see `research/headroom.mjs` and `research/drills.mjs`).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readResults } from "./runner.mjs";
import { AUDIT_BUILDS, auditBuild, familyDuelist, moduleCoverage, modulesOf } from "./headroom-builds.mjs";
import { CURVE, PERSIST, RULER, aScore, idleFigures, pairedDifference, summarize } from "./headroom.mjs";
import { summarize as summarizeDrills } from "./drills.mjs";
import { interval } from "./stat-sweep.mjs";
import { ATTRIBUTES } from "../src/golem/attributes.ts";

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) : "-");
const pp = (x) => (Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}` : "-");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "-");
const ci = (d) => (d?.ci ? `${pp(d.mean)} [${pp(d.ci.low)}, ${pp(d.ci.high)}]` : d && Number.isFinite(d.mean) ? pp(d.mean) : "-");
/** A weapon class: the primary socket's terminal, or the ram for a body with none. */
export const weaponClass = (setup) => (setup.primary.chain === "none" ? "ram" : setup.primary.terminal);

function rowsOf(dir) {
  try { return existsSync(join(dir, "results.jsonl")) ? readResults(dir) : []; } catch { return []; }
}

// ---------------------------------------------------------------------------------------------
// Headroom bouts
// ---------------------------------------------------------------------------------------------

/** Every audit body's cells in the headroom bouts, and the paired headrooms between its minds. */
export function headroomBodies(rows) {
  const summary = summarize(rows);
  const out = [];
  for (const build of AUDIT_BUILDS) {
    const cell = (mind) => summary.cells[`${build.name}|${mind}`] ?? null;
    const duelist = familyDuelist(build.setup);
    const w = cell("golem-walker"), d = cell(duelist), e = cell(RULER), p = cell(PERSIST), c = cell(CURVE);
    if (!w && !d && !e) continue;
    const diff = (a, b) => (a && b ? pairedDifference(a, b, "score") : null);
    out.push({ body: build.name, class: weaponClass(build.setup), family: duelist, modules: modulesOf(build.setup),
      walker: w, duelist: d, expert: e, persist: p, curve: c,
      expertOverDuelist: diff(e, d), expertOverWalker: diff(e, w), persistOverDuelist: diff(p, d), expertOverCurve: diff(e, c),
      expertMarginOverDuelist: e && d ? pairedDifference(e, d, "margin") : null });
  }
  return out;
}

function headroomTable(bodies) {
  const lines = ["| Body | Class | walker | duelist | expert c8 | persist | c4 | expert - duelist | persist - duelist | c8 - c4 | expert bout s | n (expert pairs) |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
  for (const b of bodies) {
    lines.push(`| ${b.body} | ${b.class} | ${pct(b.walker?.score.mean)} | ${pct(b.duelist?.score.mean)} | ${pct(b.expert?.score.mean)} | ${pct(b.persist?.score.mean)} | ${pct(b.curve?.score.mean)} | ${ci(b.expertOverDuelist)} | ${ci(b.persistOverDuelist)} | ${ci(b.expertOverCurve)} | ${f2(b.expert?.seconds)} | ${b.expert?.pairs ?? 0} |`);
  }
  return lines.join("\n");
}

/** Headroom rolled up by weapon class and by module: the mean of the bodies' paired headrooms. */
function rollup(bodies, keyOf) {
  const groups = new Map();
  for (const b of bodies) {
    if (!b.expertOverDuelist || !Number.isFinite(b.expertOverDuelist.mean)) continue;
    for (const key of [keyOf(b)].flat()) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    }
  }
  const lines = ["| Group | bodies | expert | duelist | expert - duelist | persist - duelist | c8 - c4 |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"];
  const m = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN);
  for (const [key, list] of [...groups].sort()) {
    lines.push(`| ${key} | ${list.length} | ${pct(m(list.map((b) => b.expert.score.mean)))} | ${pct(m(list.map((b) => b.duelist.score.mean)))} | ${pp(m(list.map((b) => b.expertOverDuelist.mean)))} | ${pp(m(list.filter((b) => b.persistOverDuelist).map((b) => b.persistOverDuelist.mean)))} | ${pp(m(list.filter((b) => b.expertOverCurve).map((b) => b.expertOverCurve.mean)))} |`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Drills
// ---------------------------------------------------------------------------------------------

export function drillBodies(root, drillsDir = "headroom-drills") {
  const base = join(root, drillsDir);
  if (!existsSync(base)) return [];
  const out = [];
  for (const build of AUDIT_BUILDS) {
    const rows = [...rowsOf(join(base, `${build.name}-1s`)), ...rowsOf(join(base, `${build.name}-gi`))];
    if (!rows.length) continue;
    const manifest = ["1s", "gi"].map((s) => join(base, `${build.name}-${s}`, "manifest.json")).find(existsSync);
    const rungs = JSON.parse(readFileSync(manifest, "utf8")).rungs;
    out.push({ body: build.name, class: weaponClass(build.setup), family: familyDuelist(build.setup), summary: summarizeDrills(rows, rungs), rungs });
  }
  return out;
}

function drillTable(bodies, drill) {
  const lines = [`| Body | runs scored | walker | duelist | expert c8 | persist | c4 | c8 - duelist (paired) | c8 margin | duelist margin |`,
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
  for (const b of bodies) {
    const s = b.summary[drill];
    if (!s) continue;
    const duelist = b.rungs.includes(b.family) ? b.family : "golem-duelist";
    const r = (rung) => s.rungs[rung];
    const pair = s.pairs[`${RULER} - ${duelist}`];
    lines.push(`| ${b.body} | ${s.scored}${s.skipped ? ` (${s.skipped} skipped)` : ""}${s.void ? ` (${s.void} void)` : ""} | ${pct(r("golem-walker")?.pass)} | ${pct(r(duelist)?.pass)} | ${pct(r(RULER)?.pass)} | ${pct(r(PERSIST)?.pass)} | ${pct(r(CURVE)?.pass)} | ${pair ? `${pp(pair.difference)} +/- ${(196 * pair.se).toFixed(1)}` : "-"} | ${f2(r(RULER)?.margin)} | ${f2(r(duelist)?.margin)} |`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Dead ends
// ---------------------------------------------------------------------------------------------

/**
 * A body's headroom on each instrument, and the dead-end rule the plan asks for: small headroom on
 * both instruments, with the expert's curve flat on it.
 *
 * - **Bouts**: the paired expert-minus-duelist bar margin (continuous, so it separates bodies a
 *   share of 100 % cannot), and c8 minus c4 on the same seed pairs for the curve.
 * - **Drills**: the mean over the four drills of the paired expert-minus-duelist pass rate, and of
 *   c8 minus c4 for the curve.
 *
 * **The threshold is read off the distribution, not chosen.** On each instrument the bodies'
 * headrooms are sorted and the threshold is the midpoint of the widest gap between neighbours in the
 * lower half: a natural break, which is where "small" stops being a matter of degree. The curve is
 * flat when the c8 - c4 reading's 95 % interval holds zero (bouts) or is inside two standard errors
 * (drills). A body is flagged only when both instruments put it under their threshold and neither
 * curve is still climbing.
 */
export function deadEnds(bodies, drills) {
  const bout = new Map(bodies.filter((b) => b.expertMarginOverDuelist && Number.isFinite(b.expertMarginOverDuelist.mean))
    .map((b) => [b.body, { headroom: b.expertMarginOverDuelist.mean, share: b.expertOverDuelist?.mean,
      curve: b.expertOverCurve ? pairedCurve(b) : null, n: b.expertMarginOverDuelist.n }]));
  const drill = new Map();
  for (const d of drills) {
    const duelist = d.rungs.includes(d.family) ? d.family : "golem-duelist";
    const diffs = [], curves = [], ses = [];
    for (const name of ["survive-cut", "punish-miss", "land-clean-blow", "get-inside"]) {
      const s = d.summary[name];
      const pair = s?.pairs[`${RULER} - ${duelist}`];
      const curve = s?.pairs[`${RULER} - ${CURVE}`] ?? (s?.pairs[`${CURVE} - ${RULER}`] ? { ...s.pairs[`${CURVE} - ${RULER}`], difference: -s.pairs[`${CURVE} - ${RULER}`].difference } : null);
      if (pair && Number.isFinite(pair.difference)) diffs.push(pair.difference);
      if (curve && Number.isFinite(curve.difference)) { curves.push(curve.difference); ses.push(Number.isFinite(curve.se) ? curve.se : 0); }
    }
    if (!diffs.length) continue;
    const m = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
    const curveSe = Math.sqrt(ses.reduce((a, x) => a + x * x, 0)) / Math.max(ses.length, 1);
    drill.set(d.body, { headroom: m(diffs), drills: diffs.length, curve: curves.length ? { mean: m(curves), flat: Math.abs(m(curves)) <= 2 * curveSe || m(curves) <= 0 } : null });
  }
  const threshold = (values) => {
    const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length < 4) return null;
    const lower = sorted.slice(0, Math.ceil(sorted.length / 2) + 1);
    let best = { gap: -Infinity, at: null };
    for (let i = 0; i + 1 < lower.length; i += 1) {
      const gap = lower[i + 1] - lower[i];
      if (gap > best.gap) best = { gap, at: (lower[i] + lower[i + 1]) / 2 };
    }
    return best.at;
  };
  const boutThreshold = threshold([...bout.values()].map((b) => b.headroom));
  const drillThreshold = threshold([...drill.values()].map((d) => d.headroom));
  const rows = [];
  for (const name of new Set([...bout.keys(), ...drill.keys()])) {
    const b = bout.get(name) ?? null, d = drill.get(name) ?? null;
    const lowBout = b && boutThreshold !== null ? b.headroom < boutThreshold : null;
    const lowDrill = d && drillThreshold !== null ? d.headroom < drillThreshold : null;
    const flat = (b?.curve ? b.curve.flat : true) && (d?.curve ? d.curve.flat : true);
    rows.push({ body: name, bout: b, drill: d, lowBout, lowDrill, flat, flagged: Boolean(lowBout && lowDrill && flat) });
  }
  rows.sort((x, y) => (x.bout?.headroom ?? Infinity) - (y.bout?.headroom ?? Infinity));
  return { boutThreshold, drillThreshold, rows };
}

function pairedCurve(b) {
  const d = pairedDifference(b.expert, b.curve, "margin");
  return { mean: d.mean, ci: d.ci ?? null, flat: d.ci ? d.ci.low <= 0 : true };
}

function deadEndSection(dead) {
  const lines = [`## Dead ends\n\nBout threshold (natural break in the expert - duelist bar margin): ${f2(dead.boutThreshold)}; drill threshold (natural break in the mean expert - duelist pass rate): ${pp(dead.drillThreshold)} points.\n`,
    "| Body | bout headroom (margin) | share | c8 - c4 margin | drill headroom | drill c8 - c4 | low on bouts | low on drills | curve flat | flagged |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |"];
  for (const r of dead.rows) {
    lines.push(`| ${r.body} | ${f2(r.bout?.headroom)} (n ${r.bout?.n ?? 0}) | ${pp(r.bout?.share)} | ${f2(r.bout?.curve?.mean)} | ${pp(r.drill?.headroom)} | ${pp(r.drill?.curve?.mean)} | ${r.lowBout ?? "-"} | ${r.lowDrill ?? "-"} | ${r.flat} | ${r.flagged ? "**yes**" : "no"} |`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Orderings, footwork, the idle gate, the attribute audit
// ---------------------------------------------------------------------------------------------

function cellTable(summary, names) {
  const lines = ["| Cell | A | B | A's builds | n bouts | A's share | bar margin | A left / right | mean bout s | decided |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"];
  for (const name of names ?? Object.keys(summary.cells)) {
    const c = summary.cells[name];
    if (!c) continue;
    lines.push(`| ${name} | ${c.meta.a} | ${c.meta.b} | ${c.meta.aBuild} v ${c.meta.bBuild} | ${c.bouts} | ${pct(c.score.mean)} [${pct(c.score.low)}, ${pct(c.score.high)}] | ${f2(c.margin.mean)} [${f2(c.margin.low)}, ${f2(c.margin.high)}] | ${pct(c.aLeft)} / ${pct(c.aRight)} | ${f2(c.seconds)} | ${pct(c.decided)} |`);
  }
  return lines.join("\n");
}

function idleTable(rows) {
  const cells = idleFigures(rows);
  const attackers = [...new Set(Object.values(cells).map((c) => c.attacker))];
  const dummies = ["stone", "skeleton", "human", "giant"];
  const lines = [`| Attacker | ${dummies.map((d) => `v ${d}`).join(" | ")} |`, `| --- |${dummies.map(() => " ---: |").join("")}`];
  let zero = 0, total = 0;
  for (const a of attackers) {
    lines.push(`| ${a} | ${dummies.map((d) => {
      const c = cells[`${a}>${d}`];
      if (!c) return "-";
      total += 1;
      if (c.outright === 0) zero += 1;
      return `${c.outright}/${c.bouts}${c.median !== null ? ` (${c.median.toFixed(0)} s)` : ""}`;
    }).join(" | ")} |`);
  }
  return { table: lines.join("\n"), zero, total, cells };
}

const BEHAVIOUR = ["gapM", "fraction", "pressShare", "backShare", "strafe", "committedShare", "strokesPerMinute", "downShare"];

/**
 * The behaviour each attribute should move if a mind uses it (the plan's "the expert uses it"), as
 * the worker's bout readings (`behaviourReader` in `research/headroom-worker.mjs`): stand-off
 * against reach and speed, pressing against mass and toughness, time committed against arm speed.
 */
export const ATTRIBUTE_BEHAVIOUR = Object.freeze({
  movement: ["gapM", "pressShare", "backShare"], turning: ["turn", "strafe"], stability: ["pressShare", "falls"],
  recovery: ["downShare", "pressShare"], armour: ["pressShare", "committedShare"], toughness: ["pressShare", "committedShare"],
  armSpeed: ["committedShare", "strokesPerMinute"], weight: ["pressShare", "gapM"], size: ["gapM", "fraction"],
});

/** Share change per step (0.05) of an attribute, from its two ends, as percentage points. */
function perStep(lo, hi, id) {
  if (!lo || !hi) return NaN;
  const row = ATTRIBUTES[id];
  return (hi.score.mean - lo.score.mean) / ((row.max - row.min) / row.step);
}

/** The attribute audit's summary table: per attribute, both ends, per-step balance, behaviour. */
function attributeBalance(expert, duelists) {
  const find = (summary, id, level) => summary ? Object.values(summary.cells).find((c) => c.meta.attribute === id && Number(c.meta.level) === level) : null;
  const ctrl = expert ? Object.values(expert.cells).find((c) => c.meta.attribute === "control") : null;
  const lines = [`| Attribute | expert at min / max (A share) | expert pts per step | ${Object.keys(duelists).map((b) => `duelist ${b} pts per step`).join(" | ")} | behaviour it should move, A at min / control / max |`,
    `| --- | --- | ---: |${Object.keys(duelists).map(() => " ---: |").join("")} --- |`];
  for (const id of Object.keys(ATTRIBUTE_BEHAVIOUR)) {
    const row = ATTRIBUTES[id];
    const lo = find(expert, id, row.min), hi = find(expert, id, row.max);
    const behaviour = ATTRIBUTE_BEHAVIOUR[id].map((b) => `${b} ${f2(lo?.behaviour[b]?.a)} / ${f2(ctrl?.behaviour[b]?.a)} / ${f2(hi?.behaviour[b]?.a)}`).join("; ");
    const ds = Object.values(duelists).map((d) => pp(perStep(find(d, id, row.min), find(d, id, row.max), id)));
    lines.push(`| ${id} (${row.min}-${row.max}) | ${lo ? `${pct(lo.score.mean)} (n ${lo.bouts})` : "-"} / ${hi ? `${pct(hi.score.mean)} (n ${hi.bouts})` : "-"} | ${pp(perStep(lo, hi, id))} | ${ds.join(" | ")} | ${behaviour} |`);
  }
  return lines.join("\n");
}

function attributeTable(expert, duelists) {
  const lines = [`| Attribute | level | expert A share | duelist A share (${Object.keys(duelists).join(", ")}) | expert behaviour moved vs control (A) |`,
    "| --- | ---: | ---: | --- | --- |"];
  const ctrl = expert ? Object.values(expert.cells).find((c) => c.meta.attribute === "control") : null;
  const cells = expert ? Object.values(expert.cells).filter((c) => c.meta.attribute !== "control") : [];
  const keyOf = (c) => `${c.meta.attribute}=${c.meta.level}`;
  const keys = new Set(cells.map(keyOf));
  for (const [, d] of Object.entries(duelists)) for (const c of Object.values(d.cells)) if (c.meta.attribute !== "control") keys.add(keyOf(c));
  for (const key of [...keys].sort()) {
    const e = cells.find((c) => keyOf(c) === key);
    const moved = e && ctrl ? BEHAVIOUR.map((b) => `${b} ${f2(e.behaviour[b].a)} (${f2(ctrl.behaviour[b].a)})`).join(", ") : "-";
    const ds = Object.entries(duelists).map(([name, d]) => {
      const c = Object.values(d.cells).find((x) => keyOf(x) === key);
      return c ? `${name} ${pct(c.score.mean)}` : `${name} -`;
    }).join(", ");
    const [id, level] = key.split("=");
    lines.push(`| ${id} | ${level} | ${e ? `${pct(e.score.mean)} [${pct(e.score.low)}, ${pct(e.score.high)}] n ${e.bouts}` : "-"} | ${ds} | ${moved} |`);
  }
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({ options: { runs: { type: "string", default: join("research", "runs") }, headroom: { type: "string", default: "headroom-headroom" }, drills: { type: "string", default: "headroom-drills-40" }, json: { type: "string" } } });
  const root = resolve(values.runs);
  const out = {};
  const sections = [];

  const headRows = rowsOf(join(root, values.headroom));
  if (headRows.length) {
    const bodies = headroomBodies(headRows);
    out.headroom = bodies.map(({ walker, duelist, expert, persist, curve, ...rest }) => ({ ...rest,
      scores: { walker: walker?.score, duelist: duelist?.score, expert: expert?.score, persist: persist?.score, curve: curve?.score },
      expertWall: expert?.wallSeconds, expertSeconds: expert?.seconds }));
    sections.push(`## Headroom bouts (${headRows.length} bouts)\n\n${headroomTable(bodies)}\n\n### By weapon class\n\n${rollup(bodies, (b) => b.class)}\n\n### By module\n\n${rollup(bodies, (b) => b.modules)}`);
    const coverage = moduleCoverage();
    sections.push(`Module coverage: ${[...coverage].map(([id, names]) => `${id} ${names.length}`).join(", ")}`);
  }
  const drills = drillBodies(root, values.drills);
  if (drills.length) {
    out.drills = drills.map((d) => ({ body: d.body, summary: d.summary }));
    for (const drill of ["survive-cut", "punish-miss", "land-clean-blow", "get-inside"]) sections.push(`## Drill: ${drill}\n\n${drillTable(drills, drill)}`);
  }
  if (out.headroom || drills.length) {
    const dead = deadEnds(out.headroom ? headroomBodies(headRows) : [], drills);
    out.deadEnds = dead;
    sections.push(deadEndSection(dead));
  }
  for (const exp of ["orderings", "footwork"]) {
    const rows = rowsOf(join(root, `headroom-${exp}`));
    if (!rows.length) continue;
    const s = summarize(rows);
    out[exp] = s;
    sections.push(`## ${exp} (${rows.length} bouts)\n\n${cellTable(s)}`);
    if (exp === "footwork") {
      const a = s.cells[`vs-duelist|${RULER}`], b = s.cells["vs-duelist|expert-fb@c8,h1"];
      if (a && b) sections.push(`Footwork, paired by seed pair: ruler - fb against the duelist ${ci(pairedDifference(a, b, "score"))} share, margin ${ci(pairedDifference(a, b, "margin"))}`);
    }
  }
  const idleRows = rowsOf(join(root, "headroom-idle-gate"));
  if (idleRows.length) {
    const idle = idleTable(idleRows);
    out.idle = idle.cells;
    sections.push(`## Idle-dummy gate with the expert (${idleRows.length} bouts)\n\n${idle.zero} of ${idle.total} cells at zero outright wins.\n\n${idle.table}`);
  }
  const attrRows = rowsOf(join(root, "headroom-attributes-expert"));
  const duelists = {};
  for (const name of existsSync(root) ? readdirSync(root) : []) {
    const m = /^headroom-attributes-duelist-(.+)$/.exec(name);
    if (m) { const rows = rowsOf(join(root, name)); if (rows.length) duelists[m[1]] = summarize(rows); }
  }
  if (attrRows.length || Object.keys(duelists).length) {
    const expert = attrRows.length ? summarize(attrRows) : null;
    out.attributes = { expert, duelists };
    sections.push(`## Attribute audit (${attrRows.length} expert bouts)\n\n${attributeBalance(expert, duelists)}\n\n### Every level\n\n${attributeTable(expert, duelists)}`);
  }
  console.log(sections.join("\n\n"));
  if (values.json) writeFileSync(values.json, `${JSON.stringify(out, null, 1)}\n`);
}

if (process.argv[1]?.endsWith("headroom-report.mjs")) await main();

export { interval, auditBuild, aScore };
