/** Fixed-budget backward chaining for the experimental plant-up, on Node/Rapier at 120 Hz. */
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { availableParallelism } from "node:os";
import { cmaSearch, workerPool } from "./cma.mjs";
import { PLANT_UP } from "../src/core/recovery/ground/plant-up.ts";
import { risingImplementation } from "./rising-provenance.mjs";

/** Control choices only: fixed reached predicates, failure windows and deadlines have no dimensions. */
const dimensions = [
  ["within", .04, .45], ["top", 1, 8], ["response", .1, .8], ["plantLoad", .06, .3],
  ["transferLoad", .4, .9], ["height", .5, .95], ["pitch", 0, 1.3],
  ["brace:hip.@ flexion", -.35, .35], ["brace:knee.@ flexion", -.35, .35], ["brace:wrist.@ flexion", -.3, .3],
  ["brace:shoulder.@ flexion", -.4, .4], ["plant:hip.left flexion", -.5, .5], ["plant:knee.left flexion", -.5, .5],
  ["plant:ankle.left dorsiflexion", -.3, .3], ["plant:shoulder.@ flexion", -.4, .4],
  ["transfer:lumbar flexion", -.3, .3], ["transfer:hip.@ flexion", -.4, .4], ["transfer:knee.@ flexion", -.4, .4],
  ["rise:lumbar flexion", -.35, .35], ["rise:thoracic flexion", -.3, .3], ["rise:hip.@ flexion", -.35, .35],
  ["rise:knee.@ flexion", 0, .4], ["rise:ankle.@ dorsiflexion", -.2, .3],
];

