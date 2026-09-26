/**
 * Release 2's question 5(b): why a bigger walker's strokes land worse. The headroom audit's size
 * cell (`docs/analysis/2026-09-26-headroom.md` section 2, bout runner, n 96) has the x1.1 walker
 * stroking at the x1 walker's rate and dealing half its damage. This plays that cell again with
 * every stroke instrumented (`research/stroke-worker.mjs`) beside two controls, and reports the
 * stroke's range, its tip against the mark, and what each contact was.
 *
 *     node research/release2-strokes.mjs --run [--pairs 48] [--lanes 10] [--cells size-walker,mirror-walker]
 *     node research/release2-strokes.mjs --report
 *
 * Harness: the Node research runner (`runJobs`, one Havok arena per worker realm), the research
 * `PROTOCOL` (150 s cap, supported locomotion), corner-swapped seed pairs. A is the bigger body in
 * a size cell and the left-hand build's player in the mirror. Write-up:
 * `docs/analysis/2026-09-26-release-2-questions.md`, section 2.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runJobs, readResults } from "./runner.mjs";
import { PROTOCOL, seed } from "./schedule.mjs";
import { auditBuild, withAttribute } from "./headroom-builds.mjs";

export const RUN_ROOT = join("research", "runs", "release2", "strokes");
const HARNESS = "Node research runner, research/stroke-worker.mjs, research PROTOCOL (150 s cap, supported locomotion)";

const buildOf = (name) => {
  const at = /^(.+)@([a-zA-Z]+)=([0-9.]+)$/.exec(name);
  if (at) return { name, setup: withAttribute(buildOf(at[1]).setup, at[2], Number(at[3])) };
  const build = auditBuild(name);
  if (!build) throw new Error(`no audit build "${name}"`);
  return { name, setup: build.setup };
};

/** The cells: A against B, each on its build. */
export const CELLS = Object.freeze({
  "size-walker": { a: "golem-walker", b: "golem-walker", aBuild: "default@size=1.1", bBuild: "default" },
  "mirror-walker": { a: "golem-walker", b: "golem-walker", aBuild: "default", bBuild: "default" },
  "small-walker": { a: "golem-walker", b: "golem-walker", aBuild: "default@size=0.9", bBuild: "default" },
  "size-duelist": { a: "golem-duelist", b: "golem-duelist", aBuild: "default@size=1.1", bBuild: "default" },
  "big-mirror-walker": { a: "golem-walker", b: "golem-walker", aBuild: "default@size=1.1", bBuild: "default@size=1.1" },
  // The counterfactual: one side is the walker that never strokes (`POINTER` in the worker), so what
  // a stroke meets is the other body's pointed striker and never its stroke.
  "size-pointer": { a: "golem-walker", b: "golem-walker:pointer", aBuild: "default@size=1.1", bBuild: "default" },
  "pointer-size": { a: "golem-walker:pointer", b: "golem-walker", aBuild: "default@size=1.1", bBuild: "default" },
  "mirror-pointer": { a: "golem-walker", b: "golem-walker:pointer", aBuild: "default", bBuild: "default" },
  // The size law turns a larger arm more slowly (`SIZE_LAW_POWER`, rates as 1 / s); arm speed at the
  // size stat gives it back, to read what is left of size once the arm's clock is the x1 arm's.
  "size-armspeed": { a: "golem-walker", b: "golem-walker", aBuild: "default@size=1.1@armSpeed=1.1", bBuild: "default" },
});

function jobsFor(cells, pairs) {
  const jobs = [];
  for (let k = 0; k < pairs; k += 1) for (const cell of cells) {
    const c = CELLS[cell];
    const seeds = [seed("release2-strokes-v1", cell, k, "a"), seed("release2-strokes-v1", cell, k, "b")];
    for (const aSide of ["left", "right"]) {
      const aLeft = aSide === "left";
      jobs.push({ id: `${cell}#${k}/${aSide}`, round: 0, block: `${cell}#${k}`, cell, k, aSide, a: c.a, b: c.b,
        aBuild: c.aBuild, bBuild: c.bBuild, left: aLeft ? c.a : c.b, right: aLeft ? c.b : c.a,
        leftBuild: aLeft ? c.aBuild : c.bBuild, rightBuild: aLeft ? c.bBuild : c.aBuild,
        seeds: aLeft ? seeds : [...seeds].reverse() });
    }
  }
  return jobs;
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

const q = (xs, p) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
};
const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const f = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? "--" : x.toFixed(d));
const med = (xs, d = 2) => `${f(q(xs, 0.5), d)} [${f(q(xs, 0.25), d)}, ${f(q(xs, 0.75), d)}]`;

