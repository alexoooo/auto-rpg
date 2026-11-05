/**
 * What a crypt run costs a step, over a run: the hero explores a generated level (`DungeonRun`, no
 * visuals), `--companions` Warriors following it, until the run ends or `--seconds` of it have
 * passed. A row is a seed: how the run stood at the end, the bodies built, how many of them were
 * held in the fight (`LEVELS`), how many out of it and how many of those held where they lie, and
 * the wall time of a step, as the run's mean and as the mean of its slowest second.
 *
 * With `--listen` the same run is played twice at once, unheard and heard, a step of each by
 * turns, so the two are read on the machine as it is at that moment and their difference is what
 * hearing costs. Heard is as a page hears it (`hearRun`, `src/game/dungeon/hearing.ts`): every built
 * body's touches, and its air, asked here every step where a page asks once a frame, by a
 * listener that does nothing with them. The row's first figures are the unheard run's.
 *
 *   node research/crypt-step.mjs [--seeds 1,2,3,4] [--seconds 120] [--companions 0] [--listen] [--mind option] [--runs 1] [--minds 3]
 *
 * `--mind` names the preset (`MINDS`) every body plays, the party's and the enemies'; each its
 * model's own unless given. `--runs` plays each seed that many times: a run is the same to the
 * bit each time, so the least of each step's times over the playings is its work, and the row's
 * last figures are the dearest such step past the first 2 s and the worst lag behind real time
 * from then (`lagOf`, `research/lag.mjs`), the least of each playing's own, with the bodies built
 * and the collections in the run of steps that built that playing's worst. `--minds` runs every
 * mind apart, on that many worker threads (`mindWorkers`, `src/app/node/minds.ts`).
 *
 * Wall time on the machine it runs on, one row at a time: read it on a quiet one, with the
 * process held to cores of one kind (`start /b /wait /high /affinity <mask>` on Windows). On
 * cores of two kinds a step reads several times longer from one second to the next, and the share
 * between the two runs is lost in it.
 */
import { parseArgs } from "node:util";
import { hearRun } from "../src/game/dungeon/hearing.ts";
import { DungeonRun } from "../src/app/node/game.ts";
import { CORE_ENGINE, freshEngine } from "../tests/harness/core-stand.mjs";
import { MINDS } from "../src/app/catalog.ts";
import { PerformanceObserver } from "node:perf_hooks";
import { lagOf } from "./lag.mjs";
import { mindWorkers } from "../src/app/node/minds.ts";

const collections = [];
new PerformanceObserver((list) => { for (const e of list.getEntries()) collections.push({ at: e.startTime, ms: e.duration }); }).observe({ entryTypes: ["gc"] });

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1,2,3,4" }, seconds: { type: "string", default: "120" }, companions: { type: "string", default: "0" }, listen: { type: "boolean", default: false }, mind: { type: "string" }, runs: { type: "string", default: "1" }, minds: { type: "string" } } });
const mind = values.mind === undefined ? undefined : MINDS[values.mind]?.config;
if (values.mind !== undefined && !mind) throw new Error(`no mind preset ${values.mind}`);
const seconds = Number(values.seconds), companions = Array.from({ length: Number(values.companions) }, () => "workshop-fighter");

/** A run of `seed`, heard or not, and the wall time its steps have taken: all of them, and its slowest second's. */
async function begun(seed, heard) {
  const place = values.minds ? mindWorkers(Number(values.minds)) : null;
  const run = new DungeonRun({ seed, engine: await freshEngine(), companions, ...(mind ? { mind: () => mind } : {}), ...(place ? { minds: place } : {}) });
  // The hero explores by itself in this mode, and fights what it meets.
  run.commands.setMode({ keyboard: false, facing: true });
  const hearing = heard ? hearRun(run, () => {}) : null;
  const airing = hearing ? run.world.afterStep(() => hearing.airs(() => {})) : null;
  return { run, total: 0, worst: 0, dispose() { airing?.dispose(); hearing?.dispose(); run.dispose(); place?.dispose(); } };
}

