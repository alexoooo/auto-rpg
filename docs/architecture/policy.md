# Policy architecture

**Purpose:** Describe the current observation-to-command policy seams and their implementations.
**Status:** current
**Canonical source:** [`crates/policy/src/lib.rs`](../../crates/policy/src/lib.rs), [`Observation`](../../crates/sim/src/obs.rs), and [`Command`](../../crates/sim/src/command.rs)
**Update when:** The `Policy` trait, observation contract, command shape, policy registry, or run harness changes.

## The complete policy seam

There is one seam, and it has one required operation:

```rust
fn decide(&mut self, obs: &Observation) -> CommandV1;     // Policy
```

**There were three.** `CombatModel::Legacy`'s seam was
`fn decide(&Observation) -> Command`, and embodied session 10 deleted it with the
model; the articulated seam returned the 53-byte core payload rather than the 57-byte
command, and session 05 deleted it with *its* model. What is worth carrying forward is the general
sentence rather than the signatures: everything downstream of this crate -- a
neural policy, an evolved controller, a scripted test dummy, a human's mouse --
is the same one method, and the simulation cannot tell them apart and does not
try to. The crate's module header argues why these were separate traits rather
than one trait over an enum payload -- which is now an argument about the *next*
model rather than about the last two -- and why the seams therefore did not
compose.

`reset` is optional policy lifecycle behaviour and the run harness calls it
before every run. A policy may keep its own memory, but it receives neither
`&World` nor a mutation capability; every authoritative effect returns through a
submitted command. **The claim that a policy instance can be reused across
rollouts without one leaking into the next is asserted again**, by
`an_embodied_policy_instance_can_be_reused_without_leaking_between_runs`, which
drives a policy that *tires* as it decides: a policy whose `decide` is a pure
function of its argument answers identically whether or not the runner cleared
it, so a pure fixture leaves `policy.reset()` covered by nothing. That was the
state of this line for two sessions and the crate header recorded it as a gap.

