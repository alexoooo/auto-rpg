import { freshHavok, runBout } from "./tests/harness/bout-runner.mjs";
import { defaultGolemSetup } from "./src/golem/build.ts";
import { golemGuardian, GUARDIAN } from "./src/golem/styles/guardian.ts";
import { golemFencer } from "./src/golem/tactics-v2.ts";
const setup = defaultGolemSetup();
const SEEDS = [20260904, 20260911, 20260918, 20260925, 20261002, 20261009, 20261016, 20261023];
const rows = [];
for (const seed of SEEDS) {
  const walls = { asks: 0, onChamber: 0 };
  const mind = golemGuardian(seed, GUARDIAN, (available, reading, view, option) => {
    walls.asks += 1;
    if (option === "parry" && reading.theirs === "chamber") walls.onChamber += 1;
  });
  const blows = { left: 0, right: 0 };
  const out = runBout({
    left: "golem-guardian", right: "golem-fencer", leftUnit: "golem", rightUnit: "golem",
    leftGolem: setup, rightGolem: setup, locomotionMode: "supported",
    seeds: [seed, seed + 17], maxSeconds: 14, physics: await freshHavok(),
    leftMind: { name: "golem-guardian", styled: mind, decide: (v, dt) => mind.decide(v, dt) },
    rightMind: golemFencer(seed + 17),
    onEvent: (e) => { blows[e.side] += 1; },
  });
  rows.push({ seed, s: out.seconds, end: out.ending, ...walls, l: blows.left });
}
for (const r of rows) console.log(`  ${r.seed} ${r.s.toFixed(1).padStart(5)} s ${r.end.padEnd(10)}`
  + ` asks ${String(r.asks).padStart(4)} onChamber ${String(r.onChamber).padStart(3)} `
  + `blows ${r.l}`);
const f = (k) => rows.map((r) => r[k]);
console.log(`seconds ${Math.min(...f("s")).toFixed(1)}..${Math.max(...f("s")).toFixed(1)}  `
  + `asks min ${Math.min(...f("asks"))}  onChamber min ${Math.min(...f("onChamber"))}  `
  + `asks/s min ${Math.min(...rows.map((r) => r.asks / r.s)).toFixed(1)}`);
