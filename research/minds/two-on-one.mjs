/**
 * **Two on one**: whether what two foes take from a body a second is the sum of what each takes
 * alone, and what its mind expects of each (step 7 of `docs/plans/2026-11-17-testbed.md`).
 *
 *   node research/minds/two-on-one.mjs [--cases 24] [--seconds 60] [--foe man] [--near 2] [--workers N] [--save <file>] [--load <file>]
 *
 * A Crypt run (`createCrypt`, `src/evaluation/crypt.ts`) on an open room of 14 by 14 m: the hero a
 * man under the game's Option Mind (`defaultMind("man")`, the `option` preset), under the
 * person's Commander with no order given (`party`: it takes on a foe upon it), and one or two foes
 * of `--foe`'s model under their own minds and a mob (the run's default). Each case places the hero
 * at the room's middle and foe A and foe B 2.5 to 3.5 m from it, 90 to 180 degrees apart about it,
 * drawn from the case's number; and is played three times on those placements: A alone, B alone,
 * both. A run ends with the hero out of the fight (its pool ended: its knockout), every foe out,
 * or `--seconds`.
 *
 * Each step reads the hero's bar (its pool's life over its full life) and which foes in the fight
 * stand within `--near` m of it, centre to centre (`DungeonActor.feet`): the bar lost a second over
 * the time one foe was near, two were, and either; each blow's life taken from the hero, by the
 * foe that struck it (`DungeonRun.blows`, over the hero's full life); and what the hero's mind
 * expects each foe to take of it a second at reach (`Prospect.taken`, `MindReport.prospects`),
 * summed over the foes in the fight it has priced, at each step a foe was near.
 *
 * It prints, by condition, the cases' life lost a second while engaged (pooled: the cases' loss
 * over their time; and the cases' mean), with a 95% bootstrap interval over cases; again over only
 * the first `EARLY` s engaged, since a fight alone lasts longer than two on one; together
 * against A + B, case by case on the same placements; and the prospects' sum against the
 * measured. `--save` keeps each run's record; `--load` reads them and plays only those missing.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

/** The room's floor cells, a side; cells sit at whole metres from 1, the floor from 0.5. */
const ROOM = 14;
const CONDITIONS = ["A", "B", "AB"];
/** The first seconds of a run's time engaged its loss is read over again, s: alone, a fight lasts longer than two on one. */
const EARLY = [5, 10];

