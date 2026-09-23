# Duel setup -- 01 drive either body at any time

Today a person chooses who drives on the setup screen (the Move/Attack boxes), and mid-fight `C`
moves them from one body to the other. There is no way back to "nobody", and `C` is dead in a
pause because `Controls.onKeyDown` gates it on `active`. This session makes the choice a game one:
take either body, or let go of the one you have, from the HUD, in a fight or a pause.

## Code

- **`releaseBody(state)`** in `src/bout.ts`, beside `takeBody`. It is `withControl(matchup,
  humanSide, "mind")`, returns the state unchanged when nobody is human, and is refused in
  `select` exactly as `takeBody` is.
- **`releaseBodyNow()`** in `src/main.ts`, beside `takeBodyNow`. It hands the body you leave a
  fresh policy from `unitDefinition(unit).createPolicy(matchup[side].policy)` through `handOver`,
  then applies `releaseBody`, `syncChannels()` and `targeting.attach(yours(), theirs())`. The
  released-policy factory is shared with `takeBodyNow`, not copied.
- **`Hud`** in `src/hud.ts` takes an `onDrive(side)` hook, handed in the way `onSkim` is. Each
  side's title row carries one small button:
  - **Take** on a body you do not drive;
  - **Let go** on the one you do.

  With no hook the button is inert rather than absent (the `onSkim` rule). `main.ts` routes it to
  `takeBodyNow(side)` or `releaseBodyNow()`, and does nothing in `select`.
- **Pause.** Both calls only swap minds, so both are allowed while paused; nothing steps until
  resume. `C` itself stays gated -- arming a pick needs the per-frame ray, which a pause does not
  run.
- **`index.html` `#help`.** Add the HUD buttons, and correct the stale `R` line, which still says
  "and the setup screen once one has been decided".

## Tests

In `tests/bout.test.mjs`, beside the `takeBody` block:

- releasing leaves two minds and keeps both policies;
- release then take leaves exactly one driver;
- release is refused from the screen, and is a no-op with nobody human.

In `tests/host-run.test.mjs` or a new HUD source test: the HUD's drive button is written from
`telemetry.driving`, so it reads "Let go" on your side only.

## Browser check

Fight, take the other body from the HUD, let go, pause, take again, resume. The camera follows the
body you took; with nobody human it follows the left.
