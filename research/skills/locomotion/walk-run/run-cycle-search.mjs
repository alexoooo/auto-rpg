/**
 * **The run's settings searched on its drill** (`RunCycleSettings`, `src/skills/locomotion/cycle-run.ts`,
 * through the walk and run that hands over to it, `walkRun`): CMA-ES in the unit cube of `DIMS`
 * (`research/cma.mjs`), each candidate the walk and run's research tuning over its body's record
 * (`move-drill.mjs`: `run`, and the walk's `at`, the pace past which it runs, `WalkRunSettings.run`,
 * and `swerve`, how fast it swings its velocity round), played on the training twin of the body's
 * run row (`--loadout`, one cell) at the game's rate, 120 Hz, the cell's own subject
 * (`option-drill`), and scored by the seconds its trials lose against their orders (`-lost`, a fall
 * at `FALL_PRICE`). It writes each generation to `<out>.jsonl` and the best to `<out>-best.json`.
 *
 *   node research/skills/locomotion/walk-run/run-cycle-search.mjs --out .tmp/<task>/run [--body workshop-fighter] [--loadout empty,empty]
 *     [--dims accel,brake] [--start '{"cv":0.3}' | file.json] [--braking-only] [--stride file.json]
 *     [--generations 60] [--lambda 28] [--sigma 0.1] [--workers 28] [--score] [--confirm <out>-best.json]
 *
 * - `--dims` names the settings moved, the rest the start's over the record's.
 * - `--braking-only` keeps the running cycle the record's and searches the decelerating one
 *   (`braking`), from the record's braking where it has one.
 * - `--stride` gives the run gait's walking stride (`GaitTuning`) for every candidate.
 * - `--score` plays the start alone and prints each trial; `--confirm` plays the best and the record
 *   on the row's own cases at 120 and 480 Hz, the worse counting.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { cmaSearch } from "../../../cma.mjs";
import { scoreOn, trialPool } from "../../../drill-trials.mjs";
import { confirmMove, moveRow, valuesWith, walkRunRecord } from "../move-drill.mjs";

/** Each setting searched and its range. */
const DIMS = {
  blend: [0, 1], short: [0, 1], swingGain: [0, 0.4], cadenceGain: [0, 0.3], gainsFrom: [2.2, 5], period: [0.8, 1.25], accel: [0.3, 4], brake: [0.3, 4], ahead: [0.1, 1.5],
  lean: [-0.05, 0.45], pelvis: [0.04, 0.2], leanGain: [0, 1], leanMost: [0, 0.6], bank: [-0.5, 1.5], hold: [0.5, 1], settle: [0.02, 0.15], stance: [0.4, 1], swing: [0.3, 1], ankle: [0.2, 1],
  cv: [-0.1, 0.4], cd: [-0.5, 0.8], late: [0.5, 0.95], paceGain: [0, 0.5], paceMost: [0, 0.4],
  contact: [0.1, 0.4], gainSide: [0, 0.4], width: [-0.05, 0.2], cvAnkleSide: [-1, 1], cdSide: [-0.5, 1],
  kneeAdd: [-0.2, 0.4], ankleAdd: [-0.3, 0.2], hipAdd: [-0.3, 0.3], wait: [0.001, 0.2], early: [0.05, 0.3], arms: [0, 3], elbow: [0.3, 1.8],
  at: [0.8, 1.6], swerve: [1, 4],
};
/** The walk's settings it moves, by the names it gives them, and the walk's own names for them. */
const WALK = { at: "run", swerve: "swerve" };

