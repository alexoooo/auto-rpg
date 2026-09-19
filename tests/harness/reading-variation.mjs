// Which of a pilot's readings actually carry information in the matchup being measured?
//
// Run it: `node tests/harness/reading-variation.mjs`
//
// ## Why this exists
//
// On 2026-09-19 the stroke reader was found blind: it keys on the watched arm's extension, and on
// these bodies that arm sits at about 0.95 of its reach all bout, so the quantity never moves and
// the phase it produces was "idle" for 82 % of asks. Nothing in the tree could see that, because
// a reading nobody wired up and a reading wired to a constant look identical from the outside --
// both just sit there. The bug cost a knob sweep, a search dimension budget and two retracted
// tables before it was caught by hand.
//
// So this asks the general question the hand-search asked the specific one: **for every field the
// pilot publishes, how much does it actually vary?** A field pinned at one value is either dead
// code or a blind signal, and either way a rule reading it is not doing what its name says.
//
// ## What it found on the day it was written
//
// ```
// theirWeapon   enum  sword 100%                          -- one weapon in this arena
// rushing       bool  up 0.0 %                            -- `readTipSpeed` ships at 0, correct
// theirReach    num   mean 1.780 sd 0.000 [1.78..1.78]    -- both sides are the same body
// longer        bool  up 0.0 %
// headfirst     bool  up 0.0 %
// paired        bool  up 0.0 %
// ```
//
// The last four are one fact. Every bout in the record is fought between two golems built from
// the same `defaultGolemSetup`, so the two reaches are equal to the digit, and `longer` -- which
// wants a reach edge of `reachEdge` -- can never be true. **Every rule behind it is dead in the
// only matchup that is measured**, and `standOffFraction`, `guardByTheirs` and `guardReachVs` are
// all comparisons against a constant. That is not a bug to fix by deleting them: a mixed arena
// would light them up. It is something a person tuning this matchup has to know, because a knob
// behind a permanently-false gate will measure flat for a reason that has nothing to do with the
// idea it encodes.
//
// **A zero here is a question, not a verdict.** `theirWeapon` is constant because the arena has
// one weapon; `rushing` is constant because the row that drives it ships off. Both are correct.
// What the column is for is making you ask.
process.env.SWORD_MEASURE_LIBRARY = "1";
const { REAPER, golemReaper } = await import("file:///C:/Users/ostro/RustroverProjects/auto-rpg/src/golem/styles/reaper.ts");
const { freshHavok, runBout } = await import("file:///C:/Users/ostro/RustroverProjects/auto-rpg/tests/harness/bout-runner.mjs");
const cols = new Map();
for (const foe of ["golem-duelist", "golem-champion", "golem-planner", "golem-fencer"]) {
  for (let k = 0; k < 2; k += 1) {
    const seed = 55000 + k * 41;
    const driven = golemReaper(seed, REAPER, (r) => {
      for (const [key, v] of Object.entries(r)) {
        if (typeof v === "boolean") {
          const c = cols.get(key) ?? { kind: "bool", n: 0, t: 0 };
          c.n += 1; if (v) c.t += 1; cols.set(key, c);
        } else if (typeof v === "number" && Number.isFinite(v)) {
          const c = cols.get(key) ?? { kind: "num", n: 0, s: 0, ss: 0, lo: Infinity, hi: -Infinity };
          c.n += 1; c.s += v; c.ss += v * v;
          c.lo = Math.min(c.lo, v); c.hi = Math.max(c.hi, v); cols.set(key, c);
        } else if (typeof v === "string") {
          const c = cols.get(key) ?? { kind: "str", n: 0, seen: new Map() };
          c.n += 1; c.seen.set(v, (c.seen.get(v) ?? 0) + 1); cols.set(key, c);
        }
      }
    });
    const mind = { name: "golem-reaper", driven, decide: (v, dt) => driven.decide(v, dt) };
    await runBout({
      left: "golem-reaper", right: foe, leftMind: mind, leftUnit: "golem", rightUnit: "golem",
      locomotionMode: "supported", seeds: [seed, seed + 17], maxSeconds: 30,
      physics: await freshHavok(),
    });
  }
}
const rows = [];
for (const [key, c] of cols) {
  if (c.kind === "num") {
    const mean = c.s / c.n;
    const sd = Math.sqrt(Math.max(c.ss / c.n - mean * mean, 0));
    // Spread relative to the range it moves over -- a field pinned at one value reads 0.
    rows.push([key, "num", `mean ${mean.toFixed(3)} sd ${sd.toFixed(3)}`,
      `[${c.lo.toFixed(2)}..${c.hi.toFixed(2)}]`, c.hi - c.lo < 1e-9 ? 0 : sd / (c.hi - c.lo)]);
  } else if (c.kind === "bool") {
    const p = c.t / c.n;
    rows.push([key, "bool", `up ${(p * 100).toFixed(1)} %`, "", Math.min(p, 1 - p)]);
  } else {
    const top = [...c.seen].sort((a, b) => b[1] - a[1]);
    const p = top[0][1] / c.n;
    rows.push([key, "enum", top.map(([v, n]) => `${v} ${(n / c.n * 100).toFixed(0)}%`).join(" "),
      "", 1 - p]);
  }
}
rows.sort((a, b) => a[4] - b[4]);
console.log("reading              kind   distribution                                    variation");
for (const [k, kind, dist, range, v] of rows) {
  const flag = v < 0.02 ? "  <-- carries almost nothing" : "";
  console.log(k.padEnd(20), kind.padEnd(6), `${dist} ${range}`.padEnd(48), v.toFixed(4).padStart(8), flag);
}
