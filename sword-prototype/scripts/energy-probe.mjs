// What arrives, per landed stroke, against an opponent that fights back and against one that does
// not.
//
//   node scripts/energy-probe.mjs [--opponent golem-fencer|idle|both] [--mind golem-fencer]
//     [--bouts 4] [--random 40] [--terminals maul,mace|all] [--seed 20260906] [--cap 60]
//     [--separation 1.2]
//
// **Why this exists.** AR established that damage against `idle` is not a function of stroke speed:
// stretching the arc 9.81x kept 89% of the damage, where `E = 1/2 mu v^2` predicts about one per
// cent. The reading was that the dummy pays for mass in contact -- shoving -- and the fencer pays
// only for strokes that clear their own energy floor, and that the two cells are therefore not one
// task. That reading was inferred from damage totals. This instrument tests it from the other side,
// on the quantity the damage model actually consumes, and it is the test `docs/measurements.md` has
// now named twice as owed.
//
// **The floor is asked for, not written down here.** `biteFloorJ` is per mechanism -- a blade's cut
// floor is not a club's crush floor -- and the whole point of that export is that the early-out in
// `src/combat.ts` stopped keeping a second copy of the rule. A probe that hardcoded one number
// would be the third copy and would misreport every blunt terminal.
//
// **Sequential and in-process, deliberately.** The worker pool returns a summary row; the per-blow
// report never leaves the worker. Rather than teach `scripts/tournament-worker.mjs` a new tally,
// this subscribes to `runBout`'s `onEvent` directly, which is the same hook the worker uses and
// costs no change to shared code. A few hundred blows settle a distribution, so the bout counts
// this wants are far below what a gradient estimate wants.
import { availableParallelism } from "node:os";

import { freshHavok, runBout } from "./bout-runner.mjs";
import { armedTerminal, seedFor } from "./tournament.mjs";
import { parseTerminals, poolFor, poolSentence } from "./train-ppo.mjs";
import { biteFloorJ, biteMechanism } from "../src/scoring.ts";

// Log-spaced and stated once, because the interesting region is the bottom: the question is what
// share of strokes land under a floor of a few joules, and a linear bucketing puts every one of
// them in the first bar.
const EDGES = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500];

