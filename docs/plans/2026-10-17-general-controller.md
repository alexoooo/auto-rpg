# Whole-body control: running, recovery and combat

## Scope

Develop one reusable execution stack within the
[shared controller workshop](2026-10-20-shared-controller-workshop.md): motion and contact goals
turned into bounded muscle commands by whole-body control. The current solve, stance and skill
interfaces are described in [Motor control](../architecture.md#motor-control) and
[Skills](../architecture.md#skills). This plan owns the open running, recovery, strike/hold and
assistance experiments on that stack.

The stack is available to the [options fighter](2026-10-14-options-fighter.md) and other Minds.
An experiment may use another controller or replace the whole stack through the common
observation/actuation boundary. Independent component registration and shared task infrastructure
belong to the workshop plan. Keep existing selectable implementations alongside candidates;
retirement is a separate owner decision.

## Running and Haste

Develop forward running that uses the body's available strength and speed, supports stopping
and turning, and carries equipment without uncontrolled drift. Compare contact/flight planning
and learned steering where useful. Motion references can provide posture preferences without
fixing the attainable pace or forcing a particular algorithm.

The running candidate must meet these capability targets together:

- Forward running toward the owner's 5 m/s aim, with the Warrior sustaining at least 4.5 m/s.
- Haste +100 adds at least 1 m/s under matched conditions, with its effect on falls and other
  bodies/loadouts reported.
- At most 19 falls in the 300-trial gait battery and at most 18 in its 150 club trials; the
  forward club envelope is at or above SIMBICON's on matched cells.
- Sideways and backward movement remain stepping walks at their own pace. Exercise travel,
  transitions, stops and turns rather than judging only straight-line top speed.
- The owner accepts the motion's look in the Lab and game. Human motion is a preference; a
  different motion that meets the physical objective remains a valid candidate.

These are capability goals, read on the Node stand, Rapier, 120 Hz, using the same resolved
engine profile, body definitions, loadouts and battery conditions for candidate and reference.
Declare Balance and Haste in each result; nominal comparisons use Balance 0 and Haste 0, with
Haste comparisons and assisted trials identified separately. Keep the original battery scope
when scoring its numerical bars. A changed battery is a new protocol whose references are read
again before comparison.

Use the existing course, search and envelope apparatus (`research/locomotion-run.mjs`,
`research/run-cycle-search.mjs`, `research/core-stance-envelope.mjs`) and the task's physical
observations. Resolve the current reference implementation and its settings at the checkpoint;
earlier pace, envelope and fall readings are not current baselines.

## Fast, robust unassisted recovery

Develop feedback over physical support transitions and motion, including a faster path onto
support and a stable hand-back. A planned contact, completed internal stage or briefly raised
trunk is insufficient: the independent task must verify that the body recovered and can move.
Compare planners, reference tracking and learned policies through the same permitted actuation.

The owner's target is the 64-fall protocol in `research/rising-bed.mjs --target` and
[the recovery target](../reference/rising.md). On the Node stand, Rapier, 120 Hz,
Balance 0 and Grit 0, it covers the Warrior and Rogue, empty-handed and with the club, each
shoved in sixteen directions. The target requires:

- The complete set of unique directions.
- At least 15 of 16 verified recoveries within 6 s in every body/loadout group.
- At least 61 of 64 verified recoveries within 6 s overall.
- Every cardinal shove direction passing in every group.
- A failure-inclusive median verified recovery time at most 4 s.

`risingReport` owns the checks, including failures in the denominator and capped median. Keep
step-up as the baseline, make the falls afresh, and distinguish takeover, controller hand-back
and independently verified recovery. The Lab's Stand-up scenario exercises the target's falls
as a round on one body; its outcome is reported separately from independent stand trials.

A candidate acting on observations through muscle or joint-target actions also runs the
sixteen-fall screen (`research/stand-up-acceptance.mjs --candidate <module>`). It has its own
conditions and verification. Passing it does not establish the 64-fall target, and a rejected
external-actuation request is a failure.

Vary falls and starting support in development, then confirm on fresh cases. Keep the nominal
anatomy and muscle limits unchanged when claiming the unassisted goal. An anatomy, solver,
sole or assistance study is an explicitly different configuration, with its reference read
under those conditions. An improvement on a battery, passing software checks and completing
the goal remain separate claims.

## Assistance experiments

Balance, Haste and proposed Grit work must name their physical authority and configuration.
Balance remains the metered extra wrench; Haste changes the declared muscle-speed capability.
Grit is a separate proposed torque-assistance experiment whose limits, accounting and
interaction with the muscles must be defined before it is used. The proposal raises available
torque bounds; account for the extra effort separately from nominal muscle strength. Assistance
does not silently change nominal anatomy or raise muscle strength for feel.

The Grit-assisted recovery objective is a median below 4 s under the explicitly declared Grit
configuration, on matched target cases. It is independent of the unassisted target above. If a
controller uses assistance in training, evaluate the resulting unassisted controller without it before
making an unassisted claim. A policy must consume the observed body and its actual available
actuation; additional authority must not overdrive a motion whose feedback ignores it.

Morphology or alternative assistance mechanisms can be investigated as separate experiments.
Record their sourced physical changes, permissions and effect on the same tasks; transfer back
to nominal gameplay is a further comparison.

## Strikes and equipment holds

Develop point and orientation tasks that deliver useful motion through bounded muscles while
retaining whole-body support. The open work is a driven strike that sequences the available
arm, trunk and ground reaction effectively, returns under control and works in combat, together
with useful physical holds for equipment.

Evaluate the strike on its physical task first: pre-impact driven motion, contact, delivered
effort, self-injury, balance and return to readiness. Then compare the same fighter assembly
with only the executor changed, against a frozen opponent field. Competitive strength must be
at least the reference's under that declared protocol, and the one-two and guard retain their
measured admission and execution windows. Use the current paired match and tournament paths
(`scripts/match.mjs`, `scripts/tournament.mjs`); whole-body motion alone does not establish
stronger combat.

Hold and strike experiments use current action/executor configurations and ordinary ownership,
interruption and contact feedback. Equipment construction and multi-item loadouts belong to the
workshop plan. As those mechanics arrive, exercise shield orientation, weapon lines and coupled
two-hand control through the same solve without adding a separate controller for every loadout.

## Resources, comparisons and next work

Choose one capability question and a frozen platform checkpoint. Re-read its reference, develop
one candidate beside it, evaluate fresh cases and show the motion to the owner. Running,
recovery and striking work can proceed independently where their interfaces permit it; a needed
shared platform change lands separately and creates a new comparison checkpoint.

Keep the solve's 0.5 ms per body per step performance objective as a hardware-qualified target.
When cost is the question, use `research/step-time.mjs`, record the machine, engine, rate and
fixture, and compare candidate/reference on the same machine. Laptop and desktop wall times
are distinct readings. Physics remains 120 Hz; a different policy cadence is an explicit
experiment whose held commands, work allowance and replay are specified.

Use the normal checks in `AGENTS.md`, and relevant scenario or slow checks by name. Capability
targets are separate from the software gate. Keep learned weights as immutable versioned assets
with their producing run identified. Extend goal vocabularies when a working alternative needs
them, under the workshop's component contract. Motor selection remains independent of the
particular running, recovery or combat algorithm.
