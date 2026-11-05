import { isRefused } from "../src/core/refusal.ts";
/**
 * **How long a mind lies in the match's bouts**: the standard match's bouts (`MATCH_CASES`,
 * `src/evaluation/match/cases.ts`) of mind `a` against mind `b`, each on each side, read for `a`'s
 * body: its longest time down, its time down in all, and what its chooser had on offer while it lay
 * (`Engagement.offers`, read each second past `--after` s down), with the bout's winner. With
 * `--time`, each step's wall time too, the least, median, 99th and 99.9th percentiles and most, ms: what the
 * minds' deciding costs beside the step it runs in (read on a quiet machine, `--workers 1`).
 *
 *   node research/lying.mjs [--a option] [--b bare] [--cases 0,10,48] [--workers 12] [--after 20] [--time]
 *
 * A mind is a name the match takes (a preset's id or a kind) or a JSON file of a config. Node, the
 * core world, the default engine (rapier-coordinate), 120 Hz.
 */
import "../tests/harness/preload-data.mjs";
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { MATCH } from "../src/app/node/evaluation.ts";
import { MATCH_CASES } from "../src/app/node/evaluation.ts";
import { WORLD_BUILDERS } from "../src/app/node/evaluation.ts";
import { loadoutKey } from "../src/core/bodies/items/held.ts";

Logger.LogLevels = Logger.NoneLogLevel;

/** A mind the match takes by name, or a config read from a JSON file. */
const mindOf = (given) => given.endsWith(".json") ? { id: given, label: given, value: JSON.parse(readFileSync(given, "utf8")) } : given;

/** One bout, `a` on `side`: what its body's time down came to, and each step's wall time where `time`. */
async function play(k, side, a, b, after, time) {
  const cases = MATCH_CASES.standard, condition = cases.conditions[k];
  const world = cases.world(side === "left" ? [a.value, b.value] : [b.value, a.value], condition, "rapier-coordinate", [undefined, undefined]);
  if (isRefused(world)) throw new Error(world.refused);
  const kind = WORLD_BUILDERS.bout, built = await kind.build(world);
  if (isRefused(built)) throw new Error(built.refused);
  try {
    kind.start(built, world);
    const duel = built.duel, body = duel.duelists[side], steps = [], offered = {};
    let down = 0, longest = 0, total = 0, n = 0;
    while (!duel.verdict) {
      const began = time ? performance.now() : 0;
      built.world.step();
      if (time) steps.push(performance.now() - began);
      n++;
      if (body.body.down) {
        down += built.world.dt; total += built.world.dt;
        if (down > after && n % 120 === 0) {
          const engagement = body.minded.report?.engagement;
          const key = `${engagement?.phase} :: ${(engagement?.offers ?? []).map((offer) => offer.name).join(" | ")}`;
          offered[key] = (offered[key] ?? 0) + 1;
        }
      } else down = 0;
      longest = Math.max(longest, down);
    }
    return { k, side, left: condition.left, right: condition.right, loadout: loadoutKey(condition.loadout), gap: condition.gap,
      winner: duel.verdict.winner === null ? "draw" : duel.verdict.winner === side ? "a" : "b", seconds: duel.clock, longest, total, offered, steps };
  } finally { built.dispose(); }
}

if (isMainThread) {
  const { values } = parseArgs({ options: { a: { type: "string", default: "option" }, b: { type: "string", default: "bare" }, cases: { type: "string" },
    workers: { type: "string" }, after: { type: "string", default: "20" }, time: { type: "boolean" } } });
  const [a, b] = MATCH.subjects([mindOf(values.a), mindOf(values.b)]);
  const all = MATCH_CASES.standard.conditions.map((_, k) => k), cases = values.cases ? values.cases.split(",").map(Number) : all;
  const jobs = cases.flatMap((k) => [[k, "left"], [k, "right"]]), count = Math.min(jobs.length, Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
  const after = Number(values.after), rows = [];
  await Promise.all(Array.from({ length: count }, () => new Promise((done, fail) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { a: a.value, b: b.value, after, time: values.time === true } });
    const next = () => { const job = jobs.shift(); if (job) worker.postMessage(job); else worker.terminate().then(done); };
    worker.on("message", (row) => { rows.push(row); next(); });
    worker.on("error", fail);
    next();
  })));
  rows.sort((x, y) => x.k - y.k || x.side.localeCompare(y.side));
  console.log(`${a.id} v ${b.id}: ${rows.length} bouts, ${a.id}'s body read; Node, core world, rapier-coordinate, 120 Hz`);
  for (const row of rows.filter((one) => one.longest > after)) {
    console.log(`case ${row.k} ${row.left} v ${row.right} ${row.loadout} gap ${row.gap}, a ${row.side}: down ${row.longest.toFixed(1)} s at most, ${row.total.toFixed(1)} s in all; ${row.winner} at ${row.seconds.toFixed(1)} s`);
    for (const [key, n] of Object.entries(row.offered).sort((x, y) => y[1] - x[1]).slice(0, 3)) console.log(`    ${n}x ${key}`);
  }
  const long = rows.filter((row) => row.longest > after).length, total = rows.reduce((sum, row) => sum + row.total, 0);
  console.log(`\n${long} of ${rows.length} bouts down more than ${after} s; ${total.toFixed(1)} s down in all`);
  const tally = (pick) => { const t = { won: 0, drawn: 0, lost: 0 }; for (const row of rows.filter(pick)) row.winner === "a" ? t.won++ : row.winner === "draw" ? t.drawn++ : t.lost++; return t; };
  for (const body of [...new Set(rows.map((row) => row.side === "left" ? row.left : row.right))]) {
    const mine = (row) => (row.side === "left" ? row.left : row.right) === body, t = tally(mine);
    const down = rows.filter(mine).reduce((sum, row) => sum + row.total, 0);
    console.log(`a as ${body}: won ${t.won}, drawn ${t.drawn}, lost ${t.lost}; ${down.toFixed(1)} s down`);
  }
  if (values.time) {
    const steps = rows.flatMap((row) => row.steps).sort((x, y) => x - y), at = (q) => steps[Math.min(steps.length - 1, Math.floor(q * steps.length))];
    console.log(`step wall time, ms, over ${steps.length} steps: least ${steps[0].toFixed(2)}, median ${at(.5).toFixed(2)}, 99th ${at(.99).toFixed(2)}, 99.9th ${at(.999).toFixed(2)}, most ${steps.at(-1).toFixed(2)}`);
  }
} else {
  const { a, b, after, time } = workerData;
  parentPort.on("message", async ([k, side]) => parentPort.postMessage(await play(k, side, { value: a }, { value: b }, after, time)));
}
