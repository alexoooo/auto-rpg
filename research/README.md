# Research

Node scripts that measure the core (`src/core/`), most on its stand
(`tests/harness/core-stand.mjs`), and the physics engines' bake-off. They import `src/` directly
and run from the repository root; the batteries spread their trials over worker threads
(`--workers`), one stand per trial. A figure is read with its harness: Node, the stand or the
module it drives, the engine and the rate.

Some write the data files the core reads, and only with `--write`; without it they print.

## The core

| Script | What it measures | Writes |
|---|---|---|
| `core-stance-envelope.mjs` | each core body's walks (five ways, at each speed) and turns; the fastest each holds | `assets/core/stance-envelope.json` |
| `core-stance-sweep.mjs` | the stance's batteries (stand, edge, step, walk, gait at `--speeds` and `--ways`, shove) over stance tunings (`--variants`) | |
| `core-stance-trials.mjs`, `core-stance-worker.mjs` | the trials the sweep and envelope run, and their worker | |
| `core-routine-battery.mjs` | the lab's Routine from seeded pushed starts, per tuning: loops held, falls, each strike's peak | |
| `core-strike.mjs`, `core-club-strike.mjs` | modules the searches and workers call, with no entry point of their own: one fist strike scored by the fist's speed, one club blow by the energy it brings to a head | |
| `core-strike-search.mjs`, `core-strike-worker.mjs` | a cross-entropy search for a body's fastest strike (`--guard` for a straight from guard, `--weapon club`) | |
| `core-strike-window.mjs` | where each recipe still lands, along and across its heading | the windows, into `assets/core/strikes.json` |
| `core-strike-repertoire.mjs` | builds the repertoire from searches' best strikes | `assets/core/strikes.json` |
| `core-rapier-probe.mjs` | on the core's engine module alone, off the stand: what Rapier's generic joint does: its limits' measure, motor axes, saturation, gyroscopic spin, a motor braking a hung rod | |
| `blow-shares.mjs` | the surfaces' stiffness table with its sources, the share each surface takes where two meet, the same at half and twice a surface's stiffness, and the joules that empty each part | the tables, pasted into `docs/reference/wounds.md` |
| `real-against-engine.mjs` | the core's functions of a real number beside the running engine's `Math`: how many values differ in any bit, how widely, and each function's digest, the same in every engine | the table, pasted into `docs/reference/real-functions.md` |

`core-club-unit.json` is the club blow that sets the damage unit (`core-club-unit` in `SOURCES`).

For example:

```powershell
node research/core-stance-envelope.mjs --workers 14
node research/core-strike-search.mjs --model workshop-rogue --hand right --guard
node research/core-strike-window.mjs --hz 120,480
node research/core-routine-battery.mjs --variants '[{}]' --seeds 12
```

Each script's doc comment gives its options, what it prints and the rule it reads by.

## Bouts

Arena bouts off the page: Node, the core's world, Rapier, 120 Hz. A bout is its recipe
(`DuelRecipe`) and its tape, and plays the same to the bit from them, so a row names both.

| Script | What it measures | Writes |
|---|---|---|
| `bout.mjs`, `bout-worker.mjs`, `bout-pool.mjs` | one arena bout from its recipe in a world of its own: how it ended, what landed, each side's mean assist, and the digest of every pose at every step; its worker; and many bouts over workers | |
| `bout-trace.mjs` | one bout's row: the digest a change that should change nothing must leave as it was | |
| `bout-baseline.mjs` | how every matchup ends at each starting gap: endings, falls and wounding blows a minute, and what a bout's blows cost its sides; with the right hands empty (`--held empty`), no part coming off (`--never-off`), the hands' surfaces stiffer or softer (`--hand`), a hit point of other joules (`--unit`), and what the blows under a floor were (`--floors`) | the tables, pasted into `docs/reference/bouts.md` and `wounds.md` |
| `crypt-blows.mjs` | a crypt run's blows with no visuals, by what met in each (an item, a bare hand, two bodies), and those with a side already out of the fight | the table, pasted into `docs/reference/bouts.md` |
| `assist-need.mjs` | what each side's soles miss of what its stance asks of the ground, over every matchup | the table, pasted into `docs/reference/assist.md` |
| `assist-sweep.mjs` | what balance does to how bouts end: both sides even, other worths of a point, and one side with more | the three tables, pasted into `docs/reference/assist.md` |
| `rollouts.mjs`, `rollout-worker.mjs`, `rollout-pool.mjs` | a bout forked by replay: played to a step under its tape and on under a branch of other orders; a row's value to a side, the responses a side may try, and the choice among them; its worker; and a pool that stays up between batches | |
| `oracle.mjs` | for one side of a bout, how it does when at every half second it tries each response in a fork of the true world and takes the best, beside the bout under its tactics alone | the table, pasted into `docs/reference/oracle.md`; with `--out`, each bout's recipe and tape, and the link that plays it |

```powershell
node research/bout-trace.mjs
node research/bout-baseline.mjs --workers 14
node research/bout-baseline.mjs --gaps 3,3.5,4,4.5,5 --held empty --floors 1,5
node research/assist-sweep.mjs --workers 14
node research/oracle.mjs --all --side both --workers 14 --out research/runs/oracle
```

## The physics bake-off

`physics-bakeoff/` compares engines under one controller on the same cases: a standing foot and a
forearm chain for fidelity, a standing human observed with no bar, and many humans spaced or piled for speed. The
live adapters are MuJoCo and Rapier (`physics-bakeoff/engines.mjs`); the `physics-bench.html` page
runs the same cases in a browser (`src/physics-bench/`). `REPORT.md` holds the results and the
choice of Rapier; `results/` holds the raw runs.

```powershell
node research/physics-bakeoff/fidelity.mjs reference
node research/physics-bakeoff/fidelity.mjs rapier-simd
node research/physics-bakeoff/summarize-fidelity.mjs
sh research/physics-bakeoff/run-perf.sh
node research/physics-bakeoff/summarize-perf.mjs
```

`case-c.mjs` (a whole human standing), `candidates.mjs` (passing settings ranked by cost),
`load-cost.mjs` (download, start-up and memory) and `mujoco-armature.mjs` (MuJoCo's conditioning
for piles) answer narrower questions; `thresholds.mjs` holds the pass bars.
