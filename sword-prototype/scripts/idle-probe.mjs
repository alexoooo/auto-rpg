// The decisiveness floor: can a mind kill a body that does nothing?
//
//   node scripts/idle-probe.mjs [--mind golem-policy] [--checkpoint run-checkpoint.json]
//     [--read greedy|drawn] [--bouts 4] [--workers N] [--cap 60] [--seed 20260906] [--random 40]
//     [--terminals maul,mace|all]
//
// Every bout is a build against *itself*, one side driven and the other on `idle`, so the only
// question a row answers is whether this mind on this body can finish an opponent that never
// moves, never blocks and never steps away. A layout that cannot decide here cannot decide
// anything, and a mind that cannot decide here is not the body's fault.
//
// **Why this is a shipped script and not a scratch file.** It began as one, in `.review/`, and
// Session 14's calibration is written on what it measured: `golem-driver` finishes all twenty
// eight maul bouts and two per cent of the blade ones, which is what turned "the fit is bad" into
// "thirty eight of fifty two bodies cannot decide a bout and the rollout is mostly noise from
// them". Session 14's plan then made the kill rate by weapon class a permanent tripwire beside the
// checkpoint matrix, and a tripwire that lives in a gitignored directory is not one.
//
// **The rollup is the finding and the per-build rows are the evidence.** A draw index is a fact
// about one seed; "the maul finishes and the blade does not" is a fact about weapons, and it is
// the second that a session is allowed to write down.
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { armedTerminal, runJobs, seedFor } from "./tournament.mjs";
import { parseTerminals, poolFor, poolSentence } from "./train-ppo.mjs";
import { viablePair } from "../src/golem/viability.ts";

const meanOf = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * The per-build rows rolled up by armed terminal: the class's mean of the per-build rates, and
 * the class's own table.
 *
 * **Both, because they answer different questions.** `killRate` is the mean of the builds' rates,
 * which is what a row prints and what makes a class of seven builds comparable to a class of
 * fourteen. `kills` and `bouts` are the integers, which is what a 2x2 test wants and what the mean
 * cannot be turned back into once a bout is lost to a dead worker. It is a separate function from
 * the probe so that it can be tested on a table with kills in it, rather than only on whatever a
 * six-second fixture happens to finish.
 */
export function rollupByTerminal(builds) {
  const byTerminal = new Map();
  for (const t of builds) {
    if (!byTerminal.has(t.terminal)) byTerminal.set(t.terminal, { terminal: t.terminal, builds: 0, always: 0, rate: 0, kills: 0, played: 0, theirBar: 0, damage: 0 });
    const g = byTerminal.get(t.terminal);
    g.builds += 1;
    g.always += t.always ? 1 : 0;
    g.rate += t.killRate;
    g.kills += t.won;
    g.played += t.bouts;
    g.theirBar += t.theirBar;
    g.damage += t.meanDamage;
  }
  return [...byTerminal.values()]
    .map((g) => ({ terminal: g.terminal, builds: g.builds, always: g.always, kills: g.kills, bouts: g.played, killRate: g.rate / g.builds, theirBar: g.theirBar / g.builds, damage: g.damage / g.builds }))
    .sort((a, b) => b.killRate - a.killRate);
}

/**
 * The motionless bodies one build can be probed against, in pool order.
 *
 * Mirrored, that is the build itself and nothing else, which is what every probe in the record
 * before Session 10 of the learn set ran. On random pairs it is every *other* build in the pool
 * that `viablePair` accepts against it -- the same predicate the rollouts and the ratings reject
 * on -- and the list is walked in order rather than drawn, because a probe is a floor and a floor
 * that moved with a draw index would be a floor nobody could re-test.
 *
 * A build with no viable partner in the pool is probed against itself, with a note the caller can
 * count. Dropping it instead would silently change which bodies the class rollup is a mean over,
 * which is the one thing a tripwire may not do.
 */
export function probePartners(pool, build, mirror = true) {
  if (mirror) return [build];
  const partners = pool.filter((other) => other !== build && viablePair(build.setup, other.setup));
  return partners.length === 0 ? [build] : partners;
}

