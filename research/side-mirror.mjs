/**
 * The side-mirror gate: every mind against itself, scored by side.
 *
 *     node research/side-mirror.mjs --dir research/runs/side-mirror
 *     node research/side-mirror.mjs --minds golem-duelist,golem-reaper --blocks 64 --workers 12
 *
 * The plan is part 4 of `docs/plans/2026-09-25-skill-ceiling-01-body-release-1.md`; the table it
 * writes (`mirror.md` beside `results.jsonl`) is in `docs/analysis/2026-09-25-side-mirror.md`.
 *
 * **What a mirror is.** One mind on both sides of one build, and nothing else different but the
 * side. The right body is the left one turned half a turn, so a left share away from 50 % is the
 * side deciding bouts: a spawn, the arena, the solver's ordering, or a mind whose own path depends
 * on which way it faces. A comparison run with such a mind is partly a comparison of sides.
 *
 * "Side" is the whole slot: where the body stands, and when Havok built it. In a mirror whose opening
 * the seeds do not reach, the two bodies are symmetric up to float rounding, and that rounding picks
 * a slot. Measured on the guardian and the miser, the world mirrored exactly (positions, build order
 * and step order swapped) hands the same lean to the other side; the pooled share over every mind
 * whose seeds reach its bouts is 49.8 +- 2.8 %. See the analysis for both.
 *
 * **A block is one seed pair played both ways round**: seeds `[a, b]`, then `[b, a]`, so the mind
 * seeded `a` plays once on each side. Each side's mind is seeded from its own seed (`seeds[0]` left,
 * `seeds[1]` right), the split `createBout` makes, so neither shares the other's stream. A block the
 * same side wins twice is one the side decided; a block the same *seed* wins twice is one the mind
 * decided, whichever side it stood on.
 *
 * **Bouts are counted once per distinct trajectory.** The worker hashes both bodies as the bout runs
 * (`research/side-mirror-worker.mjs`), and bouts with equal hashes are one bout: a mirror whose seeds
 * reach nothing is one bout however many times it is played, and its band has to come from that one.
 * The left share, its band and the verdict are all taken over distinct trajectories. The share over
 * every bout is printed beside it.
 *
 * **The band** is the 95 % band of a fair coin at the distinct count, `1.96 * sqrt(0.25 / n)`, and a
 * mirror fails when its left share is further from 50 % than that. A draw scores a half. That is the
 * widest band a fair mirror can have -- draws only narrow it -- so a failure is not the band's doing.
 * At 128 distinct bouts it is 8.7 points.
 *
 * Execution is `runJobs` in `research/runner.mjs`: isolated worker lanes, one bout per worker at a
 * time, a fresh Havok per bout, resumable from `results.jsonl`. Never `Promise.all` over bouts
 * (`AGENTS.md`: one realm runs one Havok arena at a time).
 */
import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { PROTOCOL, seed } from "./schedule.mjs";

export const HARNESS = "Node harness, research runner, supported locomotion";

/** Frames between two trajectory samples in the worker: 10 Hz at the harness's 60 Hz frame. */
export const SAMPLE_FRAMES = 6;
/** Bout seconds at which the worker keeps the trajectory's prefix hash. */
export const CHECKPOINTS = Object.freeze([0.5, 1, 2, 4, 8, 16, 32, 64]);

/**
 * The minds the gate covers, each with why. The probe set is `PROBE_MINDS` in
 * `research/stat-sweep.mjs`. The naive ladder is session 03's, `LADDER` in `tests/harness/drills.mjs`
 * (`idle`, `golem-walker`, `golem-duelist`). The v4 minds are those over the
 * fourth executor, `golemDriven` in `src/golem/tactics-v4.ts`. The rest are the other named golem
 * minds in `POLICIES` (`src/mind.ts`), measured so that every one of them has a mirror on record.
 */
