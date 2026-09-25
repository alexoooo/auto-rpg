// Skill ceiling session 02: how long a fork of a bout stays faithful, and whether it ranks commands
// the way the real world does (`docs/plans/2026-09-25-skill-ceiling-02-fork.md`, "Measure").
//
//   node research/fork-study.mjs [--lanes 6] [--seeds 12] [--out research/runs/fork-study]
//   node research/fork-study.mjs --summary [--out research/runs/fork-study]
//
// Harness: the Node bout runner (`tests/harness/bout-runner.mjs`) and the fork harness
// (`tests/harness/fork.mjs`), one Havok instance per worker thread, jobs run one at a time inside
// each worker (AGENTS.md, "One worker realm runs one Havok arena at a time"). Each job is one
// mirror bout; each writes its own file, because one shared file on Windows silently keeps one
// shard of several.
//
// Per fork moment, four things:
// - **Divergence**, each a world stepped beside the original from the moment: a *teleport* fork
//   driven open loop by the commands the original applied, substep by substep (so what diverges is
//   the physics and nothing a mind made of it); the same fork closed loop, driven by its own
//   restored minds, which is what a planner's rollout is; an *exact* fork (Havok's memory copied,
//   `tests/harness/fork.mjs`); and an exact fork whose opponent restarts its dice.
// - **Ranking.** Four command prefixes, each run in a replay of the bout from t = 0 to the moment
//   (the reference) and in each kind of fork, scored by damage dealt minus taken by the left side.
// - **Cost.** Capture, build, restore, and one simulated second of a fork.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ARGS = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = ARGS.indexOf(`--${name}`);
  return at === -1 ? fallback : ARGS[at + 1];
};

/** The probe minds, each in a mirror. */
export const MINDS = ["golem-duelist", "golem-miser", "golem-researched-needle-v1", "golem-champion", "golem-brawler"];
/** Horizons after the fork moment, seconds. */
export const HORIZONS = [0.1, 0.25, 0.5, 1, 2, 4];
/** Ranking horizons, seconds, and how long a prefix overrides the mind. */
export const RANK_HORIZONS = [0.5, 1, 2];
export const PREFIX_SECONDS = 0.5;
export const PREFIXES = ["own", "press", "withdraw", "circle"];
/** How each prefix is scored: the reference first, then the worlds ranked against it. */
export const RANK_KINDS = ["replay", "teleport", "exact", "dice"];
/** The divergence kinds, each a world stepped beside the original. */
export const DIVERGENCE_KINDS = ["open", "closed", "exact", "dice"];
/** Fork moments per bout, spaced so that each one's four-second window ends before the next. */
const MOMENTS = 4;
const FRAME = 1 / 60;

/** A small deterministic hash, for seeds and moment jitter that do not depend on anything else. */
function mix(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}

