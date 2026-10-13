/** Seeded ground starts and the separate, fixed 64-fall target, on Node/Rapier at 120 Hz. */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { HUMANOID_MODELS, modelSpec } from "../src/core/models.ts";
import { groundPostures } from "../src/lab/ground-starts.ts";

const median = values => { const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length ? (sorted[mid] + sorted[(sorted.length - 1) >> 1]) / 2 : null; };
const list = (text, allowed, name) => {
  const values = text.split(",");
  if (!values.length || new Set(values).size !== values.length || values.some(value => !allowed.includes(value))) throw new Error(`invalid ${name}: ${text}`);
  return values;
};

/** Parse only explicit supported controls; the target's physical protocol cannot be overridden. */
export function risingOptions(args) {
  const options = { starts: ["shoved", "dropped"], models: [...HUMANOID_MODELS], held: ["empty", "club"], seeds: [1, 2, 3, 4, 5, 6],
    sub: "support-recovery", balance: 0, gusts: false, target: false, workers: Math.max(1, availableParallelism() - 2), out: null };
  const specified = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]; specified.add(key);
    if (key === "--target" || key === "--gusts") { options[key.slice(2)] = true; continue; }
    const value = args[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`${key} needs a value`);
    switch (key) {
      case "--starts": options.starts = list(value, ["shoved", "dropped", "placed"], "starts"); break;
      case "--models": options.models = list(value, HUMANOID_MODELS, "models"); break;
      case "--held": options.held = list(value, ["empty", "club"], "held"); break;
      case "--seeds": {
        const match = /^(\d+)-(\d+)$/.exec(value);
        options.seeds = match ? Array.from({ length: Number(match[2]) - Number(match[1]) + 1 }, (_, k) => Number(match[1]) + k) : value.split(",").map(Number);
        if (!options.seeds.length || options.seeds.some(seed => !Number.isSafeInteger(seed) || seed < 0) || new Set(options.seeds).size !== options.seeds.length) throw new Error(`invalid seeds: ${value}`);
        break;
      }
      case "--sub": if (value !== "support-recovery") throw new Error(`unsupported sub-mind: ${value}`); options.sub = value; break;
      case "--balance": options.balance = Number(value); if (!Number.isFinite(options.balance) || options.balance < 0) throw new Error(`invalid balance: ${value}`); break;
      case "--workers": options.workers = Number(value); if (!Number.isSafeInteger(options.workers) || options.workers < 1) throw new Error(`invalid workers: ${value}`); break;
      case "--out": options.out = value; break;
      default: throw new Error(`unknown option ${key}`);
    }
  }
  if (options.target && (["--starts", "--models", "--held", "--seeds", "--gusts"].some(key => specified.has(key)) || options.balance !== 0))
    throw new Error("--target fixes models, loadouts, directions, calm air and Balance 0");
  return options;
}

/** Every direction appears once in each target group; everyday shoves span eight directions per seed. */
export function risingJobs(options) {
  const jobs = [];
  if (options.target) {
    for (const model of ["workshop-fighter", "workshop-rogue"]) for (const held of ["empty", "club"]) for (let direction = 0; direction < 16; direction++)
      jobs.push({ model, held, seed: 1, start: "shoved", degrees: direction * 22.5, balance: 0, gusts: false, target: true, sub: options.sub });
  } else for (const model of options.models) for (const held of options.held) for (const seed of options.seeds) for (const start of options.starts) {
    const common = { model, held, seed, start, balance: options.balance, gusts: options.gusts, target: false, sub: options.sub };
    if (start === "shoved") for (let direction = 0; direction < 8; direction++) jobs.push({ ...common, degrees: direction * 45 });
    else if (start === "placed") for (const posture of groundPostures(modelSpec(model))) jobs.push({ ...common, posture });
    else jobs.push(common);
  }
  return jobs.map((job, id) => ({ ...job, id }));
}

/** Failures remain in denominators and in the capped median; hand-back and verified standing stay separate. */
export function risingReport(rows, target = false) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.start}/${row.model}/${row.held}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const time = row => row.stood ? (target ? row.verified : row.handback) : null;
  const successful = (row, within = Infinity) => time(row) !== null && time(row) <= within;
  const groups = [...grouped].map(([key, cases]) => ({ key, all: cases.length, stood: cases.filter(row => successful(row)).length,
    within6: cases.filter(row => successful(row, 6)).length, within12: cases.filter(row => successful(row, 12)).length,
    median: median(cases.map(row => time(row) ?? 30)), rejected: cases.filter(row => row.status === "rejected start").length,
    landedStanding: cases.filter(row => row.status === "landed standing").length,
    phaseSeconds: Object.fromEntries([...new Set(cases.flatMap(row => Object.keys(row.phases)))].map(phase => [phase,
      cases.reduce((sum, row) => sum + (row.phases[phase] ?? 0), 0) / cases.length])) }));
  let gates = null;
  if (target) {
    const expected = risingJobs({ target: true, sub: "support-recovery" }).map(row => `${row.model}/${row.held}/${row.degrees}`).sort();
    const actual = rows.map(row => `${row.model}/${row.held}/${row.degrees}`).sort();
    const complete = JSON.stringify(actual) === JSON.stringify(expected);
    gates = { completeUniqueDirections: complete, balanceZero: rows.every(row => row.balance === 0),
      eachGroup15of16: complete && groups.every(group => group.within6 >= 15),
      total61of64: complete && rows.filter(row => successful(row, 6)).length >= 61,
      allCardinals: complete && rows.filter(row => row.degrees % 90 === 0).every(row => successful(row, 6)),
      median4: complete && median(rows.map(row => time(row) ?? 30)) <= 4 };
  }
  return { harness: "Node stand, core World, Rapier, 120 Hz", mode: target ? "owner target" : "everyday bed", cap: 30,
    groups, gates, claims: { beatsSupportRecovery: "requires comparison with the saved reference on identical cases",
      meetsOwnerTarget: gates === null ? "not evaluated by the everyday bed" : Object.values(gates).every(Boolean),
      assist: { balances: [...new Set(rows.map(row => row.balance))], forceImpulse: rows.reduce((sum, row) => sum + (row.assist?.forceImpulse ?? 0), 0),
        momentImpulse: rows.reduce((sum, row) => sum + (row.assist?.momentImpulse ?? 0), 0) } }, rows };
}

async function run(options) {
  const jobs = risingJobs(options), rows = [], workers = [], queue = [...jobs];
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
        rows.push(row); process.stderr.write(`${rows.length}/${jobs.length} ${job.model} ${job.held} ${job.start} ${row.status}\n`);
      }
    }));
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
  rows.sort((a, b) => a.id - b.id);
  const report = risingReport(rows, options.target), json = JSON.stringify(report, null, 2) + "\n";
  if (options.out) await writeFile(options.out, json);
  process.stdout.write(json);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(risingOptions(process.argv.slice(2))).catch(error => { console.error(error); process.exitCode = 1; });
