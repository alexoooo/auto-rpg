/**
 * **A look at a skill's movement** ([the skill recipe](../docs/recipes/skill.md#the-procedure)): a
 * body's skill, as one of its variations, played on its table cell's research trials (its drill's
 * training twin; `--cell` names the table's skill where it is not the skill's own, `punch` for
 * `straight-punch`), how many landed (or reached what the drill asks), went down, and ended where the
 * skill says it leaves its body (`AsSkill.ends`), each rung's apart with its mean value, and a
 * strip of frames of a few of them, drawn from the side at each change of the skill's stage and
 * every 0.1 s while it acts (`look-image.mjs`). It is kept in `research/looks/<body>/<variation>/<code>/`,
 * `<code>` the hash of the skill's code and records (`lookCode`, `look-gate.mjs`): `look.json` (the counts and each
 * strip's frames, their time and stage) and `strip-<k>.png`, which Git does not keep: this redraws it. Beside them, `verdict.md`, written by
 * whoever reads the strips, says whether the movement looks like the motion and works some of the
 * time; a search reads it before it starts (`requireLook`), and a change to the skill's code is a new
 * `<code>` with no verdict.
 *
 *   npm run look -- <body> <skill/variation> [--cell <the table's skill>] [--loadout left,right] [--tuning settings.json] [--trials 32] [--strips 4]
 */
import "../tests/harness/preload-data.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { cellOf, drillTrials, endsOf, playTrial, subjectOf, trialPool, withTuning } from "./drill-trials.mjs";
import { bodyShape, drawBodies, stripPng } from "./look-image.mjs";
import { belowNormal, defaultLanes } from "../scripts/lanes.mjs";
import { lookCode, lookDir } from "./look-gate.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/** The most panels a strip has; a strip with more keeps each change of stage and spaces the rest. */
const PANELS = 14;
/** How often a frame is drawn while the skill acts, s, and after it ends. */
const EVERY = 0.1, AFTER = [0.3, 1];

/** The subject's value of `trial` as `variation`, with `tuning` over its record where given. */
function valueOf(trial, variation, tuning) {
  const value = subjectOf(trial).value, skill = variation.split("/")[0];
  const variations = (value.variations ?? []).filter((one) => !one.startsWith(`${skill}/`)).concat(variation);
  return tuning ? withTuning({ ...value, variations }, tuning) : { ...value, variations };
}

/** The facing of `built`'s root about the vertical, as a unit (x, z). */
function facing(duelist) {
  const q = duelist.body.view.root.rotation, yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
  return [Math.sin(yaw), Math.cos(yaw)];
}

/**
 * **A strip of `trial`**: played with `value`, a frame at each change of the stage of the actor's (the
 * left side's) first action and every `EVERY` s while it is under way, and `AFTER` s after it ends;
 * drawn about where the actor stood, and across its facing, as the first action began.
 */
async function strip(trial, value) {
  const frames = [];
  let seen = "", first = null, ended = null, nextAt = 0, shapes = null, view = null;
  await playTrial(trial, value, {
    watch: (built) => {
      const { duel, world } = built, me = duel.duelists.left, time = world.time;
      shapes ??= [duel.duelists.left, duel.duelists.right].map((one) => ({ built: one.built, shape: bodyShape(one.built.spec) }));
      const actions = me.minded.skills?.report.actions ?? [];
      if (first === null && actions.length) { first = actions[0].id; const c = me.body.view.stance.centre; view = { origin: [c.x, c.z], heading: facing(me) }; }
      const action = first === null || ended !== null ? undefined : actions.find((a) => a.id === first), acts = action ? `${action.action}:${action.stage ?? action.phase}` : "";
      if (first !== null && !action && ended === null) ended = time;
      const changed = acts !== seen && acts !== "", timed = acts && time >= nextAt, after = ended !== null && AFTER.some((a) => time >= ended + a && time - 1 / 120 < ended + a);
      if (first !== null && (changed || timed || after)) {
        frames.push({ time: +time.toFixed(3), stage: acts || (me.standing ? "standing" : "down"), key: changed || after,
          drawn: drawBodies(shapes.map((s, k) => ({ ...s, colour: k === 0 ? [60, 110, 210] : [205, 70, 60] })), view) });
        nextAt = time + EVERY;
      }
      seen = acts;
    },
  });
  if (frames.length <= PANELS) return frames;
  const keys = frames.filter((f) => f.key), rest = frames.filter((f) => !f.key), room = Math.max(0, PANELS - keys.length);
  const spaced = rest.filter((_, k) => room > 0 && k % Math.ceil(rest.length / room) === 0);
  return [...keys, ...spaced].sort((a, b) => a.time - b.time).slice(0, PANELS);
}