/** One role's readings over a cell: every stroke and contact of A (or B) across its bouts. */
export function roleFigures(rows, role) {
  const sideOf = (r) => (role === "a" ? r.aSide : r.aSide === "left" ? "right" : "left");
  const mine = rows.map((r) => ({ r, s: r.sides[sideOf(r)] }));
  const seconds = rows.reduce((a, r) => a + r.seconds, 0);
  const strokes = mine.flatMap(({ s }) => s.strokes);
  const contacts = strokes.flatMap((s) => s.contacts);
  const scoring = (c) => c.damage > 0 && !c.blocked;
  const landed = strokes.filter((s) => s.contacts.some(scoring));
  const touched = strokes.filter((s) => s.contacts.length > 0);
  const unswung = mine.flatMap(({ s }) => s.unswung);
  const swungDamage = contacts.reduce((a, c) => a + c.damage, 0);
  const unswungDamage = unswung.reduce((a, c) => a + c.damage, 0);
  const kinds = {};
  for (const c of contacts.filter(scoring)) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
  const first = touched.map((s) => s.contacts[0]);
  const inChamber = (s, c) => c.since < (s.chamberSeconds ?? 0.22);
  const chamberContacts = strokes.flatMap((s) => s.contacts.filter((c) => inChamber(s, c)));
  const chamberDamage = strokes.reduce((a, s) => a + s.contacts.filter((c) => inChamber(s, c)).reduce((b, c) => b + c.damage, 0), 0);
  const commitScoring = strokes.flatMap((s) => s.contacts.filter((c) => !inChamber(s, c) && scoring(c)));
  // What each stroke came to: a scoring contact after the chamber, only in the chamber, only
  // parried (every contact blocked or on a held part), touched for nothing, or no contact at all.
  const outcome = (s) => {
    if (s.contacts.some((c) => !inChamber(s, c) && scoring(c))) return "commit";
    if (s.contacts.some(scoring)) return "chamber";
    if (s.contacts.length && s.contacts.every((c) => c.blocked || c.guarded)) return "parried";
    return s.contacts.length ? "nothing" : "none";
  };
  const outcomes = {};
  for (const s of strokes) outcomes[outcome(s)] = (outcomes[outcome(s)] ?? 0) + 1;
  const firstHeld = touched.filter((s) => s.contacts[0].blocked || s.contacts[0].guarded).length;
  return {
    outcomes, chamberDamage, firstHeldShare: firstHeld / Math.max(1, touched.length),
    commitClosing: commitScoring.map((c) => c.closing), commitEdge: commitScoring.map((c) => c.edge),
    commitDamage: commitScoring.map((c) => c.damage), commitSince: commitScoring.map((c) => c.since),
    engagedAtStart: strokes.filter((s) => s.contacts.length && s.contacts[0].since <= 0.05).length / Math.max(1, strokes.length),
    bouts: rows.length, wins: rows.filter((r) => r.winner === sideOf(r)).length,
    damagePerBout: mean(mine.map(({ s }) => s.damage)), strokesPerMin: (60 * strokes.length) / seconds, strokes: strokes.length,
    fraction: strokes.map((s) => s.fraction), gap: strokes.map((s) => s.gap), reach: strokes.map((s) => s.reach), ground: strokes.map((s) => s.ground),
    drop: strokes.map((s) => s.drop), tipPeak: strokes.map((s) => s.tipPeak), closest: strokes.map((s) => s.closest),
    closestSpeed: strokes.map((s) => s.closestSpeed), closestAt: strokes.map((s) => s.closestAt), closestTipY: strokes.map((s) => s.closestTipY),
    touchedShare: touched.length / Math.max(1, strokes.length), landedShare: landed.length / Math.max(1, strokes.length),
    contactsPerStroke: contacts.length / Math.max(1, strokes.length),
    damagePerStroke: swungDamage / Math.max(1, strokes.length), damagePerLanded: swungDamage / Math.max(1, landed.length),
    swungDamage, unswungDamage, unswungContacts: unswung.length,
    blockedShare: contacts.filter((c) => c.blocked || c.guarded).length / Math.max(1, contacts.length),
    zeroShare: contacts.filter((c) => !c.blocked && c.damage === 0).length / Math.max(1, contacts.length),
    chamberShare: chamberContacts.length / Math.max(1, contacts.length),
    firstSince: first.map((c) => c.since), firstClosing: first.map((c) => c.closing), firstSpeed: first.map((c) => c.speed),
    scoringClosing: contacts.filter(scoring).map((c) => c.closing), scoringSpeed: contacts.filter(scoring).map((c) => c.speed),
    scoringEdge: contacts.filter(scoring).map((c) => c.edge), scoringTipDist: contacts.filter(scoring).map((c) => c.tipDist),
    scoringEnergy: contacts.filter(scoring).map((c) => c.energy), scoringDamage: contacts.filter(scoring).map((c) => c.damage),
    scoringStrikerKg: contacts.filter(scoring).map((c) => c.strikerKg), scoringPartKg: contacts.filter(scoring).map((c) => c.partKg),
    kinds, keys: Object.entries(contacts.filter(scoring).reduce((a, c) => ({ ...a, [c.key]: (a[c.key] ?? 0) + 1 }), {}))
      .sort((x, y) => y[1] - x[1]).slice(0, 6),
  };
}

