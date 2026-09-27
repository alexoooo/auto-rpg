# AI league and research

Everything here runs the game's real Havok bout runner (`tests/harness/bout-runner.mjs`) under
Node, one arena per worker thread (`runJobs` in `runner.mjs`). `results/` holds published
evidence; large resumable logs live in ignored `runs/` directories.

**Retired 2026-09-27.** The parameter search, confirmation, browser preview and promotion pipeline
(`search.mjs`, `promotion.mjs`, `preview.mjs`, `revalidate.mjs`), the laboratory under `lab/`
(PPO, NEAT, evolution, the bespoke and residual policies, the teacher datasets and wave 4), and
every mind they produced were removed in the next-phase cleanup, together with the stone-golem
minds other than the v1 duelist and the walker. The tag `pre-next-phase-cleanup` holds all of it;
`lab/`'s notes and `results/` stay as the record. Probe and gauntlet lists that named retired
minds now name the duelist and the walker, so tables taken before and after that date are not
comparable.

## The rating league

Ratings are offline Glicko-2 measurements, not a difficulty promise for a particular selected body.
Arena games never alter them. `src/policy-ratings.json` is the small shipped artifact, and it is
empty until the league is next run on the current roster.

```powershell
node research/cli.mjs evaluate --dir research/runs/current --hours 3
node research/cli.mjs summarize --dir research/runs/current
node research/cli.mjs publish --dir research/runs/current
```

`evaluate` publishes any complete rounds when it finishes. `--workers N` overrides the default of
half the logical CPUs, capped at eight. `--rounds 1` allows a smaller provisional league. `--seed`
fixes a different evaluation seed. Run directories are immutable experiments: resuming uses their
saved roster and protocol, not new command-line round/seed choices. The hour allowance is
cumulative across `evaluate` calls in a directory. Completed jobs are appended immediately;
interrupted jobs remain pending. A failed job is recorded with its error, never counted as a draw
and never silently dropped. Do not run two commands against one directory.

## The other instruments

- `league.mjs`: the paired comparison of two minds over body variants and weapon classes (skill
  ceiling session 03, `docs/analysis/2026-09-25-drills.md`), refusing a side-decided mind.
- `side-mirror.mjs`: every mind against itself, scored by side
  (`docs/analysis/2026-09-25-side-mirror.md`).
- `stat-sweep.mjs --stat <id>`: one golem attribute at several multipliers against an unmodified
  body; `--edge <named build>` plays a whole build as a known-answer check
  (`docs/analysis/2026-09-23-attribute-measurements.md`). `downed-census.mjs`, `fall-loop.mjs`,
  `idle-dummy.mjs` and `control-band.mjs` read its runs or run beside it.
- `drills.mjs`, `headroom.mjs` and their reports: the skill-ceiling drill suite and headroom audit.
- `command-null.mjs`: the null control for the body-command channels.
- `fork-study.mjs`: what an exact fork buys a search, on the kept minds.
- The benches (`rise-bench`, `size-bench`, `stance-bench`, `step-bench`, `grounded-tone`,
  `human-arm-limits`, `effector-*`, `leverage`, `body-readout`) each measure one body question and
  name their harness in their own header.

## What is measured

Harness: `tests/harness/bout-runner.mjs`, supported locomotion, a fresh wasm instance per bout,
150-second cap, normal startup, no settling or damage-based draw adjustment. The game's verdict
determines 1/0.5/0 points. Overtime remains the game's rule and is reported explicitly.

Every registered policy but `idle` plays every other on twelve same-build matchups and six adjacent
roster cross-build pairings. Each cross-build pairing exchanges policy-to-body assignment and arena
side, so each policy sees each build and arena side equally often. Seeds follow policies when sides
swap. (Until 2026-09-27 this was twelve baseline golem minds, 66 pairs and 3,168 games a round.)

Glicko-2 starts at 1500 / RD 350 / volatility 0.06, with tau 0.5. A full round is one simultaneous
rating period. Publication excludes incomplete rounds, and ratings are provisional below four
rounds or above RD 100. Ratings depend on the opponent population; an added contender causes all
complete periods to be recomputed, including the new matchups. RD is a model-based uncertainty
estimate, not a guarantee against correlated physics outcomes or non-transitive matchups.

`summary.json` includes matchup, build and side breakdowns, wins/draws/losses, overtime counts,
mean duration, and behavior. A single rating cannot express counterstrategies.

- Attack rate counts rising `thrust` command edges per hand and natural channel per simulated
  second. It counts commanded attacks, not successful strokes or hits; paired hands can produce
  two edges. The legacy option-labelled `attackAttempts` counter is not populated by this harness.
- Retreat fraction measures commanded `forward < -0.1` time, not physical displacement.
- Range fractions are the existing recorder's four distance bins, normalized by simulation time.
- Block rate uses the recorder's deduplicated defensive contacts per second.
- Engagement measurements retain the recorder's opportunity, stall, movement and drought fields.

These definitions compare styles without reading their private option names. The physical control
test checks repeated/worker parity and separates an attacking duelist from Idle. It deliberately
does not equate command rate with lethality or use tip-speed peaks as fighting quality.

Runtime source dependencies are hashed after TypeScript removes type-only imports. The lockfile
and measurement worker are included. The arena always shows the last measured rating with its
evaluation date, even after runtime or policy changes; the detail note identifies changed versions
without hiding the score. Fingerprints
still protect research resume and evidence from mixing incompatible experiments.
Manifests also record the exact protocol, roster, runtime, dependencies and instrument version.
