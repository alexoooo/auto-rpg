# v2-19 — decide whether learning earns a larger roadmap

**Goal:** compare one small learned articulated policy with the frozen scripted
baseline using native offline training and held-out replayable evaluation.

**Depends on:** passed `v2-17`; use `v2-18` for presentation only after its pass.

**Golden expectation:** no hash moves. Training may be nondeterministic; recorded
submitted commands and replays remain deterministic.

## Minimal learning boundary

Add `crates/learn` depending on `sim` and `policy`, and add it only to native `lab`.
It may use floating point but no learned/model/optimizer type enters `Scenario`,
`World`, `SubmittedCommand`, replay, or hashing. Do not add `search`, browser learning
hosts, rollout workers, WebGPU training, a skill catalog, hierarchy, or workbench.

Implement one versioned two-layer MLP (`FEATURE_LAYOUT_VERSION` input, 64 hidden
units, discrete action logits) and adapt the existing bounded population optimizer.
The discrete action table is append-only and contains the exact scripted vocabulary
from `v2-17`; body yaw and arm targets are complete `ArticulatedCommandV1` builders,
not a second command ABI. Frozen checkpoints record model schema, feature/action
layouts, training seed set, optimizer settings, and SHA-256 digest. Inference uses
preallocated buffers and deterministic argmax for a fixed checkpoint on one host.

Add:

```text
crates/learn/src/model.rs
crates/learn/src/checkpoint.rs
crates/learn/src/probe.rs
crates/lab/src/learn_probe.rs
docs/performance/v2-learning-probe.md
```

`lab learn-probe train` writes checkpoints atomically. `lab learn-probe evaluate`
records every held-out run as the normal replay envelope plus checkpoint digest; a
replay never loads the checkpoint.

## Comparison and decision

Before training, freeze 400 mirrored held-out seeds unused by optimization. Compare
learned and scripted policies against the same frozen scripted opponents, sides,
loadouts, and tick limit. Report win/draw/loss, scalar return, tick-limit rate,
contacts by kind/height/region, defended contacts, self-created energy violations,
inference time, and bootstrap 95% confidence intervals.

Learning earns a follow-up roadmap only if held-out mean return improves by at least
5% with a confidence interval excluding zero, tick-limit rate worsens by no more than
2 percentage points, every `v2-17` safety invariant remains green, and recorded
replays reproduce exactly. Otherwise record whether to keep scripted control, revise
the action/observation design, or stop learning work. A training-curve improvement or
visual demo alone is not a pass.

## Tests and verification

```text
checkpoint_layout_and_digest_mismatches_fail_closed
frozen_inference_allocates_nothing_after_warmup
learned_output_uses_only_the_versioned_action_table
training_types_cannot_enter_authoritative_state
held_out_seeds_are_disjoint_from_training
recorded_learned_replays_do_not_load_the_model
a_failed_or_nan_evaluator_falls_back_to_the_scripted_policy
```

```powershell
cargo test
cargo run --release -p lab -- learn-probe train --spec v2-probe
cargo run --release -p lab -- learn-probe evaluate --spec v2-probe --seeds 400 --mirrored
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```

Append the evidence and final `expand`, `revise`, or `stop` decision to this file.
Only `expand` authorizes new plans for scale, search, catalogs/hierarchy, browser
training, GPU evaluation, or the Lab workbench.

---

## Implementation decisions — `crates/learn` (2026-08-10)

The crate is landed; the `lab learn-probe` subcommand, the held-out comparison and
`docs/performance/v2-learning-probe.md` are not, and **no `expand` / `revise` /
`stop` decision is recorded here.** That decision needs the held-out comparison this
crate makes possible and does not itself run. Nothing depends on `learn` yet — it is
a workspace member reachable from `cargo test -p learn` and from nowhere else, and
`lab` is where the edge goes when the subcommand lands.

What did land: `crates/learn/src/{lib,model,checkpoint,probe}.rs`, four test files,
the workspace `members` entry, the layout block in `AGENTS.md`, and `learn` added to
the audited set in `tools/check_deps.js`.

### The 922-column vector is not the input

`FEATURE_COUNT` is 922. Fed to 64 hidden units that is 60,242 weights, and the
optimizer being adapted is a `(mu + lambda)` evolution strategy whose existing world
is `MAX_GENOME_LEN = 24`. So the input is a hand-picked **41-scalar slice**,
`LEARN_FEATURE_LAYOUT_VERSION = 1`, append-only, giving 3,858 weights. Every column
is commented at `model::write_features`; the blocks are:

| indices | what |
|---|---|
| 0..4 | anything in sight; the 360-tick cycle phase as (cos, sin); elapsed fraction |
| 4..13 | blood, shock, five regional integrities, own travel in body frame |
| 13..21 | both hands: forward, lateral, height, fatigue |
| 21..30 | the nearest opponent: range, relative bearing, relative facing, its travel, contact timing, severance fraction |
| 30..39 | the live blade: tip and hilt in body frame, hilt height, and the **rates** of hilt height and tip range |
| 39..41 | the opponent's plate: present, and how high it is held |

Everything is in **body frame**, which is what makes `--mirrored` a doubling of the
sample rather than a doubling of the task; `a_mirrored_fight_writes_the_same_slice`
pins it. The two rate columns are the only state the policy carries, and they are why
`reset` is not a no-op: one frame cannot tell a weapon hand being loaded from one
already spent.

**Two of the forty-one columns are structurally dead on the shipped fixture**, and
that is written down here because "the slice was too narrow" is one of the
explanations a failed probe has to rule out. The probe always puts the candidate on
the Fighter, whose only opponent is a shieldless Brute, so features 39 and 40 (the
opponent's plate) never leave zero — `the_opponent_shield_columns_are_dead_on_the_shipped_fixture`
asserts it, and that test failing means the fixture grew a second shield and the note
should go. A further seven to ten columns are constant *within* a typical fight
(blood, shock, the five integrities, severance) because nothing damages either body
enough to move them, so the network sees roughly thirty live columns of forty-one.

Left out and argued in place: opponents past the first (six rows, one filled), the
45 columns of opponent capsules (nearly a rigid function of position and yaw, and
there is no target-region head to use them), own wound fractions, and own equipment
ids.

### Action heads

`LEARN_ACTION_LAYOUT_VERSION = 1`, five heads, 18 logits, argmax per head with ties
to the lowest index. 540 compositions, against ~400 for a flat table with none of
the structure.

| head | width | entries |
|---|---|---|
| footwork | 5 | advance (15/16), hold, withdraw (1/2), strafe left (1/2), strafe right (1/2) |
| weapon height | 3 | LOW, MID, HIGH |
| weapon bearing | 3 | 0, +EIGHTH_TURN, -EIGHTH_TURN, off the line to the opponent |
| weapon posture | 4 | chamber (3/4, 1), commit (1, 1), rest (1/4, 0), **guard (1/2, 1/2)** |
| guard height | 3 | LOW, MID, HIGH, driving the off arm |

Every magnitude is the scripted vocabulary's. The four constants this crate has to
copy (`articulated_script` keeps them private) are pinned against the script's own
submitted commands by `the_action_table_is_the_scripts_own_vocabulary`, so a drift on
either side fails a test rather than quietly making the comparison unfair.

The off arm is built locally as `off_hand(body_yaw, holding, guard)` — v2-20's
signature — rather than by calling into `policy`, so the two sessions do not have to
land together. Body yaw is not a head: it always faces the fight.

### The scalar return, and whether it discriminates

`probe::shaped_return` is `lab::fitness`'s shape: outcome (100 / 55 / 20 / 0), then
40 × own health, then 60 × the opponent's health removed, then −ticks/150.

**Measured over 400 mirrored trials per policy, each on the heroes against the
composed script on the monsters** (`the_shaped_return_separates_the_three_scripted_policies`,
`cargo test -p learn --release --test return_discrimination -- --ignored --nocapture`):

| policy | mean return | s.e. | bootstrap 95% CI | wins | tick-limit |
|---|---|---|---|---|---|
| composed | 64.953 | 1.277 | [62.465, 67.348] | 330/400 | 99.0% |
| windmill | 82.225 | 0.864 | [80.652, 83.917] | 399/400 | 97.8% |
| attack-moves | 75.728 | 1.191 | [73.546, 78.131] | 384/400 | 97.0% |

All three pairs separate: gaps 17.271 / 10.775 / 6.496 against summed standard
errors of 2.141 / 2.467 / 2.055, and the three intervals are disjoint. **The return
discriminates.** Term by term (the four columns sum to the mean, which the test
asserts rather than prints):

| policy | outcome | survival | attrition | time | sum |
|---|---|---|---|---|---|
| composed | 45.825 | 39.533 | 3.482 | −23.887 | 64.953 |
| windmill | 55.875 | 39.956 | 10.136 | −23.743 | 82.225 |
| attack-moves | 54.150 | 39.872 | 5.235 | −23.528 | 75.729 |

Survival and the time penalty are effectively constants on this corpus — the Fighter
ends between 0.988 and 0.999 whatever it does, and 97–99% of fights reach the clock.
All of the discrimination is in the outcome term (span 10.05) and the attrition term
(span 6.65), which is what the 60 on attrition is chosen to achieve.

**Two caveats the next session should carry rather than rediscover.** The two
orientations of one seed are not independent — measured ρ = 0.135 with the composed
script on both sides, so every standard error above understates by about `sqrt(1+ρ)`,
6.5%. It does not overturn a gap that clears its noise threefold. And the two
orientations are not the same distribution: plain gives mean 67.65 / sd 36.39 against
the mirror's 65.35 / 22.77, so a pooled standard deviation is a mixture and not a
spread worth interpreting.

**The finding beside it is worth as much as the measurement.** The composed script is
the *weakest* of the three fighters by seventeen points; the windmill control beats
the same opponent 399 times out of 400. A learned policy asked to beat the composed
baseline is being asked to beat something two controls already beat comfortably, so
a 5% improvement over it would be weak evidence that learning works. The held-out
comparison should report against all three, and `revise` is on the table for the
choice of baseline as much as for the action design.

### A smoke run, and the number in it that matters

`a_short_training_run_climbs_and_writes_a_loadable_checkpoint` — 10 generations, 16
candidates, 4 training seeds mirrored, full 3,600-tick fights, 287s on 20 threads.
**Not the v2-19 comparison**: the seed set is four, the held-out set is twenty of the
four hundred the plan freezes, and nothing here is evidence for or against learning.
What it shows is that the loop works. The champion improves
77.0 → 91.3 → 94.0 → 95.5 → 118.6 across generations, which is what a `(mu + lambda)`
strategy with a working mutation operator looks like; before the RNG fix below the
champion was found in generation 0 and never beaten again.

Held out on 20 seeds × 2 orientations:

| policy | mean return |
|---|---|
| composed script | 65.677 ± 3.396 |
| **zeroed network** | **75.972 ± 0.555** |
| trained network | 85.301 |

**Read the middle row before the third.** A network of all zeros — which ties every
head and therefore picks index zero everywhere: advance, LOW, straight down the line,
chamber, guard LOW — already beats the scripted baseline by ten points, with a fifth
of its variance. So of the trained network's +19.6 over the baseline, roughly half is
not learning at all; it is the fact that walking in and chambering low beats the
composed script. The number a real comparison has to report is the +9.3 over the
zeroed control, and **the zeroed network belongs in v2-19's comparison table as a
fourth condition.** A 5% gate measured only against the composed script would be
passed by a constant.

### Where the plan's assumptions did not hold

- **"the opponent's per-region integrity" is not observable.** `ObservedOpponent`
  publishes geometry, identity and a severance mask and nothing about integrity or
  health. Feature 29 (the fraction of regions severed) is the only damage signal a
  fighter has about the other body, and it is far coarser.
- **"health differential, then damage dealt" cannot be two tiers.** Health is
  published per side as a fraction of that side's own bar, so on a one-against-one
  fixture the two are `h` and `1 − m` and every weighting of them is a linear
  function of `h − m`. The split survives only as a ratio.
- **"outcome dominates" is true only over reachable states.** The health axis spans
  100 points and the decision step is 55, so a *hypothetical* bloody loss outscores
  a bloodless win. It is unreachable: `World::timeout` awards the decision to
  whichever side holds more health, so attrition past the crossing point wins the
  decision rather than buying a loss. The test asserts the reachable version.
- **The ladder is flat below zero.** A draw, a decision against, and a defeat all
  score the same outcome term, so the attrition term is the only thing ranking a
  generation of losers — which matters more here than in `lab::fitness`, because a
  random population loses often.
- **Three weapon postures were not enough.** `chamber / commit / rest` gives the
  learned policy no way to hold a braced guard at all, which the script does for
  three phases in twelve. `Posture::Guard` is appended as index 3, leaving the three
  the plan named where a v2-19 checkpoint would expect them.
- **`crates/learn/tests/allocation.rs` contains the repository's only `unsafe`.**
  Counting allocations needs a `GlobalAlloc` wrapper and `std` offers no safe hook.
  It is one item in a test binary that ships in nothing; the alternative was to
  assert the claim from the source, which is not a test. The file argues it and
  invites its own deletion.

### What an adversarial review caught, and what it says about the method

The crate was reviewed by an agent briefed to refute it rather than summarise it.
Recorded here because the class of bug it found is the class this crate cannot see
in its own behaviour.

**The mutation operator was not a Gaussian.** `model::uniform` divided by `2^23`
where it should have divided by `2^24`, so its range was `[-1, 3)` with a mean of
one. `probe::gaussian` — twelve of those, minus six — therefore had mean `6σ` and
standard deviation `2σ` rather than mean zero and standard deviation `σ`, and every
generation added `+0.486` to all 3,858 weights at the default sigma. That is not a
`(mu + lambda)` strategy exploring around a parent; it is a fixed march along the
all-ones direction, and `ProbeConfig::sigma` was controlling the drift rate rather
than the exploration radius. `Model::random` was correspondingly initialised
asymmetric and biased positive — the exact failure its own doc comment warns about.

**Nothing in the suite failed.** Training was reproducible across thread counts,
checkpoints round-tripped, the population climbed, the action table held, and a
ten-generation run reported a 30% held-out improvement over the scripted baseline. A
monotone drift up a shaped return is indistinguishable from learning when read from
the outside. The lesson is narrow and worth keeping: **an optimizer's random number
generator needs its moments asserted directly**, because every downstream test it
has will pass. `a_uniform_draw_is_centred_and_bounded`,
`a_fresh_network_is_centred_on_zero` and `a_gaussian_draw_has_the_moments_it_claims`
now do that.

The same review also found: a checkpoint reader that accepted a NaN in its training
record (breaking the crate's own round-trip claim, since `NaN != NaN`); a
weight-count mismatch reported as a fabricated `5x0x0` shape; the mirrored-slice test
comparing eleven columns as `0 == -0` because its fixture carried no blade; the
component table pricing settled kills at 55 instead of 100, so the published columns
did not sum to the mean beside them; the mirrored-orientation correlation above; and
three different wrong values for "the whole 922-column vector as weights". All are
fixed, and the SHA-256 survived 80 digests against `node:crypto` across every
padding residue and four feeding patterns.

---

## How v2-19 closed (2026-08-11): `revise`

`lab learn-probe train|evaluate` landed, one checkpoint was trained and the held-out
comparison was run. **The complete corpus, every table, and the head-reachability
arithmetic are in
[`docs/performance/v2-learning-probe.md`](../performance/v2-learning-probe.md).**
What follows is the decision and the argument for it.

### The gate this session was given was passable by a constant, and was replaced

v2-19 above says learning passes if held-out mean return beats the scripted baseline
by 5% with an interval excluding zero. Measured: **a network with every weight at zero
scores 76.844 against the composed script's 59.871** on the frozen held-out corpus.
Argmax over zeroed heads selects index 0 everywhere, so that "policy" is the constant
*advance, weapon LOW, straight down the line, chamber, guard LOW* — and it beats the
named baseline by 28%. The composed script also **loses 118 of 400** to a mirror of
itself. A 5% bar over it is a bar a constant clears five times over, and any headline
of the form "learning beats the script" off it would be measuring the script.

What was run instead, and what a successor should keep:

- **Five conditions**, all on the heroes, all on the same held-out trials: constant,
  composed, attack-moves, windmill, learned.
- **The bar is five percent over the best non-learned condition**, which is the
  windmill at 84.606 and not the composed script at 59.871, with a **paired** bootstrap
  95% interval on the per-trial difference excluding zero. Paired because every
  condition fights the same seed in the same orientation, so trial `i` of two rows
  differs in one thing; bootstrapping the two means separately and subtracting leaves
  in the seed variance both share and reports an interval two to three times too wide.
- **The zeroed row is reported as "constant (advance/LOW/chamber/LOW guard)" and never
  as "the null model".** Which constant it is falls out of the order of the entries in
  each action head, which is append-only but otherwise arbitrary. A reader who takes
  the floor for a principled one will draw a conclusion from it that it cannot support.
  `the_constant_condition_is_the_zeroed_network_and_says_which_constant` asserts the
  sentence so that appending an entry at the front of a head cannot make it quietly
  false.
- **Two opponent conditions**, because a fixed script can be beaten by reading its
  clock. `learn::PhaseShiftedScript` adds one constant tick offset per run, drawn from
  the run seed over the script's whole 2,160-tick period, before delegating. It is in
  `learn` and not in `policy`: `ScriptedArticulatedPolicy` is a pure function of the
  observation with no per-run memory, `ARPG-SCRIPT-V1` is defined over what it submits,
  and per-run state belongs to whoever drives the run.

### The result

| | frozen composed script | phase-randomised |
|---|---|---|
| best non-learned | windmill 84.606 | windmill 84.193 |
| learned | **88.922** | **87.797** |
| paired difference | +4.316 (+5.1%), CI [+0.998, +7.945] | +3.604 (+4.3%), CI [+0.095, +6.970] |
| the 5% bar | +4.230 — point clears, lower bound does not | +4.210 — not cleared |
| tick-limit against the reference | 92.5% vs 96.2%, **−3.8 points** | 93.0% vs 95.5%, −2.5 points |
| refused submissions / solver refusals / energy excess | 0 / 0 / 0 | 0 / 0 / 0 |
| replays reproduced | 400/400, no model loaded | 400/400, no model loaded |
| inference | 2.93 us per decision | 3.07 us per decision |

**It is not a pass.** The bar is not cleared under both opponents, and under the
stricter reading — the interval's *lower bound* clearing five percent — it is not
cleared under either.

### The phase-randomisation verdict: no clock-reading claim is earned

The two verdict lines read PASS and FAIL, and the sentence they invite — *the edge is
a clock reading* — **is not what the numbers say, and this session's first draft of
the tooling printed it anyway.** An edge of +5.1% and an edge of +4.3% against a bar
of 5.0% produce opposite verdicts and differ by 0.7 points, which is nothing beside
either interval.

The test that actually answers it is the difference of the differences, paired trial
by trial: the same seed in the same orientation, fought twice, once against a
predictable opponent and once against an unpredictable one. `learn-probe evaluate`
now computes and prints it:

> **phase costs +0.712 of the edge over windmill, paired bootstrap 95% CI
> [−4.209, +5.350].**

The interval contains zero with room on both sides — it is seven times wider than the
point estimate. Randomising the opponent's phase did not measurably take anything
away. So:

- The learned policy did **not** measurably win by reading the script's clock — even
  though features 1 and 2 of its input slice are the cosine and sine of exactly that
  phase, put there deliberately for it to find.
- The two verdicts differ because of where the bar sits, not because of the clock.
- The control is worth keeping regardless. It cost one wrapper and it is the only
  thing standing between this corpus and a finding that would have been invented out
  of a threshold.

### The head-reachability verdict: confirmed, refined, and one premise refuted

**Zero head contacts in all ten rows, and it means "unreachable", not "unchosen".**
The claim handed to this session was that no attack in the scripted vocabulary can
reach a head. It is right, but it is two different facts in the two directions and one
of its premises was wrong.

- **The Fighter cannot reach the Brute's head at all.** Highest commandable hand is
  `standing_height * 3/4` = z 1.35, the blade is horizontal from it, and the Brute's
  head sphere plus the sword's radius admits a blade axis only from z 1.61 up. **A gap
  of 0.26 world units**, closed by no bearing, reach, posture or footwork.
- **The Brute can touch a Fighter's head and is never credited with it.** Its `HIGH`
  club axis is z 1.50 and a Fighter's head admits contact within 0.166 horizontally —
  but the region key is `(time of impact, medial distance, index)` and the torso
  capsule admits contact within 0.401 at the same height, so the torso is always struck
  first and always takes the row.
- **The refuted premise:** a Fighter's head band is **1.50..1.90**, not 1.60..1.80.
  `body_region_volumes` builds the head as a degenerate capsule with
  `lower == upper == centre_z`, so `AnatomyRegionSpec::half_height` is **dead for the
  head region** and the collider is a sphere of `radius` about `centre_z`.

`no_attack_in_the_vocabulary_can_be_credited_to_a_head` in `crates/learn` pins all of
it, and `learn-probe evaluate` prints the sentence under every contacts table. Not
fixed here: a fourth height, a non-horizontal blade, or a region-targeting action head
are each their own session's argument. **One of five anatomy regions is inert, and any
session adding a target-region head would be born with a dead entry in it.**

### The decision: `revise`

Not `expand`: the bar is not cleared, and v2-19 says outright that a training-curve
improvement or a visual demo alone is not a pass. The training return of 113.048 is a
mean over twelve trials on six seeds the optimizer selected on; the same checkpoint
scores 88.922 held out. The two are not comparable and nothing here rests on the
first.

Not `stop` either, and the four reasons are the content of the revision:

1. **The run was budget-stopped at 52 of 120 generations**, on a 45-minute wall-clock
   cap. The champion had not moved for the last twenty, which is a plateau and not a
   proof — an elitist `(mu + lambda)` at a fixed sigma with no step-size adaptation
   plateaus and then jumps. **The cheapest single action available is to finish the
   run**, and a marginal result from a run cut at 43% is not evidence that the method
   is exhausted.
2. **The learned policy is already the best of the five conditions on both boards**,
   never loses (0 of 400, twice), doubles the settled kills, and is the only condition
   that moves the tick-limit rate in the direction v2-17 needs. It is short of a bar,
   not short of a result.
3. **It is a near-constant, and that is the action/observation finding.** It commands
   MID about eighty percent of the time where every script cycles all three heights,
   and its legs column collapses to 18,914 against the windmill's 71,695. What it
   learned is one posture-and-height combination better than the zeroed network's — not
   a guard that reads the threat, which is the one edge v2-20 deliberately left
   standing for a learned policy to take. Either the slice does not carry what a height
   decision needs, or the return cannot see the difference.
4. **The physics caps how much any policy can express.** All five conditions sit in a
   band from 59.9 to 88.9 on a corpus where 92.5% to 99.8% of fights reach the clock.
   v2-17's gate wants under ten percent; learning bought 3.7 of the roughly 86 points
   it is short. **Learning is being measured through a model that cannot end fights**,
   and that is upstream of every knob in this session.

So `revise`, and the revision is ordered: **finish the training run first** (it is
free and it is the only one of the four that could change the verdict on its own),
then decide between the action/observation design and the physics — with (4) the
better bet, because a return whose whole discrimination lives in one decision term is
a return that will keep reporting near-constants as winners.

**`revise` does not authorize** scale, search, catalogs, hierarchy, browser training,
GPU evaluation, or the Lab workbench. Only `expand` does, and this is not one.

### What v2-19's own file got wrong, beyond the gate

- **"400 mirrored held-out seeds" is ambiguous** and was read as 400 *trials* — 200
  seeds in two orientations — so that the standard errors here are directly comparable
  with the ones the crate already recorded at `n = 400`. A reader comparing an `n` of
  400 with an `n` of 800 would silently be comparing intervals that differ by 40%.
- **`a_failed_or_nan_evaluator_falls_back_to_the_scripted_policy` was not implemented
  as written, and should not be.** That fallback belongs to inference inside a fight;
  the checkpoint reader makes it unreachable by refusing a non-finite weight at load,
  which is the earlier and better place. What a *measurement* must never do is quietly
  substitute one condition for another — a comparison that scored the composed script
  in the learned row would report a dead heat and be believed. `load_checkpoint` exits.
  `a_checkpoint_this_build_cannot_read_is_never_scored_as_a_policy` records the shape.
- **The checkpoint format records the training seed set and not the training
  opponent.** `evaluate` prints the opponent it is scoring against and says in the same
  line that this is an assumption the file cannot confirm. A session that trains more
  than one checkpoint against more than one opponent must add the column first.
- **`Mechanics` pools both fighters.** The contacts table's region and kind columns
  count the Brute's club beside the candidate's sword. The height columns survive it —
  the Brute cycles evenly, so the learned row's 87k/671k/76k can only be a Fighter
  welded to MID — but a successor measuring an aiming policy needs the split.

### Watching a learned fight

```powershell
cargo run --release -p lab -- trace --policy learned --checkpoint checkpoints/v2-probe.ckpt --seed 3
npm run view
# then open http://localhost:5173/fight.html
```

`TRACE_SCHEMA` moved from `arpg-fight-trace-2` to `-3` for it: the single `script`
field became `heroes`, `monsters` and `checkpoint`, because a learned fight is the
first trace whose two bodies are driven by different things and a header naming one of
them would leave a reader to guess. `client/src/fight/trace.ts` mirrors it, the status
line shows both sides and the checkpoint digest, and each body's readout says which
policy is driving it.

`checkpoints/v2-probe.ckpt` is **committed**, which is unusual for a generated
artifact and is deliberate: the training command is capped on wall clock rather than
on generations, so it cannot reproduce this file on any other host, and the sha256
this decision is recorded against would be unverifiable without it. It is 15,580
bytes. The training console log is not committed; its curve is in the evidence record.
