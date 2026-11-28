/**
 * **The value fitted to what followed** (`FittedValue`, `src/minds/option/predictions/value/fitted-value.ts`;
 * `assets/minds/fitted-value.json`): the life a body dealt and the life it took over each of
 * `HORIZONS` s after the states the game's Mind decided at, each fitted by boosted regression trees
 * to those states as the fitted leaf reads one (`readingAt`, `featuresOf`).
 *
 *   node research/minds/fitted-value.mjs collect <protocol> <from> <to> <dir> [<mind.json>]
 *   node research/minds/fitted-value.mjs fit <dir>... [--write [--asset <name>]]
 *
 * `collect` plays the match evaluation's `<protocol>` bouts `<from>` to `<to>`, the game's Mind on
 * both sides (`option`) or the Mind `<mind.json>` configures, and keeps in `<dir>` the Mind it played
 * (`mind.json`: its config, or "option"), each tree search's root as read there
 * (`fitted-value-hook.mjs`), each bout's bodies, the Mind that played each side and what it read (`Played`), and its lives at each step either changes. `fit` reads them,
 * holds out the bouts `HELD` names, fits each horizon's dealt and taken on the rest and says each
 * one's held-out R², and that of 2 dealt less taken read from the two beside trees fitted to it
 * alone (not kept): what fitting them apart loses; `--write` puts the models in the game's asset
 * (`assets/minds/fitted-value.json`, or `assets/minds/<name>.json` with `--asset`) with where
 * they came from, the Minds that played its bouts (`Origin.minds`) and the bodies its bouts played (each row's `bodies`).
 */
import { register } from "node:module";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fitValue, followed, HORIZONS } from "./value-fit.mjs";

const SCRIPT = "research/minds/fitted-value.mjs";
/** The asset `--asset <name>` names, the game's fitted value's where none. */
const assetOf = (args) => { const at = args.indexOf("--asset"); return `assets/minds/${at < 0 ? "fitted-value" : args[at + 1]}.json`; };
/** The bouts held out of a fit: the drawn mirror's from its 108th. */
const HELD = (bout) => bout.startsWith("warrior-drawn/") && Number(bout.split("/")[1]) >= 108;

const [mode, ...args] = process.argv.slice(2);
if (mode === "collect") await collect(...args);
else if (mode === "fit") await fitAll(args.filter((arg, k) => arg !== "--write" && arg !== "--asset" && args[k - 1] !== "--asset"), args.includes("--write") ? assetOf(args) : null);
else throw new Error("usage: fitted-value.mjs collect <protocol> <from> <to> <dir> [<mind.json>] | fit <dir>... [--write [--asset <name>]]");

/** Play bouts `from` to `to` of `protocol`, the game's Mind or the one at `mindPath` on both sides, keeping each search's root and each bout's lives in `dir`. */
async function collect(protocol, from, to, dir, mindPath) {
  register("./fitted-value-hook.mjs", import.meta.url);
  await import("../../tests/harness/preload-data.mjs");
  const { EVALUATIONS, playCase } = await import("../../src/app/node/evaluation.ts");
  const { DEFAULT_ENGINE } = await import("../../src/core/physics/engines.ts");
  const { isRefused } = await import("../../src/core/refusal.ts");
  const { graceAt } = await import("../../src/minds/option/situation/reach-memory.ts");
  const { bodyOf, offeredOf, readingAt } = await import("../../src/minds/option/predictions/value/fitted-value.ts");
  const { playedBy } = await import("../skills/profile-origin.mjs");
  const { SIDES } = await import("../../src/game/arena/duel.ts");
  const evaluation = EVALUATIONS.match, cases = evaluation.protocols[protocol], [subject] = evaluation.subjects(mindPath ? [mindPath, mindPath].map((path, k) => ({ id: `mind${k}`, label: "mind", value: JSON.parse(readFileSync(path, "utf8")) })) : ["option", "option"]);
  if (!cases) throw new Error(`no match protocol ${protocol}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/mind.json`, JSON.stringify(mindPath ? JSON.parse(readFileSync(mindPath, "utf8")) : "option") + "\n");
  for (const [i, condition] of cases.conditions.slice(Number(from), Number(to)).entries()) {
    const bout = `${protocol}/${Number(from) + i}`, world = cases.world([subject.value, subject.value], condition, cases.engine ?? DEFAULT_ENGINE, [{}, {}]);
    if (isRefused(world)) throw new Error(world.refused);
    let duel = null; const states = [], lives = [], bodies = new Set();
    globalThis.__searchRoot = (root, at) => {
      if (!duel || !root.focus) return;
      bodies.add(bodyOf(root.focus.spec));
      const offered = [];
      for (const pair of at.pairsAt(root)) { const terms = at.modelAt(pair, root); if (terms) offered.push(offeredOf(pair.option.kind, pair.option.open === true, terms)); }
      states.push({ side: root.focus.side === "left" ? "right" : "left", t: duel.clock, reading: readingAt(root, graceAt(root), offered) });
    };
    const played = await playCase(world, cases.seconds, (built) => {
      duel = built.duel; const reader = cases.read(built, condition);
      return { afterStep() {
        reader.afterStep();
        const now = [duel.life("left"), duel.life("right")], last = lives[lives.length - 1];
        if (!last || now.some((life, k) => life !== last[k + 1])) lives.push([duel.clock, ...now]);
      }, get ended() { return reader.ended; }, reading: () => reader.reading() };
    }, {});
    if (isRefused(played)) throw new Error(played.refused);
    appendFileSync(`${dir}/states-${protocol}-${from}.jsonl`, JSON.stringify({ bout, bodies: [...bodies], played: SIDES.map((side) => playedBy(duel.duelists[side].body.built.spec, duel.duelists[side].mind)), end: duel.clock, lives, states }) + "\n");
    console.log(`${bout}: ${states.length} states, ${duel.clock.toFixed(1)} s`);
  }
}