const quantile = (sorted, q) => {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const meanOf = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function tally() {
  return { blows: 0, paid: 0, blocked: 0, underFloor: 0, energy: [], closing: [], speed: [],
    damage: 0, kinds: new Set() };
}

/**
 * One cell: the driven mind on every build of the pool, against `opponent` on the same build.
 *
 * Mirrored on purpose. A build against itself is the only pairing where a difference between the
 * two cells cannot be a difference between two bodies, and the whole claim under test is about the
 * opponent and not the pool.
 */
export async function energyCell({
  pool, mind = "golem-fencer", opponent = "idle", bouts = 4, seed = 20260906, cap = 60,
  separation = null, onProgress = null,
}) {
  const per = Math.max(2, Math.ceil(bouts / 2) * 2);
  const byKind = new Map();
  let strokesSeen = 0;
  let boutsRun = 0;
  for (const [b, build] of pool.entries()) {
    for (let k = 0; k < per / 2; k += 1) {
      const pairing = b * 1024 + k;
      // The report names the *mechanism* -- a maul and a mace are both "club" -- and the question
      // this probe is pointed at is which terminal pays, so the row is keyed by the build's arm
      // and the mechanism is kept beside it. A build carrying two different terminals is filed
      // under its primary, which is what `armedTerminal` reads and what the pool filter selects on.
      const terminal = armedTerminal(build.setup);
      for (const swapped of [false, true]) {
        const mineIsLeft = !swapped;
        const seeds = [seedFor(seed, pairing, swapped ? 1 : 0), seedFor(seed, pairing, swapped ? 0 : 1)];
        const start = separation === null ? {} : { separation };
        await runBout({
          left: mineIsLeft ? mind : opponent,
          right: mineIsLeft ? opponent : mind,
          leftUnit: "golem", rightUnit: "golem",
          leftGolem: build.setup, rightGolem: build.setup,
          locomotionMode: "supported",
          seeds, maxSeconds: cap, physics: await freshHavok(), ...start,
          onEvent(event) {
            // Only the driven side's own blows. The dummy never swings, but `golem-fencer` on the
            // far side does, and counting both would average the cell with its own opponent.
            if (event.side !== (mineIsLeft ? "left" : "right")) return;
            const report = event.report;
            const kind = report.weapon;
            const key = kind === "empty" ? "empty" : terminal;
            if (!byKind.has(key)) byKind.set(key, tally());
            const row = byKind.get(key);
            row.kinds.add(kind);
            row.blows += 1;
            strokesSeen += 1;
            if (event.blocked) row.blocked += 1;
            const floor = biteMechanism(kind) === "none" ? 0 : biteFloorJ(kind);
            if (report.energyJ < floor) row.underFloor += 1;
            if (report.damage > 0) row.paid += 1;
            row.energy.push(report.energyJ);
            row.closing.push(report.closingSpeed);
            row.speed.push(report.speed);
            row.damage += report.damage;
          },
        });
        boutsRun += 1;
        onProgress?.({ boutsRun, strokesSeen });
      }
    }
  }
  return { byKind, boutsRun, strokesSeen };
}

export function formatCell(label, cell) {
  const lines = [];
  lines.push(`== ${label}: ${cell.boutsRun} bouts, ${cell.strokesSeen} contacts`);
  lines.push("");
  lines.push("| terminal | contacts | blocked | under floor | paid | mean J | median J | p90 J"
    + " | tip m/s | closing m/s | damage per contact |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const kind of [...cell.byKind.keys()].sort()) {
    const r = cell.byKind.get(kind);
    const sorted = [...r.energy].sort((a, b) => a - b);
    const pct = (n) => `${(100 * n / Math.max(1, r.blows)).toFixed(0)} %`;
    lines.push(`| ${kind} | ${r.blows} | ${pct(r.blocked)} | ${pct(r.underFloor)} | ${pct(r.paid)}`
      + ` | ${meanOf(r.energy).toFixed(1)} | ${quantile(sorted, 0.5).toFixed(1)}`
      + ` | ${quantile(sorted, 0.9).toFixed(1)} | ${meanOf(r.speed).toFixed(2)}`
      + ` | ${meanOf(r.closing).toFixed(2)} | ${(r.damage / Math.max(1, r.blows)).toFixed(2)} |`);
  }
  lines.push("");
  lines.push("Arriving energy per contact, all weapons, joules:");
  lines.push("");
  const all = [];
  for (const r of cell.byKind.values()) all.push(...r.energy);
  const total = Math.max(1, all.length);
  for (let i = 0; i < EDGES.length; i += 1) {
    const lo = EDGES[i];
    const hi = i + 1 < EDGES.length ? EDGES[i + 1] : Infinity;
    const n = all.filter((j) => j >= lo && j < hi).length;
    const bar = "#".repeat(Math.round(40 * n / total));
    const span = (hi === Infinity ? `${lo}+` : `${lo}-${hi}`).padStart(9);
    lines.push(`  ${span} | ${String(n).padStart(5)} ${(100 * n / total).toFixed(1).padStart(5)} % ${bar}`);
  }
  return lines.join("\n");
}

async function main(argv) {
  const flag = (name, fallback = null) => {
    const i = argv.indexOf(name);
    return i === -1 || i + 1 >= argv.length ? fallback : argv[i + 1];
  };
  const num = (name, fallback) => {
    const raw = flag(name, null);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${name} wants a number, not ${raw}`);
    return value;
  };
  const mind = flag("--mind", "golem-fencer");
  const asked = flag("--opponent", "both");
  const opponents = asked === "both" ? ["golem-fencer", "idle"] : [asked];
  const seed = num("--seed", 20260906);
  const bouts = num("--bouts", 4);
  const random = num("--random", 40);
  const cap = num("--cap", 60);
  const separation = flag("--separation", null) === null ? null : num("--separation", 0);
  const terminals = parseTerminals(flag("--terminals", null));
  const pool = poolFor({ seed, random, terminals, mirror: true });
  console.log(`energy probe: ${mind} on ${pool.length} builds, ${bouts} bouts each, seed ${seed}`);
  console.log(poolSentence(terminals));
  console.log(`${availableParallelism()} cores available; this probe is sequential by design`);
  for (const opponent of opponents) {
    const started = Date.now();
    const cell = await energyCell({ pool, mind, opponent, bouts, seed, cap, separation });
    console.log("");
    console.log(formatCell(`${mind} vs ${opponent}`, cell));
    console.log("");
    console.log(`  (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("energy-probe.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
