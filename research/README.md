# Research

Node scripts that measure the core (`src/core/`), most on its stand
(`tests/harness/core-stand.mjs`). They import `src/` directly
and run from the repository root; batteries spread their trials over worker threads (`--workers`),
one stand a trial. A figure is read with its harness: Node, the stand or the module it drives, the
engine and the rate.

**Each script's doc comment is its record**: its options, what it prints and the rule it reads
by. This page says only where a kind of script lives and what a comment cannot hold.

A script that writes a data file the core reads does so only when asked (`--write`, or
`skills/locomotion/stance/stance-envelope.mjs`'s `--add`); without it, it prints. Three always
write:

| Script | Writes, every run |
|---|---|
| `skills/locomotion/walk-run/run-cycle.mjs` | `assets/skills/locomotion/cycle-run/run-cycle.json`, or `--out` |
| `skills/skill-records.mjs` | a body's row, `assets/skills/<capability>/<implementation>/<skill>.json` (a strike's `assets/skills/strikes/<skill>/<variation>.json`) and its `.meta.json` |
| `skills/strikes/straight-punch/punch-export.mjs` | `assets/skills/strikes/straight-punch/drive.json` (or the sword thrust's) and its `.meta.json`, or `--out` |

`humanoid/posture/man-posture-starts.mjs` also writes every run, to
`research/humanoid/posture/data/man-postures.json`. Other output goes to `.tmp/` or `--out`;
`research/runs/` is kept outside Git, each folder with a README naming its files.

## Where a script lives

| Folder | Holds |
|---|---|
| `skills/` | one folder a capability, as `src/skills/`: `locomotion/` (the walk's and the run's drills, `move-drill.mjs`; the stance's batteries in `stance/`; the clip cycle in `walk-run/`; the travel and residual environments and their screens), `recovery/` (the battery of falls, `rise.mjs`; the staged rise's search and traces; the witnesses that a fast rise exists; [the owner's target](../docs/reference/rising.md#the-owners-target)'s `rising-*.mjs`), `strikes/` (each blow's drill, search and export; the bite, [reptile](../docs/reference/reptile.md)). `skill-search.mjs` searches a skill's settings by CMA-ES on its cells' training twins; `skill-records.mjs` writes a row |
| `humanoid/` | statics and kinematics: which support postures the Warrior can hold (`posture/`), where its knuckles reach (`reach/`) |
| `entrants/`, `minds/` | the bare entrant's learning environments; a mind's pending control |
| `physics-bakeoff/` | [`REPORT.md`](physics-bakeoff/REPORT.md): the physics engines compared, and the choice of Rapier |
| the root: bouts | `bout.mjs` plays one bout from its recipe (`buildBout`), with its worker and pool; `bout-trace.mjs` its digest; `bout-baseline.mjs`, `assist-*.mjs`, `crypt-blows.mjs`, `empty-hand-league.mjs`, `cap-series.mjs`; `lying.mjs` (how long a mind lies down in the match's bouts), `touches.mjs` (each body's touches, priced); `rollouts.mjs` forks a bout by a load or a replay, which `oracle.mjs` searches; a fork may take a given Option (`option-fork-hook.mjs`), checked on one bout by `option-fork-check.mjs` |
| the root: the step | what a world step takes in time and memory: `step-*.mjs`, `crypt-step.mjs`, `crypt-plan.mjs`, `mind-*.mjs`, `minds-apart.mjs`, `call-count.mjs`, `reach-bed.mjs`, `rest-probe.mjs`. Their figures and commands: [step cost](../docs/reference/step-cost.md) |
| the root: learning | `run-learning-server.mjs` (an environment file's copies on worker threads), `case-learning-environment.mjs` (any learnable part in an evaluation's cases; a pooled environment's starts are kept in `.cache/starts/` and found again by condition, `starts.mjs`), `learner-adapter.mjs` (the loop every environment steps through), `run-train.py` (PPO or SAC against the server; PPO's rollouts by `rollout.mjs`), `learning-speed.mjs` |
| the root: the engine and contact | `rapier-probe.mjs`, `rapier-package-parity.mjs`, `engine-adapter-cost.mjs`, `real-against-engine.mjs`, `toe-support.mjs`, `pad-surface.mjs` |
| the root: the look | `look.mjs` (a skill's movement drawn in strips at its key moments, its verdict and counts kept in `looks/`, its strips redrawn by `npm run look` and not kept in Git), `look-gate.mjs` (the verdict a search reads before it starts), `look-image.mjs` (the drawing) |
| the root: shared | `cma.mjs` (the resumable CMA-ES every search shares), `drill-trials.mjs` (a drill's trial pool), `worker-jobs.mjs`, `lag.mjs`, `yaw-pitch-roll.mjs`, `bvh.mjs` and `mocap-import.mjs` (the CMU clips the run cycle is fitted to; `run-cycle.mjs` names them and their licence) |

Two data files are provenance, not scripts: `skills/strikes/held-blow/club-unit.json` is the club
blow that sets the damage unit (`club-unit` in `SOURCES`), the Warrior's strongest one-handed blow
with the wooden club; `skills/strikes/sword-thrust/sword-thrust-search.json` is the searched
schedule `assets/skills/strikes/sword-thrust/drive.json` names as how it was made.

## Commands

```powershell
node research/bout-trace.mjs                      # one bout's digest: unchanged by a change that should change nothing
node research/bout-baseline.mjs --gaps 3,3.5,4,4.5,5 --held empty --floors 1,5
node research/oracle.mjs --all --side both --workers 14 --out .tmp/oracle
node research/skills/recovery/rise.mjs --workers 30 --watch 40 --only man --shoves 128 --falls
node research/skills/locomotion/stance/stance-envelope.mjs --legs walk-run --models man --holds empty --walks
node research/humanoid/posture/posture.mjs --workers 30
node research/engine-adapter-cost.mjs --reference <commit> --runs 3
node research/blow-shares.mjs                     # the tables of docs/reference/wounds.md
```

## Found here

- **Training speed**: the sparring punch's environment trains fastest on every logical processor
  with 8 environments each: 243 decisions a second on the 16-core development host, against 221
  with 2 each and 187 stepped together (`learning-speed.mjs`). A strike's or the run's environment
  plays its drill's training twin at the game's rate, 120 Hz.
- **A travel policy seed declares its observation transform** (`normalization`). Estimate a
  transform over standing, entry and running. Replay the initial and critic-only exports against
  the seed before reading a learned checkpoint: input clipping and float32 conversion change
  physical outcomes while the actor's weights are held.
- **The bare foot, the palm and the passive toe hold no support posture the boot does not**
  (`humanoid/posture/man-postures.mjs --envelopes boot,barefoot,toe`).