/** Case `k`'s placements: the hero near the middle, A and B 2.5 to 3.5 m from it, 90 to 180 degrees apart. */
function placements(k) {
  let word = (0x9e3779b9 * (k + 1)) >>> 0;
  const draw = () => { word = (word + 0x6d2b79f5) | 0; let t = Math.imul(word ^ (word >>> 15), 1 | word); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const middle = 0.5 + ROOM / 2, hero = { x: middle + (draw() - 0.5), z: middle + (draw() - 0.5) };
  const bearingA = draw() * 2 * Math.PI, apart = (Math.PI / 2 + draw() * Math.PI / 2) * (draw() < 0.5 ? -1 : 1);
  const gapA = 2.5 + draw(), gapB = 2.5 + draw();
  const at = (bearing, gap) => ({ x: hero.x + gap * Math.sin(bearing), z: hero.z + gap * Math.cos(bearing) });
  return { hero, A: at(bearingA, gapA), B: at(bearingA + apart, gapB), gapA, gapB, apart: Math.abs(apart) * 180 / Math.PI };
}

if (isMainThread) {
  const { values } = parseArgs({ options: {
    cases: { type: "string", default: "24" }, seconds: { type: "string", default: "60" }, foe: { type: "string", default: "man" },
    near: { type: "string", default: "2" }, workers: { type: "string" }, save: { type: "string" }, load: { type: "string" },
  } });
  const cases = Number(values.cases), seconds = Number(values.seconds), near = Number(values.near), foe = values.foe;
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));
  if (!Number.isSafeInteger(cases) || cases < 1 || !(seconds > 0) || !(near > 0) || !Number.isSafeInteger(lanes) || lanes < 1) throw new Error("invalid cases, seconds, near or workers");
  const key = (job) => `${job.foe} ${job.k} ${job.condition} ${job.seconds} ${job.near} early ${EARLY}`;
  const loaded = new Map(values.load && existsSync(values.load) ? JSON.parse(readFileSync(values.load, "utf8")) : []);
  const jobs = [];
  for (let k = 0; k < cases; k++) for (const condition of CONDITIONS) jobs.push({ k, condition, foe, seconds, near });
  for (const job of jobs) job.result = loaded.get(key(job));
  const played = jobs.filter((job) => !job.result), started = Date.now();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, played.length) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    worker.once("error", reject);
    const feed = () => {
      if (next >= played.length) { worker.terminate(); resolve(); return; }
      const job = played[next++];
      worker.once("message", ({ result, error }) => {
        if (error) { job.fault = error.split("\n")[0]; process.stderr.write(`${key(job)}: faulted, ${job.fault}\n`); feed(); return; }
        job.result = result;
        process.stderr.write(`${key(job)}: ${result.seconds.toFixed(1)} s, ${result.ending}, hero bar ${result.bar.toFixed(3)}\n`);
        feed();
      });
      const { result: _, ...settings } = job; worker.postMessage(settings);
    };
    feed();
  })));
  const faulted = jobs.filter((job) => job.fault);
  if (faulted.length) console.log(`${faulted.length} of ${jobs.length} runs faulted, left out: ${faulted.map((job) => `${key(job)} (${job.fault})`).join("; ")}`);
  const kept = jobs.filter((job) => job.result);
  if (values.save) writeFileSync(values.save, JSON.stringify(kept.map((job) => [key(job), job.result])));
  const wall = (Date.now() - started) / 1000;
  report(kept, { foe, near, seconds, cases, wall, played: played.length });
} else {
  await import("../../tests/harness/preload-data.mjs");
  const { CONTEXT } = await import("../../src/app/node/context.ts");
  const { createCrypt } = await import("../../src/evaluation/crypt.ts");
  const { DEFAULT_ENGINE } = await import("../../src/core/physics/engines.ts");
  const { isRefused } = await import("../../src/core/refusal.ts");
  const { CRYPT_WORLD } = createCrypt(CONTEXT);
  const floor = Array.from({ length: ROOM + 2 }, (_, z) => Array.from({ length: ROOM + 2 }, (_, x) => x >= 1 && x <= ROOM && z >= 1 && z <= ROOM ? "." : "#").join(""));
  parentPort.on("message", async ({ k, condition, foe, seconds, near }) => {
    let built = null;
    try {
      const placed = placements(k), foes = condition === "AB" ? ["A", "B"] : [condition];
      const crypt = { layout: { floor, doors: [], obstacles: [], start: placed.hero, exit: { x: ROOM + 12, z: ROOM + 12 },
        spawns: foes.map((name) => placed[name]), enemies: foes.map(() => foe) },
        party: [{ model: "man", at: placed.hero }], mind: CONTEXT.defaultMind("man"), script: [] };
      built = await CRYPT_WORLD.build({ kind: "crypt", engine: DEFAULT_ENGINE, crypt });
      if (isRefused(built)) { const refused = built.refused; built = null; throw new Error(refused); }
      const { run } = built, hero = run.hero, dt = 1 / run.world.hz, names = new Map(foes.map((name, i) => [`enemy-${i}`, name]));
      const total = hero.fighter.pool.total;
      const bins = { 1: { time: 0, lost: 0 }, 2: { time: 0, lost: 0 } }, early = Object.fromEntries(EARLY.map((window) => [window, { time: 0, lost: 0 }]));
      const byFoe = Object.fromEntries(foes.map((name) => [name, { near: 0, alone: 0, taken: 0, prospect: 0, priced: 0, out: null }]));
      let bar = hero.vitality, blows = 0, prospectSum = 0, prospectNear = 0, prospectSteps = 0, knockout = null, first = null, ending = "cap";
      while (run.clock < seconds) {
        run.step(1); built.afterStep();
        for (; blows < run.blows.length; blows++) {
          const blow = run.blows[blows], at = blow.sides.findIndex((side) => side.fighter === "hero");
          if (at < 0 || !blow.sides[at].wound) continue;
          const by = names.get(blow.sides[1 - at].fighter);
          if (by) byFoe[by].taken += blow.sides[at].wound.life / total;
        }
        const now = hero.vitality, lost = bar - now; bar = now;
        const heroAt = hero.feet(), inFight = run.enemies.filter((enemy) => enemy.fighter && enemy.alive);
        for (const enemy of run.enemies) if (enemy.fighter && !enemy.alive && byFoe[names.get(enemy.id)].out === null) byFoe[names.get(enemy.id)].out = run.clock;
        const close = inFight.filter((enemy) => { const at = enemy.feet(); return Math.hypot(at.x - heroAt.x, at.z - heroAt.z) <= near; });
        if (close.length) {
          if (first === null) first = run.clock;
          for (const window of EARLY) { const bin = early[window]; if (bins[1].time + bins[2].time < window) { bin.time += dt; bin.lost += lost; } }
          const bin = bins[Math.min(2, close.length)]; bin.time += dt; bin.lost += lost;
          for (const enemy of close) { const one = byFoe[names.get(enemy.id)]; one.near += dt; if (close.length === 1) one.alone += dt; }
          const prospects = hero.fighter.minded.report?.prospects ?? [];
          let sum = 0, sumNear = 0;
          for (const prospect of prospects) {
            const enemy = inFight.find((one) => one.id === prospect.foe);
            if (!enemy) continue;
            sum += prospect.taken;
            if (close.includes(enemy)) sumNear += prospect.taken;
            const one = byFoe[names.get(enemy.id)]; one.prospect += prospect.taken * dt; one.priced += dt;
          }
          prospectSum += sum * dt; prospectNear += sumNear * dt; prospectSteps += dt;
        }
        if (!hero.alive) { knockout = run.clock; ending = "hero out"; break; }
        if (!inFight.length && run.enemies.every((enemy) => enemy.fighter)) { ending = "foes out"; break; }
        if (run.status !== "playing") { ending = run.status; break; }
      }
      parentPort.postMessage({ result: { k, condition, placed, seconds: run.clock, ending, knockout, first, bar, bins, early, byFoe,
        prospect: prospectSteps ? { sum: prospectSum / prospectSteps, near: prospectNear / prospectSteps } : null } });
    } catch (error) {
      parentPort.postMessage({ error: String(error?.stack ?? error) });
    } finally { built?.dispose(); }
  });
}

