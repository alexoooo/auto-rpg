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
| `core-blow.mjs` | a module the searches, the windows and the repertoire call, with no entry point of its own: one strike thrown through the strike skill at a target body of a band's part, read by the rule a fight wounds by; its score, the hit points done less those it cost, a miss under any hit, a fall under any miss; and what a candidate's numbers stand for by what is held | |
| `core-strike.mjs`, `core-club-strike.mjs` | what a candidate's numbers are, with no entry point of their own: a fist's strike and a club's blow decoded from and encoded to a search's unit numbers, the freedoms each may push, and a trial's perturbation | |
| `core-strike-search.mjs`, `core-strike-worker.mjs` | a cross-entropy search for the blow that pays most for a body, a thing held (`--held`) and a height band (`--band`), from scratch or going on from a recipe or a search (`--from`); `--guard` for a straight from guard | |
| `core-strike-window.mjs` | where each recipe still lands about its place, along and across its heading and up: the stand-offs at which it lands, leaves its body up three seconds after, and does a share of what it does at its place (`--keep`, `--keep-up`), at every rate, as the mean of `--trials` perturbed throws; a recipe whose window is narrower than the feet are set to is taken out, and its cell takes the next of its searches (`--spare`); `--save` and `--load` keep the readings | the windows, into `assets/core/strikes.json` |
| `core-strike-repertoire.mjs` | builds the repertoire from searches' outputs: of a cell's searches the one that nets most on replay at 120 Hz, kept only where it nets more than a placed blow at the same target; `--spare` writes the cell's other searches that do | `assets/core/strikes.json`, without its windows |
| `core-targets.mjs`, `core-targets-run.mjs` | the lab's Routine on its seeded targets, each body bare and with the club: what each strike did to the dummy hung at its target; and the run both batteries' workers make | the tables, pasted into `docs/reference/blows.md` |
| `core-blow-standing.mjs` | what a body's blow does a body that stands: an arena bout in which one side stands, bare-handed, and the other is ordered to attack its head or its upper trunk, by body, thing held, band, foe and starting gap | the table, pasted into `docs/reference/blows.md` |
| `core-aim.mjs` | whether a fighter that aims at what its recipes pay most on does better than one that aims at the head: arena bouts paired by their starting gap against a control with both aiming at the head, by what is held, the pair and the side that aims | the tables, pasted into `docs/reference/blows.md` |
| `core-placed.mjs` | the placed blow's sweep: the targets' battery at each stretch, time and distance carried through, given to the skills in place of the blow set | the table, pasted into `docs/reference/blows.md` |
| `core-placed-versus.mjs` | a recipe against a placed blow by the target's height: one body, one target ahead of it, thrown at both ways | the table, pasted into `docs/reference/blows.md` |
| `core-placed-arm.mjs` | an arm alone following a placed blow's goal, the lower trunk held: how near its point comes to a place, in each of two times | the table, pasted into `docs/reference/blows.md` |
| `core-reach-map.mjs` | kinematics alone: where one place for the Warrior's knuckles, and for the swell of the club he holds, is solved, with the wrist held and freed | the tables, pasted into `docs/reference/human-and-strikes.md` |
| `core-rapier-probe.mjs` | on the core's engine module alone, off the stand: what Rapier's generic joint does: its limits' measure, motor axes, saturation, gyroscopic spin, a motor braking a hung rod | |
| `touches.mjs` | what a body sounds of: each part's new touches with the ground, with itself and with another body (a second, their energies, closing speeds and the mass met) and its fastest point's speed, standing, walking, in the Run, shoved, falling, in the Routine and the Blow, and in three bouts | the tables, condensed into `docs/reference/look.md#touches-measured` |
| `core-guard.mjs` | whether a fighter that covers what threatens its head is hit there less than one in the pose: arena bouts paired by their starting gap against a control with both in the pose, by what is held, the senses' delay, the pair and the side that covers; an experiment's cover or threat as a variant | the tables, pasted into `docs/reference/blows.md` |
| `core-guard-late.mjs` | why a blow meets a covering side's head: for each one in club bouts, how long its mind had seen the threat and how far its knuckles and its club's swell were from the cover's place; `--threat` for another than the one set | the tables, pasted into `docs/reference/blows.md` |
| `core-guard-reach.mjs` | what a cover reaches on the stand, and how soon: the bare hand's knuckles and the club's swell from their places, a threat each way from the head, for each cover given; `--club` lays the club's line the skill's way or one of the script's two | the table, pasted into `docs/reference/blows.md` |
| `blow-shares.mjs` | the surfaces' stiffness table with its sources, the share each surface takes where two meet, the same at half and twice a surface's stiffness, and the joules that empty each part | the tables, pasted into `docs/reference/wounds.md` |
| `real-against-engine.mjs` | the core's functions of a real number beside the running engine's `Math`: how many values differ in any bit, how widely, and each function's digest, the same in every engine | the table, pasted into `docs/reference/real-functions.md` |

`core-club-unit.json` is the club blow that sets the damage unit (`core-club-unit` in `SOURCES`).

For example:

```powershell
node research/core-stance-envelope.mjs --workers 14
node research/core-strike-search.mjs --model workshop-rogue --held fist --band middle --guard
node research/core-strike-window.mjs --spare spare.json --save windows.json
node research/core-routine-battery.mjs --variants '[{}]' --seeds 12
node research/core-targets.mjs --each
node research/core-placed.mjs --workers 26
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