There is no team wrapper that runs one policy per side. The legacy seam had one,
`TeamPolicy`, which dispatched on `Observation::faction` -- and the reason it has
no successor is a property of the *observation* rather than an omission:
`Observation` is subject-scoped and has no faction column, so "the
other side" appears in it only as `opponents`, already selected. Per-side routing
therefore belongs to whoever drives the run, which does know both factions. The
crate's module header carries that argument in full, and
[`Policy`](../../crates/policy/src/lib.rs#L242) carries the doctest pair
showing that no policy can be handed a `&World`.

## Observation to command

`World::observe` produces a deterministic subject-scoped observation:
exact proprioception, and bounded noisy information about everything else.
Policies operate on those perceived values. What an embodied policy may see, and
why it arrives as fractions rather than as world units, is
[below](#what-an-embodied-policy-is-allowed-to-see-and-why-it-arrives-as-fractions).

A submitted command's 53-byte **core** is a movement vector, a torso yaw, an intent,
and per arm a bearing, a height, a reach, an effort, a grip request and a release
request. The 57-byte command a policy returns is that plus a swing plane per arm, and
its movement vector and arm bearings are read **relative to the torso** rather than
absolutely -- the same byte offsets meaning different things, which
[the embodied command contract](../reference/embodied-command-v1.md) owns.

The legacy `Command` was four parts: a movement vector, an intent, exactly one
`LimbCommand` carrying an absolute angle and a guard reach and a strike choice,
and a loadout slot. **The singular limb is why that seam could not simply be
widened.** A body that is a disc with one blade angle is asked where to stand,
where a jointed opponent is a set of swept volumes and two blades and the
question is which of them to put steel into. Different observation, different
command, different entry into `World`.

Faction `Order` and `Objective` are not policy outputs and, on a surviving model,
are not policy *inputs* either. The host still sets them on `World` and they
still reach the state hash, but neither surviving observation carries an order or
navigation column, so nothing perceives them.
[Navigation and visibility](../design/navigation-visibility.md) owns that finding
and what it cost the browser.

## Run harness ownership

`policy::run` resets the policy, constructs a `World`, applies
initial orders, and repeats the decision loop followed by `World::step`. It
optionally records the submitted commands into a `Replay`, and returns outcome
metrics and the final `World::state_hash`. **What it records is what the world
*stored*, not what the policy offered** -- a refused submission stores the
neutral command atomically and returns the reason beside it, and recording the
offered command would replay a different fight the day validation moved by a raw
unit.

`policy::run` was the legacy loop and `policy::run_articulated` was the
articulated one; both are gone with their models. They were siblings rather than
branches inside one loop, and that argument is what says the next model gets its
own loop rather than a `match` on the hot decision path. The claims that went
with the legacy loop are listed in the crate's module header rather than left
implicit, because a deleted test leaves no trace.

**There is no weight search in this repository any more.** The genome surface --
`PolicySpec`, `MAX_GENOME_LEN`, and `lab evolve` above them -- optimised the
*named weights of a hand-authored policy*, and the embodied script has none, so
porting the search would have meant inventing a subject for it.
[Learning status](learning.md) carries that argument and the loss.

The determinism boundary is intentionally below the policy. A fixed-point policy
can be reproducible, but `World` remains portable even if a future policy uses
target-dependent floating-point inference, because a replay stores the command it
chose.

## The surviving seam

`Policy` is the same shape over the subject-scoped types:
`World::observe` in, `CommandV1` out, and no `&World`
parameter. A `compile_fail` doctest on the trait fences that, because a unit
test can only show that one policy did not read hidden state while the
signature shows that none can. On the stable toolchain rustdoc does not enforce
a pinned error code, so the fence is paired with a compiling twin that differs
only by the `&World` parameter, and the error the pair produces is measured
rather than remembered.

The three traits were separate rather than one trait over a `SubmittedCommand`
enum. The model is chosen once by the `Scenario` and never mixes inside a
world, so a mismatch is static information; `World::submit` already
refuses the wrong model at the boundary, and a second refusal one layer up would
buy nothing. **The argument outlives the second and third traits on purpose** --
with one model left it is what says a new model arrives as a new seam rather
than as a match arm in this one.

There is no `TeamPolicy`. The legacy one routed on the observation's faction, and
`Observation` has no faction column -- "the other side" appears only
as already-selected `opponents`. Per-side routing belongs to whoever drives the
run.

**The surviving seam differed from the articulated one in exactly one place: the
width of what it returns.** That was not a formality, and it is why the
articulated seam could be deleted whole rather than merged. The 57-byte command
carries a swing plane the 53-byte core has no offsets for, so a policy
typed to return the core could not command an elbow, and an
adapter between the two would have had to invent a plane -- which is inventing
state rather than converting it. There was never an adapter to keep.

It takes an `Observation` because that is what a body
produces: **perception was shared between the two models even where the command was
not**, which is why one observation type survived both deletions while two command
types did not.

### What an embodied policy is allowed to see, and why it arrives as fractions

`Observation` carries an `ObservedStance`, and each `ObservedOpponent`
carries a narrower `ObservedOpponentStance`. Both were blank on a body without legs,
on the rule the older block already set: one struct and one width whichever model a
scenario picked. **No such body is reachable now**, and the blank case is still
specified because the struct still has one -- see the [stance
rows](../reference/articulated-abi.md#stance-rows), where the same distinction lost
the fixture that used to demonstrate it.

The subject's own values are the hips relative to the torso, the twist as a signed
fraction of the stance budget, the pelvis as a fraction of standing pelvis height,
the step as a fraction of its own duration, and per arm the elbow relative to that
arm's shoulder plus how much of the reach annulus is left before the clamp bites.
A perceived opponent gets two of those: their twist fraction and whether they are
mid-step.

**The fractions are the boundary and not a convenience.** `STANCE_TWIST_LIMIT_RAW`,
`STANCE_STEP_TICKS` and `PELVIS_HEIGHT_RAW` live in `crates/sim`'s actuator module
and are deliberately not re-exported from `sim`, so a policy cannot reach them.
That makes a raw twist an uninterpretable number on the far side of the seam --
the divisor is the half that carries the meaning, and it is the half that stays
in. Publishing the ratio is therefore the only shape of this fact that crosses the
boundary at all, and the same argument puts the elbow relative to its own shoulder
over arm length, since no shoulder is published anywhere. It is the argument
`Contact::min_strike_range` already makes about deriving and handing over rather
than leaving to be reconstructed, taken to the case where reconstruction is not
merely wasteful but impossible.

**Reach headroom is the column the seam gained rather than a rescaling of one it
had.** An embodied arm can be commanded to a pose it cannot hold, and the clamp in
front of the integrator silently takes the difference. A policy that reads only
where its hand is cannot tell a comfortable guard from a locked-out one; one that
reads how much extension is left can choose between stepping in and reaching
further. Zero means the arm is against its own outer bound.

**Opponent stance is exact and carries no perception noise**, unlike the geometry
in the same row. A twist is the angle between two halves of one silhouette, and a
body's bearing is already exact for exactly that reason; mid-step is categorical
like a severed region. The concession is deliberate: a saturated twist is meant to
be an opening, and an opening whose cost is paid by the body that is wound up is
the right shape for it. What a dim fighter reads wrong stays what it always read
wrong -- where the body is.

`ComposedController` -- the session-08 controller that merges a human hand and an
AI hand into one submission -- keeps its inherent `decide` and `reset` as the
implementation, and the trait impl forwards to them. A caller holding one by
value should not have to import a trait to drive it; the trait exists so a
*driver* can hold either it or a scripted embodied policy behind one
`Box<dyn Policy>`, which is a different need and arrived a session
later.

### The scripted embodied policy, and the one term that exists to be measured

`crates/policy/src/script.rs` is the first policy typed to the embodied
seam. It was a **sibling of `articulated_script.rs` and not a mode of it**, and the
reason was the frame: `ArmTarget::bearing` and `move_dir` were world quantities in
that file and are torso-relative ones here. A single file with a frame flag would make
"which frame is this bearing" a runtime question in the one place where the wrong
answer produces a fighter swinging at the map's north, and nothing at the boundary
would refuse the command. The frame is also a simplification, and both show up in
the file: a guard arc centred on the body is a clamp with no yaw in it, a step that
brings the feet under the shoulders is `(1, 0)`, and the same tactical situation at
two different yaws is the *same command* in every relative column.

It expresses four things, because those four are the session's acceptance
criteria: close and strike; hold a guard while circling; step to unwind a
saturated twist; and use elevation. Each has a named test that goes red when its
term is deleted.

Two columns of the observation block are load-bearing in it. **Reach headroom
decides between stepping in and reaching further**: an arm at its outer bound has
no extension left, so asking for more buys a clamp and the distance has to come out
of the feet instead. **The opponent's stance is read twice** -- their twist chooses
which way to circle, because a body wound to its limit cannot follow you around to
the side it is wound away from, and their mid-step flag chooses when, because a
body whose feet are committed cannot answer. Every read of the block is gated on
its `present` flag, which is the whole of the degradation onto a model with no
legs: a blank block's zeros mean "locked out" and "settled" read straight, and an
ungated policy would step in on every tick of every articulated fight.

**The swing plane is used rather than left neutral, per arm.** The weapon arm keeps
the neutral plane, which puts the elbow below the shoulder-to-hand line and the
forearm under the blade rather than leading it into the target; the guard arm folds
its elbow a quarter turn toward the body's centre line, so the forearm lies across
the line the guard covers instead of hanging under it. Since session 07 the forearm
is a swept collider, so where the elbow hangs is what it can intercept. Both are
chosen on the model rather than on a corpus, because there is no embodied corpus
yet.

**The elevation term reads the body's own floor and never an opponent's, and that
is a correction rather than a simplification.** The obvious design is
`foe.body_position.z - obs.body_position.z`, and the perception model rules it out:
`observed_opponent` displaces a perceived body rigidly, that displacement has a z
term, and the duel fixture's fighters carry 0.9 and 1.2 world units of noise against
a sculpted fixture whose entire relief from the flat to the summit is 0.75. A
per-tick reading of the difference of two floors is a reading of the noise, and
filtering it would need a deadband wider than the hill. The subject's own
`body_position.z` is exact, so the term is built from it: a body that has climbed a
terrace strikes one notch lower and closes at half speed, and a body that has lost a
height step turns its circle the other way. It is a hill climb with one bit of
state and no terrain query, which is all an observation can support -- there is no
height field in one and there should not be.

That is the policy's only memory, and it is the reason `reset` has work to do.
Everything else is a pure function of one observation, which is what
`scripted_command` exposes: a test that wants to know what the script says
at tick 137 does not have to build a policy and drive a world.

**The term is switchable, and switching it off is the point.** The next session
measures the policy against itself with the elevation term disabled on a sculpted
corpus, so the switch is a constructor parameter rather than a build flag or a
global: two builds of one library that differ by a `static` cannot be bracketed
`control -> subject -> control` inside one round, and this repository accepts no
other comparison for a number that moves 2-3x run to run. The term exists **to be
measured, not asserted** -- nothing in the code claims the high ground wins, and a
measurement that comes back flat is a result.

The property that makes that measurement mean anything is that the term is
*provably inert on level ground*: no drift is set until the floor has fallen a
height step and no climb is counted until it has risen a terrace, neither of which
happens on a dungeon whose every tile is level.
`the_two_configurations_agree_on_flat_ground` drives both configurations over
`Scenario::embodied_duel` and compares state digests, and
`the_two_configurations_diverge_on_a_hill` does the same over
`Scenario::embodied_slope` and requires that they differ. Without the first, a
difference measured on the hill would be partly a difference the flat corpus would
show too; without the second, there would be nothing to measure.

### What the shipped script is worth, measured

**It does not play well, and that is a property of what it was built for rather than a
defect in it.** Over 400 mirrored trials of `embodied-duel-v1` under the script on both
sides, measured 2026-08-18:

```text
clock     33/400 decided by a body (8.2%), 367 reached tick 3600 (91.8%)
fights    3522.6449 ticks mean, 3600.0000 median
contacts  816852 resolutions, of which 626361 weapon/body
health    fighter ends on 0.8687 mean, brute on 0.6021 mean
guard     diagonal 52.06% of 42800 commanded pairs
```

At 60 Hz the median duel is sixty seconds of continuous contact with no result. The reading
that matters is the contact column: **1,566 weapon-on-body facts per trial deliver about
0.40 of the Brute's health between them**, a shade over a ten-thousandth of a health point
each. The bodies are not failing to reach each other; they are standing inside each other
and rubbing, and damage is kinetic energy, so a blade at nearly zero relative speed does
nearly nothing however often it touches.

The `guard` row is the other half. 52.06% diagonal has been read as competence and is not:
the guard height is `HEIGHTS[((tick + GUARD_LEAD_TICKS) / HEIGHT_TICKS) % 3]`, a clock that
**never looks at the incoming blow**, and the diagonal is the arithmetic of two clocks half
a step apart on a table whose three off-diagonal cells are structurally unreachable.

None of this is news to the file: `script.rs` says in its own header that it does
not tune, because there was no embodied corpus to tune against when it was written. It
existed to make the corpus possible. The corpus exists now, and the measured baseline above
is what a policy that plays is measured against. The topic that did so -- the embodied
fight -- has closed, and
[the tactical policy record](../performance/embodied-tactical-policy.md) is what it left:
a tuned fighter measured against this baseline on four harnesses, losing to the frozen
script on all four. The numbers here are current and this document is where they live.

## The registry, and why its `build` cannot fail

`PolicyKind` is the last of three registries and was a sibling of the
other two rather than an extension of either: the three seams shared no code
space, so `2` named `idle`, `windmill` and `scripted-level` depending on which
registry was being read, and a collision between them would have been a page
showing a different fight when a dropdown moves. **Two of the three are deleted
and the rule they were written for is the reason to keep saying it**: a second
seam appends its own registry rather than codes to this one, and no unit test can
see that regression, because with one registry left there is nothing left to
collide with. Codes are append-only for the same reason as before -- they are
what a saved configuration or a URL carries. The five are `neutral`, `scripted`, `scripted-level`, `tactical` and
`tactical-fixed-guard`. Two of the five are controls, and both are registry entries
rather than test-only constructors for the same reason: they are what a measurement
runs against, and that comparison has to be runnable from a command line and nameable
per side.

`scripted-level` is the scripted policy with its elevation term switched off.
`tactical` is the strike planner behind this seam: `StrikePlanner` is frame-free,
because every quantity it reads is a world quantity measured off an observation whose
type is the same on both seams, so the port shares the planner and forks only the
command assembly. The frame enters in one four-line function,
[`into_torso_frame`](../../crates/policy/src/tactics.rs#L99), which subtracts
the *observed* yaw and not the commanded one -- the world re-adds
`World::body_yaw[i].angle`, and the commanded yaw is a request the actuator chases at a
bounded rate. Its first measured outing is
[the tactical policy record](../performance/embodied-tactical-policy.md).

`tactical` also carries **the only guard in this repository that is a read rather than
a clock**. [`GuardRead`](../../crates/policy/src/guard.rs) takes the nearest
live blade's tip, expresses it as a fraction of the subject's own standing height above
the floor its owner stands on, and commands the nearest of the three bands -- deadbanded
so a blade that has not moved does not move the arm, and committed for the thirteen
ticks the actuator needs to carry a hand one band. **No tick can produce a height no
blade produced** — which is the narrow claim and the true one. This paragraph said "it
reads no tick, no phase and no counter" until 2026-08-18, and that was contradicted by
the sentence before it: the guard reads `obs.tick` to know whether its thirteen ticks
have run, and `StrikePlanner::phase` to know whether the strike owns the arm. What the
tick and the phase can do is *gate* the read; neither can select a value.
`tactical-fixed-guard` is that policy with the read switched off: the same arm,
the same reach and the same effort, permanently on the body's own centre line, so a
difference measured between the two is the read and not "one of them has an arm up".
The result of racing them, including the four departures from the session plan that came
out of reading the simulator rather than the corpus, is in
[the tactical policy record](../performance/embodied-tactical-policy.md#session-03-the-guard-that-watches).

`tactical` also carries **the one piece of this seam that is configuration rather
than code**. [`Footwork`](../../crates/policy/src/footwork.rs) is four numbers
a `StrikePlanner` spends on its feet -- the standoff it holds outside its own reach,
the fraction of reach at which it gives ground, how fast the feet cross measure during
a commit, and the twist fraction at which a wound torso walks while it unwinds. It is a
struct on the planner and not four module constants for `TacticalConfig`'s reason:
**one planner drove two seams.** `TacticalArticulatedPolicy`, which `#/arena` rendered
and which every pinned `articulated-duel-v1` measurement was taken with, and
`TacticalPolicy`, which session 04 retuned against `embodied-duel-v1`. Editing
the constants in place would have retuned the first silently. Session 05 deleted the
first, so the row is now configuration with one live reader -- **kept rather than
folded back into constants**, because it is what makes the sweeps below reproducible
from a shipped command instead of from an edit and a rebuild. `Footwork::ARTICULATED`
is therefore the planner's own pre-session-04 numbers,
[`StrikePlanner::footwork`](../../crates/policy/src/tactics.rs#L416) is the
constructor that takes a row, and `StrikePlanner::default()` still answers the
articulated one -- which is why `TacticalPolicy` has a hand-written `Default`
rather than a derived one.

The row survives `StrikePlanner::reset`, on `PlanScoring`'s precedent: a corpus runner
resets between seeds, and a reset that restored `Default` wholesale would demote every
seed after the first to a policy nobody selected. And it is reachable from a command
line -- `lab embodied --footwork margin,floor,lunge,unwind` -- so that the sweeps in
[the tactical policy record](../performance/embodied-tactical-policy.md#session-04-the-fight-that-ends-and-does-not)
are reproducible without editing a constant and rebuilding. `PolicyKind::build_with_footwork`
answers `None` for the three entries with no planner, so a row that cannot be spent is
refused by name rather than dropped.

**`PolicyKind::build` returns a policy and not an `Option`, which is where
it deliberately differed from its sibling.** `ArticulatedPolicyKind` answered `None`
for its learned code because a trained fighter is a kind *plus fifteen kilobytes of
weights* and nothing keyed by an integer has anywhere to put a checkpoint; the
dispatch belonged to whoever held the checkpoint, and `crates/policy` could not
have built one anyway -- it is audited by `tools/check_deps.js` and must not gain a
float dependency, and the floating point lives in `crates/learn-core`, which
depends on *this* crate. Nothing here is a checkpoint: session 09 measured the
learning boundary and deferred widening the network's input, so an embodied
learned code would be a promise made before the session that owes it exists.
`ComposedController` is not a kind either, for the same argument's shape rather
than its subject -- it is a set of sources, one of which is a human hand, and an
integer has nowhere to put a person.

## `script_digest` is gone, and the debt it carried went with it

`policy::script_digest` reduced a submitted-command stream to eight bytes so that two
runs of the same script could be compared without keeping the stream. **It could not
see an embodied run at all**: its loop kept only `SubmittedCommand::Articulated`, and
its doc comment accounted for the arm it dropped as `Legacy`, which "cannot occur".
`Embodied` occurs on every record of every embodied run, so the digest counted zero
records and finished at the empty-stream constant `0x89b684347e2caedd` -- the same
number for the script, for the control, and for a matchup running a different policy
on each side.

**The owed repair was a one-line change and was discharged by deletion instead.** The
function lived in `crates/policy/src/articulated_script.rs`, which session 05 deleted
with the model it served, so there is no longer a shared digest for a caller to reach
for and get a constant from. `AGENTS.md` still lists the repair as owed and should
stop.

`lab embodied` folded its own stream under `ARPG-EMBODIED-SCRIPT-V1` rather
than calling it, and that fold is now the only one; the function is
[`embodied_script_digest`](../../crates/lab/src/main.rs#L774), it copies
`script_digest`'s grammar byte for byte over `CommandV1::payload_bytes`, and its
doc comment carries the whole argument. **The copy is now the original**, which is the
cheapest possible discharge of a debt that was going to be a session with a hash
prediction: the shared function fed three registered digests, so widening its match was
never a cleanup, and deleting the model deleted the caller that made it wrong.

It was found only because three `crates/lab` tests were written against the number
first and all three went red. A `script` column that looks like a fingerprint and is a
constant is exactly the invisible green-test failure `AGENTS.md`'s house style warns
about, and it shipped in a report for the length of one session. The measured record is
[the embodied corpus](../performance/embodied-corpus-and-high-ground.md).

## Frozen networks are current, and where the float stops

`crates/learn-core` holds a compact 41-feature slice, a 41x64x18 perceptron, a
five-head action table and a checkpoint codec; `crates/learn` holds the
population that trains one. Both may use floating point, which nothing under
`fx`, `sim` or the deterministic parts of `policy` may, and the licence has one
condition: **nothing they compute reaches authoritative state.** What crosses is
five head indices from an argmax, assembled by `learn_core::compose` into a command
core out of a fixed table of `Fx` constants.
`LearnedActionV1` is a separate type for exactly that reason: the world's submission
cannot be handed one.

The dependency arrow is the rest of the architecture. `learn-core` may see `fx`,
`sim` and `policy`; none of the three may see it, and
`the_learned_policy_is_unreachable_from_sim` says so by asking **Cargo** for the
resolved graph. It read the manifests as text until a review of v2-ui-08 got
three ordinary spellings past it -- no spaces, a trailing slash, and
`learn.workspace = true` -- which matters because that session's own finding is
that the compiler never enforced this arrow, leaving the test as the whole of
it. `crates/web` depends on `learn-core` and must never depend on `crates/learn`,
which uses `std::thread::scope` and a wall clock and belongs in no `cdylib`.

`LEARNED_INFERENCE_DIGEST` is what keeps the crossing honest between targets:
`Model::forward` is a rectified linear precisely so that no libm call enters the
inference path, and until v2-ui-08 that portability argument had no second host
to be checked on. It is registered in
[`hashes.md`](../reference/hashes.md#golden-registry) with the
`-C target-cpu=native` caveat that bounds it.

The surviving run harness was `run_articulated`'s sibling and the legacy `run`'s
before that, never a branch inside either, because a `match` on the combat model would
have put every difference behind one branch on the hot decision loop of the thing that
must not move. **It carries the surviving name now that the siblings are gone**, which
is the shape that argument always pointed at. Three things distinguish it from the
legacy loop, and all three survive
the loops that are gone:

- It records what the world **stored**, not what the policy offered.
  The submission answers `Stored { command, rejection }`, and a range
  or equipment failure atomically stores the neutral command instead. Replays
  persist final submitted commands, so the stored one is what a
  `Replay::record_submitted` row carries -- not the offered one, which is
  never written down. `a_refused_submission_is_recorded_as_what_the_world_stored`
  reads what was written down rather than resting on replay equality, which would
  pass either way.
- `RunResult::rejected` and `RunResult::first_rejection` report refusals.
  Without them a run whose every command was replaced looks exactly like a run
  by a policy that is not very good.
- The swordplay counters stay at zero, because the surviving branch of
  `World::step` emits only `Event::Death`. Damage
  travels as contact resolution rows.

`World::outcome` is model-agnostic and is reachable here, because
`reap_dead_bodies` clears `alive` when the anatomy says dead.
`an_embodied_run_stops_on_a_death_and_not_only_on_the_clock` proves that by
thinning an anatomy until the reaper fires rather than by waiting for the game to
be balanced -- which is how the same claim was made for the deleted loop, and for
the same reason: a fixture that ends on its own for reasons of its own stops being
a test about the reaper the next time the damage model moves. A run that reaches
`max_ticks` is scored on points by `World::timeout` exactly as a legacy one was.

## Human commands use the same boundary

The browser may ask a person rather than a Rust policy for the hero's next command.
This is a change of command source, not a second authority channel: the host still
submits `Command`, and `World` cannot tell whether a policy, a replay, or live input
produced it. Direct control deliberately asks for a movement direction, an attack
line, and a cut; swing phases and recovery remain simulation rules rather than
pointer-controlled pose.

Submitting every tick also advances the world's decision deadline every tick, so the
browser owns the cadence for whichever half of the hero is still policy-controlled.
A recorder for browser fights must capture those host submissions; the current lab
runner only records decisions made through its pending-policy loop. This supersedes
the former `DESIGN.md#the-one-exception-taking-the-controls` discussion while keeping
its warning about replay completeness.

The embodied observation/action seam, its registry, its configured duel, and the
learned browser policy are current. The decision-loop ownership is intentionally
split: `policy::run` is exercised directly only by tests; a lab harness needs
per-tick resolutions, cap hits, and energy-ledger columns that `RunResult` does not
carry, so its loop is pinned to the runner by an equivalence test; and the browser
needs two independently selected policies, while `run` installs one
policy kind on both sides. A future shared versioned policy envelope is still a
proposal, not an omitted part of the current seam.

## A recorded direction: options, and the two selection boundaries

Not current and not authorized -- recorded here because the distinction it turns on is a
real one about this repository's seams, and it was the only durable content of a research
plan set that was retired in 2026-08 without a session ever running.

The proposal was a slower meta-policy choosing among complete, understandable combat
options while a lower-level controller executes each choice long enough for it to have an
effect. An option is a versioned `(loadout, strategy)` pair -- `(shield+sword, charge)`,
`(shield+sword, withdraw)`, `(club, hold-measure)` -- so several options may share one
loadout, which is what isolates strategy selection from equipment selection.

**The part worth keeping is that "selection" means two different things and conflating them
would break replay.**

- *Encounter selection* happens **before** `World` construction and may choose any eligible
  pair. The chosen loadout becomes ordinary scenario input and is fingerprinted and
  replayed exactly as it is today.
- *Tactical selection* happens **during** a fight and may change only the strategy. Every
  candidate must match the already-equipped loadout, and a selector asking for another
  loadout is refused by option id rather than silently swapping gear -- a hand's contents
  are a scenario fact, and changing one mid-fight under an unmoved fingerprint is the
  shape of bug this repository has shipped and caught more than once.

The hierarchy would own no `World`, no snapshot, no hidden target state and no
authoritative memory: the selected strategy still receives only an observation and returns
only a command, and replay still records submitted commands, so replay needs neither the
selector nor its catalog nor its model. That property is what made the proposal compatible
with [the agent boundary](../../DESIGN.md#the-agent-boundary) rather than an exception to
it, and it is the reason to record the shape rather than the ambition.

It was retired because its own precondition was never met: it required a mechanically
productive corpus with context-dependent option advantage to be demonstrated first, and no
such demonstration exists. Any successor needs a separately approved causal question.

## Source anchors

- The seam: [`Policy`](../../crates/policy/src/lib.rs#L242)
- The seam's registry: [`PolicyKind`](../../crates/policy/src/lib.rs#L394)
- The scripted embodied policy: [`crates/policy/src/script.rs`](../../crates/policy/src/script.rs)
- The tactical embodied policy: [`crates/policy/src/tactics.rs`](../../crates/policy/src/tactics.rs)
- The guard that reads the blade: [`crates/policy/src/guard.rs`](../../crates/policy/src/guard.rs)
- What a planner's feet are told: [`crates/policy/src/footwork.rs`](../../crates/policy/src/footwork.rs)
- Headless decision loops: [`crates/policy/src/runner.rs`](../../crates/policy/src/runner.rs)
- Subject-scoped inputs: [`crates/sim/src/obs.rs`](../../crates/sim/src/obs.rs)
- The command grammars, `Order` and `Objective`: [`crates/sim/src/command.rs`](../../crates/sim/src/command.rs)
- Submission and scheduling: [`World::submit`](../../crates/sim/src/world/mod.rs)
