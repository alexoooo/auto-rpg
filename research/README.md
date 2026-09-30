# Research

Node scripts that measure the core (`src/core/`) on its stand (`tests/harness/core-stand.mjs`), and
the physics engines' bake-off. Every figure names its harness.

- `core-strike*.mjs`, `core-club-strike.mjs`: strikes by a core human, searched and scored; the
  repertoire they write is `assets/core/strikes.json`. `core-club-unit.json` is the club blow that
  sets the damage unit.
- `core-stance-*.mjs`, `core-routine-battery.mjs`: the stance's trials, sweeps and envelope, and
  the lab routine from seeded starts.
- `core-rapier-probe.mjs`: what Rapier's generic joint does, read on a stand.
- `physics-bakeoff/`: MuJoCo and Rapier on the bake-off's cases (`src/physics-bench/`), with
  `REPORT.md`. Havok's runs, and its adapter, went with Havok on 2026-09-30; their results stay in
  `physics-bakeoff/results/` and the report.

The old league, its rating, schedule and minds, the laboratory's notes and the published results
under `lab/` and `results/` were deleted with the old path on 2026-09-30
(`docs/plans/2026-09-30-old-path-removal.md`, step 5); commit 77a0cd77 holds them.
