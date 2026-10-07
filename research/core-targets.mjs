/**
 * **The targets' battery**: the lab's Routine (`src/lab/routine.ts`) run once round its loop for
 * each body, thing held and seed, the walk out included, as the page runs it; each of its targets
 * is a body read by the rule a fight wounds by (`src/lab/targets.ts`). With a hand empty the hands
 * strike in turn; with something held in the right hand that hand strikes at every target, so a
 * row is one thing's.
 *
 *   node research/core-targets.mjs [--models workshop-fighter,workshop-rogue,crypt-skeleton] [--held empty,club]
 *     [--targets 10] [--seeds 1,2,3] [--hz 120] [--workers 14] [--each] [--list]
 *
 * Prints, per body, thing held and stratum: the targets, those hit, the mean and the least damage
 * of the hits (HP), the mean of how near the misses passed (cm), the targets whose place the body
 * filled through its strike (no dummy was hung), the readings a fall closed, and the targets left
 * unread by a run that ended early (a body that lay
 * where it fell, or a loop over its time). `--each` reads each target on a run of its own, the walk
 * out to it included, so that no target is left unread by a fall at one before it: the hand that
 * strikes at it is the one its turn in the loop gives. `--list` prints each reading after the table.
 * One worker a run, each on a stand of its own (`core-targets-run.mjs`: Node core stand, Rapier,
 * no assist, the arena's rules).
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { HUMANOID_MODELS as BODY_MODELS } from "../src/core/models.ts";
import { LAB_HELD } from "../src/lab/scenarios.ts";

const STRATA = ["control", "high", "middle", "low"];
const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const shown = (value, digits) => value === null ? "-" : value.toFixed(digits);

if (isMainThread) {
  const { values } = parseArgs({ options: {
    models: { type: "string", default: "workshop-fighter,workshop-rogue,crypt-skeleton" }, held: { type: "string", default: "empty,club" },
    targets: { type: "string", default: "10" }, seeds: { type: "string", default: "1,2,3" }, hz: { type: "string", default: "120" },
    workers: { type: "string" }, each: { type: "boolean", default: false }, list: { type: "boolean", default: false },
  } });
  const models = values.models.split(","), helds = values.held.split(","), seeds = values.seeds.split(",").map(Number);
  for (const model of models) if (!BODY_MODELS.includes(model)) throw new Error(`--models names no body: ${model} (one of ${BODY_MODELS.join(", ")})`);
  for (const held of helds) if (!LAB_HELD.includes(held)) throw new Error(`--held names nothing the lab holds: ${held} (one of ${LAB_HELD.join(", ")})`);
  const targets = Number(values.targets), hz = Number(values.hz);
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));
  // A run is a loop; or, each target on its own, the loop from that target and no further.
  const spans = values.each ? Array.from({ length: targets }, (_, k) => ({ from: k, targets: k + 1 })) : [{ from: 0, targets }];
  const jobs = models.flatMap((model) => helds.flatMap((held) => seeds.flatMap((seed) => spans.map((span) => ({ model, held, seed, ...span, hz })))));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); resolve(); return; }
      const id = next++;
      worker.once("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        jobs[id].result = result;
        feed();
      });
      worker.postMessage(jobs[id]);
    };
    feed();
  })));
  console.log(`The Routine's targets, ${targets} ${values.each ? "each on a run of its own" : "a run"}, seeds ${seeds.join(", ")}; Node core stand, Rapier, ${hz} Hz, no assist, the arena's rules`);
  console.log("");
  console.log("| Body | Held | Stratum | Targets | Hit | Damage, HP: mean | least | Missed by, cm: mean | Crowded | Fell | Unread |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  const listed = [];
  for (const model of models) for (const held of helds) {
    const runs = jobs.filter((job) => job.model === model && job.held === held);
    if (values.list) {
      for (const { seed, from, result } of runs) {
        listed.push(`${model}, ${held}, seed ${seed}${values.each ? `, target ${from + 1}` : ""}: ${result.ended} at ${result.seconds.toFixed(1)} s`);
        for (const r of result.readings) {
          listed.push(`  ${r.stratum} [${r.at.map((x) => x.toFixed(2)).join(", ")}] ${r.hand} ${r.strike ?? "no strike"}${r.band ? ` (${r.band})` : ""}${r.up === null ? "" : `, ${(100 * r.up).toFixed(0)} cm over the head`}: `
            + `${r.blow ? `${r.blow.damage.toFixed(3)} HP, ${r.blow.energy.toFixed(1)} J at ${r.blow.closing.toFixed(1)} m/s with ${r.blow.with}` : r.nearest === null ? "none began" : !r.hung ? "its place was filled" : `missed by ${(100 * r.nearest).toFixed(1)} cm`}`
            + `${r.fell ? ", fell" : ""}, ${r.seconds.toFixed(1)} s`);
        }
      }
    }
    for (const stratum of STRATA) {
      const drawn = runs.reduce((sum, { result }) => sum + result.strata.filter((s) => s === stratum).length, 0);
      const read = runs.flatMap(({ result }) => result.readings.filter((r) => r.stratum === stratum));
      const hits = read.filter((r) => r.blow), misses = read.filter((r) => !r.blow && r.hung);
      const crowded = read.filter((r) => !r.hung && r.strike !== null);
      console.log(`| ${model} | ${held} | ${stratum} | ${drawn} | ${hits.length} | ${shown(mean(hits.map((r) => r.blow.damage)), 3)} | `
        + `${shown(hits.length ? Math.min(...hits.map((r) => r.blow.damage)) : null, 3)} | ${shown(mean(misses.map((r) => 100 * r.nearest)), 1)} | `
        + `${crowded.length} | ${read.filter((r) => r.fell).length} | ${drawn - read.length} |`);
    }
  }
  if (listed.length) console.log(["", ...listed].join("\n"));
} else {
  const [{ Logger }, { runTargets }] = await Promise.all([import("@babylonjs/core/Misc/logger.js"), import("./core-targets-run.mjs")]);
  Logger.LogLevels = Logger.ErrorLogLevel;
  parentPort.on("message", async (job) => {
    try { parentPort.postMessage({ result: await runTargets(job) }); }
    catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