export const MIRROR_MINDS = Object.freeze([
  { name: "idle", roles: ["ladder"] },
  { name: "golem-walker", roles: ["ladder"] },
  { name: "golem-duelist", roles: ["probe", "ladder"] },
  { name: "golem-champion", roles: ["probe"] },
  { name: "golem-brawler", roles: ["probe"] },
  { name: "golem-miser", roles: ["probe", "v4"] },
  { name: "golem-reaper", roles: ["v4"] },
  { name: "golem-driver", roles: ["v4"] },
  { name: "golem-fencer", roles: ["named"] },
  { name: "golem-planner", roles: ["named"] },
  { name: "golem-form", roles: ["named"] },
  { name: "golem-skirmisher", roles: ["named"] },
  { name: "golem-guardian", roles: ["named"] },
  { name: "golem-tactician", roles: ["named"] },
]);

export const DEFAULT_BLOCKS = 64;

/**
 * Minds whose own mirror the side decides, each with what was measured. **Nothing measures against
 * them**: `refuseSideDecided` is called by `research/stat-sweep.mjs` and by `research/league.mjs`
 * for any comparison that is not the mind's own mirror, and `tests/side-mirror.test.mjs` fails if
 * a listed mind stops failing, so the list cannot go stale in either direction without a red test.
 */
export const SIDE_DECIDED = Object.freeze({
  "golem-guardian": "its mirror is one bout whatever the seeds, and the left wins it at 2.15 s, 128 of 128 "
    + "(docs/analysis/2026-09-25-side-mirror.md)",
});

/** Throws if any of `minds` is side-decided, naming each and why. */
export function refuseSideDecided(minds, what = "a comparison") {
  const listed = [...new Set(minds)].filter((name) => Object.hasOwn(SIDE_DECIDED, name));
  if (listed.length) {
    throw new Error(`${what} may not measure against a mind its side decides: `
      + listed.map((name) => `${name} (${SIDE_DECIDED[name]})`).join("; "));
  }
}

/** Every job: `blocks` seed pairs per mind, each played `[a, b]` and then `[b, a]`. */
export function mirrorJobs({ minds, blocks, runSeed }) {
  if (!Number.isInteger(blocks) || blocks < 1) throw new Error("blocks must be a positive integer");
  if (new Set(minds).size !== minds.length) throw new Error("a mind is listed twice");
  const jobs = [];
  for (const [round, mind] of minds.entries()) {
    for (let k = 0; k < blocks; k++) {
      const a = seed(runSeed, mind, k, "a"), b = seed(runSeed, mind, k, "b");
      if (a === b) throw new Error(`block ${mind}/${k} drew one seed twice`);
      for (const [half, seeds] of [["ab", [a, b]], ["ba", [b, a]]]) {
        jobs.push({ id: `${mind}/${k}/${half}`, round, block: `${mind}/${k}`, mind, half,
          left: mind, right: mind, leftBuild: "base", rightBuild: "base", seeds });
      }
    }
  }
  return jobs;
}

/** The left side's score for one bout: a win 1, a draw 1/2, a loss 0. */
export const leftScore = (row) => (row.winner === null ? 0.5 : row.winner === "left" ? 1 : 0);

/** The 95 % band of a fair coin over `n` independent bouts, as a share. */
export const fairBand = (n) => 1.96 * Math.sqrt(0.25 / n);

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/** What a bout ended on: who won, when, and both final bars. */
export const outcomeOf = (row) => `${row.winner}|${row.seconds}|${row.vitality.join(",")}`;

/**
 * What makes two bouts one bout: equal trajectory hashes, or, for a row written by a worker that
 * hashes none (`research/league-worker.mjs`), equal outcomes. On the side-mirror run of 2026-09-25
 * the two counts agree for twelve of fourteen minds; the miser's are 87 outcomes against 88
 * trajectories and the walker's 84 against 99, because a draw can end different bouts identically:
 * sixteen walker bouts drained both bars to empty at 120 s, and two miser bouts ended in the same
 * double exhaustion at 6.08 s. Where they differ the outcome counts fewer, so its band is the wider.
 */