async function played(seed) {
  const sides = [await begun(seed, false), ...(values.listen ? [await begun(seed, true)] : [])];
  const [{ run }] = sides, hz = run.world.hz;
  let most = 0, steps = 0;
  const times = [], starts = [], builds = [];
  for (let s = 0; s < seconds && run.status === "playing"; s++) {
    const second = sides.map(() => 0);
    for (let i = 0; i < hz; i++) {
      sides.forEach((side, k) => {
        const before = k === 0 ? side.run.actors.filter((a) => a.fighter).length : 0, t = performance.now();
        side.run.step();
        const took = performance.now() - t;
        second[k] += took;
        if (k === 0) { times.push(took); starts.push(t); builds.push(side.run.actors.filter((a) => a.fighter).length - before); }
      });
    }
    sides.forEach((side, k) => { side.total += second[k]; side.worst = Math.max(side.worst, second[k] / hz); });
    steps += hz;
    most = Math.max(most, run.actors.filter((a) => a.fighter).length);
  }
  const built = run.actors.filter((a) => a.fighter), [unheard, heard] = sides, row = {
    seed, status: run.status, seconds: steps / hz, enemies: run.enemies.length, built: built.length, most,
    held: built.filter((a) => a.held && a.alive).length, out: built.filter((a) => !a.alive).length, lying: built.filter((a) => a.held && !a.alive).length, mean: unheard.total / steps, worst: unheard.worst,
    heard: heard ? { mean: heard.total / steps, worst: heard.worst } : null, times,
  };
  const lag = lagOf(times, 1000 / hz, 2 * hz), from = starts[lag.began], to = starts[lag.at] + times[lag.at];
  row.lag = { ...lag, built: builds.slice(lag.began, lag.at + 1).reduce((a, b) => a + b, 0), collected: collections.filter((c) => c.at >= from && c.at <= to).map((c) => c.ms) };
  if (heard && (heard.run.status !== run.status || heard.run.blows.length !== run.blows.length)) throw new Error(`seed ${seed}: heard, the run is another run`);
  for (const side of sides) side.dispose();
  return row;
}

console.log(`Node, a crypt run with no visuals, ${CORE_ENGINE}, 120 Hz; the hero exploring, ${companions.length} with it; to the run's end or ${seconds} s\n`);
const listened = values.listen ? " Heard: a step, ms | In its slowest second, ms | Hearing, % of the unheard step |" : "";
console.log(`| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Held | Out of the fight | Of them held | A step, ms | In its slowest second, ms | Of real time, % |${listened} The dearest step past 2 s, ms | The worst lag, ms | At step, built over | Bodies built, collections in it |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|${values.listen ? "---|---|---|" : ""}---|---|---|---|`);
for (const seed of values.seeds.split(",").map(Number)) {
  const playings = [];
  for (let k = 0; k < Number(values.runs); k++) playings.push(await played(seed));
  const r = playings.at(-1), n = Math.min(...playings.map((one) => one.times.length));
  let dearest = 0;
  for (let i = 2 * 120; i < n; i++) dearest = Math.max(dearest, Math.min(...playings.map((one) => one.times[i])));
  const heard = r.heard ? ` ${r.heard.mean.toFixed(2)} | ${r.heard.worst.toFixed(2)} | ${((r.heard.mean / r.mean - 1) * 100).toFixed(1)} |` : "";
  const lag = playings.reduce((a, b) => b.lag.lag < a.lag.lag ? b : a).lag;
  console.log(`| ${r.seed} | ${r.status} | ${r.seconds} | ${r.enemies} | ${r.built} | ${r.most} | ${r.held} | ${r.out} | ${r.lying} | ${r.mean.toFixed(2)} | ${r.worst.toFixed(2)} | ${(r.worst * 120 / 10).toFixed(0)} |${heard} ${dearest.toFixed(2)} | ${lag.lag.toFixed(2)} | ${lag.at}, ${lag.at - lag.began + 1} steps | ${lag.built}; ${lag.collected.map((ms) => ms.toFixed(1)).join(", ") || "none"} |`);
}
