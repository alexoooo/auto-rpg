/**
 * **The straight punch in the game**: Arena bouts (`buildBout`) of a Puncher (`PUNCHER`) throwing the
 * straight punch (`straightPunch`, `src/core/skills/straight-punch.ts`) bare-handed at what `--aim`
 * names (`SeekConfig.aim`, the head unless asked), come to as `--range` says (`SeekConfig.range`,
 * the edge unless asked), of a bare-handed Warrior, priced by the arena's
 * rulebook as its blows land (`Duel.blows`). A bout's
 * score is the hit points the foe lost less those the puncher lost, with `FELL` taken off for each
 * second the puncher spent down and `LOST` for a bout it lost; with `--head`, also that many hit points for
 * the share of the foe's vital part (its head) emptied, less the same of the puncher's, since an
 * emptied head ends the bout however full the rest is. The foes are a Warrior standing in
 * guard, or Classic, Combat, Brawler, Kicker, Scrapper or the Puncher fighting back
 * (`--foes stands,classic,combat,brawler,kicker,scrapper,puncher`), or a rival: the Puncher throwing
 * the straight punch with the settings `--rival` gives (`--foes rival`).
 * `--scene` also plays the punch test's bout (`tests/straight-punch.test.mjs`: walked in, on a Warrior
 * standing in guard 1.2 m off, 5 s) and takes off what it falls short of there: `SHORT` a wounding
 * punch under two, and `SHORT` a kilogram under 1.5 that the heaviest wounding fist met.
 *
 * Usage:
 *   node research/punch-in-bout.mjs [--settings '<json>'] [--gaps 1.2,1.6] [--seconds 8] [--foes stands] [--aim head] [--range edge]  one setting, its blows printed
 *   node research/punch-in-bout.mjs --search [--foes stands,classic] [--aim head] [--range edge] [--gaps 1,1.4] [--seconds 8] [--settings '<json>'] [--fixed '<json>'] [--rival '<json>'] [--scene] [--head 2] [--sigma 0.2] [--generations 30] [--lambda 16] [--workers 15] [--seed 1] [--hz 120]
 *
 * `--fixed` holds the settings it names where it puts them and searches the rest.
 *
 * Harness: Node, the core's world on Rapier (`DEFAULT_ENGINE`), the Arena's room, 120 Hz unless asked.
 */
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { buildBout } from "./bout.mjs";
import { cmaSearch, workerPool } from "./cma.mjs";
import { BRAWLER, CLASSIC, COMBAT, KICKER, PUNCHER, SCRAPPER } from "../src/core/mind/config.ts";
import { STRAIGHT_PUNCH } from "../src/core/skills/straight-punch.ts";

/** A Warrior standing in guard, throwing nothing. */
const STANDS = Object.freeze({ ...CLASSIC, tactics: { kind: "stand" }, blow: null });

/** Both sides bare-handed: the Warrior's own loadout is a club. */
const BARE = Object.freeze({ left: "empty", right: "empty" });

/** Hit points a second down costs the puncher in the score, and a bout lost. */
const FELL = 0.5, LOST = 1;

/** Hit points a wounding punch or a kilogram short of the punch test's bout costs in the score. */
const SHORT = 0.5;

const argOf = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
/** The rival's straight punch settings, over the Puncher's. */
const RIVAL = Object.freeze(isMainThread ? JSON.parse(argOf("rival") ?? "{}") : workerData?.rival ?? {});

/** The foes a setting may be scored against, by name. */
const FOES = Object.freeze({ stands: STANDS, classic: CLASSIC, combat: COMBAT, brawler: BRAWLER, kicker: KICKER, scrapper: SCRAPPER, puncher: PUNCHER,
  rival: { ...PUNCHER, blow: { ...PUNCHER.blow, ...RIVAL } } });

/** The settings searched, each its range. */
const RANGES = Object.freeze({
  pace: [0.2, 2], reach: [0.6, 1.3], band: [0.02, 0.3], settle: [0, 0.6], through: [0, 0.4], hips: [0, 0.5], turn: [0, 0.45], lean: [0, 0.5],
  chamber: [0, 0.5], lead: [0, 0.15], elbow: [0, 0.25], brake: [0, 0.4], follow: [0, 0.06], longest: [0.15, 0.6], recover: [0.1, 0.8],
});
const FIXED = Object.freeze(isMainThread ? JSON.parse(argOf("fixed") ?? "{}") : workerData?.fixed ?? {});
const KEYS = Object.keys(RANGES).filter((key) => !(key in FIXED));
const toSettings = (u) => ({ ...Object.fromEntries(KEYS.map((key, i) => [key, RANGES[key][0] + u[i] * (RANGES[key][1] - RANGES[key][0])])), ...FIXED });
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
    const headOf = (side) => { const d = duel.duelists[side], vital = d.body.built.spec.wounds.vital[0]; return 1 - d.pool.hp(vital) / d.pool.max(vital); };
    const thrown = left.minded.skills.report.strike.thrown;
    const lost = duel.verdict?.winner === "right" ? 1 : 0;
    return { gap, given, taken, heads: [headOf("right"), headOf("left")], down, lost, thrown: thrown.left + thrown.right, punches, verdict: duel.verdict ? `${duel.verdict.winner ?? "draw"} by ${duel.verdict.ending}` : null,
      score: given - taken - FELL * down - LOST * lost };
  } finally { dispose(); }
}

