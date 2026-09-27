# Task-space proposals for the offline expert

Skill-ceiling session 06 continuation. The actuator's bench is in
`2026-09-26-effector-target.md`; this work adds the expert that can ask for it.
The `effector` channel remains off by default. No body, motor ceiling or shipped policy was tuned.

This records the initial proposals and screen at `d6b7ce71`. The subsequent endpoint correction
and revised defaults are in `2026-09-26-effector-endpoint-fallback.md` and
`2026-09-26-effector-attainable-proposals.md`. Commands below run the current implementation;
the archived screening record identifies the original source hashes.

## What the expert searches

`expert-effector@c8,h1` adds three plans: a sweep, a straight extension, and a reverse sweep with
reduced speed and effort. Each writes a world endpoint and hand quaternion directly to
`BodyCommand`, plus speed and force fractions. Geometry comes from the live hand's own shoulder,
reach and outboard sign, aimed at an opponent-relative mark. It does not track achieved tip error
or set a body transform. The actuator retains responsibility for reachability and joint stops.

The proposed orientation samples hand +Z along that line, with a roll about it. This is a small
proposal family, not a complete search over attainable poses or a promise that every requested
orientation is reachable. The current anatomical rigid endpoints are its only declared actuators.

The preferred hand alternates by decision. A missing declaration or a lost hand falls back to the
other declared, live hand. A body with neither receives no target. Phase travels with a warm plan
and its fork; leaving a target segment clears its target through the normal command adapter.
Mutations explore mark height and lateral offset, sweep, roll, duration, extension, speed and force.

The first three old proposals are retained. Targets are inserted next, and the old tail is kept
after them. A c8 two-round search evaluates six first-round plans: three old and three target
plans, or four old/warm and two targets when a warm start is present. Thus a result compares a
proposal-budget allocation as well as a command channel. The original expert's proposals and RNG
draws are unchanged. Combining the flag with stance or step retains their proposals too.

## A prerequisite repaired

The first real-bout prediction test exposed a missing snapshot record in `humanoidDuelist`.
Its enclosed tactics were not restored, so the full opponent model drifted, including with the
effector channel disabled. `2026-09-26-humanoid-fork.md` records the repair and the precise scope
of earlier measurements needing repetition. Both sides of this experiment use the repaired model.

## Reproduction and readings

Harness: Node/Havok bout runner through `research/headroom.mjs` and its worker. The usual full
headroom command is:

```powershell
node research/headroom.mjs --exp channel --channel effector --pairs 32 --lanes 3
```

The channel now defaults to the three supported audit bodies: `human-warrior`, `human-unarmed`
and `human-mace`. Each plays corner-swapped pairs against the original expert, and both experts
play the family's duelist on common seeds. Explicit `--bodies` remains available.

A bounded screening run, kept separate from the 150-second research protocol:

```powershell
node research/headroom.mjs --exp channel --channel effector --pairs 2 --lanes 3 --max-seconds 6 --tag screen
```

`--max-seconds` is recorded in both the schedule and manifest, so it cannot silently resume into a
full-length run. The headroom worker records `targetedShare` separately from legacy thrust/stroke
counts. `targetSpeed` and `targetForce` are means over target-bearing hand samples, and null when
none were applied. A held target is not counted as a fresh attack each frame.

An initial 36-bout full-length pilot was stopped before a bout completed. Its empty run directory
is retained locally. It supplies no evidence. The bounded run is the screening evidence below;
neither a six-second cap nor two seed pairs can establish full-bout headroom.

## Screening result

All 36 bouts completed without a failure, in 860 seconds of wall time at three worker lanes.
Every bout reached the six-second cap as a draw. The table is the mean share of frames with an
applied target, four bouts per cell (two corner-swapped seed pairs):

| Body | Against original expert | Against family duelist |
|---|---:|---:|
| Human sword/shield | 0% | 0% |
| Human fists | 7.27% | 0% |
| Human mace/shield | 5.19% | 10.39% |

The ruler control applied no targets. The mace experiment's mean bar margin against its family
duelist was +0.00577, versus +0.01399 for the ruler on the same seeds: a paired difference of
-0.00822 bars. Its head-to-head margin against the ruler was -0.000034 bars. These are early-bout
readings with two seed pairs, not evidence of a full-bout gain or loss. The sword experiment did
not select targets; its altered candidate budget can still alter the noisy legacy candidates.

Verdict: the expert can select and execute the channel, but this screen gives no reason to enable
it. Keep it experimental. Before spending on full-length human searches, inspect and improve the
proposal family, especially the sword proposals, and retain the corrected ruler alongside it.
The compact record is `research/results/2026-09-26-effector-screen.json`, including per-bout seeds,
target use, selected labels and source hashes.

## Validation

- 1,057 tests, typecheck and production build pass.
- The original 45 command-null bouts are bit-identical before and after, with `effector` enabled
  but unwritten by the original expert. Six additional crossed human/stone control bouts also
  retain their trajectory and behaviour hashes and outcomes.
- Tests cover both live sockets, declarations and severing, phase-preserving warm starts,
  candidate budgets and mutation ranges, actual target motor settings and moving mass, exact
  mid-sweep forks, full-model rollout prediction and the research schedule/telemetry.
- Ten deliberate mutations were caught: dropped dispatch, wrong socket, ignored declaration,
  ignored hand loss, restarted phase, ignored speed, ignored force, missing force exploration,
  hidden human tactical state, and missing target-use telemetry.
- No page or browser controller changed, and no development server was started.

The incoming audio and character-workshop work at `1820d219` was merged during this run.
The combined tree passes 1,070 tests, typecheck and build. The incoming changes do not alter the
arena's body, command or fork dynamics used by the screening workers.

The raw screening run, validation logs and mutation logs are retained locally under
`research/runs/`; a compact screening record is kept under `research/results/`.
