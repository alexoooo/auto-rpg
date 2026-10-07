/**
 * **The placed blow's sweep** (`PLACED`, `src/core/skills/strike.ts`): the targets' battery
 * (`core-targets.mjs`, each target on a run of its own, the walk out to it included) at every
 * cell of `--stretch` by `--seconds` by `--through`, each given to the skills in place of the
 * blow set (`RecipeOptions.placed`). A cell reads its placed blows alone: a target a recipe was
 * thrown at is the same in every cell.
 *
 *   node research/core-placed.mjs [--stretch 0.8,0.9,1,1.1] [--seconds 0.25,0.4,0.6] [--through 0.1,0.15,0.25]
 *     [--models workshop-fighter,workshop-rogue,crypt-skeleton] [--held empty,club] [--targets 10] [--seeds 1,2,3]
 *     [--hz 120] [--workers 14]
 *
 * Prints, per thing held and cell: the placed blows thrown, those that hit, and the hits of the
 * blows in each stratum, their damage a blow thrown (a miss is none) and a hit (HP), the hits'
 * mean closing speed (m/s), the mean of how near the misses passed (cm), the targets whose place
 * the body filled through its blow (no dummy was hung), the readings a fall closed, and the
 * targets left unread. Node core stand, Rapier, no assist, the arena's rules.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";

const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const shown = (value, digits) => value === null ? "-" : value.toFixed(digits);

if (isMainThread) {
  const [{ HUMANOID_MODELS: BODY_MODELS }, { HELD }, { PLACED }] = await Promise.all([
    import("../src/core/models.ts"), import("../src/core/items/held.ts"), import("../src/core/skills/strike.ts")]);
  const { values } = parseArgs({ options: {
    stretch: { type: "string", default: "0.8,0.9,1,1.1" }, seconds: { type: "string", default: "0.25,0.4,0.6" }, through: { type: "string", default: "0.1,0.15,0.25" },
    models: { type: "string", default: "workshop-fighter,workshop-rogue,crypt-skeleton" }, held: { type: "string", default: "empty,club" },
    targets: { type: "string", default: "10" }, seeds: { type: "string", default: "1,2,3" }, hz: { type: "string", default: "120" },
    workers: { type: "string" },
  } });
  const numbers = (list) => list.split(",").map(Number);
  const models = values.models.split(","), helds = values.held.split(","), seeds = numbers(values.seeds);
  for (const model of models) if (!BODY_MODELS.includes(model)) throw new Error(`--models names no body: ${model} (one of ${BODY_MODELS.join(", ")})`);
  for (const held of helds) if (!HELD.includes(held)) throw new Error(`--held names nothing the lab holds: ${held} (one of ${HELD.join(", ")})`);
  const targets = Number(values.targets), hz = Number(values.hz);
  const cells = numbers(values.stretch).flatMap((stretch) => numbers(values.seconds).flatMap((seconds) => numbers(values.through).map((through) => ({ stretch, seconds, through }))));
  const jobs = cells.flatMap((placed, cell) => models.flatMap((model) => helds.flatMap((held) => seeds.flatMap((seed) =>
    Array.from({ length: targets }, (_, k) => ({ cell, model, held, seed, from: k, targets: k + 1, hz, skills: { placed } }))))));
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));
  const started = Date.now();
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); resolve(); return; }
      const id = next++;
      worker.once("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        jobs[id].result = result;
        if (++done % 200 === 0) process.stderr.write(`${done}/${jobs.length} in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
        feed();
      });
      worker.postMessage(jobs[id]);
    };
    feed();
  })));
  console.log(`The placed blow's sweep on the Routine's targets, ${targets} each on a run of its own, seeds ${seeds.join(", ")}, bodies ${models.join(", ")}; `
    + `Node core stand, Rapier, ${hz} Hz, no assist, the arena's rules. The blow set: stretch ${PLACED.stretch}, ${PLACED.seconds} s, through ${PLACED.through} m.`);
  for (const held of helds) {
    console.log("");
    console.log(`| Held | Stretch | Seconds | Through, m | Placed | Hit | of the high | middle | low | Damage, HP: a blow | a hit | Closing, m/s | Missed by, cm | Crowded | Fell | Unread |`);
    console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    cells.forEach(({ stretch, seconds, through }, cell) => {
      const runs = jobs.filter((job) => job.cell === cell && job.held === held);
      const read = runs.flatMap(({ result }) => result.readings.filter((r) => r.kind === "placed"));
      const hits = read.filter((r) => r.blow), misses = read.filter((r) => !r.blow && r.hung), crowded = read.filter((r) => !r.hung);
      const unread = runs.reduce((sum, { result }) => sum + result.strata.length - result.readings.length, 0);
      const of = (stratum) => `${hits.filter((r) => r.stratum === stratum).length} of ${read.filter((r) => r.stratum === stratum).length}`;
      console.log(`| ${held} | ${stretch} | ${seconds} | ${through} | ${read.length} | ${hits.length} | ${of("high")} | ${of("middle")} | ${of("low")} | `
        + `${shown(read.length ? hits.reduce((sum, r) => sum + r.blow.damage, 0) / read.length : null, 4)} | ${shown(mean(hits.map((r) => r.blow.damage)), 4)} | `
        + `${shown(mean(hits.map((r) => r.blow.closing)), 2)} | ${shown(mean(misses.map((r) => 100 * r.nearest)), 1)} | `
        + `${crowded.length} | ${read.filter((r) => r.fell).length} | ${unread} |`);
    });
  }
} else {
  const [{ Logger }, { runTargets }] = await Promise.all([import("@babylonjs/core/Misc/logger.js"), import("./core-targets-run.mjs")]);
  Logger.LogLevels = Logger.ErrorLogLevel;
  parentPort.on("message", async (job) => {
    try { parentPort.postMessage({ result: await runTargets(job) }); }
    catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
