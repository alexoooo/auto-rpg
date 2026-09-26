/**
 * Item 6 of the headroom audit's proposals: the stone waist's lean ceiling
 * (`TORSO_WAIST.leanTorque`, shipped `onBody(600)` = 1852 N.m), swept as a counterfactual and put
 * back after every bout. Nothing here retunes the table; the write-up is
 * `docs/analysis/2026-09-26-release-2-questions.md`, section 1.
 *
 *     node research/release2-waist.mjs --bouts  --levels 300,600,1500 [--lanes 10]
 *     node research/release2-waist.mjs --benches --levels 300,600,1500
 *     node research/release2-waist.mjs --report
 *
 * A level is the number written inside `onBody()`, the table's own units before the stone body's
 * mass factor (`BODY_OVER_SHIPPED`, 3.086): 600 is shipped, 1500 is the doc table's pick. The knob
 * is `waist.leanTorque` in `research/overrides.mjs`, carried in each run's manifest.
 *
 * Harnesses:
 *
 * - **bouts**: the Node research runner (`runJobs`, one Havok arena per worker realm) through
 *   `research/fall-loop-worker.mjs`, the research `PROTOCOL` (150 s cap, supported locomotion).
 *   Groups: `stone`, a round robin of five naive stone minds on the stone default; `wheel`,
 *   `multileg`, `plated` and `maul`, the brawler and the duelist; `idle`, an idle stone default
 *   against a `golem-brawler` on the stone default (the audit's chest-high press, `idleFelledJobs` in
 *   `research/leverage.mjs`). Every group is played in side-swap blocks.
 * - **benches**: in this realm, one after another. The Node torso bench's scripted sequence on the
 *   plain and the plated trunk (`runTorsoBench`, the doc table's own instrument); the headless
 *   arena's balance states and shove bisection (`balanceState`, `balanceBisect`); and one stroke at
 *   the air from a settled guard on an assembled body (`commitmentProbe`), with the peak anchor
 *   stray of the striking hand read beside it.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { BODY_OVER_SHIPPED, TORSO_WAIST } from "../src/golem/config.ts";
import { sweepJobs } from "./stat-sweep.mjs";
import { PROTOCOL } from "./schedule.mjs";
import { auditBuild } from "./headroom-builds.mjs";
import { applyOverrides } from "./overrides.mjs";

export const SHIPPED_RAW = 600;
export const RUN_ROOT = join("research", "runs", "release2", "waist");
const SEED = 20260926;

/** The bout groups: each a build and the minds of its round robin (every ordered pair, mirrors included). */
export const WAIST_GROUPS = Object.freeze({
  stone: { build: "default", minds: ["golem-walker", "golem-duelist", "golem-brawler", "golem-champion", "golem-miser"], blocks: 100 },
  wheel: { build: "wheel", minds: ["golem-brawler", "golem-duelist"], blocks: 32 },
  multileg: { build: "multileg", minds: ["golem-brawler", "golem-duelist"], blocks: 32 },
  plated: { build: "plated", minds: ["golem-brawler", "golem-duelist"], blocks: 32 },
  // The two-handed maul: the torso bench's one body whose stroke stray and stroke-step tipping line
  // move with the lean, so its falls are read on their own.
  maul: { build: "maul", minds: ["golem-brawler", "golem-duelist"], blocks: 32 },
});

const levelTorque = (raw) => raw * BODY_OVER_SHIPPED;
const levelDir = (raw) => join(RUN_ROOT, `lean-${raw}`);

function groupJobs(name, raw, blocksOverride) {
  if (name === "idle") return null;
  const group = WAIST_GROUPS[name];
  const setup = auditBuild(group.build).setup;
  const level = { key: name, value: null, control: false, setup };
  return { jobs: sweepJobs({ levels: [level], blocks: blocksOverride ?? group.blocks, minds: group.minds, runSeed: SEED }),
    builds: [{ name: "base", setup }, { name, setup }] };
}