const { values: o } = parseArgs({ options: {
  out: { type: "string" }, body: { type: "string", default: "workshop-fighter" }, loadout: { type: "string" }, dims: { type: "string" }, start: { type: "string" },
  "braking-only": { type: "boolean" }, stride: { type: "string" }, generations: { type: "string", default: "60" }, lambda: { type: "string", default: "28" },
  sigma: { type: "string", default: "0.1" }, workers: { type: "string" }, score: { type: "boolean" }, confirm: { type: "string" },
} });
const pool = trialPool(Number(o.workers ?? Math.max(1, availableParallelism() - 4)));
/** The walk and run's tuning `point` gives: its cycle as the run (or, braking only, the braking), its `at` and `swerve` the walk's. */
const tuningOf = (point, braking, stride) => {
  const cycle = Object.fromEntries(Object.entries(point).filter(([key]) => !(key in WALK))), walk = Object.fromEntries(Object.entries(WALK).filter(([key]) => key in point).map(([key, name]) => [name, point[key]]));
  return { gaits: { run: { [braking ? "braking" : "run"]: cycle, ...(braking || !Object.keys(walk).length ? {} : { walk }), ...(stride ? { stride } : {}) } } };
};
try {
  if (o.confirm) {
    const found = JSON.parse(readFileSync(o.confirm, "utf8"));
    console.log(JSON.stringify(await confirmMove(moveRow(found.row).cells, tuningOf(found.run, found.braking, found.stride), { play: pool.play })));
  } else {
    const row = { body: o.body, skill: "run", ...(o.loadout ? { loadout: o.loadout } : {}) }, braking = !!o["braking-only"];
    const record = walkRunRecord(o.body), base = braking ? record.braking ?? record.run : record.run;
    const keys = o.dims ? o.dims.split(",") : Object.keys(DIMS).filter((key) => key in base || (!braking && key in WALK));
    for (const key of keys) if (!DIMS[key] || !(key in base || (!braking && key in WALK))) throw new Error(`no setting ${key} is searched`);
    const given = o.start ? JSON.parse(o.start.startsWith("{") ? o.start : readFileSync(o.start, "utf8")) : {};
    const start = { ...base, ...(braking ? {} : { at: record.walk.run, swerve: record.walk.swerve }), ...Object.fromEntries(Object.entries(given).filter(([key]) => key in base || (!braking && key in WALK))) };
    const stride = o.stride ? JSON.parse(readFileSync(o.stride, "utf8")) : undefined;
    const toUnit = (p) => keys.map((k) => ((p[k] ?? DIMS[k][0]) - DIMS[k][0]) / (DIMS[k][1] - DIMS[k][0]));
    const fromUnit = (u) => ({ ...start, ...Object.fromEntries(keys.map((k, i) => [k, +(DIMS[k][0] + Math.min(1, Math.max(0, u[i])) * (DIMS[k][1] - DIMS[k][0])).toFixed(4)])) });
    const { trials } = moveRow(row);
    console.error(`the run's ${braking ? "braking" : "cycle"} on ${o.body}: ${trials.length} trials of the twin a candidate`);
    // A candidate is scored by the time it loses; one none of whose trials counts scores below every one that has one.
    const score = async (u) => { const r = await scoreOn(trials, valuesWith(tuningOf(fromUnit(u), braking, stride)), { play: pool.play }); return { ...r, score: r.value === null ? -1e3 : -r.value }; };
    if (o.score) {
      const r = await score(toUnit(start));
      for (const one of r.each) console.log(`${one.name}: ${one.outcome}, ${one.value === null ? "-" : one.value.toFixed(2)} s lost${one.down ? ", fell" : ""}`);
      console.log(`lost ${r.value?.toFixed(3) ?? "-"} s a trial; fell ${r.falls} of ${r.trials}`);
    } else {
      if (!o.out) throw new Error("--out names the search's files");
      const { best } = await cmaSearch({ n: keys.length, start: toUnit(start), sigma: Number(o.sigma), lambda: Number(o.lambda), generations: Number(o.generations), seed: 1, score,
        onGeneration: (entry, { best }) => {
          const line = { ...entry, lost: best.r?.value, falls: best.r?.falls };
          console.log(JSON.stringify(line));
          appendFileSync(o.out + ".jsonl", JSON.stringify({ ...line, run: fromUnit(best.u) }) + "\n");
          writeFileSync(o.out + "-best.json", JSON.stringify({ row, braking, ...(stride ? { stride } : {}), run: fromUnit(best.u), lost: best.r?.value }, null, 1) + "\n");
        } });
      console.log("best", -best.score, "s lost");
    }
  }
} finally { await pool.terminate(); }