export function jobs(seedsPerMind) {
  const out = [];
  MINDS.forEach((mind, m) => {
    for (let s = 0; s < seedsPerMind; s += 1) {
      const seeds = [mix(m * 1000 + s, 1), mix(m * 1000 + s, 2)];
      // Openings are seed-independent for about 0.7 s (the rate control clock analysis), so the
      // first moment is after that; each later one is 4.6 s on, jittered by up to half a second, so
      // no two bouts fork at the same instant and each moment's four-second window has ended before
      // the next moment comes.
      const moments = [];
      for (let k = 0; k < MOMENTS; k += 1) {
        const jitter = (mix(seeds[0], k) % 1000) / 1000;
        moments.push(0.8 + 4.6 * k + 0.5 * jitter);
      }
      out.push({ id: `${mind}-${s}`, mind, seed: s, seeds, moments });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// One job, in a worker
// ---------------------------------------------------------------------------------------------

async function runJob(job, physics) {
  const { createBout, freshHavok } = await import("../tests/harness/bout-runner.mjs");
  const { captureBout, exactFork, forkBout } = await import("../tests/harness/fork.mjs");
  const { restoreMind, snapshotMind } = await import("../src/fork/mind.ts");
  // Every world goes into a Havok instance of its own: the original, so that an exact fork can copy
  // it, and every fork and replay, so that each holds the original's handles. (`physics`, the
  // worker's own instance, is left unused.)
  void physics;
  const options = { left: job.mind, right: job.mind, seeds: job.seeds, locomotionMode: "supported",
    maxSeconds: 150, physics: await freshHavok() };
  const fresh = async () => ({ physics: await freshHavok() });
  const sides = ["left", "right"];
  /** The right side's mind restarts its dice: the same moment, the opponent's other futures. */
  const reseedRight = (world, seed) => {
    const mind = world.right.mind;
    restoreMind(mind, snapshotMind(mind), { reseed: seed });
  };
  const teleportOf = (capture) => ({ ...capture, native: { ...capture.native, heap: null } });

  const pose = (bout) => Buffer.from(new Float64Array([bout.left, bout.right].flatMap((g) =>
    g.limbs.flatMap((l) => {
      const p = l.part.mesh.position, q = l.part.mesh.rotationQuaternion;
      return [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
    }))).buffer);
  const root = (golem) => golem.locomotionModule.root.mesh.position.clone();
  const tip = (golem) => {
    const effector = golem.effectors.primary;
    const record = effector ? golem.recordFor(effector.module) : null;
    if (!effector || !record || record.severed) return null;
    const view = effector.module.view();
    return view ? view.tip.clone() : null;
  };
  const points = (bout) => sides.map((side) => ({ root: root(bout[side]), tip: tip(bout[side]) }));
  const gaps = (a, b) => {
    const pa = points(a), pb = points(b);
    return sides.map((_, i) => ({
      root: pa[i].root.subtract(pb[i].root).length(),
      tip: pa[i].tip && pb[i].tip ? pa[i].tip.subtract(pb[i].tip).length() : null,
    }));
  };
  // Damage dealt by each side, as the runner's own records hold it (read through the fork record,
  // which reads and writes nothing).
  const dealt = (bout) => {
    const records = bout.forkWorld().roots.runner.captureState().sides;
    return [records[0].record.damage, records[1].record.damage];
  };
  const margin = (bout, from) => {
    const [l, r] = dealt(bout);
    return (l - from[0]) - (r - from[1]);
  };

  /** Wrap what a side's driver applies: every substep's command goes through `through`. */
  const intercept = (bout, side, through) => {
    const driver = bout[side].control.driver;
    const apply = driver.apply;
    driver.apply = (dt, intent) => apply(dt, through(intent));
  };
  const prefixed = (name, until, clock) => (intent) => {
    if (name === "own" || clock() >= until) return intent;
    const next = structuredClone(intent);
    const hand = next.actingHand ? next[next.actingHand] : null;
    if (name === "press") {
      next.forward = 1; next.strafe = 0;
      if (hand) { hand.thrust = true; hand.guard = false; }
    } else if (name === "withdraw") {
      next.forward = -1; next.strafe = 0;
      if (hand) { hand.thrust = false; hand.guard = true; }
    } else if (name === "circle") {
      next.forward = 0; next.strafe = 1;
    }
    return next;
  };

  const rows = [];
  const bout = createBout(options);
  // The original's applied commands, queued per side for the open-loop fork.
  const queues = { left: [], right: [] };
  let recording = false;
  for (const side of sides) {
    intercept(bout, side, (intent) => {
      if (recording) queues[side].push(structuredClone(intent));
      return intent;
    });
  }
  let frame = 0;
  const stepTo = (b, target, from) => { let f = from; while (f < target && b.active) { b.step(); f += 1; } return f; };

  for (const moment of job.moments) {
    // Never a moment the original has already stepped past: the replay reference steps to `at`.
    const at = Math.max(Math.round(moment / FRAME), frame);
    frame = stepTo(bout, at, frame);
    if (frame < at || !bout.active) break;
    const row = { job: job.id, mind: job.mind, seed: job.seed, moment: at * FRAME, frame: at };
    const atPose = pose(bout);
    const atDamage = dealt(bout);

    // Cost, and the divergence forks: teleport open and closed loop, exact, exact with the
    // opponent's dice restarted.
    let t = performance.now();
    const light = captureBout(bout);
    row.captureMs = performance.now() - t;
    t = performance.now();
    const capture = captureBout(bout, { heap: true });
    row.captureHeapMs = performance.now() - t;
    row.nodes = light.graph.nodes.length;
    row.heapBytes = capture.native.heap.length;
    const open = forkBout(options, teleportOf(capture), await fresh());
    row.buildMs = open.forkTiming.buildMs;
    row.restoreMs = open.forkTiming.restoreMs;
    const closed = forkBout(options, teleportOf(capture), await fresh());
    t = performance.now();
    const exact = await exactFork(options, capture);
    row.exactMs = performance.now() - t;
    row.exactBuildMs = exact.forkTiming.buildMs;
    row.exactRestoreMs = exact.forkTiming.restoreMs;
    const dice = await exactFork(options, capture);
    reseedRight(dice, mix(job.seeds[1], at));
    for (const side of sides) {
      queues[side].length = 0;
      intercept(open, side, () => {
        const next = queues[side].shift();
        if (!next) throw new Error("open-loop fork ran past the original's commands");
        return next;
      });
    }
    recording = true;
    const horizonFrames = HORIZONS.map((h) => Math.round(h / FRAME));
    row.open = {}; row.closed = {}; row.exact = {}; row.dice = {};
    let simMs = 0;
    for (let f = 1; f <= horizonFrames.at(-1); f += 1) {
      if (!bout.active) break;
      bout.step();
      open.step();
      closed.step();
      t = performance.now();
      exact.step();
      if (f <= 60) simMs += performance.now() - t;
      dice.step();
      frame += 1;
      const h = horizonFrames.indexOf(f);
      if (h !== -1) {
        row.open[HORIZONS[h]] = gaps(bout, open);
        row.closed[HORIZONS[h]] = gaps(bout, closed);
        row.exact[HORIZONS[h]] = gaps(bout, exact);
        row.dice[HORIZONS[h]] = gaps(bout, dice);
      }
    }
    row.forkSecondMs = simMs;
    recording = false;
    for (const world of [open, closed, exact, dice]) world.dispose();

    // Ranking: four prefixes, each in a replay from t = 0 (the reference), a teleport fork, an
    // exact fork, and an exact fork whose opponent draws other dice (one reseed for all four
    // prefixes, so the prefixes are compared on common random numbers, as a planner would).
    row.rank = {};
    const rankFrames = RANK_HORIZONS.map((h) => Math.round(h / FRAME));
    for (const name of PREFIXES) {
      const scores = {};
      for (const kind of RANK_KINDS) {
        let world;
        if (kind === "teleport") world = forkBout(options, teleportOf(capture), await fresh());
        else if (kind === "exact") world = await exactFork(options, capture);
        else if (kind === "dice") {
          world = await exactFork(options, capture);
          reseedRight(world, mix(job.seeds[1], at));
        } else {
          world = createBout({ ...options, ...(await fresh()) });
          stepTo(world, at, 0);
          if (!pose(world).equals(atPose)) throw new Error(`${job.id}: a replay from t = 0 is not the original at ${at}`);
        }
        const from = dealt(world);
        if (kind === "replay" && (from[0] !== atDamage[0] || from[1] !== atDamage[1])) {
          throw new Error(`${job.id}: a replay's damage differs from the original's at ${at}`);
        }
        const until = world.clock + PREFIX_SECONDS - 1e-9;
        intercept(world, "left", prefixed(name, until, () => world.clock));
        const out = {};
        for (let f = 1; f <= rankFrames.at(-1); f += 1) {
          if (world.active) world.step();
          const h = rankFrames.indexOf(f);
          if (h !== -1) out[RANK_HORIZONS[h]] = margin(world, from);
        }
        world.dispose();
        scores[kind] = out;
      }
      row.rank[name] = scores;
    }
    rows.push(row);
  }
  bout.dispose();
  return rows;
}

if (!isMainThread) {
  const { freshHavok } = await import("../tests/harness/bout-runner.mjs");
  const { Logger } = await import("@babylonjs/core/Misc/logger.js");
  Logger.LogLevels = Logger.ErrorLogLevel;
  const physics = await freshHavok();
  parentPort.on("message", async (job) => {
    if (job === null) { process.exit(0); }
    const started = performance.now();
    try {
      const rows = await runJob(job, physics);
      writeFileSync(join(workerData.out, `${job.id}.json`), JSON.stringify({ job, rows, seconds: (performance.now() - started) / 1000 }));
      parentPort.postMessage({ id: job.id, ok: true, rows: rows.length });
    } catch (error) {
      parentPort.postMessage({ id: job.id, ok: false, error: String(error?.stack ?? error) });
    }
  });
  parentPort.postMessage({ ready: true });
}

// ---------------------------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------------------------

const quantile = (values, q) => {
  const v = values.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const at = (v.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
  return v[lo] + (v[hi] - v[lo]) * (at - lo);
};

/** Agreement of one fork ranking with its reference: pairwise, top-1 and whole-order. */
function agreement(ref, fork) {
  let pairs = 0, agree = 0;
  for (let i = 0; i < ref.length; i += 1) {
    for (let j = i + 1; j < ref.length; j += 1) {
      const r = Math.sign(ref[i] - ref[j]);
      if (r === 0) continue;
      pairs += 1;
      const f = Math.sign(fork[i] - fork[j]);
      agree += f === r ? 1 : f === 0 ? 0.5 : 0;
    }
  }
  const best = Math.max(...ref);
  const bests = ref.filter((x) => x === best).length;
  const top = bests === 1 ? (fork.indexOf(Math.max(...fork)) === ref.indexOf(best)
    && fork.filter((x) => x === Math.max(...fork)).length === 1 ? 1 : 0) : null;
  const order = ref.every((x, i) => ref.every((y, j) => Math.sign(x - y) === Math.sign(fork[i] - fork[j]))) ? 1 : 0;
  return { pairs, agree, top, order, allTied: pairs === 0 };
}

/** A bootstrap over bouts: every moment of a resampled bout comes with it. */
function clusterInterval(clusters, statistic, draws = 2000) {
  let state = 12345;
  const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const out = [];
  for (let d = 0; d < draws; d += 1) {
    const sample = [];
    for (let i = 0; i < clusters.length; i += 1) sample.push(clusters[Math.floor(rand() * clusters.length)]);
    const value = statistic(sample.flat());
    if (value !== null) out.push(value);
  }
  return [quantile(out, 0.025), quantile(out, 0.975)];
}

export function summarise(directory) {
  const files = readdirSync(directory).filter((f) => f.endsWith(".json"));
  const byMind = new Map();
  const rows = [];
  for (const file of files) {
    const { job, rows: r } = JSON.parse(readFileSync(join(directory, file), "utf8"));
    for (const row of r) rows.push(row);
    if (!byMind.has(job.mind)) byMind.set(job.mind, 0);
    byMind.set(job.mind, byMind.get(job.mind) + r.length);
  }
  const summary = { bouts: files.length, moments: rows.length, momentsByMind: Object.fromEntries(byMind) };

  // Divergence.
  for (const loop of DIVERGENCE_KINDS) {
    summary[loop] = {};
    for (const h of HORIZONS) {
      const roots = [], tips = [];
      for (const row of rows) {
        const g = row[loop][h];
        if (!g) continue;
        for (const side of g) { roots.push(side.root); if (side.tip !== null) tips.push(side.tip); }
      }
      summary[loop][h] = {
        n: roots.length,
        rootMedianMm: quantile(roots, 0.5) * 1000, rootP90Mm: quantile(roots, 0.9) * 1000,
        tipMedianMm: quantile(tips, 0.5) * 1000, tipP90Mm: quantile(tips, 0.9) * 1000,
      };
    }
  }

  // Ranking, each fork kind against the replay.
  summary.rank = {};
  for (const kind of RANK_KINDS.filter((k) => k !== "replay")) {
  summary.rank[kind] = {};
  for (const h of RANK_HORIZONS) {
    const items = [];
    for (const row of rows) {
      const ref = PREFIXES.map((p) => row.rank[p].replay[h]);
      const fork = PREFIXES.map((p) => row.rank[p][kind][h]);
      if (ref.some((x) => x === undefined) || fork.some((x) => x === undefined)) continue;
      items.push({ job: row.job, ...agreement(ref, fork), exact: ref.every((x, i) => x === fork[i]) ? 1 : 0 });
    }
    const pairwise = (list) => {
      const p = list.reduce((s, x) => s + x.pairs, 0);
      return p ? list.reduce((s, x) => s + x.agree, 0) / p : null;
    };
    const top = (list) => {
      const t = list.filter((x) => x.top !== null);
      return t.length ? t.reduce((s, x) => s + x.top, 0) / t.length : null;
    };
    const order = (list) => {
      const t = list.filter((x) => !x.allTied);
      return t.length ? t.reduce((s, x) => s + x.order, 0) / t.length : null;
    };
    const byJob = new Map();
    for (const item of items) {
      if (!byJob.has(item.job)) byJob.set(item.job, []);
      byJob.get(item.job).push(item);
    }
    const groups = [...byJob.values()];
    summary.rank[kind][h] = {
      moments: items.length,
      allTied: items.filter((x) => x.allTied).length,
      exactScores: items.filter((x) => x.exact).length,
      pairs: items.reduce((s, x) => s + x.pairs, 0),
      pairwise: pairwise(items), pairwiseCI: clusterInterval(groups, pairwise),
      topMoments: items.filter((x) => x.top !== null).length,
      top1: top(items), top1CI: clusterInterval(groups, top),
      orderMoments: items.filter((x) => !x.allTied).length,
      order: order(items), orderCI: clusterInterval(groups, order),
    };
  }
  }
  // Chance, for the same moments: pairwise 0.5 (a tie in the fork scores half), top-1 one in four.
  summary.chance = { pairwise: 0.5, top1: 1 / PREFIXES.length };

  // Cost.
  const cost = (key) => ({ median: quantile(rows.map((r) => r[key]), 0.5), p90: quantile(rows.map((r) => r[key]), 0.9) });
  summary.cost = {
    captureMs: cost("captureMs"), captureHeapMs: cost("captureHeapMs"),
    buildMs: cost("buildMs"), restoreMs: cost("restoreMs"),
    exactMs: cost("exactMs"), exactBuildMs: cost("exactBuildMs"), exactRestoreMs: cost("exactRestoreMs"),
    forkSecondMs: cost("forkSecondMs"), nodes: cost("nodes"), heapBytes: cost("heapBytes"),
  };
  return summary;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

if (isMainThread && process.argv[1] && fileURLToPath(`file://${process.argv[1].replace(/\\/g, "/")}`) === SELF) {
  const out = arg("out", "research/runs/fork-study");
  if (ARGS.includes("--summary")) {
    console.log(JSON.stringify(summarise(out), null, 2));
  } else {
    mkdirSync(out, { recursive: true });
    const lanes = Math.min(6, Number(arg("lanes", 6)));
    const only = arg("only", null);
    const todo = jobs(Number(arg("seeds", 12)))
      .filter((job) => !existsSync(join(out, `${job.id}.json`)))
      .filter((job) => !only || job.id.startsWith(only));
    console.log(`${todo.length} jobs on ${lanes} lanes -> ${out}`);
    const started = performance.now();
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: Math.min(lanes, todo.length) }, () => new Promise((resolve) => {
      const worker = new Worker(SELF, { workerData: { out } });
      const feed = () => {
        if (next >= todo.length) { worker.postMessage(null); return; }
        worker.postMessage(todo[next++]);
      };
      worker.on("message", (m) => {
        if (m.ready) { feed(); return; }
        done += 1;
        const s = ((performance.now() - started) / 1000).toFixed(0);
        console.log(`[${done}/${todo.length} ${s} s] ${m.id} ${m.ok ? `${m.rows} moments` : `FAILED\n${m.error}`}`);
        feed();
      });
      worker.on("exit", resolve);
      worker.on("error", (e) => { console.error(e); resolve(); });
    })));
  }
}
