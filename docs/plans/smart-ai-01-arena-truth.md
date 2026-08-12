# Smart AI 01 -- make the arena tell the truth

**Goal:** a reader can always tell what fight is on screen and what pressing the
button will run. No AI or simulation behavior changes.

The bug is at [`client/src/arena/arena.ts#L986`](../../client/src/arena/arena.ts#L986):
plain `#/arena` calls `load("/fight.json")`. The prose at
[`client/src/arena/picker.ts#L122`](../../client/src/arena/picker.ts#L122) then tries
to explain checkpoint provenance while the controls describe a different matchup;
[`recordingMismatch`](../../client/src/arena/picker.ts#L321) does not compare policies.

## Tests first

Add these exact tests beside the arena tests in
[`client/test/studio-shell.test.mjs#L631`](../../client/test/studio-shell.test.mjs#L631),
and show each fail against the current route:

```js
test("a_plain_arena_opens_without_fetching_a_recording", async () => {});
test("the_picker_names_the_loaded_fight_separately_from_the_next_matchup", () => {});
test("checkpoint_copy_distinguishes_live_execution_from_recorded_provenance", () => {});
test("a_policy_mismatch_names_the_recording_that_is_still_on_screen", () => {});
```

The mount harness must record requested URLs. The first test asserts none are requested
until **Run selected fight**. The second asserts two labels when a trace is explicit:
`Viewing recording: learned vs composed, seed 3` and `Next fight: ...`. The third pins
plain language:

```text
Live learned fighter: loads checkpoints/v2-probe.ckpt and runs those weights.
Recorded fight: playback does not run AI; the digest identifies the weights used
when the recording was made.
```

## Implementation

- At [`client/src/arena/arena.ts#L986`](../../client/src/arena/arena.ts#L986), call
  `load` only when `params.has("trace")`; render an empty “Run a fight” state otherwise.
- Keep `showingTrace` as display state, but give `refreshPicker` at
  [`arena.ts#L569`](../../client/src/arena/arena.ts#L569) both the loaded header and
  pending matchup. Do not use one adjective (`recording`/`live`) to stand for both.
- Extend [`recordingMismatch`](../../client/src/arena/picker.ts#L321) to compare
  `header.heroes` and `header.monsters` as well as bodies and seed.
- Rename the button in [`web/index.html`](../../web/index.html) to **Run selected
  fight**. Preserve the lazy Worker boundary in [`onFight`](../../client/src/arena/arena.ts#L709).
- Update the arena explanation in `README.md`; this is durable user knowledge, not a
  plan-only correction.

No hash or trace schema moves. Explicit `?trace=/fight.json` remains supported.

## Verification

```powershell
node --test client/test/studio-shell.test.mjs
npm run check
npm run build
node tools/check_docs.js
git diff --check
```

