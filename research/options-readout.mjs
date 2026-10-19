/**
 * **Where the options fighter's bouts go**: empty-hand Arena bouts of the options fighter (left)
 * against a preset (right), played as the league plays them (`empty-hand-league.mjs`: the game's
 * cap, recovery left to continue), each at every gap asked. Its rows, over every bout: the share
 * of the options fighter's standing time each option ran; the share of the time both stood
 * within a clinch (`CLINCH.within`, centre to centre) and the longest clinch, s; and its blows by
 * how each ended: landed on its target in its commit, blocked (a block and no target), or met
 * nothing; and of the blows that followed a blocked one within `--after` s, the share that were
 * blocked again, with what it ran in between.
 *
 *   node research/options-readout.mjs [--against puncher] [--gaps 3,3.5,4,4.5,5] [--cap 120] [--after 1.5]
 *
 * Harness: Node, the core's world on Rapier, the Arena's room, 120 Hz.
 */
import { buildBout } from "./bout.mjs";
import { PRESETS } from "../src/core/mind/controllers.ts";
import { CLINCH } from "../src/core/mind/options/value.ts";

const argv = process.argv.slice(2), arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i < 0 ? fallback : argv[i + 1]; };
const against = arg("against", "puncher"), cap = Number(arg("cap", 120)), after = Number(arg("after", 1.5));
const gaps = arg("gaps", "3,3.5,4,4.5,5").split(",").map(Number);

const time = new Map(), between = new Map(), blows = { landed: 0, blocked: 0, nothing: 0, refused: 0 }, again = { blocked: 0, other: 0 };
let both = 0, clinch = 0, longest = 0, wins = 0, losses = 0, falls = 0;
for (const gap of gaps) {
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", minds: { left: PRESETS.options.config, right: PRESETS[against].config },
    held: { left: "empty", right: "empty" }, recoverySeconds: null, capSeconds: cap, gap });
  try {
    const L = duel.duelists.left, R = duel.duelists.right, mind = L.minded, seen = new Set();
    let run = 0, lastBlocked = -Infinity, since = new Set(), was = false;
    while (!duel.verdict) {
      world.step();
      const a = L.body.view, b = R.body.view;
      if (a.down && !was) falls++;
      was = a.down;
      if (!a.down) { const phase = mind.skills.report.engagement?.phase ?? "guard"; time.set(phase, (time.get(phase) ?? 0) + world.dt); since.add(phase); }
      if (!a.down && !b.down) {
        both += world.dt;
        const p = a.stance.centre, q = b.stance.centre, dx = p.x - q.x, dz = p.z - q.z;
        if (dx * dx + dz * dz < CLINCH.within * CLINCH.within) { clinch += world.dt; run += world.dt; longest = Math.max(longest, run); } else run = 0;
      }
      for (const ended of mind.skills.report.ledger) {
        if (seen.has(ended.sequence)) continue;
        seen.add(ended.sequence);
        const c = ended.contacts.counts.commit;
        const kind = ended.ending.kind === "refused" ? "refused" : c.target > 0 ? "landed" : c.block > 0 ? "blocked" : "nothing";
        blows[kind]++;
        if (kind === "refused") continue;
        if (ended.began - lastBlocked < after) {
          again[kind === "blocked" ? "blocked" : "other"]++;
          const key = [...since].sort().join(" + ");
          between.set(key, (between.get(key) ?? 0) + 1);
        }
        if (kind === "blocked") { lastBlocked = ended.ended; since = new Set(); }
      }
    }
    if (duel.verdict.winner === "left") wins++; else if (duel.verdict.winner === "right") losses++;
  } finally { dispose(); }
}

const standing = [...time.values()].reduce((s, t) => s + t, 0);
console.log(`options against ${against}, gaps ${gaps.join(",")}, cap ${cap} s: won ${wins}, lost ${losses}, drew ${gaps.length - wins - losses}; its falls ${falls}`);
console.log("its standing time by option:");
for (const [name, t] of [...time].sort((x, y) => y[1] - x[1])) console.log(`  ${(100 * t / standing).toFixed(1).padStart(5)} %  ${name}`);
console.log(`both standing ${both.toFixed(1)} s; within a clinch ${(100 * clinch / Math.max(both, 1e-9)).toFixed(1)} %, longest ${longest.toFixed(2)} s`);
console.log(`its blows: ${Object.entries(blows).map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`after a blocked blow, within ${after} s: blocked again ${again.blocked}, not ${again.other}; running between:`);
for (const [k, n] of [...between].sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log(`  ${n}  ${k}`);
