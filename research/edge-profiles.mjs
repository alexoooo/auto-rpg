/**
 * **The ground Options' profiles** (`assets/core/edge-profiles.json`, in the profiles' one type,
 * `src/core/skills/framework/profile.ts`): Option Mind, the game's preset on its priors alone,
 * rising from the stand-up target's falls (`risingJobs`) turned by offsets neither of its protocols
 * plays (`--offsets`), every body in every loadout; each try of a ground technique it runs is a
 * trial begun where the body lay (`groundStart`): a way up or a reposition, flatten, and a brace
 * while a way up does not yet admit the body (`BRACE_TUMBLING_OPTION`, calm). A trial runs from its
 * try's start until the mind next begins an Option other than a brace while tumbling or a landing:
 * what the try costs before the next choice, the body's tumbling after it included. It is done
 * where its Option noted it done and the body is then where it goes (a way up's edge, on its feet
 * for one to standing; flatten's lie; a brace's, where a way up is begun next); else it ended down
 * where the body lies then (`Trial.end`).
 * Each profile names what it was measured on: the body as the fall builds it, the technique's
 * config, the world's rate and the command's delay. Node, core world, Rapier, 120 Hz.
 *
 *   node research/edge-profiles.mjs [--offsets 5.625,16.875] [--workers N] [--write]
 */
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { Worker, isMainThread, parentPort } from "node:worker_threads";

const OUT = new URL("../assets/core/edge-profiles.json", import.meta.url);
/** The Options a trial waits through before the next choice: what the body does while it cannot yet choose. */
const WAITS = new Set(["brace while tumbling", "land"]);
/** A mean of seconds as the profiles keep it: to the millisecond. */
const round = (x) => Number(x.toFixed(3));

/** One fall played to its end: each ground try as a trial, keyed by the technique it ran. */
async function trialsOf(job) {
  await import("../tests/harness/preload-data.mjs");
  const { buildFall } = await import("../src/evaluation/fall.ts");
  const { MINDS } = await import("../src/entrants/game.ts");
  const { OPTIONS } = await import("../src/core/option/kinds.ts");
  const { TECHNIQUES } = await import("../src/core/recovery/ground/techniques.ts");
  const { tumbling } = await import("../src/core/control/ground-reading.ts");
  const { groundStart, measuredOn, techniqueDigest } = await import("../src/core/skills/framework/profile.ts");
  // Its priors alone (`PRIOR_PREDICTIONS`), so what it measures does not depend on what it measured before.
  const mind = { ...MINDS.option.config, predictions: { kind: "prior" } };
  /** Each ground Option measured and the technique it runs: a way up's and flatten's named as their technique, a brace while tumbling as itself. */
  const skills = new Map();
  for (const option of mind.options ?? OPTIONS) {
    if (!option.skill || option.kind === "brace-down" || option.kind === "steadying" || option.kind === "landing") continue;
    skills.set(option.kind === "brace-tumbling" ? "brace while tumbling" : option.skill.kind, option.skill);
  }
  const built = await buildFall({ ...job, mind }, "rapier");
  const spec = built.combatant.body.built.spec, hz = built.world.hz, delay = built.world.delay;
  const trials = [], open = [], waiting = [];
  let phase = null, tried = new Map();
  /** Where `trial`'s Option takes the body: a way up's edge from where it began, flatten's lie. */
  const toOf = (trial) => trial.name === "flatten" ? trial.lie
    : TECHNIQUES[trial.name]?.edges.find((edge) => edge.from === trial.from)?.to ?? null;
  const reached = (trial, g, stood, next) => trial.name === "brace while tumbling" ? next !== null && skills.has(next) && !WAITS.has(next) && next !== "flatten"
    : trial.noted && (toOf(trial) === "standing" ? stood || g === null || g.onFeet : g !== null && g.position === toOf(trial));
  const close = (trial, t, g, stood, next) => {
    const done = reached(trial, g, stood, next), standing = done && (toOf(trial) === "standing");
    trials.push({ skill: skills.get(trial.name), from: trial.from, done, seconds: round(t - trial.at), down: !standing,
      ...(done ? {} : { end: g ? (g.onFeet ? "crouch" : g.position) : "standing" }) });
  };
  try {
    while (!built.ended) {
      built.world.step();
      built.afterStep();
      const c = built.combatant, t = built.world.time, g = c.body.view.ground, now = c.minded.report?.engagement?.phase ?? null;
      // A try noted in the mind's record: its Option's start, done or not.
      for (const entry of c.minded.state.decider.record.tried) {
        const key = `${entry.name} ${entry.from}`, was = tried.get(key) ?? { tries: 0, done: 0 };
        if (entry.tries > was.tries) {
          const trial = open.findLast((one) => one.name === entry.name);
          if (trial) { trial.from = entry.from; trial.noted = entry.done > was.done; }
        }
        tried.set(key, { tries: entry.tries, done: entry.done });
      }
      if (now === phase) continue;
      // The tries begun before this one end where the mind chooses again.
      if (!WAITS.has(now)) { for (const trial of waiting.splice(0)) close(trial, t, g, false, now); }
      else if (now === "brace while tumbling" && g && !tumbling(g)) waiting.push({ name: now, at: t, from: g.position });
      if (phase !== null && skills.has(phase) && !WAITS.has(phase)) {
        const i = open.findLastIndex((one) => one.name === phase);
        if (i >= 0) { const [trial] = open.splice(i, 1); if (WAITS.has(now)) waiting.push(trial); else close(trial, t, g, false, now); }
      }
      if (now !== null && skills.has(now) && !WAITS.has(now) && g) open.push({ name: now, at: t, from: g.position, lie: g.lie, noted: false });
      phase = now;
    }
    const r = built.reading(), stood = r.stood && r.verified !== null, g = built.combatant.body.view.ground, t = built.world.time;
    for (const trial of [...open, ...waiting]) close(trial, t, g, stood, null);
    return trials.map((trial) => ({ ...trial, measured: measuredOn(spec, techniqueDigest(trial.skill), hz, null, hz, delay), postures: groundStart(trial.from) }));
  } finally { built.dispose(); }
}