export const boutIdentity = (row) => row.trajectory ?? outcomeOf(row);

/**
 * The gate itself, on a mirror's finished bouts: the left side's share over distinct bouts, a fair
 * coin's band at that count, and the verdict. `research/league.mjs` reads its mirrors through this
 * too, so there is one side gate.
 *
 * A mirror that never decides a bout has nothing for a side to decide. One whose seeds reach
 * nothing, and which decides its one bout, is decided by the side by construction: the side is the
 * only thing left that differs, so no band can pass it.
 */
export function sideVerdict(bouts) {
  if (!bouts.length) throw new Error("a mirror with no finished bout has no verdict");
  const unique = new Map();
  for (const row of bouts) if (!unique.has(boutIdentity(row))) unique.set(boutIdentity(row), row);
  const firsts = [...unique.values()];
  const distinct = firsts.length;
  const share = mean(firsts.map(leftScore));
  const decided = firsts.filter((row) => row.winner !== null).length;
  const band = fairBand(distinct);
  const verdict = decided === 0 ? "pass" : distinct === 1 ? "fail" : Math.abs(share - 0.5) > band ? "fail" : "pass";
  return { distinct, share, band, decided, verdict };
}

/**
 * One mind's mirror, from its rows: `sideVerdict`, and what explains it.
 *
 * `openings[t]` is the number of distinct trajectories up to bout second `t` (a bout that ended
 * sooner counts by its whole trajectory). `byBlock` sorts each seed pair by what decided it: the
 * same side twice, the same seed twice, or neither (a draw in it).
 */
export function mirrorVerdict(rows) {
  const ok = rows.filter((row) => row.status === "ok");
  const { distinct: n, share, band, decided, verdict } = sideVerdict(ok);
  const outcomes = new Set(ok.map(outcomeOf));
  const blocks = new Map();
  for (const row of ok) {
    const block = blocks.get(row.block) ?? {};
    block[row.half] = row;
    blocks.set(row.block, block);
  }
  const byBlock = { side: 0, seed: 0, drawn: 0 };
  for (const block of blocks.values()) {
    if (!block.ab || !block.ba) continue;
    const [x, y] = [block.ab.winner, block.ba.winner];
    if (x === null || y === null) byBlock.drawn += 1;
    else if (x === y) byBlock.side += 1;
    else byBlock.seed += 1;
  }
  const openings = Object.fromEntries(CHECKPOINTS.map((t) =>
    [t, new Set(ok.map((row) => row.prefixes?.[t] ?? row.trajectory)).size]));
  return {
    bouts: ok.length, failed: rows.length - ok.length,
    leftWins: ok.filter((row) => row.winner === "left").length,
    rightWins: ok.filter((row) => row.winner === "right").length,
    draws: ok.filter((row) => row.winner === null).length,
    shareAll: mean(ok.map(leftScore)), distinct: n, distinctOutcomes: outcomes.size, share, band, verdict,
    decided, byBlock, openings,
    seconds: mean(ok.map((row) => row.seconds)),
    damage: [mean(ok.map((row) => row.damage[0])), mean(ok.map((row) => row.damage[1]))],
  };
}

/** Every mind's verdict, in the order the minds were run. */
export function summarizeMirrors(rows, minds) {
  return minds.map((name) => ({ name, ...mirrorVerdict(rows.filter((row) => row.mind === name)) }));
}

const pct = (x) => (100 * x).toFixed(1);

