# Session 21 -- the ladder: one seed per direction, then advance or kill

> **Current prerequisites, 2026-08-26.** Session 19 closed most execution gaps this draft found.
>
> - All four runners now honor a run ID, persist indexed resume state and a common ledger, recover
>   interrupted publication, and finalize into their run directory. Look-ahead no longer needs
>   manual artifact/report paths.
> - PPO now repeats collect/update/validation jobs, so its ledger cadence and plateau have a real
>   outer loop to observe.
> - `--rung` is still intentionally absent. Session 20 must measure and freeze its schedule before
>   this session implements a resolver; a flag backed by placeholder numbers would be worse than
>   no flag.
> - Resume spelling remains runner-specific at the CLI boundary. Use the exact command printed by
>   the runner/run directory until a common dispatcher owns that syntax; never assume bare
>   `--resume` means the same thing for all four.

## Outcome

Run one seed of each direction under the 24-hour ceiling derived in session 20, watch each
ledger, fight each champion-so-far by hand, and decide -- against criteria declared in this
file before the first run starts -- which directions advance to session 22 and which are dead.

Four directions x three seeds x a fixed budget was a protocol for measuring variance in a
method already known to work. Nothing here is known to work. One seed per direction answers
the only question that currently matters: does anything move the binding gate at all?

## Declare before running

These criteria are declared now, in advance, and recorded in `docs/measurements.md` before the
first rung starts. Changing one after a ledger has been seen is a recorded decision with a
written reason, never a silent edit.

The **binding gate** is the one session 18 identified as reachable-and-discriminating with the
widest specialist gap -- on current evidence, opportunity-to-attack, where the specialist
controls sit near 0.20--0.23 against a 0.65 threshold. The **specialist control** is that
direction's own harness control from session 18, not a bench figure from another harness.

A direction **advances** only if all four hold at its stop:

1. **Movement.** Best validation binding-gate value is at least the specialist control plus
   **0.10**.
2. **Shape.** That value is present in at least three consecutive ledger rows. One lucky
   validation row is noise, and the ledger exists precisely so this is checkable.
3. **No collapse.** No other frozen gate regressed more than **0.05** below the specialist
   control. A controller that buys opportunity conversion by abandoning contact rate, stalling
   at range, or collapsing to one action is degenerating, not learning, and the diversity gate
   plus the behaviour records make that visible.
4. **Headroom.** Either the run stopped at the ceiling while still climbing, or it plateaued at
   a value whose curve plausibly reaches the gate with more time. A run that plateaued at
   control plus 0.02 is dead however elegantly it climbed for the first hour.

A direction that fails any of the four is **killed here**, and the negative result is written
up with its ledger. Killed is not a judgement about the algorithm; it is a statement that this
direction did not move this gate on this interface in a day.

## Run

Take the exact ceilings, cadences, plateau arguments and contract digest from session 20.
Schedule according to session 20's measured PPO worker/seed topology. Do not carry the old
single-worker probe forward as a ceiling on a desktop whose parallel efficiency has not yet been
measured.

~~~powershell
npm run ai:preflight
$contractDigest = '<session-20 frozen contract digest>'
npm run ai:research -- --idea neat-qd   --contract-digest $contractDigest --seed 310013 --workers 8 --rung 1 --run-id neat-qd-rung1-310013
npm run ai:research -- --idea dagger    --contract-digest $contractDigest --seed 310013 --workers 8 --rung 1 --run-id dagger-rung1-310013
npm run ai:research -- --idea lookahead --contract-digest $contractDigest --seed 310013 --rung 1 --run-id lookahead-rung1-310013
npm run ai:research -- --idea ppo       --contract-digest $contractDigest --seed 310013 --workers <session-20 choice> --rung 1 --run-id ppo-rung1-310013 --league-artifact <dagger rung-1 champion>
~~~

`--rung 1` resolves the ceiling, cadence and plateau arguments from the frozen contract rather
than restating them on the command line, so a rung cannot be run under numbers nobody recorded.
Resume an interrupted rung with the same run ID and that runner's recorded resume command.

PPO needs a league. In the ladder it gets the single rung-1 DAgger champion if DAgger advanced,
and the shipped specialists otherwise; a full three-artifact frozen league belongs to session
22. Never pass a champion-so-far artifact to a league -- the loader refuses one, and that
refusal is tested.

## Watch, and play

While the rungs run:

~~~powershell
npm run ai:watch -- --run asset-src/learning/research/neat-qd-rung1-310013 --follow
~~~

At least twice per rung, load that direction's `champion-so-far.artifact` into the visible
arena and fight it for a few minutes. Write down what it does, in words, next to the ledger row
it came from. This costs ten minutes and is the only part of the ladder that can notice a
controller which is climbing the gate while playing nothing a person would call a fight.

A ledger row and a hand on the controller answer different questions. The plan needs both.

## Decide

For each direction, record in `docs/measurements.md`: the stop condition in the exact phrase
the report used, the full gate table with signed margins against the specialist control, the
curve shape from the ledger, the hand-played notes, and the advance-or-kill verdict against the
four declared criteria.

- **One or more directions advance.** Continue to session 22 with those directions only. A
  direction that was killed does not get a second rung because a sibling succeeded.
- **No direction advances.** **Do not scale, and do not add compute.** The next session is an
  interface or gate session, not a bigger run. Choose its subject from evidence, not habit:

  - *Fitness shape.* The gates are feasibility thresholds and explicitly not positive fitness.
    If every direction plateaus far below the gate while satisfying its own objective, the
    objective and the gate are measuring different things and the objective is the bug.
  - *Observation.* Feature v4 fixed projectiles, motion direction and morphology. If ledgers
    show controllers failing specifically where an unpublished fact would have decided it, name
    that fact and publish it.
  - *Expression.* Tactic v2 gave effector, target and stance. If the hand-played champion
    visibly wants to do something the 26-output contract cannot say, the vocabulary is the bug.
  - *The opportunity definition itself.* The 0.75 s opportunity window and 2.0 s progress
    drought are modelling choices, not measurements. If session 18 found the gate merely
    reachable-but-hard for a person and every direction stalls at the same value, suspect the
    definition before suspecting four independent algorithms.

  Write the negative result up properly. Four ledgers showing where four different methods stop
  is a real finding about this interface, and it is worth more than a fifth method run blind.

## Accept

- The four advancement criteria were recorded before the first rung started.
- Every rung produced a ledger with at least twenty-four rows and a report naming its stop
  condition as `stopped: plateau` or `stopped: ceiling`.
- Every rung's champion-so-far was fought by hand at least twice, with notes.
- Each direction carries an explicit advance-or-kill verdict argued from its own ledger and its
  own harness control.
- No gate or threshold was moved during or after a run.
- If nothing advanced, session 22 is not attempted and a named diagnosis session exists instead.
- `npm test`, `npm run check` and `npm run build` pass.
