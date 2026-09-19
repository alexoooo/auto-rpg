// Where in its own stroke is the arm when the blade actually touches something?
//
// Run it: `node tests/harness/stroke-phase.mjs`
//
// ## Why this exists
//
// `golem-reaper`'s doc opens with a table of what a cut is worth against how far through its arc
// the blade was, and concludes that the axis carries a factor of four and that two gates on the
// throw could not move it. Both gates were levels on *where the body stood*. Neither of them, and
// nothing else in the tree, ever asked the stroke machine itself.
//
// Asking it is cheap, because `GolemDriven.stance` is published and `decide` runs at
// `physicsHz` -- so wrapping `decide` samples the machine at 240 Hz. An ask hook would sample at
// 12 Hz, and a chamber is 0.32 s, so 12 Hz would smear the phase boundaries this is about.
// `HitReport.at` is stamped with the same clock `FighterView.clock` carries, so the join between
// a contact and the step whose stance is recorded is exact -- the drift column below is printed
// so that a future change which breaks that shows up as a number rather than as a silent skew.
//
// ## What it found on the day it was written
//
// 192 bouts, `golem-reaper` against the four-mind gauntlet, both sides, seed base 60250101:
//
// ```
// cuts only           n    share   dmg each   speed    edge   dmg share
//   chamber           264    10.7 %    0.3916   10.92   0.778       8.4 %
//   commit           1000    40.4 %    0.5575   11.56   0.820      45.5 %
//   free              664    26.8 %    0.4236   12.56   0.844      23.0 %
//   recover           549    22.2 %    0.5134   10.86   0.828      23.0 %
// ```
//
// **Under half of this mind's cutting damage is delivered by a swing.** `commit` is the swing and
// carries 45.5 %; three cuts in five land outside it, winding up, returning to guard, or simply
// holding one. The ones made by an arm doing nothing at all are the *fastest* on the board at
// 12.56 m/s, because that speed is the body's, not the arm's.
//
// Sweep tables elsewhere print `swung%` counting `chamber` with `commit`, since a knob that
// lengthens the wind-up is a knob on the stroke. That is a different cut of this data, not a
// disagreement with it -- say which one a number came from.
//
// Every knob in every table above this was set by measuring a mind that spends most of its damage
// somewhere none of those knobs point.
//
// The second table is the swing seen from inside, and it is a straight line:
//
// ```
// seconds into the swing     n    share   dmg each   speed    edge
//   0.12..0.16            137    13.7 %    0.2989    9.63   0.732
//   0.16..0.20            226    22.6 %    0.4895   11.14   0.801
//   0.20..0.27            576    57.6 %    0.6652   12.13   0.849
//   0.27..0.40             29     2.9 %    0.4041   13.19   0.874
// ```
//
// The swing is capped at `max(commitSeconds, arc.strokeSeconds + followSeconds)` -- 0.27 s on the
// shipped table -- and the blade is still getting faster when the cap arrives. Read the direction
// of that, not the level: contact speed is partly a selection effect, since a blade that touches
// late touched something further away, which is the confound the reaper's own doc names.
//
// ## How to read a result
//
// The `free` and `recover` shares are the number to watch. They are what the guard pose is worth
// offensively, which no sweep in this tree has ever priced -- `guardReach` was set at n=32 against
// the Warrior on a table whose only column is damage taken, because every row of it won every bout.
process.env.SWORD_MEASURE_LIBRARY = "1";
const here = (p) => new URL(p, import.meta.url).href;
const { REAPER, golemReaper } = await import(here("../../src/golem/styles/reaper.ts"));
const { freshHavok, runBout } = await import(here("./bout-runner.mjs"));