/**
 * The probe: every build in `pool` against a motionless body, both corners.
 *
 * `name` is the policy the fighter plays. When `contender` is given it is that name's entry in
 * the contenders table -- a checkpoint's weights, or `{uniform: true}` -- so a mind that has not
 * been shipped can stand on the same bar as one that has. `bouts` is per build and rounded up to
 * an even number, because a bout is run from both corners and a half pairing is not a thing.
 *
 * **`mirror` is Session 10 of the learn set and it is the same axis the ratings grew.** Mirrored,
 * the motionless body is a copy of the fighter's own, and the row answers "can this mind on this
 * body finish an opponent that never moves". Off, the motionless body is a different one
 * `viablePair` accepts, and the row answers the question the record could not ask: whether the
 * floor survives the two bodies differing. The table is keyed on the *fighter's* build either way,
 * so the class rollup means the same thing in both and the two rows sit side by side.
 */
export async function idleProbe({
  pool, name = "golem-policy", contender = null, bouts = 4, workers = 8, cap = 60, seed = 20260906,
  mirror = true, onProgress = null,
}) {
  if (pool.length === 0) throw new Error("an idle probe needs a build to run");
  const contenders = contender === null ? null : { [name]: contender };
  const per = Math.max(2, Math.ceil(bouts / 2) * 2);
  const jobs = [];
  let lonely = 0;
  for (const [b, build] of pool.entries()) {
    const partners = probePartners(pool, build, mirror);
    if (!mirror && partners[0] === build) lonely += 1;
    for (let k = 0; k < per / 2; k += 1) {
      // The pairing index is the build's slot times a large stride, so a build's seeds do not
      // depend on how many builds came before it and a filtered pool probes the same fights.
      const pairing = b * 1024 + k;
      // Walked rather than drawn, and walked from `k` so that a build asked for four bouts meets
      // four different partners rather than the same one four times.
      const against = partners[k % partners.length];
      const fighter = { build: build.name, setup: build.setup, policy: name, seed: seedFor(seed, pairing, 0) };
      const dummy = { build: against.name, setup: against.setup, policy: "idle", seed: seedFor(seed, pairing, 1) };
      jobs.push({ index: jobs.length, pairing, swapped: false, cap, left: fighter, right: dummy, seeds: [fighter.seed, dummy.seed] });
      jobs.push({ index: jobs.length, pairing, swapped: true, cap, left: dummy, right: fighter, seeds: [dummy.seed, fighter.seed] });
    }
  }
  const rows = await runJobs(jobs, { workers, contenders, onProgress });
  const table = new Map();
  for (const row of rows) {
    if (row === null) continue;
    const me = row.left.policy === name ? "left" : "right";
    const them = me === "left" ? "right" : "left";
    const key = row[me].build;
    if (!table.has(key)) {
      table.set(key, { name: key, caption: "", bouts: 0, won: 0, lost: 0, kills: [], bar: [], theirs: [], damage: [], severs: [], strokes: [], started: [], aborts: [] });
    }
    const t = table.get(key);
    t.bouts += 1;
    if (row.winner === me) { t.won += 1; t.kills.push(row.seconds); }
    if (row.winner === them) t.lost += 1;
    t.bar.push(row[me].vitality);
    t.theirs.push(row[them].vitality);
    t.damage.push(row[me].damage);
    t.severs.push(row[me].severs);
    t.strokes.push(row[me].strokes ?? 0);
    if (row[me].strokesStarted !== undefined) t.started.push(row[me].strokesStarted);
    if (row[me].aborts !== undefined) t.aborts.push(row[me].aborts);
  }
  for (const build of pool) {
    const t = table.get(build.name);
    if (t) t.caption = build.caption;
  }
  const builds = [...table.values()]
    .map((t) => ({
      ...t, killRate: t.bouts === 0 ? 0 : t.won / t.bouts, always: t.bouts > 0 && t.won === t.bouts,
      theirBar: meanOf(t.theirs), myBar: meanOf(t.bar), meanDamage: meanOf(t.damage),
      meanStrokes: meanOf(t.strokes), killSeconds: t.kills.length === 0 ? null : meanOf(t.kills),
      terminal: armedTerminal(pool.find((b) => b.name === t.name).setup),
    }))
    .sort((a, b) => b.killRate - a.killRate || a.theirBar - b.theirBar);
  const classes = rollupByTerminal(builds);
  const played = builds.reduce((sum, t) => sum + t.bouts, 0);
  const kills = builds.reduce((sum, t) => sum + t.won, 0);
  return {
    name, bouts: played, kills, killRate: played === 0 ? 0 : kills / played,
    alwaysBuilds: builds.filter((t) => t.always).length,
    everBuilds: builds.filter((t) => t.won > 0).length,
    totalBuilds: builds.length, builds, byTerminal: classes,
    // The arrangement, and how many builds had to fall back to a copy of themselves under it,
    // because a random-pairs probe in which every build was lonely is a mirrored probe wearing
    // the other word and the row should be able to say so.
    mirror, lonely,
  };
}

