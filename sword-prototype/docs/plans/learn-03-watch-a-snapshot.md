# Session 03 -- watch a snapshot in the arena, and see what it is asking for

**Status (2026-09-09): planned. Needs 01.**

## Outcome

Any checkpoint a run has written -- a `train-ppo` checkpoint, a league pool member, a league's
main -- plays in the arena as `golem-snapshot`, greedy or drawn, chosen from the picker or linked
from the curve page. Beside it, a readout the player can open that shows what the mind is asking
the executor for and what it is getting: commanded stand-off against the gap it holds, advance,
strafe, the three gates, the stroke phase, and the stall and outside-reach seconds accruing.
The owner can watch iteration 8 and iteration 93 on the same matchup and say what changed.

## Frozen choices

- **One policy name, a slot behind it.** `create(seed)` in `Policy` is synchronous and the picker
  renders from `driverOptions`, so the snapshot's table is fetched before the screen is built and
  installed in a module-level slot the factory reads. The factory refuses to create a mind when
  the slot is empty, by name, and the picker marks the option incompatible the way it already
  marks a policy the unit cannot take.
- **The table goes through `checkPolicyWeights`.** A snapshot is `weights`, `logSigma` and a
  normalisation, assembled by `freshPolicyTable` in `../../src/golem/policy.ts` and refused by
  version, layout, width and count exactly as the shipped table is. A checkpoint from a run that
  moved the surface does not load, and says which refusal.
- **Greedy and drawn are two fighters**, as `../../scripts/idle-probe.mjs` says: the shipped mind
  is the head's mean, a rollout plays the draw, and the two kill at very different rates. The
  readout names which one is playing.
- **The readout is player-owned and off by default**, per the diagnostics rule in
  `../../AGENTS.md`: a `<details>` the player opens, that a state change never reopens.
- **Real time only, with one exception.** The arena has no speed multiplier and this session
  does not add one to the fight; it adds a diagnostics-only `x2` / `x4` that runs extra fixed
  steps a frame after the pattern in `../../scripts/bout-runner.mjs`, off by default, so a
  60-second bout can be skimmed. Physics determinism is unaffected: the step is the same step.

## Implement

1. src/golem/snapshot.ts: `SnapshotSource` -- `{kind: "checkpoint" | "pool" | "league", path,
   iteration, score}`; `tableFromCheckpoint(json)` reading `{weights, logSigma, normalisation,
   iteration, seed, bouts, steps}` as `../../scripts/train-ppo.mjs` writes it;
   `tableFromPoolMember(json)` reading `{weights, logSigma, norm, history, bornAt}` as `roleToJson`
   in `../../scripts/league.mjs` writes it; `tableFromLeague(json)` taking the `main` role; each
   returns `checkPolicyWeights(freshPolicyTable(...))` with `iterations`, `seed`, `date` and
   `opponent` filled from what the file carries. `installSnapshot(table, {sample, source})` and
   `installedSnapshot()`; a snapshot fetched by the page, dropped on it, or picked from a file
   input all end here.
2. `golemSnapshotMind(seed)` in `../../src/golem/golem-policies.ts`: `golemPolicy(seed,
   installedSnapshot().table, GOLEM_TACTICS_V4, null, sample)`, exposing `driven` and `lastHead`
   as `golemPolicyMind` does; registered in `POLICIES` in `../../src/mind.ts` and named in
   `GOLEM_POLICIES` in `../../src/units.ts` with the label "Golem snapshot" plus the source's
   iteration and score when one is installed.
3. In `../../src/main.ts`, before `selectScreen`: read `snapshot` from the query beside
   `MATCHUP_PARAM`, fetch it from `/runs/` (Session 02's middleware), install it, and set that side's
   policy to `golem-snapshot`; a fetch that fails leaves the screen as it was with one line in the
   boot note. The drop zone and file input on the setup panel do the same without a server.
4. The readout, in `../../src/hud.ts` beside the injuries disclosure: per side, when the mind
   exposes `driven`, `command.standOff` and the achieved gap over their reach, `advance`,
   `strafe`, `lean`, the three gates, `phase`, `stance`, asks a second, and from the bout's
   `EngagementTracker` the running `nearRangeStallSeconds` and `retreatOutsideReachSeconds`.
   Fed from the render loop's `hud.update` with one new field; hidden entirely for a mind that
   has no `driven`.
5. The skim: a `speed` on the running host in `../../src/host-run.ts`, 1 by default, that
   `runHostFrame` multiplies the fixed-step count by; a control in the same disclosure as the
   readout; reset to 1 on every return to the setup screen.
6. Tests in tests/snapshot.test.mjs: a checkpoint fixture and a pool-member fixture both install
   and produce a `PolicyWeights` the checker accepts; a fixture with `POLICY_VERSION` off by one
   is refused by name; `golem-snapshot` is a policy the golem offers and is marked incompatible
   with nothing installed; `installSnapshot` then `create` gives a mind whose `driven.command`
   is a `StyleCommand`. In `../../tests/host-run.test.mjs`: at speed 4 a frame advances four fixed
   steps and the clock agrees.

## Human gate

The owner loads league-anchored iterations 8, 40 and 93 (pool-8, pool-40 and the main of the
run under `tournaments/`) on one viable matchup, greedy, and says whether they can name what
changed between them; then opens the readout on the shipped mind and says whether the stand-off
it commands matches what they see. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/snapshot.test.mjs tests/host-run.test.mjs tests/ppo.test.mjs tests/docs.test.mjs
npm test
npm run build
git diff --check -- .
```

Then `npm run dev`, open http://localhost:5180/?snapshot=league-anchored/pool-40.json, fight,
open the readout, close the server.

## What remains

A recording of a bout that can be replayed without the physics is not this session; the recorder
in `../../src/recorder.ts` samples a bout already and a replay page would be a fourth page.
Watching two snapshots against each other needs a second slot and is a one-line generalisation
once one is wanted.