if (isMainThread) {
  const { values } = parseArgs({ options: { offsets: { type: "string", default: "5.625,16.875" }, workers: { type: "string" }, write: { type: "boolean", default: false } } });
  await import("../tests/harness/preload-data.mjs");
  const { risingJobs } = await import("../src/evaluation/rising.ts");
  const offsets = values.offsets.split(",").map(Number);
  const jobs = offsets.flatMap((offset) => risingJobs({ target: true, offset })).map(({ model, loadout, seed, start, degrees, balance, grit, gusts }) =>
    ({ model, loadout, seed, start, degrees, balance, grit, gusts, target: true }));
  const count = Math.min(jobs.length, Number(values.workers ?? Math.max(1, availableParallelism() - 2)));
  // Each fall's trials kept by its place among the falls, so the profiles do not depend on which worker ends first.
  const started = Date.now(), byFall = [], queue = jobs.map((job, i) => [i, job]);
  await Promise.all(Array.from({ length: count }, () => new Promise((done, fail) => {
    const worker = new Worker(new URL(import.meta.url));
    const next = () => { const item = queue.shift(); if (item) worker.postMessage(item); else worker.terminate().then(done); };
    worker.on("message", ([i, trials]) => { byFall[i] = trials; next(); });
    worker.on("error", fail);
    next();
  })));
  const profiles = new Map();
  const all = byFall.flat();
  for (const trial of all) {
    const key = JSON.stringify(trial.measured), profile = profiles.get(key) ?? { measured: trial.measured, label: `${trial.measured.body} ${trial.skill.kind}`, trials: [] };
    profiles.set(key, profile);
    profile.trials.push({ start: { range: 0, phase: "clear", postures: trial.postures }, done: trial.done, dealt: 0, taken: 0, seconds: trial.seconds, recovers: null, down: trial.down,
      ...(trial.end ? { end: trial.end } : {}) });
  }
  const sorted = [...profiles.values()].sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : a.measured.spec < b.measured.spec ? -1 : 1);
  console.log(`edge profiles: ${all.length} trials in ${sorted.length} profiles, offsets ${offsets.join(", ")}; Node, core world, Rapier, 120 Hz; ${((Date.now() - started) / 1000).toFixed(0)} s`);
  for (const p of sorted) {
    const byFrom = new Map();
    for (const t of p.trials) { const f = byFrom.get(t.start.postures.own) ?? { n: 0, done: 0, seconds: 0 }; f.n++; f.done += t.done ? 1 : 0; f.seconds += t.seconds; byFrom.set(t.start.postures.own, f); }
    console.log(`${p.label} ${p.measured.spec}: ${[...byFrom].map(([from, f]) => `from ${from} ${f.done}/${f.n} done, ${(f.seconds / f.n).toFixed(2)} s`).join("; ")}`);
  }
  const out = { source: { script: "research/edge-profiles.mjs", falls: "rising-target", offsets }, profiles: sorted.map((p) => ({ measured: p.measured, target: null, trials: p.trials })) };
  // A trial a line: the file stays readable at a few thousand trials.
  const text = `{\n  "source": ${JSON.stringify(out.source)},\n  "profiles": [\n${out.profiles.map((p) =>
    `    { "measured": ${JSON.stringify(p.measured)}, "target": null, "trials": [\n${p.trials.map((t) => `      ${JSON.stringify(t)}`).join(",\n")}\n    ] }`).join(",\n")}\n  ]\n}\n`;
  if (values.write) writeFileSync(OUT, text);
} else {
  parentPort.on("message", async ([i, job]) => parentPort.postMessage([i, await trialsOf(job)]));
}