/** One bout of the straight punch with `settings` (`boutOf`), aimed at what `aim` names (`SeekConfig.aim`) and come to as `range` says (`SeekConfig.range`), the rest of it the Puncher's. */
export const punchBout = (settings, { aim = PUNCHER.tactics.aim, range = PUNCHER.tactics.range, ...options } = {}) =>
  boutOf({ ...PUNCHER, tactics: { ...PUNCHER.tactics, aim, range }, blow: { kind: "straight-punch", ...STRAIGHT_PUNCH, ...settings } }, options);

/** The bouts a setting is scored on unless asked: one a gap against each foe named. */
const GAPS = [1.0, 1.4, 1.8, 2.2];

/** What `settings` fall short of in the punch test's bout: wounding punches under two, and kilograms under 1.5 that the heaviest wounding fist met. */
async function sceneShortOf(settings, hz) {
  const bout = await punchBout(settings, { foe: STANDS, gap: 1.2, seconds: 5, hz, range: "close" });
  const wounding = bout.punches.filter((p) => p.hp[0] > 0.01);
  return Math.max(0, 2 - wounding.length) + Math.max(0, 1.5 - Math.max(0, ...wounding.map((p) => p.kg[0])));
}

async function scoreOf(settings, { hz, foes, aim, range, gaps, seconds, scene, head }) {
  const bouts = [];
  for (const foe of foes) for (const gap of gaps) bouts.push(await punchBout(settings, { foe: FOES[foe], gap, hz, aim, range, seconds }));
  const mean = (key) => bouts.reduce((sum, b) => sum + b[key], 0) / bouts.length;
  const short = scene ? await sceneShortOf(settings, hz) : 0, heads = bouts.reduce((sum, b) => sum + b.heads[0] - b.heads[1], 0) / bouts.length;
  return { score: mean("score") + head * heads - SHORT * short, short, heads, given: mean("given"), taken: mean("taken"), down: mean("down"), thrown: mean("thrown"),
    lost: mean("lost"), landed: bouts.reduce((n, b) => n + b.punches.length, 0) / bouts.length };
}

if (!isMainThread && workerData?.punchInBout) {
  parentPort.on("message", async ({ id, x }) => {
    try { parentPort.postMessage({ id, r: await scoreOf(toSettings(x), workerData) }); }
    catch (error) { parentPort.postMessage({ id, r: { score: -10, error: String(error) } }); }
  });
} else if (isMainThread && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2), arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i < 0 ? fallback : argv[i + 1]; };
  const hz = Number(arg("hz", 120)), foes = arg("foes", "stands").split(","), aim = arg("aim", PUNCHER.tactics.aim), range = arg("range", PUNCHER.tactics.range);
  const gaps = arg("gaps", GAPS.join(",")).split(",").map(Number), seconds = Number(arg("seconds", 8)), scene = argv.includes("--scene"), head = Number(arg("head", 0));
  for (const foe of foes) if (!FOES[foe]) throw new Error(`no foe ${foe}: ${Object.keys(FOES).join(", ")}`);
  if (argv.includes("--search")) {
    const workers = Number(arg("workers", Math.max(1, availableParallelism() - 1))), pool = workerPool(new URL(import.meta.url), { hz, foes, aim, range, gaps, seconds, scene, head, fixed: FIXED, rival: RIVAL, punchInBout: true }, workers);
    const start = toUnit({ ...STRAIGHT_PUNCH, ...JSON.parse(arg("settings", "{}")) }).map((v) => Math.min(1, Math.max(0, v)));
    try {
      const { best } = await cmaSearch({ n: KEYS.length, start, sigma: Number(arg("sigma", 0.2)), lambda: Number(arg("lambda", 16)), generations: Number(arg("generations", 30)),
        seed: Number(arg("seed", 1)), score: (u) => pool.evaluate(u),
        onGeneration: (entry, { best: found }) => console.log(JSON.stringify({ ...entry, bestSoFar: +found.score.toFixed(4), r: found.r, settings: toSettings(found.u) })) });
      console.log(JSON.stringify({ best: { score: best.score, r: best.r, settings: toSettings(best.u) } }));
    } finally { pool.terminate(); }
  } else {
    const settings = JSON.parse(arg("settings", "{}"));
    for (const foe of foes) for (const gap of gaps) console.log(JSON.stringify(await punchBout(settings, { foe: FOES[foe], gap, seconds, hz, aim, range })));
  }
}
