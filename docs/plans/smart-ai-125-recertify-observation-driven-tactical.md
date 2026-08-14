# Smart AI 125 -- recertify ordinary observation-driven Tactical

**Status:** stopped and fully reverted. The commit-boundary recertification passed its
focused moving-target proof but regressed the unchanged 100-fight outcome gate from
Smart115's `55/100` to `49/100`. The prior ordinary policy and the controlled Robust
Strike preset are restored; no Smart125 production or test edit survives.

## Stopped result

The focused policy suite reached `141` green tests. Restoring the stale cached-plan
path made the moving-target test red before restoration. The unchanged 50 canonical
plus 50 mirrored gate then reported:

```text
outcome body decisions: 20/50 canonical, 29/50 mirrored, 49/100 total
outcomes: 37 Fighter, 12 Brute, 0 mutual, 35 points, 16 draw
contacts: 564 total, 15 WeaponWeapon, 12 WeaponShield, 537 WeaponBody
authority: 0 refused submissions, 2_534 solver-rejected ticks
worst body-decision tick: 549
command receipts: 0xddaef180716517a1 / 0xcf2e2207dd26125b
wall: 286_636 ms
revise
```

No retained stdout log or SHA was reported, so none is reconstructed. The experiment
increased contacts relative to the 484-contact baseline while reducing outcome-only
body decisions from 55 to 49; contact count therefore cannot justify landing it.
The implementer confirmed removal of `choose_commit_plan`, the recertification/
fallback transition, refreshed-plan reload and focused moving-target tests. The prior
policy suite is back to 140 unit tests green. The controlled preset and its visible
receipt are unchanged.

Smart115 measured only `21/100` strict zero-refusal body decisions and `55/100`
outcome-only. Exact mechanics and portability closure may change that result, but a
controlled stationary schedule is not evidence that ordinary Tactical chooses and
executes the same attack from observation.

## A -- recertify exactly at the commit boundary

Edit [`crates/policy/src/articulated_tactics.rs`](../../crates/policy/src/articulated_tactics.rs)
at `StrikePlanner::decide_with_intent`. Keep the current chamber plan while the arm
travels to its chamber endpoint. On the single `Chamber -> Commit` call -- before
constructing the first Commit command -- call the existing deterministic
`choose_plan(obs, foe, intent)` against the current observation, the currently
matched observed foe and the same sampled intent retained in `self.intent`.

The transition is exactly:

```rust
TacticalPhase::Chamber if elapsed >= CHAMBER_TICKS => {
    self.phase_started = obs.tick;
    if let Some(refreshed) = choose_plan(obs, foe, intent) {
        self.plan = Some(refreshed);
        self.phase = TacticalPhase::Commit;
    } else {
        self.phase = TacticalPhase::Measure;
        self.plan = None;
        return feet_command(obs, foe, toward, APPROACH_SPEED);
    }
}
```

Do not add a second `choose_commit_plan` algorithm, a commit-only crossing grammar,
or a cached-spawn shortcut. `choose_plan` already owns region/hand/arc enumeration,
crossing, exact deterministic ordering and intent filtering; recertification must not
create a second authority that can disagree with Measure. If the current source has
a provisional `choose_commit_plan`, replace it with this existing-helper call and
remove the duplicate helper/tests that only prove its separate grammar.

The sampled intent is not resampled at the transition. `self.intent` remains the one
chosen at the preceding sample boundary; only its best current plan is recomputed.
Set `phase_started` at the transition in both branches. A `None` result must not emit
the stale Commit command: clear the plan, return to Measure and issue the ordinary
feet fallback for the current observation.

Add a frozen moving-target acceptance test before the 100-fight run:

```rust
#[test] fn commit_recertifies_the_real_blade_against_a_target_that_moved_while_it_chambered() {}
#[test] fn a_missing_commit_recertification_returns_to_measure_without_using_the_stale_plan() {}
```

Build an initial observation for which `choose_plan` supplies a chamber plan. Advance
the observation to `CHAMBER_TICKS`, then move the observed opponent body and every
published target region together so the cached plan's predicted segment no longer
crosses its cached region while a newly observed plan still crosses a current region.
Freeze both crossing results. Require the first command at the boundary to use the
new plan's hand, region, commit bearing and height, and require the planner context to
hold that new plan in Commit. The `None` companion moves the target beyond every
current candidate and requires Measure, `plan == None`, and a feet command rather
than any Commit arm target.

Mutation proof: restore the stale behavior by assigning `Commit` and emitting
`self.plan` without calling `choose_plan`. The moving-target test must go red because
the command follows the old crossing. Separately ignore `None` and retain the old
plan; the fallback test must go red. Restore both mutations before broader gates.

Also keep an ordinary/control separation assertion: drive
`TacticalArticulatedPolicy::default()`, never `controlled_robust_strike`, and poison
the controlled ordinal-3144 constants in a test mutation. The ordinary boundary
receipt must remain unchanged. The controlled branch remains its early return and is
not recertified or otherwise altered by this session.

Every new decision must use only `ArticulatedObservation`; no World pose, declared
spawn offset, exact state, target truth or controlled schedule may enter the ordinary
branch.

## B -- frozen 100-fight competence rerun

Reuse Smart103/115's exact corpus and accounting without changing a byte:

```text
50 canonical moving duels
50 mirrored moving duels
same seeds, loadouts, spawn grammar and tick limit as Smart103
TacticalArticulatedPolicy::default() on the evaluated Fighter
ordinary opponent/control policy unchanged
```

Run all 100 with no early stop. Preserve the two reported measures but keep the
strict one authoritative:

- strict success: a uniquely attributed Fighter weapon-to-body decision before any
  solver refusal, cap or submission refusal;
- outcome-only sidecar: body decision at any later point, reported but not accepted
  as competence.

Acceptance is at least `95/100` strict successes, at least `47/50` on each orientation,
zero submission refusals, zero caps before a counted decision, deterministic command
and state receipts on rerun, and no canonical/mirror result gap greater than three.
Record contacts by WW/WS/WB, first-decision tick distribution, outcome classes and
solver refusals exactly as Smart115 did. Do not weaken the denominator or count a
points decision, draw, contact without body outcome, or post-refusal wound as strict.

If any threshold fails, retain the controlled preset unchanged, record `revise`, and
stop. No timing/reach/weight/solver retune, new search, UI change or pin move is
authorized here.

## C -- replacement remains a separate decision

A green gate authorizes a successor to propose ordinary Tactical as the Arena
default. It does not perform that replacement. That successor must separately prove
default configuration/worker/browser behavior and preserve `Robust Strike
(controlled)` as an explicit reproducible diagnostic until the observation-driven
default has its own visible two-run receipt.

Expected pin moves are zero: policy command receipts may change only if the policy
source changed before this measurement, while geometry/contact/stream/ABI/replay and
both exact feature digests remain fixed. Any unexpected registered move stops.

## Verification

```powershell
cargo test -p policy commit_recertifies_the_real_blade -- --nocapture
cargo test -p policy missing_commit_recertification -- --nocapture
cargo test -p policy
cargo test -p lab --features cartesian-recoil tactical_competence -- --nocapture
cargo test
cargo test --workspace --features cartesian-recoil
node tools/check_docs.js
git diff --check
```

Retain the complete 100-row log, byte length, SHA-256, command/state aggregate
receipts and exact final stdout. Do not touch the Arena or controlled preset in this
session.
