/**
 * **The locomotion test bed on the Node stand** (Rapier, 120 Hz): the Lab's Run (`startRun`,
 * `src/lab/run-mode.ts`) on every combination of body, track, pace asked, wind and seed, each run
 * for `--seconds` or until the body falls. A fall ends a run as a failure.
 *
 *   node research/locomotion-run.mjs [--models workshop-fighter,workshop-rogue] [--tracks square,circle]
 *     [--paces 0.5,1,1.5] [--winds 0:0,1:50] [--seeds 1,2] [--seconds 30] [--side 6] [--radius 4]
 *     [--legs '{"kind":"stance-walk"}'] [--stance '{...}'] [--workers 16] [--out runs.jsonl]
 *
 * - `--winds` is a list of rate:strength (gusts a second : N at a gust's peak).
 * - `--legs` is the mind's locomotion part (`FighterConfig.locomotion`); the rest of the mind is
 *   the Lab's Script preset (`LAB_PRESETS`).
 * - `--stance` is an experiment's stance tuning (`StanceTuning`), whose body has no envelope: its
 *   walk is not capped by one. Its `gait` merges into `STANCE_GAIT`.
 *
 * Each run's record goes to `--out` as a line of JSON if asked. The summary, per body, track and
 * wind: at each pace, the runs that fell (and on which piece of the track), the mean speed along the
 * track and each side's; and the fastest pace at which no seed fell, with every slower one.
 *
 * Runs go in parallel on worker threads, one stand at a time in each.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { appendFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

/** One run: its record, as the run's last frame left it. */
async function runOnce({ model, track: id, pace, wind, seed, seconds, side, radius, legs, stance }) {
  const [{ humanSpec }, { labActor }, { startRun }, { TRACKS, trackOf }, { LAB_PRESETS }, { STANCE_GAIT }, { coreStand }] = await Promise.all([
    import("../src/core/human/spec.ts"), import("../src/lab/actor.ts"), import("../src/lab/run-mode.ts"), import("../src/lab/track.ts"),
    import("../src/lab/scenarios.ts"), import("../src/core/control/stance-tuning.ts"), import("../tests/harness/core-stand.mjs"),
  ]);
  const info = TRACKS[id], size = id === "square" ? side : id === "circle" ? radius : undefined;
  const track = trackOf(info.size && size !== undefined ? info.size.of(size) : info.pieces);
  const stand = await coreStand(humanSpec(model), { ground: true });
  const mind = { ...LAB_PRESETS.script.config, ...(legs ? { locomotion: legs } : {}) };
  const tuning = stance ? { ...stance, ...(stance.gait ? { gait: { ...STANCE_GAIT, ...stance.gait } } : {}) } : undefined;
  const run = startRun(labActor(stand.built, stand.world, { mind, stance: tuning }), track, { top: pace, facing: info.facing, wind: { settings: wind, seed } });
  let frame = run.frame(), off = 0, fellOn = null;
  try {
    while (frame.time < seconds && !frame.fallen) {
      stand.step(stand.seconds(0.1));
      frame = run.frame();
      if (frame.time > 1) off = Math.max(off, frame.off);
    }
    if (frame.fallen) fellOn = track.piece(frame.along);
  } finally { run.dispose(); stand.dispose(); }
  return {
    model, track: id, pace, wind, seed, fell: frame.fallen ? +frame.time.toFixed(2) : null, fellOn,
    travelled: +frame.travelled.toFixed(3), mean: +frame.mean.toFixed(3), walking: frame.walking, off: +off.toFixed(3),
    pieces: frame.pieces.map((v) => v === null ? null : +v.toFixed(3)), gait: Object.fromEntries(Object.entries(frame.gait).map(([k, v]) => [k, +v.toFixed(3)])),
    gusts: frame.gusts,
  };
}