/** Fit each horizon to the states in `dirs`, say each one's held-out R², and keep them in the asset `out` where given. */
async function fitAll(dirs, out) {
  const { FEATURES, featuresOf } = await import("../../src/minds/option/predictions/value/fitted-value.ts");
  const { drainOf, GAME_ENDS } = await import("../../src/game/arena/end-rule.ts");
  // The tournament's bouts are played under the game's end rules.
  const drained = drainOf(GAME_ENDS);
  const { playedOnce } = await import("../skills/profile-origin.mjs");
  const states = [], bouts = new Set(), bodies = new Set(), played = [];
  for (const dir of dirs) for (const name of readdirSync(dir).filter((file) => /^states-.*\.jsonl$/.test(file)).sort())
    for (const line of readFileSync(`${dir}/${name}`, "utf8").split("\n")) {
      if (!line) continue;
      const { bout, end, lives, states: roots, ...row } = JSON.parse(line);
      if (!Array.isArray(row.bodies)) throw new Error(`${bout}: no bodies kept`);
      if (!Array.isArray(row.played)) throw new Error(`${bout}: the Minds that played it were not kept; collect it again`);
      bouts.add(bout); for (const body of row.bodies) bodies.add(body);
      played.push(...row.played);
      for (const { side, t, reading } of roots)
        states.push({ x: featuresOf(reading), held: HELD(bout), weight: 1, after: HORIZONS.map((h) => followed(lives, end, side, t, h, drained)) });
    }
  console.log(`${states.length} states of ${bouts.size} bouts: ${states.filter((s) => !s.held).length} fitted, ${states.filter((s) => s.held).length} held out`);
  const { models, fitted, held } = fitValue(states, FEATURES.length);
  if (!out) return;
  const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(), minds = [...new Set(dirs.map(mindOf))];
  const origin = `${SCRIPT} fit at ${commit}: ${fitted} states of ${minds.join(" and ")} on both sides, in ${[...bouts].filter((b) => !HELD(b)).length} bouts (${dirs.join(", ")}), ${held} held out`;
  writeFileSync(out, JSON.stringify({ origin, from: { minds: playedOnce(played) }, bodies: [...bodies].sort(), features: FEATURES, horizons: HORIZONS, models }) + "\n");
  console.log(`wrote ${out}: ${origin}`);
}

/** The Mind a run directory's rows played, as `collect` kept it (`mind.json`): the game's Mind (`option`) where it kept none, as it did before it kept one. */
function mindOf(dir) {
  const mind = existsSync(`${dir}/mind.json`) ? JSON.parse(readFileSync(`${dir}/mind.json`, "utf8")) : "option";
  return mind === "option" ? "the game's Mind (option)" : `the Mind ${JSON.stringify(mind)}`;
}