function report(dir) {
  const rows = readResults(dir).filter((r) => r.status === "ok");
  const cells = [...new Set(rows.map((r) => r.cell))];
  const out = {};
  const lines = [`Harness: ${HARNESS}.`, ""];
  lines.push("| cell | role | build | bouts | wins | damage/bout | strokes/min | swung dmg | unswung dmg | touched % | landed % | dmg/stroke | dmg/landed | blocked % | zero-damage % | in-chamber % |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const cell of cells) {
    const cr = rows.filter((r) => r.cell === cell);
    out[cell] = {};
    for (const role of ["a", "b"]) {
      const x = roleFigures(cr, role);
      out[cell][role] = x;
      const build = role === "a" ? CELLS[cell].aBuild : CELLS[cell].bBuild;
      lines.push(`| ${cell} | ${role.toUpperCase()} | ${build} | ${x.bouts} | ${x.wins} | ${f(x.damagePerBout)} | ${f(x.strokesPerMin, 1)} | ${f(x.swungDamage / x.bouts)} | ${f(x.unswungDamage / x.bouts)} | ${f(100 * x.touchedShare, 1)} | ${f(100 * x.landedShare, 1)} | ${f(x.damagePerStroke, 4)} | ${f(x.damagePerLanded, 4)} | ${f(100 * x.blockedShare, 1)} | ${f(100 * x.zeroShare, 1)} | ${f(100 * x.chamberShare, 1)} |`);
    }
  }
  lines.push("", "Range at the stroke's start and the tip against the mark (median [quartiles])", "",
    "| cell | role | gap / reach | gap m | reach m | ground m | socket over mark m | tip peak m/s | closest to mark m | speed there m/s | at s | tip over mark there m |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const cell of cells) for (const role of ["a", "b"]) {
    const x = out[cell][role];
    lines.push(`| ${cell} | ${role.toUpperCase()} | ${med(x.fraction)} | ${med(x.gap)} | ${med(x.reach)} | ${med(x.ground)} | ${med(x.drop)} | ${med(x.tipPeak, 1)} | ${med(x.closest)} | ${med(x.closestSpeed, 1)} | ${med(x.closestAt)} | ${med(x.closestTipY)} |`);
  }
  lines.push("", "Scoring contacts made in a stroke (median [quartiles])", "",
    "| cell | role | first contact at s | first closing m/s | scoring closing m/s | scoring speed m/s | edge | tip dist m | striker kg | part kg | energy J | damage | kinds | keys |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const cell of cells) for (const role of ["a", "b"]) {
    const x = out[cell][role];
    lines.push(`| ${cell} | ${role.toUpperCase()} | ${med(x.firstSince)} | ${med(x.firstClosing, 1)} | ${med(x.scoringClosing, 1)} | ${med(x.scoringSpeed, 1)} | ${med(x.scoringEdge)} | ${med(x.scoringTipDist)} | ${med(x.scoringStrikerKg)} | ${med(x.scoringPartKg)} | ${med(x.scoringEnergy, 0)} | ${med(x.scoringDamage, 4)} | ${JSON.stringify(x.kinds)} | ${x.keys.map(([k, n]) => `${k.split(".").slice(-2).join(".")} ${n}`).join(", ")} |`);
  }
  lines.push("", "What each stroke came to, and where its damage was dealt (share of strokes; damage per bout)", "",
    "| cell | role | strokes | scored after the chamber % | only in the chamber % | parried % | touched for nothing % | no contact % | engaged at start % | first contact on a held item % | chamber dmg/bout | commit dmg/bout | commit closing m/s | commit edge | commit damage | commit at s |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |");
  for (const cell of cells) for (const role of ["a", "b"]) {
    const x = out[cell][role];
    const o = (k) => f((100 * (x.outcomes[k] ?? 0)) / Math.max(1, x.strokes), 1);
    lines.push(`| ${cell} | ${role.toUpperCase()} | ${x.strokes} | ${o("commit")} | ${o("chamber")} | ${o("parried")} | ${o("nothing")} | ${o("none")} | ${f(100 * x.engagedAtStart, 1)} | ${f(100 * x.firstHeldShare, 1)} | ${f(x.chamberDamage / x.bouts)} | ${f((x.swungDamage - x.chamberDamage) / x.bouts)} | ${med(x.commitClosing, 1)} | ${med(x.commitEdge)} | ${med(x.commitDamage, 3)} | ${med(x.commitSince)} |`);
  }
  const md = lines.join("\n");
  writeFileSync(join(dir, "report.md"), `${md}\n`);
  writeFileSync(join(dir, "report.json"), `${JSON.stringify(out)}\n`);
  console.log(md);
}

