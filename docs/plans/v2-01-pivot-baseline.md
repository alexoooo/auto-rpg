# v2-01 — land the pivot without losing the control

**Goal:** preserve the current playable game, record the renderer failure that
caused the reset and leave a clean baseline for every v2 comparison.

**Golden expectation:** no hash moves.

## Changes

1. At `web/main.js:2097` retain `WORLD_DPR_MAX = 0.75` for World only.
   Tactical and Dev remain at display DPR.
2. At the foreground-wall code near `web/main.js:11078` and
   `web/draw.js:204` retain the local hero-sized cutaway. Do not restore whole
   depth-band fading or drawing the hero after every wall.
3. Land the actor calibration notes and `DESIGN.md` correction already present
   in the worktree. Current PNGs remain the legacy client's locked set.
4. Beside `DESIGN.md:2149` record that Canvas is the debug/reference renderer,
   production moves to a separate GPU client and the sim stays renderer-neutral.
5. Do not install packages or change the dependency rule here. `v2-02` owns the
   complete policy correction so a baseline commit cannot partially contradict
   `AGENTS.md`.

## Verification

```powershell
git status --short
cargo run --release -p lab -- hash
cargo test
node --check web/draw.js
node --check web/main.js
node --test tools/wasm_check.js
git diff --check
```

Expected native hash: `0xfe31370e141ef531`. If current output differs, stop.

## Acceptance

- World loads, moves through a door and yields a foreground wall locally without
  erasing its side face.
- Tactical and Dev remain at native DPR.
- The record says 7–9 fps before, 30–32 fps at the complaint viewport after the
  0.75 cap, and 44–50 fps at the fixed comparison viewport. It does not claim
  Canvas reached 60 fps.
- No art regeneration, formatter churn or dependency files enter the commit.
