/**
 * Seeded ground starts and the separate, fixed 64-fall target, on Node/Rapier at 120 Hz; with
 * `--loadouts left,right;...`, the target's sixteen shoves of each model on those loadouts instead,
 * which is not the target.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";
import { writeFile, appendFile } from "node:fs/promises";
import { loadoutFaults, loadoutKey } from "../src/core/items/held.ts";
import { HUMANOID_MODELS, modelSpec } from "../src/core/models.ts";
import { TECHNIQUES } from "../src/core/recovery/ground/techniques.ts";
import { partLookup } from "../src/entrants/game.ts";
import { risingImplementation } from "./rising-provenance.mjs";
import { risingJobs, risingMind, risingReport } from "../src/evaluation/rising.ts";

const list = (text, allowed, name) => {
  const values = text.split(",");
  if (!values.length || new Set(values).size !== values.length || values.some(value => !allowed.includes(value))) throw new Error(`invalid ${name}: ${text}`);
  return values;
};

/** Parse only explicit supported controls; the target's physical protocol cannot be overridden. */
export function risingOptions(args) {
  const options = { starts: ["shoved", "dropped"], models: [...HUMANOID_MODELS], held: ["empty", "club"], seeds: [1, 2, 3, 4, 5, 6],
    sub: "support-recovery", techniques: null, technique: null, after: null, balance: 0, gusts: false, target: false, obstacles: false, loadouts: null, workers: Math.max(1, availableParallelism() - 2), out: null };
  const specified = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]; specified.add(key);
    if (key === "--target" || key === "--gusts" || key === "--obstacles") { options[key.slice(2)] = true; continue; }
    const value = args[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`${key} needs a value`);
    switch (key) {
      case "--starts": options.starts = list(value, ["shoved", "dropped", "placed"], "starts"); break;
      case "--models": options.models = list(value, HUMANOID_MODELS, "models"); break;
      case "--held": options.held = list(value, ["empty", "club"], "held"); break;
      case "--loadouts": {
        options.loadouts = value.split(";").map((pair) => { const [left, right, ...rest] = pair.split(","); return rest.length ? null : { left, right }; });
        if (options.loadouts.some((loadout) => loadout === null || loadoutFaults(loadout).length > 0) || new Set(options.loadouts.map(loadoutKey)).size !== options.loadouts.length) throw new Error(`invalid loadouts: ${value}`);
        break;
      }
      case "--seeds": {
        const match = /^(\d+)-(\d+)$/.exec(value);
        options.seeds = match ? Array.from({ length: Number(match[2]) - Number(match[1]) + 1 }, (_, k) => Number(match[1]) + k) : value.split(",").map(Number);
        if (!options.seeds.length || options.seeds.some(seed => !Number.isSafeInteger(seed) || seed < 0) || new Set(options.seeds).size !== options.seeds.length) throw new Error(`invalid seeds: ${value}`);
        break;
      }
      case "--sub": if (!["support-recovery", "stand-up"].includes(value)) throw new Error(`unsupported sub-mind: ${value}`); options.sub = value; break;
      case "--technique": case "--after":
        if (!Object.hasOwn(TECHNIQUES, value)) throw new Error(`unknown technique: ${value}`);
        options[key.slice(2)] = value; break;
      case "--techniques": options.techniques = list(value, Object.keys(TECHNIQUES), "techniques"); break;
      case "--balance": options.balance = Number(value); if (!Number.isFinite(options.balance) || options.balance < 0) throw new Error(`invalid balance: ${value}`); break;
      case "--workers": options.workers = Number(value); if (!Number.isSafeInteger(options.workers) || options.workers < 1) throw new Error(`invalid workers: ${value}`); break;
      case "--out": options.out = value; break;
      default: throw new Error(`unknown option ${key}`);
    }
  }
  if (options.target && (["--starts", "--models", "--held", "--seeds", "--gusts"].some(key => specified.has(key)) || options.balance !== 0))
    throw new Error("--target fixes models, loadouts, directions, calm air and Balance 0");
  if (options.obstacles && (options.target || options.technique || ["--starts", "--models", "--held", "--seeds", "--gusts"].some(key => specified.has(key)) || options.balance !== 0))
    throw new Error("--obstacles is separate from --target and fixes models, loadouts, directions, calm air and Balance 0");
  if (options.loadouts && (options.target || options.obstacles || options.technique || ["--starts", "--held", "--seeds", "--gusts"].some(key => specified.has(key)) || options.balance !== 0))
    throw new Error("--loadouts plays the target's shoves on other loadouts: it fixes directions, calm air and Balance 0, and is not the target");
  if (options.loadouts && !specified.has("--models")) options.models = ["workshop-fighter", "workshop-rogue"];
  if (options.after && !options.technique) throw new Error("--after requires --technique");
  if (options.techniques) {
    if (options.technique || specified.has("--sub") && options.sub !== "stand-up") throw new Error("--techniques configures the stand-up sub-mind");
    options.sub = "stand-up";
  }
  if (options.technique && (options.target || options.balance !== 0 || options.gusts)) throw new Error("standalone techniques use calm Balance 0 eight-second trials, separately from --target");
  const fits = (model) => { const technique = TECHNIQUES[options.technique]; return technique.fits(modelSpec(model), technique.defaults, partLookup) === null; };
  if (options.technique && !specified.has("--models")) options.models = options.models.filter(fits);
  if (options.technique && !options.models.every(fits)) throw new Error("technique does not fit every selected model");
  return options;
}

async function run(options) {
  const jobs = risingJobs(options), rows = [], workers = [], queue = [...jobs];
  const provenance = { options, mind: risingMind(options.sub, options.techniques ?? undefined), implementation: await risingImplementation(["research/rising-bed.mjs", "research/rising-worker.mjs", "src/evaluation/rising.ts"]) };
  if (options.out) {
    await writeFile(`${options.out}.meta.json`, JSON.stringify(provenance));
    await writeFile(`${options.out}.jsonl`, "");
  }
  try {
    await Promise.all(Array.from({ length: Math.min(options.workers, jobs.length) }, async () => {
      const worker = new Worker(new URL("./rising-worker.mjs", import.meta.url)); workers.push(worker);
      while (queue.length) {
        const job = queue.shift();
        const row = await new Promise((resolve, reject) => {
          const message = result => { clean(); result.error ? reject(new Error(result.error)) : resolve(result.result); };
          const failure = error => { clean(); reject(error); };
          const ended = code => failure(new Error(`rising worker exited ${code}`));
          const clean = () => { worker.off("message", message); worker.off("error", failure); worker.off("exit", ended); };
          worker.once("message", message); worker.once("error", failure); worker.once("exit", ended); worker.postMessage(job);
        });
        rows.push(row);
        if (options.out) await appendFile(`${options.out}.jsonl`, JSON.stringify(row) + "\n");
        process.stderr.write(`${rows.length}/${jobs.length} ${job.model} ${job.loadout ? loadoutKey(job.loadout) : job.held} ${job.start} ${row.status}\n`);
      }
    }));
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
  rows.sort((a, b) => a.id - b.id);
  const report = { ...risingReport(rows, options.target), provenance }, json = JSON.stringify(report, null, 2) + "\n";
  if (options.out) await writeFile(options.out, json);
  process.stdout.write(json);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(risingOptions(process.argv.slice(2))).catch(error => { console.error(error); process.exitCode = 1; });