if (!isMainThread) {
  parentPort.on("message", async (job) => {
    try { parentPort.postMessage({ id: job.id, result: await runOnce(job) }); }
    catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
  });
} else {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const list = (name, fallback) => arg(name, fallback).split(",");
  const models = list("models", "workshop-fighter,workshop-rogue"), tracks = list("tracks", "square");
  const paces = list("paces", "0.5,0.7,1,1.4").map(Number), seeds = list("seeds", "1,2").map(Number);
  const winds = list("winds", "0:0").map((w) => { const [rate, strength] = w.split(":").map(Number); return { rate, strength }; });
  const seconds = Number(arg("seconds", "30")), side = Number(arg("side", "6")), radius = Number(arg("radius", "4"));
  const legs = arg("legs") ? JSON.parse(arg("legs")) : null, stance = arg("stance") ? JSON.parse(arg("stance")) : null;
  const out = arg("out"), workers = Math.min(Number(arg("workers", String(Math.max(1, availableParallelism() - 2)))), 64);

  const jobs = [];
  for (const model of models) for (const track of tracks) for (const wind of winds) for (const pace of paces) for (const seed of seeds)
    jobs.push({ id: jobs.length, model, track, pace, wind, seed, seconds, side, radius, legs, stance });
  // A calm wind blows the same on every seed: one seed is enough.
  const todo = jobs.filter((job) => job.wind.rate > 0 && job.wind.strength > 0 || job.seed === seeds[0]);
  const results = [];
  const started = Date.now();
  await new Promise((resolve, reject) => {
    let next = 0, done = 0;
    const pool = Array.from({ length: Math.min(workers, todo.length) }, () => new Worker(fileURLToPath(import.meta.url)));
    const feed = (worker) => { if (next < todo.length) worker.postMessage(todo[next++]); };
    for (const worker of pool) {
      worker.on("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        results.push(result);
        if (out) appendFileSync(out, `${JSON.stringify(result)}\n`);
        if (++done === todo.length) { pool.forEach((w) => w.terminate()); resolve(); } else feed(worker);
      });
      worker.on("error", reject);
      feed(worker);
    }
  });
  console.log(`${results.length} runs in ${((Date.now() - started) / 60000).toFixed(1)} min: Node stand, Rapier, 120 Hz, ${seconds} s, legs ${JSON.stringify(legs ?? "Script preset's")}${stance ? `, stance ${JSON.stringify(stance)}` : ""}`);
  for (const model of models) for (const track of tracks) for (const wind of winds) {
    console.log(`\n${model} ${track} wind ${wind.rate}/s ${wind.strength} N`);
    let held = null, holding = true;
    for (const pace of paces) {
      const rows = results.filter((r) => r.model === model && r.track === track && r.pace === pace && r.wind.rate === wind.rate && r.wind.strength === wind.strength);
      const fell = rows.filter((r) => r.fell !== null), mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
      const pieces = rows[0].pieces.map((_, i) => { const v = rows.map((r) => r.pieces[i]).filter((x) => x !== null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : "-"; });
      const g = (k) => (rows.reduce((s, r) => s + r.gait[k], 0) / rows.length).toFixed(2);
      console.log(`  pace ${pace.toFixed(2)}: fell ${fell.length}/${rows.length}${fell.length ? ` (at ${fell.map((r) => `${r.fell}s piece ${r.fellOn}`).join(", ")})` : ""}`
        + ` walked ${rows[0].walking.toFixed(2)} mean ${mean("mean").toFixed(2)} sides ${pieces.join("/")} off ${mean("off").toFixed(2)}`
        + ` step ${g("step")} cadence ${g("cadence")} double ${g("double")} flight ${g("flight")}`);
      if (holding && fell.length === 0) held = { pace, mean: mean("mean") }; else holding = false;
    }
    console.log(`  fastest held: ${held ? `asked ${held.pace}, ${held.mean.toFixed(2)} m/s along the track` : "none"}`);
  }
}
