# Session 01 -- pause the world and restart the bout

## Outcome

A pause freezes every mutable simulation clock and transform while the last frame remains
visible. Restart works from a live or decided bout, rebuilds once with the same matchup,
clears the verdict and resumes. Setup remains the only state with no bout to restart.

## Implement

1. At `src/bout.ts:475`, widen `restart()` from `fight` to `fight | over` and return a fresh
   `fight` state. Preserve the matchup and reset `clock`/`outcome`; refuse only `select`.
2. At `src/main.ts:703-752`, make `resume`, `pause` and restart button wiring share one host
   transition. `pause()` sets `arena.scene.physicsEnabled = false` before showing the screen;
   `resume()` sets it true immediately before starting controls. The button and `R` call the
   same `restartBout({ resume: true })`, so neither can rebuild without changing state.
3. At `src/main.ts:884-916`, gate combat clocks, blood, targeting, bout advancement and the
   physics step with the same running state. Continue `scene.render()` while paused with
   `physicsEnabled === false`; this keeps the last frame visible without advancing Havok.
4. At `src/input.ts:160-190` and `:320-350`, route blur and hidden visibility through an
   idempotent pause hook after clearing held levels. Never auto-resume on focus/visibility.
5. Put the host transition in a small pure/testable module if DOM wiring would otherwise be
   the only test seam. Do not add a second `paused` bout phase: pause is host state and
   `pauseAction()` already explains why screen and bout phase are different axes.

Core transition:

```ts
export function restart(state: BoutState): BoutState {
  if (state.phase === "select") return state;
  return { phase: "fight", matchup: state.matchup, clock: 0, outcome: null };
}
```

## Tests first

In `tests/bout.test.mjs` and a focused host test, add:

- `restart_from_fight_or_verdict_returns_a_fresh_fight_with_the_same_matchup`
- `restart_is_refused_only_when_no_bout_exists`
- `a_paused_frame_advances_no_mind_combat_arrow_blood_or_body_clock`
- `blur_and_hidden_visibility_pause_once_and_never_resume`
- `resume_does_not_replay_elapsed_wall_clock`
- `restart_button_rebuilds_once_clears_the_verdict_and_resumes`

Mutation proof: restore `state.phase !== "fight"`, leave `physicsEnabled` true for one paused
render, omit rebuild, and omit resume independently. The verdict restart, frozen-transform,
rebuild-count and active-state assertions must each fail for their own mutation.

## Acceptance

Pause during walking, during an arrow flight, and after the verdict while a corpse is still
falling. Record transforms and clocks, wait five wall-clock seconds, and verify every value is
unchanged. Resume must continue from that exact state without a large accumulated delta.
Restart from both live and decided pauses must show a fresh, running bout with the same setup.

```powershell
npm test
npm run check
npm run build
```