async function main() {
  const { values } = parseArgs({ options: {
    run: { type: "boolean", default: false }, report: { type: "boolean", default: false },
    pairs: { type: "string", default: "48" }, lanes: { type: "string", default: "10" },
    cells: { type: "string", default: "size-walker,mirror-walker,size-duelist" }, out: { type: "string" },
    override: { type: "string", multiple: true },
  } });
  // `--override walker.holdFraction=0.9`: a counterfactual knob (`research/overrides.mjs`), kept in
  // the manifest so a resume cannot mix it with another value.
  const overrides = Object.fromEntries((values.override ?? []).map((text) => {
    const [name, value] = text.split("=");
    return [name, Number(value)];
  }));
  const dir = resolve(values.out ?? RUN_ROOT);
  if (values.run) {
    const cells = values.cells.split(",").map((s) => s.trim()).filter(Boolean);
    for (const c of cells) if (!CELLS[c]) throw new Error(`no cell "${c}"`);
    const jobs = jobsFor(cells, Number(values.pairs));
    const names = new Set(jobs.flatMap((j) => [j.leftBuild, j.rightBuild]));
    const manifest = { protocol: { maxSeconds: PROTOCOL.maxSeconds, settleSeconds: PROTOCOL.settleSeconds, locomotionMode: PROTOCOL.locomotionMode },
      experiment: "release2-strokes-v1", harness: HARNESS, builds: [...names].sort().map(buildOf),
      ...(Object.keys(overrides).length ? { overrides } : {}) };
    mkdirSync(dir, { recursive: true });
    console.log(`${jobs.length} bouts into ${dir}`);
    await runJobs(dir, manifest, jobs, { workers: Number(values.lanes), jobLimitMs: 20 * 60000,
      workerUrl: new URL("./stroke-worker.mjs", import.meta.url),
      onProgress: (p) => { if (p.done % 20 === 0 || p.done === p.total) console.log(`${p.done}/${p.total} in ${p.elapsedSeconds.toFixed(0)} s, ${p.failures} failed`); } });
  }
  if (values.report || values.run) { if (existsSync(dir)) report(dir); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  await main();
}
