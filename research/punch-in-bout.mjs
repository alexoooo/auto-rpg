/**
 * **The straight punch in the game**: Arena bouts (`buildBout`) of a Classic fighter throwing the
 * straight punch (`straightPunch`, `src/core/skills/straight-punch.ts`) bare-handed at the head of
 * a bare-handed Warrior that stands in guard, priced by the arena's rulebook as its blows land (`Duel.blows`). A bout's
 * score is the hit points the foe lost less those the puncher lost, with `FELL` taken off for each
 * second the puncher spent down.
 *
 * Usage:
 *   node research/punch-in-bout.mjs [--settings '<json>'] [--gaps 1.2,1.6] [--seconds 8]  one setting, its blows printed
 *   node research/punch-in-bout.mjs --search [--generations 30] [--lambda 16] [--workers 15] [--seed 1] [--hz 120]
 *
 * Harness: Node, the core's world on Rapier (`DEFAULT_ENGINE`), the Arena's room, 120 Hz unless asked.
 */
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { buildBout } from "./bout.mjs";
import { cmaSearch, workerPool } from "./cma.mjs";
import { CLASSIC } from "../src/core/mind/config.ts";
import { STRAIGHT_PUNCH } from "../src/core/skills/straight-punch.ts";

/** A Warrior standing in guard, throwing nothing. */
const STANDS = Object.freeze({ ...CLASSIC, tactics: { kind: "stand" }, blow: null });

/** Both sides bare-handed: the Warrior's own loadout is a club. */
const BARE = Object.freeze({ left: "empty", right: "empty" });

/** Hit points a second down costs the puncher in the score. */
const FELL = 0.5;

/** The settings searched, each its range. */
const RANGES = Object.freeze({
  pace: [0.2, 1.2], reach: [0.4, 1.0], band: [0.02, 0.15], settle: [0, 0.6], through: [0, 0.4], hips: [0, 0.5], turn: [0, 0.45], lean: [0, 0.5],
  chamber: [0, 0.5], lead: [0, 0.15], elbow: [0, 0.25], brake: [0.02, 0.4], follow: [0, 0.06], longest: [0.15, 0.6], recover: [0.1, 0.8],
});
const KEYS = Object.keys(RANGES);
const toSettings = (u) => Object.fromEntries(KEYS.map((key, i) => [key, RANGES[key][0] + u[i] * (RANGES[key][1] - RANGES[key][0])]));
const toUnit = (settings) => KEYS.map((key) => (settings[key] - RANGES[key][0]) / (RANGES[key][1] - RANGES[key][0]));

/**
 * One Arena bout of `mind` (on the left) against `foe` `gap` m away for `seconds`, each side holding
 * what `held` says, bare-handed unless asked: every blow the
 * left's hands landed on the foe, what each side lost, how many blows the left threw, and the
 * seconds it spent down.
 */
export async function boutOf(mind, { foe = STANDS, gap = 1.4, seconds = 8, hz = 120, held = BARE } = {}) {
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", minds: { left: mind, right: foe }, held, gap }, { hz });
  try {
    const left = duel.duelists.left;
    let down = 0;
    while (world.time < seconds && !duel.verdict) {
      world.step();
      if (left.body.view.down) down += world.dt;
    }
    let given = 0, taken = 0;
    const punches = [];
    for (const blow of duel.blows) {
      const mine = blow.sides.findIndex((s) => s.fighter === "left");
      if (mine < 0) continue;
      const me = blow.sides[mine], them = blow.sides[1 - mine];
      given += them.damage; taken += me.damage;
      if (/^hand\./.test(me.segment)) punches.push({ time: +blow.time.toFixed(3), on: them.segment, closing: +blow.closing.toFixed(2), energy: +blow.energy.toFixed(1),
        kg: [+me.kg.toFixed(2), +them.kg.toFixed(2)], hp: [+them.damage.toFixed(3), +me.damage.toFixed(3)] });
    }
    const thrown = left.minded.skills.report.strike.thrown;
    return { gap, given, taken, down, thrown: thrown.left + thrown.right, punches, verdict: duel.verdict ? `${duel.verdict.winner ?? "draw"} by ${duel.verdict.ending}` : null, score: given - taken - FELL * down };
  } finally { dispose(); }
}

/** One bout of the straight punch with `settings` (`boutOf`), the rest of it the game's. */
export const punchBout = (settings, options) => boutOf({ ...CLASSIC, blow: { kind: "straight-punch", ...STRAIGHT_PUNCH, ...settings } }, options);

/** The bouts a setting is scored on: one a gap. */
const GAPS = [1.0, 1.4, 1.8, 2.2];

async function scoreOf(settings, hz) {
  const bouts = [];
  for (const gap of GAPS) bouts.push(await punchBout(settings, { gap, hz }));
  const mean = (key) => bouts.reduce((sum, b) => sum + b[key], 0) / bouts.length;
  return { score: mean("score"), given: mean("given"), taken: mean("taken"), down: mean("down"), thrown: mean("thrown"),
    landed: bouts.reduce((n, b) => n + b.punches.length, 0) / bouts.length };
}

if (!isMainThread && workerData?.punchInBout) {
  parentPort.on("message", async ({ id, x }) => {
    try { parentPort.postMessage({ id, r: await scoreOf(toSettings(x), workerData.hz) }); }
    catch (error) { parentPort.postMessage({ id, r: { score: -10, error: String(error) } }); }
  });
} else if (isMainThread && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2), arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i < 0 ? fallback : argv[i + 1]; };
  const hz = Number(arg("hz", 120));
  if (argv.includes("--search")) {
    const workers = Number(arg("workers", Math.max(1, availableParallelism() - 1))), pool = workerPool(new URL(import.meta.url), { hz, punchInBout: true }, workers);
    const start = toUnit({ ...STRAIGHT_PUNCH, ...JSON.parse(arg("settings", "{}")) }).map((v) => Math.min(1, Math.max(0, v)));
    try {
      const { best } = await cmaSearch({ n: KEYS.length, start, sigma: Number(arg("sigma", 0.2)), lambda: Number(arg("lambda", 16)), generations: Number(arg("generations", 30)),
        seed: Number(arg("seed", 1)), score: (u) => pool.evaluate(u),
        onGeneration: (entry, { best: found }) => console.log(JSON.stringify({ ...entry, bestSoFar: +found.score.toFixed(4), r: found.r, settings: toSettings(found.u) })) });
      console.log(JSON.stringify({ best: { score: best.score, r: best.r, settings: toSettings(best.u) } }));
    } finally { pool.terminate(); }
  } else {
    const settings = JSON.parse(arg("settings", "{}")), gaps = arg("gaps", GAPS.join(",")).split(",").map(Number);
    for (const gap of gaps) console.log(JSON.stringify(await punchBout(settings, { gap, seconds: Number(arg("seconds", 8)), hz })));
  }
}
