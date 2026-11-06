import { workerJobs } from "../../../../worker-jobs.mjs";
import { isRefused } from "../../../../../src/core/refusal.ts";
/**
 * **Where a whole mind's rise spends its time**: the stand-up target's falls (`risingJobs`, the falls
 * `npm run evaluate -- rising-target` plays, turned by `--offsets`) on the fall bed (`buildFall`),
 * risen by a mind (Option Mind's preset unless `--mind` names a JSON file), each step reading the
 * mind's ground Options' memory (`attempt`, `rise.ts`) and the ground actions it runs (`groundSkills`). Node, core world, Rapier,
 * 120 Hz.
 *
 * For each fall: the time from takeover to verified standing (30 s for a fall not stood), and each
 * ground action in turn: its name, where it was begun from, when, how long, the stages it went
 * through, and how it ended. The summary gives, over the falls, the seconds spent in each action
 * and with none, and each technique's attempts by where they were begun: begun, done, the stage
 * the failures ended in.
 *
 *   node research/skills/recovery/implementations/staged/rise-trace.mjs [--model workshop-fighter] [--offsets 0,11.25] [--mind <file.json>]
 *     [--loadout <left>,<right>] [--only <degrees>,...] [--seeds <n>,...] [--workers N] [--out <rows.json>] [--falls]
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

/** The cap a fall not stood is counted at, s. */
const CAP = 30;