export function markdownMirrors(summary, header) {
  const roles = new Map(MIRROR_MINDS.map((m) => [m.name, m.roles.join(", ")]));
  const lines = [
    `# ${header.title}`, "",
    `${HARNESS}; cap ${header.protocol.maxSeconds} s; build \`${header.build}\` on both sides; ${header.blocks} seed pairs a mind, each played both ways round; run seed ${header.seed}.`,
    "Left % is the left side's score over distinct trajectories, a draw counting half; the band is a fair coin's 95 % band at that count. Blocks: the same side won both halves / the same seed won both / a draw in one half.", "",
    "| Mind | Roles | Bouts | Distinct | Left % | Band ± | Verdict | Left % all bouts | L / R / draw | Blocks side / seed / drawn | Seconds | Damage L / R |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const m of summary) {
    lines.push(`| ${m.name} | ${roles.get(m.name) ?? "--"} | ${m.bouts} | ${m.distinct} | ${pct(m.share)} | ${pct(m.band)} | ${m.verdict} | ${pct(m.shareAll)} | ${m.leftWins} / ${m.rightWins} / ${m.draws} | ${m.byBlock.side} / ${m.byBlock.seed} / ${m.byBlock.drawn} | ${m.seconds.toFixed(1)} | ${m.damage[0].toFixed(2)} / ${m.damage[1].toFixed(2)} |`);
  }
  lines.push("", "Distinct trajectories up to each bout second (a bout that ended sooner counts whole):", "",
    `| Mind | ${CHECKPOINTS.map((t) => `${t} s`).join(" | ")} | end | outcomes |`,
    `| --- |${CHECKPOINTS.map(() => " ---: |").join("")} ---: | ---: |`);
  for (const m of summary) {
    lines.push(`| ${m.name} | ${CHECKPOINTS.map((t) => m.openings[t]).join(" | ")} | ${m.distinct} | ${m.distinctOutcomes} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({ options: {
    minds: { type: "string" }, blocks: { type: "string", default: String(DEFAULT_BLOCKS) },
    workers: { type: "string", default: "12" }, build: { type: "string", default: "default" },
    seed: { type: "string", default: "20260925" }, dir: { type: "string" },
  } });
  const [{ PLAYABLE_BUILDS }, { runJobs }, { fingerprint }] = await Promise.all([
    import("../src/golem/roster.ts"), import("./runner.mjs"), import("./fingerprint.mjs"),
  ]);
  const found = PLAYABLE_BUILDS.find((b) => b.name === values.build);
  if (!found) throw new Error(`there is no named build "${values.build}"`);
  const minds = values.minds ? values.minds.split(",") : MIRROR_MINDS.map((m) => m.name);
  const blocks = Number(values.blocks), runSeed = Number(values.seed);
  const jobs = mirrorJobs({ minds, blocks, runSeed });
  const directory = resolve(values.dir ?? "research/runs/side-mirror");
  const manifest = { version: 1, kind: "side-mirror", fingerprint: fingerprint().hash, protocol: PROTOCOL,
    build: found.setup, buildName: values.build, minds, blocks, seed: runSeed, runtime: { node: process.version } };
  console.log(`${jobs.length} bouts (${minds.length} minds x ${blocks} blocks x 2) into ${directory}`);
  const started = Date.now();
  const rows = await runJobs(directory, manifest, jobs, { workers: Number(values.workers),
    workerUrl: new URL("./side-mirror-worker.mjs", import.meta.url),
    onProgress: ({ done, total, failures }) => console.log(`  ${done}/${total}, ${failures} failed, ${((Date.now() - started) / 1000).toFixed(0)} s`) });
  const failed = rows.filter((row) => row.status !== "ok");
  if (failed.length) throw new Error(`${failed.length} bouts failed; first: ${failed[0].error}`);
  const summary = summarizeMirrors(rows, minds);
  const markdown = markdownMirrors(summary, { title: "Side mirrors", protocol: PROTOCOL, build: values.build, blocks, seed: runSeed });
  writeFileSync(join(directory, "mirror.json"), `${JSON.stringify({ manifest, summary }, null, 2)}\n`);
  writeFileSync(join(directory, "mirror.md"), markdown);
  console.log(markdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