async function main() {
  const args = process.argv.slice(2), flag = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1]; };
  const [body, variation] = args.filter((a, k) => !a.startsWith("--") && !args[k - 1]?.startsWith("--"));
  if (!body || !variation?.includes("/")) throw new Error("npm run look -- <body> <skill/variation> [--cell <the table's skill>] [--loadout left,right] [--tuning settings.json] [--trials 32] [--strips 4]");
  belowNormal();
  const tuningPath = flag("tuning", null), tuning = tuningPath ? JSON.parse(readFileSync(tuningPath, "utf8")) : null;
  const cell = cellOf({ body, skill: flag("cell", variation.split("/")[0]), loadout: flag("loadout", "empty,empty") });
  const all = drillTrials(cell, "twin"), count = Math.min(all.length, Number(flag("trials", 32)));
  const trials = Array.from({ length: count }, (_, k) => all[Math.floor(k * all.length / count)]);
  const code = lookCode(variation, tuning), dir = lookDir(body, variation, code);
  mkdirSync(dir, { recursive: true });
  const pool = trialPool(Math.min(defaultLanes(), trials.length));
  let played;
  try { played = await Promise.all(trials.map((trial) => pool.play(trial, valueOf(trial, variation, tuning)))); }
  finally { await pool.terminate().catch(() => {}); }
  const strips = Math.min(count, Number(flag("strips", 4))), shown = [];
  for (let k = 0; k < strips; k++) {
    const at = Math.floor(k * count / strips), frames = await strip(trials[at], valueOf(trials[at], variation, tuning));
    writeFileSync(join(dir, `strip-${k}.png`), stripPng(frames.map((f) => f.drawn)));
    shown.push({ strip: `strip-${k}.png`, trial: trials[at].name, rung: trials[at].protocol, outcome: played[at].outcome, down: played[at].down, frames: frames.map(({ time, stage }) => ({ time, stage })) });
  }
  const outcomes = {};
  for (const one of played) outcomes[one.outcome ?? "none"] = (outcomes[one.outcome ?? "none"] ?? 0) + 1;
  const ends = endsOf(trials[0].skill), rungs = {};
  // Each rung's own counts, a cell reading more than one (the kick's middle and base).
  played.forEach((one, k) => {
    const rung = rungs[trials[k].protocol] ??= { trials: 0, landed: 0, down: 0, endedAsItMust: 0, value: 0, counted: 0 };
    rung.trials++; if (one.value !== null) { rung.value += one.value; rung.counted++; } rung.landed += one.outcome === "landed" ? 1 : 0; rung.down += one.down ? 1 : 0; rung.endedAsItMust += ends.includes(one.ended) ? 1 : 0;
  });
  // Each rung's mean value as its cell values a trial (`trialValue`), over the trials that count.
  for (const rung of Object.values(rungs)) { rung.value = rung.counted ? +(rung.value / rung.counted).toFixed(3) : null; delete rung.counted; }
  const look = { body, variation, code, tuning, cell: `${cell.body} ${cell.skill} ${trials[0].drill}/${trials[0].protocol}`, trials: count,
    landed: played.filter((one) => one.outcome === "landed").length, down: played.filter((one) => one.down).length,
    ends, endedAsItMust: played.filter((one) => ends.includes(one.ended)).length, outcomes, rungs, strips: shown };
  writeFileSync(join(dir, "look.json"), JSON.stringify(look, null, 1) + "\n");
  const verdict = join(dir, "verdict.md");
  if (!existsSync(verdict)) writeFileSync(verdict, [`# ${body}'s ${variation} at ${code}`, "", "Looks like the motion: no", "Works some of the time: no", "",
    "What the strips show, against how a person does it:", ""].join("\n") + "\n");
  console.log(`${relative(ROOT, dir)}: landed ${look.landed}/${count}, down ${look.down}/${count}, ended ${ends.join(" or ")} ${look.endedAsItMust}/${count}, ${JSON.stringify(outcomes)}, by rung ${JSON.stringify(rungs)}; strips ${shown.map((s) => s.strip).join(", ")}; its verdict ${relative(ROOT, verdict)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
