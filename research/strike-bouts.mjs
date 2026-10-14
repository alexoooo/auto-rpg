/**
 * Named action lifecycles and physical outcomes in Arena bouts, read from the common report.
 * Per-instance phase time, preparation, verified endings and contact totals are independent of
 * executor kind. Nearby wound records are physical correlations, not action-attributed damage.
 * Node core world, Rapier, 120 Hz, the arena's rulebook; one sequential loop per worker.
 *
 * node research/strike-bouts.mjs --models workshop-fighter --gaps 3 --held empty --seconds 8 --workers 1
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

/** A completed action's wound correlation includes a quarter second after its last interval. */
const AFTER = .25;
/** Falls are read for two seconds from commitment; stance recovery continues one second past ending. */
const DOWN = 2, RECOVERY = 1;
/** Saved results describe the neutral action protocol and cannot mix with executor-private records. */
const SCHEMA = 2;

if (isMainThread) {
  const { values } = parseArgs({ options: {
    models: { type: "string" }, gaps: { type: "string", default: "3,4,5" }, held: { type: "string", default: "club" },
    seconds: { type: "string", default: "120" }, workers: { type: "string" }, save: { type: "string" }, load: { type: "string" },
  } });
  const { HUMANOID_MODELS } = await import("../src/core/models.ts");
  const models = values.models?.split(",") ?? HUMANOID_MODELS, gaps = values.gaps.split(",").map(Number), seconds = Number(values.seconds);
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2)), helds = values.held.split(",");
  if (!models.length || models.some(model => !HUMANOID_MODELS.includes(model)) || gaps.some(gap => !Number.isFinite(gap) || gap <= 0)
    || !Number.isFinite(seconds) || seconds <= 0 || !Number.isSafeInteger(lanes) || lanes < 1 || helds.some(held => !["club", "empty"].includes(held)))
    throw new Error("invalid models, gaps, seconds, workers or held selection");
  const jobs = [];
  for (const held of helds) for (const gap of gaps) for (const left of models) for (const right of models) jobs.push({ left, right, gap, held, seconds });
  const key = job => `${job.left} ${job.right} ${job.gap} ${job.held} ${job.seconds}`;
  const loaded = new Map(values.load ? JSON.parse(await readFile(values.load, "utf8")) : []);
  for (const job of jobs) {
    job.result = loaded.get(key(job));
    if (job.result && job.result.schema !== SCHEMA) throw new Error("loaded result uses a different action schema");
  }
  const played = jobs.filter(job => !job.result), started = Date.now();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, played.length) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    worker.once("error", reject);
    const feed = () => {
      if (next >= played.length) { worker.terminate(); resolve(); return; }
      const job = played[next++];
      worker.once("message", ({ result, error }) => {
        if (error) { worker.terminate(); reject(new Error(error)); return; }
        job.result = result;
        process.stderr.write(`${key(job)}: ${result.seconds.toFixed(1)} s ${result.ending}\n`);
        feed();
      });
      const { result: _, ...settings } = job; worker.postMessage(settings);
    };
    feed();
  })));
  if (values.save) await writeFile(values.save, JSON.stringify(jobs.map(job => [key(job), job.result])));
  const sum = xs => xs.reduce((total, value) => total + value, 0);
  const median = xs => xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : null;
  for (const held of helds) {
    const bouts = jobs.filter(job => job.held === held).map(job => job.result), sides = bouts.flatMap(bout => bout.sides);
    const attempts = sides.flatMap(side => side.attempts), committed = attempts.filter(attempt => attempt.committed);
    const timings = committed.flatMap(attempt => attempt.commit === null ? [] : [attempt.commit - attempt.began]);
    const endings = {};
    for (const attempt of attempts) { const kind = attempt.record?.ending.kind ?? "live-at-verdict"; endings[kind] = (endings[kind] ?? 0) + 1; }
    console.log(`Held ${held}: ${bouts.length} bouts, ${sum(bouts.map(bout => bout.seconds)).toFixed(1)} s; Node core world, Rapier, 120 Hz, the arena's rulebook`);
    console.log(`  action-seconds: ${["prepare", "commit", "release"].map(phase => `${phase} ${sum(sides.map(side => side.phases[phase])).toFixed(2)}`).join(", ")}; idle side-seconds ${sum(sides.map(side => side.idle)).toFixed(2)}`);
    console.log(`  requests ${attempts.length}, committed ${committed.length}; endings ${JSON.stringify(endings)}; median preparation ${median(timings)?.toFixed(2) ?? "unobserved"} s`);
    for (const model of models) {
      const mine = sides.filter(side => side.model === model).flatMap(side => side.attempts).filter(attempt => attempt.committed);
      console.log(`  ${model}: committed ${mine.length}, target-touch ${mine.filter(attempt => attempt.contacts.counts.commit.target > 0).length}, blocked ${mine.filter(attempt => attempt.contacts.counts.commit.block > 0).length}, `
        + `stance recovery ${mine.filter(attempt => attempt.recoveries > 0).length}, down within ${DOWN} s ${mine.filter(attempt => attempt.down).length}; `
        + `correlated effector wound records ${sum(mine.map(attempt => attempt.wounds.length))}`);
    }
  }
  console.log(`${jobs.length} bouts, ${played.length} played, in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} else {
  const { buildBout } = await import("./bout.mjs");
  const { SIDES } = await import("../src/arena/duel.ts");
  parentPort.on("message", async ({ left, right, gap, held, seconds }) => {
    let dispose;
    try {
      const recipe = { left, right, gap, cap: seconds, ...(held === "empty" ? { held: { left: "empty", right: "empty" } } : {}) };
      const bout = await buildBout(recipe); dispose = bout.dispose;
      const { world, duel } = bout, track = Object.fromEntries(SIDES.map(side => [side, {
        side, model: side === "left" ? left : right, phases: { prepare: 0, commit: 0, release: 0 }, idle: 0, attempts: [], sequence: 0,
      }]));
      const byId = Object.fromEntries(SIDES.map(side => [side, new Map()]));
      const attemptOf = (side, action) => {
        const existing = byId[side].get(action.id);
        if (existing) return existing;
        const attempt = { id: action.id, action: action.action, effector: action.effector, target: structuredClone(action.target),
          began: "began" in action ? action.began : duel.clock, commit: null, ended: null, committed: false,
          contacts: structuredClone(action.contacts), record: null, cutByVerdict: false, recoveries: 0, down: false,
          from: duel.duelists[side].body.view.stance.recoveries, downAt: null, wounds: [], struck: 0 };
        byId[side].set(action.id, attempt); track[side].attempts.push(attempt); return attempt;
      };
      while (!duel.verdict && duel.clock < seconds) {
        world.step();
        for (const side of SIDES) {
          const t = track[side], me = duel.duelists[side], report = me.minded.skills.report;
          if (!report.actions.length) t.idle += world.dt;
          for (const action of report.actions) {
            t.phases[action.phase] += world.dt;
            const attempt = attemptOf(side, action); attempt.contacts = structuredClone(action.contacts);
            if (action.phase === "commit" && attempt.commit === null) {
              attempt.commit = duel.clock; attempt.committed = true; attempt.from = me.body.view.stance.recoveries;
            }
          }
          for (const record of report.ledger) if (record.sequence > t.sequence) {
            const attempt = attemptOf(side, record);
            attempt.began = record.began; attempt.ended = record.ended; attempt.committed = record.committed;
            attempt.contacts = structuredClone(record.contacts); attempt.record = structuredClone(record); t.sequence = record.sequence;
          }
          for (const attempt of t.attempts) if (attempt.commit !== null) {
            if (attempt.ended === null || duel.clock <= attempt.ended + RECOVERY) attempt.recoveries = me.body.view.stance.recoveries - attempt.from;
            if (!attempt.down && duel.clock <= attempt.commit + DOWN && me.body.view.down) { attempt.down = true; attempt.downAt = duel.clock; }
          }
        }
      }
      for (const side of SIDES) {
        const t = track[side], me = duel.duelists[side];
        for (const attempt of t.attempts) {
          if (attempt.ended === null) { attempt.ended = duel.clock; attempt.cutByVerdict = true; }
          if (attempt.commit !== null) {
            const until = attempt.downAt ?? attempt.commit + DOWN;
            for (const blow of duel.blows) if (blow.time >= attempt.commit) {
              const mine = blow.sides.find(part => part.fighter === me.id), theirs = blow.sides.find(part => part.fighter !== me.id);
              if (!mine || !theirs) continue;
              if (blow.time <= attempt.ended + AFTER && mine.segment === attempt.effector && theirs.damage > 0)
                attempt.wounds.push({ time: blow.time, body: theirs.fighter, part: theirs.segment, damage: theirs.damage, energy: blow.energy });
              if (blow.time <= until) attempt.struck += mine.damage;
            }
          }
          delete attempt.from; delete attempt.downAt;
        }
        delete t.sequence;
      }
      parentPort.postMessage({ result: { schema: SCHEMA, seconds: duel.clock, ending: duel.verdict?.ending ?? "time", sides: SIDES.map(side => track[side]) } });
    } catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
    finally { dispose?.(); }
  });
}