/** The rollup as the tripwire reads it: kill rate by weapon class, and the pool total. */
export function formatIdleProbe(result) {
  const lines = [
    "| armed terminal | builds | always kills | kill rate | dummy bar left | damage |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const g of result.byTerminal) {
    lines.push(`| ${g.terminal} | ${g.builds} | ${g.always} of ${g.builds} | ${(g.killRate * 100).toFixed(0)} % `
      + `| ${g.theirBar.toFixed(3)} | ${g.damage.toFixed(1)} |`);
  }
  lines.push("");
  lines.push(`${result.name}: killed the dummy in ${result.kills}/${result.bouts} = `
    + `${(result.killRate * 100).toFixed(1)} % of bouts; ${result.alwaysBuilds} of ${result.totalBuilds} builds `
    + `always, ${result.everBuilds} of ${result.totalBuilds} ever.`);
  return lines.join("\n");
}

// ------------------------------------------------------------------------------------- main

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  const checkpoint = flag("checkpoint", null);
  // A checkpoint can be read greedy -- the head's mean command -- or drawn, the head plus its
  // spread, and the two are not the same fighter: a mean that stands out of range lands only on
  // the tail of the draw, so the gap between these two rows is a reading of where the mean is.
  const drawn = flag("read", "greedy") === "drawn";
  const asked = flag("mind", "golem-policy");
  const name = checkpoint !== null || asked === "uniform" ? "fit" : asked;
  const label = checkpoint !== null ? `${checkpoint} ${drawn ? "drawn" : "greedy"}` : asked;
  let contender = null;
  if (asked === "uniform") contender = { uniform: true };
  else if (checkpoint !== null) {
    const cp = JSON.parse(readFileSync(resolve(checkpoint), "utf8"));
    contender = { pi: cp.weights, logSigma: cp.logSigma, normalisation: cp.normalisation, sample: drawn };
  }
  const bouts = Math.max(2, Number(flag("bouts", 4)));
  const workers = Math.max(1, Number(flag("workers", Math.max(1, availableParallelism() - 2))));
  const cap = Number(flag("cap", 60));
  const seed = Number(flag("seed", 20260906)) >>> 0;
  const random = Math.max(0, Number(flag("random", 40)));
  // The viable set by default since Session 01 of the learn set, and `--terminals all` is the
  // fifty-two. The probe is the instrument that *found* the unviable classes, so the whole pool
  // being one word away is not a nicety here: it is how this table is re-taken. It is `mirror`
  // because every bout here is a build against a copy of itself, so the default pool is the one
  // `viableMirror` accepts -- and `scripts/viability.mjs`, which regenerates the table, calls
  // `idleProbe` over `buildPool` directly and is not affected by that default.
  const terminals = parseTerminals(flag("terminals", null));
  const pool = poolFor({ seed, random, terminals, mirror: true });
  console.log(`${label} vs idle: ${pool.length} builds x ${Math.ceil(bouts / 2) * 2} bouts, `
    + `cap ${cap} s, seed ${seed}, ${poolSentence(terminals)}`);
  const result = await idleProbe({
    pool, name, contender, bouts, workers, cap, seed,
    onProgress: ({ done, total, seconds }) => {
      if (done % 128 === 0 || done === total) console.log(`  ${done}/${total} bouts, ${seconds.toFixed(0)} s`);
    },
  });
  console.log("");
  console.log("| build | bouts | won | lost | their bar | my bar | damage | severs | strokes | kill s | caption |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const t of result.builds) {
    console.log(`| ${t.name} | ${t.bouts} | ${(t.killRate * 100).toFixed(0)} % | ${((t.lost / t.bouts) * 100).toFixed(0)} % `
      + `| ${t.theirBar.toFixed(3)} | ${t.myBar.toFixed(3)} | ${t.meanDamage.toFixed(1)} | ${meanOf(t.severs).toFixed(2)} `
      + `| ${t.meanStrokes.toFixed(0)} | ${t.killSeconds === null ? "--" : t.killSeconds.toFixed(1)} | ${t.caption} |`);
  }
  console.log("");
  console.log(formatIdleProbe({ ...result, name: label }));
}