/** One fall played to its end, its ground actions read each step. */
async function traceFall(job) {
  await import("../../../../../tests/harness/preload-data.mjs");
  const { buildFall } = await import("../../../../../src/app/node/evaluation.ts");
  const { stepUpRecipe, stepUpTuning } = await import("../../../../../src/skills/recovery/implementations/staged/records.ts");
  const { SIT_BACK } = await import("../../../../../src/skills/recovery/implementations/staged/stages.ts");
  const { humanoidSpec } = await import("../../../../../src/core/bodies/human/spec.ts");
  const tuning = stepUpTuning(humanoidSpec(job.fall.model)), stepUp = stepUpRecipe(tuning).rise.map((one) => one.name), sitBack = stepUpRecipe(tuning, SIT_BACK).rise.map((one) => one.name);
  /** Each staged part's rise stage names from where it begins (`PARTS`, `staged-edges.ts`). */
  const names = { "staged-down": stepUp, "front-sit-back": sitBack, "sit-back": sitBack.slice(sitBack.indexOf("plant")) };
  /** The run's state of the ground skill running action `id` (`groundSkills`); none where no ground skill runs it. */
  const runOf = (mind, id) => mind?.skills?.actions?.executors?.find((one) => one?.live?.id === id)?.run ?? null;
  /** Where the ground Option asking action `id` began its try (`attempt`); null where none keeps one. */
  const fromOf = (mind, id) => mind?.decider?.options?.find((one) => one?.id === id && one.from != null)?.from ?? null;
  /** What ground action `name` is doing, as its run's state `run` reads: its phase, and in a staged rise the stage. */
  const stageOf = (run, name, fallback) => {
    if (!run) return fallback;
    // A staged part's state: the roll's has no phase of its own and a rise each way over, a part of the rise's is "rise" or "steady".
    const rise = run.rise ?? run.rises?.[run.entry], rising = (run.phase ?? "rise") === "rise";
    if (rising && rise && names[name] && rise.phase === "rise") return names[name][rise.stage] ?? `stage ${rise.stage}`;
    if (rising && rise) return rise.phase;
    return run.phase ?? fallback;
  };
  const built = await buildFall(job.fall, "rapier");
  if (isRefused(built)) throw new Error(built.refused);
  const actions = new Map(), order = [], idles = [];
  /** The standing legs' memory (`locomotion`'s state, under the skills' legs): its idle settling's target. */
  let legs = null;
  const findLegs = (o, depth) => {
    if (legs || depth > 6 || !o || typeof o !== "object") return;
    if (o.idle && "seconds" in o.idle && "placing" in o) { legs = o; return; }
    for (const key of Object.keys(o)) findLegs(o[key], depth + 1);
  };
  findLegs(built.combatant.minded.state.skills?.legs, 0);
  let idleTarget = null;
  try {
    while (!built.ended) {
      built.world.step();
      built.afterStep();
      const mind = built.combatant.minded.state, time = built.world.time;
      const live = mind?.skills?.actions?.live ?? [];
      // Each idle settling begun: how far each sole stands from its target, m.
      const target = legs?.idle?.target ?? null;
      if (target && target !== idleTarget) {
        const ends = built.combatant.body.view.stance.ends;
        const soles = { left: ends["foot.left"].middle, right: ends["foot.right"].middle };
        const off = (side) => Math.hypot(soles[side].x - target[side][0], soles[side].z - target[side][1]);
        idles.push({ at: time, left: +off("left").toFixed(3), right: +off("right").toFixed(3),
          apart: +Math.hypot(soles.left.x - soles.right.x, soles.left.z - soles.right.z).toFixed(3) });
      }
      idleTarget = target;
      // An action gone from the live list ended on the step it went: how, as its run's state says.
      for (const seen of order) if (seen.end === null && !seen.gone && !live.some((action) => action.id === seen.id)) {
        seen.gone = true;
        seen.end = seen.run?.ended ?? null;
      }
      for (const action of live) {
        let seen = actions.get(action.id);
        if (!seen) {
          seen = { id: action.id, name: action.action, from: fromOf(mind, action.id), run: runOf(mind, action.id), at: time, until: time, stages: [], end: null };
          actions.set(action.id, seen); order.push(seen);
        }
        seen.until = time;
        seen.from ??= fromOf(mind, action.id);
        seen.run ??= runOf(mind, action.id);
        const stage = action.stage.startsWith("ended:") ? action.stage : stageOf(seen.run, action.action, action.stage);
        // How the body is as a staged rise hands it to the stance's steadying.
        if (stage === "steady" && !seen.handed) {
          const g = built.combatant.body.view.ground;
          seen.handed = g && { height: +g.height.toFixed(3), position: g.position, onFeet: g.onFeet, feet: +(g.footLoad[0] + g.footLoad[1]).toFixed(2),
            speed: +Math.sqrt(g.velocity.lengthSquared()).toFixed(2), upright: +g.upright.toFixed(2) };
        }
        if (stage.startsWith("ended:")) seen.end ??= stage.slice(6);
        else if (seen.stages.at(-1)?.name !== stage) seen.stages.push({ name: stage, at: +(time - seen.at).toFixed(3) });
      }
    }
    const r = built.reading(), takeover = r.takeover;
    const stood = r.stood && r.verified !== null;
    const ground = order.filter((one) => takeover !== null && one.until >= takeover)
      .map((one) => ({ name: one.name, from: one.from, at: +(one.at - takeover).toFixed(3), seconds: +(one.until - one.at).toFixed(3), stages: one.stages, end: one.end,
        ...(one.handed ? { handed: one.handed } : {}) }));
    const settled = idles.filter((one) => takeover !== null && one.at >= takeover).map((one) => ({ ...one, at: +(one.at - takeover).toFixed(3) }));
    return { ...job.key, status: r.status, takeover, time: takeover === null ? null : stood ? r.verified : CAP, stood, actions: ground, idles: settled };
  } finally { built.dispose(); }
}