/** A unit cube maps to immutable phase control inputs, not to success criteria. */
export function plantSettings(u) {
  if (!Array.isArray(u) || u.length !== dimensions.length || u.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("invalid plant-up unit cube");
  const tuning = { ...PLANT_UP, posture: {} };
  dimensions.forEach(([key, lo, hi], i) => {
    const value = lo + (hi - lo) * u[i], split = key.indexOf(":");
    if (split < 0) tuning[key] = value;
    else {
      const phase = key.slice(0, split), channel = key.slice(split + 1), posture = tuning.posture[phase] ??= {};
      if (channel.includes("@")) for (const side of ["left", "right"]) posture[channel.replace("@", side)] = value;
      else posture[channel] = value;
    }
  });
  return tuning;
}

/** Last waypoint, earlier waypoints, genuine predecessor ends, then falls; exactly eight cases each. */
export function searchStarts(stage) {
  const seeds = Array.from({ length: 8 }, (_, i) => i + 1);
  switch (stage) {
    case "last": return seeds.map(seed => ({ start: "placed", posture: "squat", waypoint: "installed", seed }));
    case "earlier": return seeds.map(seed => ({ start: "placed", posture: seed % 2 ? "half-kneel" : "fours", waypoint: "installed", seed }));
    case "predecessor": return seeds.map(seed => ({ start: "placed", posture: seed % 2 ? "back" : "right", after: "roll", seed }));
    case "falls": return seeds.map(seed => seed <= 4 ? { start: "shoved", seed, degrees: (seed - 1) * 90 } : { start: "dropped", seed });
    default: throw new Error(`unknown backward stage ${stage}`);
  }
}

/** One additional reached case outweighs every possible survival/time change; survival outranks time. */
export function techniqueScore(rows) {
  return rows.reduce((sum, row) => sum + (row.reached ? 10000 : 0) + (row.reached && row.survived ? 100 : 0)
    + (row.reached ? 8 - Math.min(8, row.seconds) : 0), 0);
}

/** The budget counts every attempted episode, including rejected geometry and failed predecessors. */
export function searchSchedule() {
  const ordinary = ["last", "earlier", "predecessor", "falls"].map(stage => ({ name: stage, stage, factor: 1, generations: 40, lambda: 12, starts: 8, episodes: 3840 }));
  let factor = 1.5;
  const discover = Array.from({ length: 10 }, (_, i) => {
    const row = { name: `strength-${i}`, stage: "earlier", factor: Math.max(1, factor), generations: 20, lambda: 12, starts: 8, episodes: 1920 };
    factor *= .95; return row;
  });
  return [...ordinary, ...discover];
}

async function search(args) {
  const options = { model: "workshop-fighter", workers: Math.max(1, Math.min(4, availableParallelism() - 2)), out: "research/runs/rising/warrior", seed: 1, resume: false };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--resume") { options.resume = true; continue; }
    const value = args[++i]; if (!value) throw new Error(`${key} needs a value`);
    switch (key) {
      case "--model": if (!["workshop-fighter", "workshop-rogue"].includes(value)) throw new Error(`invalid model ${value}`); options.model = value; break;
      case "--workers": options.workers = Number(value); break;
      case "--out": options.out = value; break;
      case "--seed": options.seed = Number(value); break;
      default: throw new Error(`unknown search option ${key}`);
    }
  }
  if (!Number.isSafeInteger(options.workers) || options.workers < 1 || !Number.isSafeInteger(options.seed)) throw new Error("invalid search workers or seed");
  const path = `${options.out}.json`, schedule = searchSchedule();
  await mkdir(dirname(path), { recursive: true });
  let record;
  if (options.resume) {
    record = JSON.parse(await readFile(path, "utf8"));
    if (record.model !== options.model || JSON.stringify(record.schedule) !== JSON.stringify(schedule)) throw new Error("incompatible rising-search checkpoint");
  } else {
    try { await readFile(path); throw new Error(`checkpoint already exists: ${path}; use --resume`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const start = dimensions.map(([key, lo, hi]) => key.includes(":") ? Math.max(0, Math.min(1, -lo / (hi - lo))) : (PLANT_UP[key] - lo) / (hi - lo));
    record = { harness: "Node stand, core World, Rapier, 120 Hz", model: options.model, balance: 0, cap: 8,
      schedule, budget: 34560, episodes: 0, stage: 0, start, stages: [], checkpoint: null, completed: false };
  }
  for (; record.stage < schedule.length; record.stage++) {
    const task = schedule[record.stage], source = await risingImplementation();
    if (record.checkpoint && JSON.stringify(source) !== JSON.stringify(record.implementation)) throw new Error("implementation changed since this stage's checkpoint");
    record.implementation = source;
    const pool = workerPool(new URL("./rising-search-worker.mjs", import.meta.url), { model: options.model, stage: task.stage, factor: task.factor }, options.workers);
    try {
      const reserved = record.reserved?.[record.stage] ?? 0;
      const generations = task.generations - reserved / (task.lambda * task.starts);
      const result = await cmaSearch({ n: dimensions.length, start: record.start, sigma: .2, lambda: task.lambda, generations,
        seed: options.seed + record.stage, resume: record.checkpoint ?? undefined, score: u => pool.evaluate(u),
        async onGeneration(entry, progress) {
          const snapshot = progress.checkpoint;
          record.checkpoint = snapshot;
          record.episodes = record.stages.reduce((sum, stage) => sum + stage.episodes, 0) + reserved + snapshot.generation * task.lambda * task.starts;
          await writeFile(path, JSON.stringify(record));
          await appendFile(`${options.out}.jsonl`, JSON.stringify({ stage: task.name, factor: task.factor, ...entry, episodes: record.episodes }) + "\n");
          process.stderr.write(`${options.model} ${task.name} ${snapshot.generation}/${generations}, reached ${snapshot.best.r?.reached ?? 0}/8, ${record.episodes}/${record.budget} episodes\n`);
        } });
      record.start = result.best.u;
      record.stages.push({ ...task, implementation: source, best: result.best, tuning: plantSettings(result.best.u) });
      record.checkpoint = null;
    } finally { await pool.terminate(); }
    await writeFile(path, JSON.stringify({ ...record, stage: record.stage + 1 }));
  }
  record.completed = record.episodes === record.budget;
  await writeFile(path, JSON.stringify(record));
  process.stdout.write(JSON.stringify({ model: record.model, completed: record.completed, episodes: record.episodes, budget: record.budget, stages: record.stages.map(({ name, best }) => ({ name, reached: best.r.reached, survived: best.r.survived })) }, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  search(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
