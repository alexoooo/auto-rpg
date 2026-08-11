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