/** Seconds of `rows`' falls in each action, and with none from takeover to the fall's end. */
function summary(rows) {
  const made = rows.filter((row) => row.takeover !== null), times = made.map((row) => row.time).sort((a, b) => a - b);
  const median = times.length ? (times[(times.length - 1) >> 1] + times[times.length >> 1]) / 2 : null;
  const within = (s) => made.filter((row) => row.time <= s).length;
  console.log(`falls ${rows.length}, made ${made.length}, stood ${made.filter((row) => row.stood).length}, within 6 s ${within(6)}, within 10 s ${within(10)}, median ${median?.toFixed(2)} s`);
  const spent = new Map();
  let none = 0;
  for (const row of made) {
    let covered = 0;
    for (const one of row.actions) { spent.set(one.name, (spent.get(one.name) ?? 0) + one.seconds); covered += one.seconds; }
    none += Math.max(0, row.time - covered);
  }
  console.log("\nSeconds a fall, mean over the falls made, by action (none: no ground action live):\n");
  console.log("| Action | s a fall |\n|---|---:|");
  for (const [name, seconds] of [...spent].sort((a, b) => b[1] - a[1])) console.log(`| ${name} | ${(seconds / made.length).toFixed(2)} |`);
  console.log(`| none | ${(none / made.length).toFixed(2)} |`);
  const tries = new Map();
  for (const row of made) for (const one of row.actions) {
    const key = `${one.name} from ${one.from ?? "?"}`, entry = tries.get(key) ?? { begun: 0, done: 0, seconds: 0, ends: new Map() };
    entry.begun++; entry.seconds += one.seconds;
    if (one.end === "done") entry.done++;
    else { const at = `${one.end ?? "cut"} at ${one.stages.at(-1)?.name ?? "?"}`; entry.ends.set(at, (entry.ends.get(at) ?? 0) + 1); }
    tries.set(key, entry);
  }
  console.log("\nAttempts by action and where begun:\n");
  console.log("| Action | Begun | Done | Mean s | Not done: how and where |\n|---|---:|---:|---:|---|");
  for (const [key, entry] of [...tries].sort((a, b) => b[1].begun - a[1].begun))
    console.log(`| ${key} | ${entry.begun} | ${entry.done} | ${(entry.seconds / entry.begun).toFixed(2)} | ${[...entry.ends].map(([at, n]) => `${at} ${n}`).join("; ")} |`);
}

if (isMainThread) {
  const { values } = parseArgs({ options: { model: { type: "string", default: "workshop-fighter" }, offsets: { type: "string", default: "0" },
    mind: { type: "string" }, loadout: { type: "string" }, only: { type: "string" }, seeds: { type: "string", default: "1" }, workers: { type: "string" }, out: { type: "string" }, falls: { type: "boolean", default: false } } });
  const { risingJobs } = await import("../../../../../src/evaluation/rising.ts");
  const { MINDS } = await import("../../../../../src/app/catalog.ts");
  const mind = values.mind ? JSON.parse(readFileSync(values.mind, "utf8")) : MINDS.option.config;
  const only = values.only ? new Set(values.only.split(",")) : null;
  const seeds = values.seeds.split(",").map(Number);
  if (seeds.some(seed => !Number.isSafeInteger(seed) || seed < 1)) throw new Error('--seeds needs positive integers');
  const { loadoutKey } = await import("../../../../../src/core/bodies/items/held.ts");
  const jobs = values.offsets.split(",").map(Number).flatMap((offset) => risingJobs({ target: true, offset }))
    .filter((job) => job.model === values.model && (!values.loadout || loadoutKey(job.loadout) === values.loadout) && (!only || only.has(String(job.degrees))))
    .flatMap(({ model, loadout, start, degrees, balance, grit, gusts }) => seeds.map(seed => ({
      key: { model, loadout: loadoutKey(loadout), degrees, seed }, fall: { model, loadout, seed, start, degrees, balance, grit, gusts, target: true, mind } })));
  const count = Number(values.workers ?? Math.max(1, availableParallelism() - 4));
  const started = Date.now();
  const rows = (await workerJobs(jobs, { lanes: count, create: () => new Worker(new URL(import.meta.url)), result: answer => answer })).flat().sort((a, b) => a.loadout < b.loadout ? -1 : a.loadout > b.loadout ? 1 : a.degrees - b.degrees || a.seed - b.seed);
  console.log(`rise trace: ${jobs.length} falls of ${values.model}, offsets ${values.offsets}, seeds ${values.seeds}; Node, core world, Rapier, 120 Hz; ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
  if (values.falls) for (const row of rows) console.log(`${row.loadout} ${row.degrees} seed ${row.seed}: ${row.stood ? row.time.toFixed(2) : "not stood"}; ${row.actions.map((one) =>
    `${one.name}${one.from ? `(${one.from})` : ""} ${one.at.toFixed(1)}+${one.seconds.toFixed(1)} ${one.end ?? "cut"}${one.end === "done" ? "" : `@${one.stages.at(-1)?.name ?? "?"}`}`).join(" > ")}`);
  if (values.falls) console.log("");
  summary(rows);
  if (values.out) writeFileSync(values.out, JSON.stringify(rows, null, 1));
} else {
  parentPort.on("message", async job => {
    try { parentPort.postMessage([await traceFall(job)]); }
    catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