const hits = [];
const spans = [];
for (const foe of ["golem-duelist", "golem-champion", "golem-planner", "golem-fencer"]) {
  for (let k = 0; k < 2; k += 1) {
    const seed = 60250101 + k * 23;
    const driven = golemReaper(seed, REAPER);
    // The machine as of the most recent physics step. Kept out here because a contact callback
    // fires between steps, and reading `driven.stance` there would read the step after the blow.
    let stance = "free";
    let since = 0;
    let sinceOpen = 0;
    let clock = 0;
    const mind = {
      name: "golem-reaper", driven,
      decide: (v, dt) => {
        const intent = driven.decide(v, dt);
        clock = v.clock;
        const now = driven.stance;
        if (now === stance) { since += dt; sinceOpen += dt; } else {
          if (stance !== "free" && now === "free") spans.push(sinceOpen);
          if (stance === "free") sinceOpen = 0;
          since = 0;
          stance = now;
        }
        return intent;
      },
    };
    await runBout({
      left: "golem-reaper", right: foe, leftMind: mind, leftUnit: "golem", rightUnit: "golem",
      locomotionMode: "supported", seeds: [seed, seed + 17], maxSeconds: 60,
      physics: await freshHavok(),
      onEvent: (event) => {
        if (event.side !== "left") return;
        const rep = event.report;
        hits.push({
          dmg: rep.damage ?? 0, speed: rep.speed ?? 0, kind: rep.kind ?? "",
          edge: rep.edgeAlignment ?? 0, stance, since, drift: Math.abs(rep.at - clock),
        });
      },
    });
  }
}

const drift = hits.map((h) => h.drift).sort((a, b) => a - b);
console.log(`${hits.length} contacts, ${spans.length} strokes run to completion`);
console.log(`contact-to-step drift: median ${drift[drift.length >> 1].toFixed(5)} s, `
  + `max ${drift[drift.length - 1].toFixed(5)} s (a physics step is ${(1 / 240).toFixed(5)})`);
spans.sort((a, b) => a - b);
if (spans.length > 0) {
  const q = (p) => spans[Math.min(spans.length - 1, Math.floor(p * spans.length))];
  console.log(`stroke length open->free: p10 ${q(0.1).toFixed(3)} p50 ${q(0.5).toFixed(3)} `
    + `p90 ${q(0.9).toFixed(3)} s\n`);
}

const show = (label, rows) => {
  console.log(`${label.padEnd(14)}      n    share   dmg each   speed    edge   dmg share`);
  const total = rows.reduce((s, h) => s + h.dmg, 0);
  for (const k of [...new Set(rows.map((h) => h.stance))].sort()) {
    const bin = rows.filter((h) => h.stance === k);
    const mean = (f) => bin.reduce((s, h) => s + f(h), 0) / bin.length;
    console.log(`  ${k}`.padEnd(16) + String(bin.length).padStart(7)
      + (100 * bin.length / rows.length).toFixed(1).padStart(8) + " %"
      + mean((h) => h.dmg).toFixed(4).padStart(10) + mean((h) => h.speed).toFixed(2).padStart(8)
      + mean((h) => h.edge).toFixed(3).padStart(8)
      + (100 * bin.reduce((s, h) => s + h.dmg, 0) / Math.max(1e-9, total)).toFixed(1).padStart(10)
      + " %");
  }
  console.log("");
};
show("every contact", hits);
show("cuts only", hits.filter((h) => h.kind === "cut"));

const inSwing = hits.filter((h) => h.kind === "cut" && h.stance === "commit");
console.log("seconds into the swing     n    share   dmg each   speed    edge");
const edges = [0, 0.04, 0.08, 0.12, 0.16, 0.20, 0.27, 0.40, 1.0];
for (let i = 0; i < edges.length - 1; i += 1) {
  const bin = inSwing.filter((h) => h.since >= edges[i] && h.since < edges[i + 1]);
  if (bin.length === 0) continue;
  const mean = (f) => bin.reduce((s, h) => s + f(h), 0) / bin.length;
  console.log(`  ${edges[i].toFixed(2)}..${edges[i + 1].toFixed(2)}`.padEnd(20)
    + String(bin.length).padStart(7)
    + (100 * bin.length / inSwing.length).toFixed(1).padStart(8) + " %"
    + mean((h) => h.dmg).toFixed(4).padStart(10) + mean((h) => h.speed).toFixed(2).padStart(8)
    + mean((h) => h.edge).toFixed(3).padStart(8));
}