async function runBouts(levels, groups, lanes, idlePairs, blocksOverride) {
  const [{ runJobs }, { idleFelledJobs }] = await Promise.all([import("./runner.mjs"), import("./leverage.mjs")]);
  // Interleave: every group at every level is its own run directory, queued level by level.
  for (const raw of levels) {
    const overrides = { "waist.leanTorque": levelTorque(raw) };
    for (const name of groups) {
      const directory = resolve(levelDir(raw), name);
      let jobs, builds;
      if (name === "idle") {
        jobs = idleFelledJobs(idlePairs, "golem-brawler");
        builds = [{ name: "default", setup: auditBuild("default").setup }];
      } else ({ jobs, builds } = groupJobs(name, raw, blocksOverride));
      const manifest = { version: 1, kind: "fall-loop", protocol: { maxSeconds: PROTOCOL.maxSeconds,
        settleSeconds: PROTOCOL.settleSeconds, locomotionMode: PROTOCOL.locomotionMode }, group: name, seed: SEED,
        builds, overrides, leanRaw: raw };
      const started = Date.now();
      console.log(`lean ${raw} (${levelTorque(raw).toFixed(0)} N.m) ${name}: ${jobs.length} bouts into ${directory}`);
      await runJobs(directory, manifest, jobs, { workers: lanes, jobLimitMs: 20 * 60000,
        workerUrl: new URL("./fall-loop-worker.mjs", import.meta.url),
        onProgress: ({ done, total, failures }) => console.log(`  lean ${raw} ${name} ${done}/${total}, ${failures} failed, ${((Date.now() - started) / 1000).toFixed(0)} s`) });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Benches
// ---------------------------------------------------------------------------------------------

/**
 * One stroke at the air from a settled guard on an assembled body (`commitmentProbe`'s bout), with
 * the striking hand's anchor stray read every solver step: how far the hand is from where its
 * drive is steering it (`anchorStray` in `src/golem/effectors/chains/arm-core.ts`). Read in three
 * windows, by the stroke's own clock (`STROKE_SHAPES`): the guard held before it; the **drive**,
 * the chamber and the stroke proper, where a stray is the limb failing to follow; and the
 * **follow**, the rest of the commit, where the drive deliberately drops its force ceiling and the
 * limb leaves its anchor by design (AGENTS.md, `BENCH_READOUT.strokeExclusionSeconds`). The trunk's
 * peak tilt off vertical is read over the drive.
 */
export async function strokeStray(setup, { step }) {
  const [{ headlessPair, scriptedMind }, { STROKE_SHAPES }] = await Promise.all([import("./leverage.mjs"),
    import("../src/golem/tactics.ts")]);
  const mind = scriptedMind(step ? "stroke-step" : "stroke");
  const h = await headlessPair(setup, mind);
  const effector = h.golem.effectors?.primary ?? h.golem.effectors?.secondary;
  const view = effector?.module.view?.() ?? null;
  const striker = effector?.module.strikers?.[0] ?? null;
  let guardStray = 0, driveStray = 0, followStray = 0, tipPeak = 0, last = null, trunkLeanPeak = 0, shape = null;
  const core = h.golem.limbs.find((l) => l.key.endsWith("trunk.core"))?.part ?? null;
  h.onSample((t) => {
    const stray = view?.anchorStray ?? null;
    const mm = Number.isFinite(stray) ? stray * 1000 : null;
    if (mind.strokes === 0 && t > 1.5 && mm !== null) guardStray = Math.max(guardStray, mm);
    if (mind.strokes !== 1) return;
    if (!shape) {
      const hand = h.golem.effectors?.primary ? "primary" : "secondary";
      const weapon = h.golem.view?.self?.hands?.[hand]?.weapon;
      if (!STROKE_SHAPES[weapon]) throw new Error(`no stroke shape for the ${hand} hand's "${weapon}"`);
      shape = STROKE_SHAPES[weapon];
    }
    const into = mind.t - mind.strokeAt;
    const drive = into <= shape.chamberSeconds + shape.strokeSeconds;
    if (mind.stage === "done") return;
    if (mm !== null) {
      if (drive) driveStray = Math.max(driveStray, mm); else followStray = Math.max(followStray, mm);
    }
    if (striker) {
      const w = striker.tipPosition();
      if (last) tipPeak = Math.max(tipPeak, Math.hypot(w.x - last.x, w.y - last.y, w.z - last.z) * 120);
      last = w.clone();
    }
    if (core && drive) {
      // The trunk's pitch off vertical, rad: its up axis against the world's.
      const q = core.mesh.rotationQuaternion;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      trunkLeanPeak = Math.max(trunkLeanPeak, Math.acos(Math.max(-1, Math.min(1, upY))));
    }
  });
  try { h.run(6.2); } finally { h.dispose(); }
  return { step, guardStrayMm: guardStray, driveStrayMm: driveStray, followStrayMm: followStray, tipPeakMps: tipPeak,
    trunkTiltPeakRad: trunkLeanPeak };
}

/**
 * An idle stone body pressed at the chest: a constant horizontal force of `newtons`, straight back
 * against its facing (its weakest line, `docs/analysis/2026-09-26-headroom.md` section 4.1), applied
 * at the trunk core's centre every solver step for `seconds`, after a 2.5 s settle. The force is
 * physics only and never a ledger entry, so it cannot fell the body -- a knockdown is the
 * locomotion ledger's decision, and in a bout the press reaches it through `readContact` -- and
 * what it reads is the waist giving way: the trunk's peak tilt off vertical and the least margin
 * of the centre of mass inside the base. Measured, the waist does not bend a little under a
 * little force; it holds to within a milliradian and then yields outright (1852 N.m: 0.0016 rad
 * at 5000 N, 0.62 rad at 7000), so `pressFold` bisects for the force at which it yields.
 */
export async function chestPress(setup, newtons, { seconds = 3 } = {}) {
  const [{ headlessPair, scriptedMind }, { hullMargin }, { Vector3 }] = await Promise.all([import("./leverage.mjs"),
    import("./fall-loop-worker.mjs"), import("@babylonjs/core/Maths/math.vector.js")]);
  const h = await headlessPair(setup, scriptedMind("still"));
  const core = h.golem.limbs.find((l) => l.key.endsWith("trunk.core"))?.part ?? null;
  if (!core) throw new Error("no trunk core to press");
  const dt = 1 / 120;
  let pressing = false, tilt = 0, margin = Infinity;
  const push = new Vector3();
  h.onSample(() => {
    if (!pressing) return;
    const yaw = h.port.carrier.state.yaw;
    push.set(-Math.sin(yaw) * newtons * dt, 0, -Math.cos(yaw) * newtons * dt);
    core.body.applyImpulse(push, core.mesh.position);
    const q = core.mesh.rotationQuaternion;
    tilt = Math.max(tilt, Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z)))));
    const m = h.port.tipping ? hullMargin(h.port.tipping.hull) : null;
    if (m !== null) margin = Math.min(margin, m);
  });
  try { h.run(2.5); pressing = true; h.run(seconds); } finally { h.dispose(); }
  return { newtons, tiltPeakRad: tilt, marginMinM: Number.isFinite(margin) ? margin : null };
}