/** What the runs came to, printed. */
function report(jobs, { foe, near, seconds, cases, wall, played }) {
  const runs = (condition) => jobs.filter((job) => job.condition === condition).map((job) => job.result);
  const byCase = new Map();
  for (const job of jobs) { const row = byCase.get(job.k) ?? {}; row[job.condition] = job.result; byCase.set(job.k, row); }
  /** A case's rate over the bins named: life lost over time near, a share of full life a second. */
  const engaged = (r, bins) => { let lost = 0, time = 0; for (const b of bins) { lost += r.bins[b].lost; time += r.bins[b].time; } return { lost, time }; };
  const draw = mulberry(7);
  /** A statistic of `items` and its 95% bootstrap interval over them. */
  const boot = (items, stat, n = 2000) => {
    const point = stat(items), samples = [];
    for (let i = 0; i < n; i++) samples.push(stat(items.map(() => items[Math.floor(draw() * items.length)])));
    samples.sort((a, b) => a - b);
    return { point, low: samples[Math.floor(0.025 * n)], high: samples[Math.floor(0.975 * n)] };
  };
  const pooled = (bins) => (rs) => { let lost = 0, time = 0; for (const r of rs) { const e = engaged(r, bins); lost += e.lost; time += e.time; } return time ? lost / time : NaN; };
  const meanOf = (xs) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
  const fmt = (b, d = 4) => `${b.point.toFixed(d)} (${b.low.toFixed(d)} to ${b.high.toFixed(d)})`;
  console.log(`Two on one: a man under the game's Option Mind against ${foe} foes under theirs and a mob; ${cases} placements, three runs each, to ${seconds} s at most; near is within ${near} m centre to centre.`);
  console.log(`${played} runs played in ${wall.toFixed(0)} s.\n`);
  console.log("Life lost a second (share of the hero's full life) while engaged, 95% bootstrap over cases:\n");
  console.log("| Condition | Runs | Engaged s, mean | Pooled, any near | Mean of cases, any near | One near, pooled | Both near, pooled | Both-near s, mean | Hero out | Time to knockout, median s | Prospects' sum while near, mean | Of the foes near |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const condition of CONDITIONS) {
    const rs = runs(condition), timed = rs.filter((r) => engaged(r, [1, 2]).time > 0.5);
    const outs = rs.filter((r) => r.knockout !== null).map((r) => r.knockout).sort((a, b) => a - b);
    const prospects = rs.filter((r) => r.prospect);
    console.log(`| ${condition} | ${rs.length} | ${meanOf(rs.map((r) => engaged(r, [1, 2]).time)).toFixed(1)} | ${fmt(boot(rs, pooled([1, 2])))} | ${fmt(boot(timed, (xs) => meanOf(xs.map((r) => { const e = engaged(r, [1, 2]); return e.lost / e.time; }))))} | `
      + `${fmt(boot(rs, pooled([1])))} | ${condition === "AB" ? fmt(boot(rs, pooled([2]))) : "-"} | ${condition === "AB" ? meanOf(rs.map((r) => r.bins[2].time)).toFixed(1) : "-"} | ${outs.length}/${rs.length} | ${outs.length ? outs[outs.length >> 1].toFixed(1) : "none"} | `
      + `${fmt(boot(prospects, (xs) => meanOf(xs.map((r) => r.prospect.sum))))} | ${fmt(boot(prospects, (xs) => meanOf(xs.map((r) => r.prospect.near))))} |`);
  }
  // Paired over placements: together against A + B, each a case's rate over its time engaged.
  const rate = (r, bins) => { const e = engaged(r, bins); return e.time > 0.5 ? e.lost / e.time : null; };
  const paired = [...byCase.values()].filter((row) => row.A && row.B && row.AB).map((row) => ({ A: rate(row.A, [1, 2]), B: rate(row.B, [1, 2]), AB: rate(row.AB, [1, 2]), both: rate(row.AB, [2]) }))
    .filter((row) => row.A !== null && row.B !== null && row.AB !== null);
  console.log("\nOver only the first seconds engaged (a run knocked out sooner, over the time it had), pooled:\n");
  console.log(`| Condition | ${EARLY.map((window) => `First ${window} s`).join(" | ")} |`);
  console.log(`|---|${EARLY.map(() => "---|").join("")}`);
  for (const condition of CONDITIONS) console.log(`| ${condition} | ${EARLY.map((window) => fmt(boot(runs(condition), (rs) => rs.reduce((s, r) => s + r.early[window].lost, 0) / rs.reduce((s, r) => s + r.early[window].time, 0)))).join(" | ")} |`);
  const placed = [...byCase.values()].filter((row) => row.A && row.B && row.AB);
  for (const window of EARLY) {
    const of = (rows, c) => rows.reduce((s, row) => s + row[c].early[window].lost, 0) / rows.reduce((s, row) => s + row[c].early[window].time, 0);
    console.log(`First ${window} s, together over A + B (pooled): ${fmt(boot(placed, (rows) => of(rows, "AB") / (of(rows, "A") + of(rows, "B")), 1000), 3)}`);
  }
  console.log(`\nPaired over ${paired.length} placements with every run engaged more than 0.5 s, a case's rate its loss over its time engaged:\n`);
  const diff = (of) => boot(paired, (xs) => meanOf(xs.map(of)));
  console.log(`- A alone ${fmt(diff((r) => r.A))}, B alone ${fmt(diff((r) => r.B))}, A + B ${fmt(diff((r) => r.A + r.B))}`);
  console.log(`- together, any near ${fmt(diff((r) => r.AB))}; together less A + B ${fmt(diff((r) => r.AB - r.A - r.B))}`);
  const withBoth = paired.filter((r) => r.both !== null);
  console.log(`- together, both near (${withBoth.length} placements with more than 0.5 s of it) ${fmt(boot(withBoth, (xs) => meanOf(xs.map((r) => r.both))))}; less A + B ${fmt(boot(withBoth, (xs) => meanOf(xs.map((r) => r.both - r.A - r.B))))}`);
  console.log(`- together (pooled, any near) over A + B (pooled): ${fmt(boot([...byCase.values()].filter((row) => row.A && row.B && row.AB), (rows) => pooled([1, 2])(rows.map((row) => row.AB)) / (pooled([1, 2])(rows.map((row) => row.A)) + pooled([1, 2])(rows.map((row) => row.B))), 1000), 3)}`);
  console.log("\nBy foe: blows' life taken from the hero a second the foe was near, and what the hero's mind expected of it at reach while near (mean `taken`):\n");
  console.log("| Condition | Foe | Near s, mean | Of it alone, mean | Life taken by its blows, mean | Taken a second near, pooled | Prospect's taken, mean while priced | Out of the fight |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const condition of CONDITIONS) for (const name of condition === "AB" ? ["A", "B"] : [condition]) {
    const fs = runs(condition).map((r) => r.byFoe[name]);
    const priced = fs.filter((f) => f.priced > 0);
    console.log(`| ${condition} | ${name} | ${meanOf(fs.map((f) => f.near)).toFixed(1)} | ${meanOf(fs.map((f) => f.alone)).toFixed(1)} | ${meanOf(fs.map((f) => f.taken)).toFixed(3)} | `
      + `${fmt(boot(fs, (xs) => { const t = xs.reduce((s, f) => s + f.near, 0); return t ? xs.reduce((s, f) => s + f.taken, 0) / t : NaN; }))} | `
      + `${priced.length ? fmt(boot(priced, (xs) => meanOf(xs.map((f) => f.prospect / f.priced)))) : "none"} | ${fs.filter((f) => f.out !== null).length}/${fs.length} |`);
  }
}

/** A seeded draw in [0, 1) for the bootstrap. */
function mulberry(seed) {
  let word = seed >>> 0;
  return () => { word = (word + 0x6d2b79f5) | 0; let t = Math.imul(word ^ (word >>> 15), 1 | word); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