/** The trunk tilt, rad, past which a press has folded the waist rather than leaned on it. */
export const FOLD_TILT = 0.2;

/** Bisects for the least chest force, N, that folds the waist (`chestPress` past `FOLD_TILT`). */
export async function pressFold(setup, { lo = 0, hi = 40000, iterations = 9 } = {}) {
  const probes = [];
  const top = await chestPress(setup, hi);
  probes.push(top);
  if (top.tiltPeakRad < FOLD_TILT) return { foldN: null, above: hi, probes };
  for (let i = 0; i < iterations; i += 1) {
    const mid = (lo + hi) / 2;
    const r = await chestPress(setup, mid);
    probes.push(r);
    if (r.tiltPeakRad >= FOLD_TILT) hi = mid; else lo = mid;
  }
  return { foldN: hi, holdsN: lo, probes };
}

async function runBenches(levels, out) {
  const { runTorsoBench, HARNESS: TORSO_HARNESS } = await import("../tests/harness/golem-torso-bench.mjs");
  const { balanceState, balanceBisect } = await import("./leverage.mjs");
  const rows = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")).rows : [];
  for (const raw of levels) {
    if (rows.some((r) => r.raw === raw)) { console.log(`lean ${raw}: already benched`); continue; }
    const torque = levelTorque(raw);
    const row = { raw, torque, torso: {}, balance: {}, stroke: {} };
    for (const torsoId of ["torso.plain", "torso.plated"]) {
      const run = await runTorsoBench({ torsoId, headId: "head.ram", overrides: [[TORSO_WAIST, { leanTorque: torque }]] });
      const at = run.marks.find((mark) => mark.phase === "lean");
      row.torso[torsoId] = { arrivalSeconds: at?.torso?.arrivalSeconds ?? null, overshoot: at?.torso?.overshoot ?? 0,
        lagMm: run.torso?.peakTipErrorMm ?? null, wanderMm: run.torso?.tipWanderMm ?? null, stuckSteps: run.torso?.stuckSteps ?? null,
        bobPeakMm: run.bob.peakMm, bobSettleSeconds: run.bob.settleSeconds };
    }
    const restore = applyOverrides({ "waist.leanTorque": torque });
    try {
      for (const build of ["default", "plated", "maul"]) {
        const setup = auditBuild(build).setup;
        const states = {};
        for (const state of ["still", "walk", "stroke", "stroke-step"]) {
          const s = await balanceState(setup, state);
          states[state] = { weakestMedian: s.weakest.median, weakestP10: s.roseMin.p10, backMedian: s.back.median, frontMedian: s.front.median,
            marginMedian: s.marginMedian };
        }
        const bisect = [];
        for (const k of [0.95, 1.05]) bisect.push(await balanceBisect(setup, k));
        row.balance[build] = { states, bisect };
        row.stroke[build] = { flat: await strokeStray(setup, { step: false }) };
      }
      row.press = {};
      for (const build of ["default", "plated"]) {
        const setup = auditBuild(build).setup;
        row.press[build] = await pressFold(setup);
      }
    } finally { restore(); }
    rows.push(row);
    console.log(JSON.stringify(row));
    writeFileSync(out, `${JSON.stringify({ harness: { torso: TORSO_HARNESS, balance: "Node headless arena (research/leverage.mjs balanceState/balanceBisect)",
      stroke: "Node headless arena, one stroke at the air from a settled guard (research/release2-waist.mjs strokeStray)" }, rows }, null, 2)}\n`);
  }
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

function readGroup(dir) {
  const path = join(dir, "results.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((r) => r.status === "ok");
}

const f = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? "--" : x.toFixed(d));

async function report() {
  const { summarize, clustered } = await import("./fall-loop.mjs");
  const levels = readdirSync(RUN_ROOT).filter((d) => d.startsWith("lean-")).map((d) => Number(d.slice(5))).sort((a, b) => a - b);
  const lines = [];
  const out = { levels: {} };
  lines.push("## Falls by group (Node research runner, fall-loop worker, research PROTOCOL)", "",
    "| lean (raw / N.m) | group | bouts | falls/min | standing falls/min | down % | re-fall <=2 s % | clustered falls/min |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const raw of levels) {
    out.levels[raw] = {};
    for (const name of ["idle", ...Object.keys(WAIST_GROUPS)]) {
      const rows = readGroup(join(levelDir(raw), name));
      if (!rows.length) continue;
      if (name === "idle") {
        const falls = rows.flatMap((r) => r.sides[r.idleSide].falls);
        const seconds = rows.reduce((a, r) => a + r.seconds, 0);
        const refall = falls.filter((x) => x.from !== "rising" && x.sinceStood !== null && x.sinceStood <= 2).length;
        const down = rows.reduce((a, r) => a + r.sides[r.idleSide].downSeconds, 0) / seconds;
        const idleWins = rows.filter((r) => r.winner === r.idleSide).length;
        out.levels[raw].idle = { bouts: rows.length, falls: falls.length, seconds, fallsPerMin: 60 * falls.length / seconds, down, refall, idleWins };
        lines.push(`| ${raw} / ${levelTorque(raw).toFixed(0)} | idle v brawler (idle side; idle won ${idleWins}) | ${rows.length} | ${f(60 * falls.length / seconds)} | -- | ${f(100 * down, 1)} | ${falls.length ? f(100 * refall / falls.length, 1) : "--"} | -- |`);
        continue;
      }
      const s = summarize(rows.map((r) => ({ ...r, group: name })), () => name)[name];
      out.levels[raw][name] = s;
      lines.push(`| ${raw} / ${levelTorque(raw).toFixed(0)} | ${name} | ${rows.length} | ${f(s.all.fallsPerMin)} | ${f(s.all.standingFallsPerMin)} | ${f(100 * s.all.downShare, 1)} | ${f(100 * s.all.refall2, 1)} | ${f(s.clustered.fallsPerMin.mean)} ± ${f(s.clustered.fallsPerMin.half)} |`);
    }
  }
  // Win rates: each mind's share over the stone round robin, mirrors excluded, and the brawler mirror's falls a bout.
  lines.push("", "## Naive-mind shares on the stone default (round robin, mirrors excluded; share of bouts won, draws a half)", "");
  const minds = WAIST_GROUPS.stone.minds;
  lines.push(`| lean | ${minds.join(" | ")} | brawler mirror falls a body a bout | stone mirror falls a body a bout |`, `| --- | ${minds.map(() => "---:").join(" | ")} | ---: | ---: |`);
  for (const raw of levels) {
    const rows = readGroup(join(levelDir(raw), "stone"));
    if (!rows.length) continue;
    const cells = minds.map((m) => {
      let score = 0, n = 0;
      for (const r of rows) {
        if (r.left === r.right) continue;
        const side = r.left === m ? "left" : r.right === m ? "right" : null;
        if (!side) continue;
        n += 1;
        score += r.winner === null ? 0.5 : r.winner === side ? 1 : 0;
      }
      return n ? `${f(100 * score / n, 1)} (${n})` : "--";
    });
    const mirror = (m) => {
      const mr = rows.filter((r) => r.left === m && r.right === m);
      return mr.length ? mr.reduce((a, r) => a + r.sides.left.falls.length + r.sides.right.falls.length, 0) / (2 * mr.length) : NaN;
    };
    const allMirror = rows.filter((r) => r.left === r.right);
    const allFalls = allMirror.length ? allMirror.reduce((a, r) => a + r.sides.left.falls.length + r.sides.right.falls.length, 0) / (2 * allMirror.length) : NaN;
    lines.push(`| ${raw} | ${cells.join(" | ")} | ${f(mirror("golem-brawler"))} | ${f(allFalls)} |`);
  }
  // Pairing-level wins, for the matchups that move.
  lines.push("", "## Head-to-head on the stone default: the row mind's share against the column mind, by level (both corners)", "");
  for (const raw of levels) {
    const rows = readGroup(join(levelDir(raw), "stone"));
    if (!rows.length) continue;
    lines.push(`lean ${raw}:`, "", `| | ${minds.map((m) => m.replace("golem-", "")).join(" | ")} |`, `| --- | ${minds.map(() => "---:").join(" | ")} |`);
    for (const a of minds) {
      const cells = minds.map((b) => {
        if (a === b) return "";
        let score = 0, n = 0;
        for (const r of rows) {
          const side = r.left === a && r.right === b ? "left" : r.right === a && r.left === b ? "right" : null;
          if (!side) continue;
          n += 1; score += r.winner === null ? 0.5 : r.winner === side ? 1 : 0;
        }
        return n ? `${f(100 * score / n, 0)}` : "--";
      });
      lines.push(`| ${a.replace("golem-", "")} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }
  // Benches
  const benchPath = join(RUN_ROOT, "benches.json");
  if (existsSync(benchPath)) {
    const { rows } = JSON.parse(readFileSync(benchPath, "utf8"));
    rows.sort((a, b) => a.raw - b.raw);
    lines.push("", "## Torso bench (Node torso bench, head.ram), read at the lean mark", "",
      "| lean (raw / N.m) | plain arrival s | overshoot rad | lag mm | stuck | shove bob mm | plated arrival s | overshoot | lag mm | stuck | bob mm |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const r of rows) {
      const p = r.torso["torso.plain"], q = r.torso["torso.plated"];
      lines.push(`| ${r.raw} / ${r.torque.toFixed(0)} | ${f(p.arrivalSeconds, 3)} | ${f(p.overshoot, 4)} | ${f(p.lagMm, 1)} | ${p.stuckSteps} | ${f(p.bobPeakMm, 1)} | ${f(q.arrivalSeconds, 3)} | ${f(q.overshoot, 4)} | ${f(q.lagMm, 1)} | ${q.stuckSteps} | ${f(q.bobPeakMm, 1)} |`);
    }
    lines.push("", "## The tipping line (Node headless arena): weakest fall impulse, median / 10th percentile, N.s; shove bisection at 0.95 and 1.05 of it", "",
      "| lean | build | still | walk | stroke | stroke-step | bisect 0.95 / 1.05 |", "| --- | --- | ---: | ---: | ---: | ---: | --- |");
    for (const r of rows) for (const [build, b] of Object.entries(r.balance)) {
      const s = b.states;
      const c = (x) => `${f(x.weakestMedian, 0)} / ${f(x.weakestP10, 0)}`;
      lines.push(`| ${r.raw} | ${build} | ${c(s.still)} | ${c(s.walk)} | ${c(s.stroke)} | ${c(s["stroke-step"])} | ${b.bisect.map((x) => (x.fell ? "fell" : "stood")).join(" / ")} |`);
    }
    lines.push("", "## One stroke at the air on an assembled body (Node headless arena): peak anchor stray, mm; tip peak, m/s; trunk tilt peak, rad", "",
      "| lean | build | guard stray | drive stray | follow stray | tip peak | trunk tilt in the drive |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |");
    for (const r of rows) for (const [build, s] of Object.entries(r.stroke)) {
      lines.push(`| ${r.raw} | ${build} | ${f(s.flat.guardStrayMm, 1)} | ${f(s.flat.driveStrayMm, 1)} | ${f(s.flat.followStrayMm, 1)} | ${f(s.flat.tipPeakMps, 1)} | ${f(s.flat.trunkTiltPeakRad, 3)} |`);
    }
    lines.push("", `## The chest force that folds the waist (Node headless arena, idle body, 3 s press at the core; fold = trunk tilt past ${FOLD_TILT} rad), N`, "",
      "| lean | default: holds / folds | plated: holds / folds |", "| --- | ---: | ---: |");
    const fold = (p) => (p?.foldN === null ? `> ${p.above}` : p ? `${f(p.holdsN, 0)} / ${f(p.foldN, 0)}` : "--");
    for (const r of rows) lines.push(`| ${r.raw} / ${r.torque.toFixed(0)} | ${fold(r.press?.default)} | ${fold(r.press?.plated)} |`);
  }
  const md = lines.join("\n");
  writeFileSync(join(RUN_ROOT, "report.md"), `${md}\n`);
  writeFileSync(join(RUN_ROOT, "report.json"), `${JSON.stringify(out, (k, v) => (k === "sides" && Array.isArray(v) ? v.length : v), 1)}\n`);
  console.log(md);
  void clustered;
}

async function main() {
  const { values } = parseArgs({ options: {
    bouts: { type: "boolean", default: false }, benches: { type: "boolean", default: false }, report: { type: "boolean", default: false },
    levels: { type: "string", default: "300,450,600,800,1000,1500" }, groups: { type: "string", default: "idle,stone,wheel,multileg,plated" },
    lanes: { type: "string", default: "10" }, "idle-pairs": { type: "string", default: "16" }, blocks: { type: "string" },
  } });
  const levels = values.levels.split(",").map(Number);
  mkdirSync(RUN_ROOT, { recursive: true });
  if (values.bouts) await runBouts(levels, values.groups.split(","), Number(values.lanes), Number(values["idle-pairs"]),
    values.blocks ? Number(values.blocks) : undefined);
  if (values.benches) await runBenches(levels, join(RUN_ROOT, "benches.json"));
  if (values.report) await report();
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  await main();
}
