# Combat arms 02 -- make two hands worth using

**Status:** **completed 2026-08-16.** See the closing note at the foot of this file --
including a **correction to this plan's pin prediction**. Depends on
[session 01](combat-arms-01-two-handed-grip.md). See
[the overview](combat-arms-00-overview.md).

**One variable, measured.** This session gives a two-handed grip a mechanical benefit
and changes nothing else. Session 01 made the grip expressible; this makes it worth
expressing.

## What is wrong today

The two-handed branch in `crates/sim/src/world.rs` integrates **only** the right arm --
right target, right item, right authority -- then calls `bill_fatigue` on the **left**
arm with the same inertia, the same commanded effort and the same step, then mirrors
the right arm's scalars into the left. Pinned by
`a_two_handed_trajectory_uses_right_authority_effort_and_target_only` and
`a_two_handed_target_mirrors_the_off_hand`.

So two-handing costs a doubled fatigue bill and an extra mirrored capsule to be hit,
and returns nothing. Meanwhile `equipment_inertia` in
`crates/sim/src/combat/actuator.rs` gives the club `mass * (0.25 + balance)` =
**1.918** against the sword's **0.992**, and `arm_available` divides acceleration by
it. The club is handicapped roughly two to one with no compensating term anywhere.

`docs/reference/articulated-actuators.md` anticipated this and left the hook: *"left
authority does not alter a `Both` trajectory in v2-13 ... A later impairment rule that
couples two-handed torque must amend this contract before changing that behavior."*

**Amend that contract first, in the same commit, before the code.** It is the document
that says the current behaviour is deliberate; leaving it standing while changing the
behaviour is how a reference becomes a lie.

## The change

Two halves, both small, and they are separable if the measurement says only one is
warranted:

1. **Effort.** Pass a two-handed flag (or an already-divided effective inertia) from
   the arm-drive site in `world.rs` into `arm_available`, and halve the effective
   inertia when it is set. Halving is not an arbitrary constant: it makes the club's
   `1.918` land at `0.959`, within a hair of the sword's `0.992`, so a two-handed club
   accelerates about as well as a one-handed sword. That is the argument for the
   number, and it belongs beside it.
2. **Fatigue.** Share **one** bill across the two arms instead of billing the same
   work twice. Independently defensible as "two arms share the work", and it removes a
   cost that exists today only because the mirror was implemented before anyone asked
   what it should cost.

**Do not touch the item's mass.** Raising effective mass is the only way to raise
closure energy at a fixed speed, and it is a different session: mass feeds
`exact_lattice_for_unit`, whose scale and endpoint denominator bits are pinned by
`shipped_exact_lattices_pin_scale_and_endpoint_denominator_bits`, and it feeds both
feature-only exact digests. `crates/sim/src/combat/spec.rs` already records what
happens when a mass and a geometry move in one commit: the attrition numbers stop being
attributable.

## Tests

- `a_two_handed_grip_accelerates_the_club_like_a_one_handed_sword` -- the bound from
  both sides. Assert the two-handed club's bearing step is **within a stated fraction**
  of the one-handed sword's under identical commands, not merely "greater than
  one-handed". A one-sided bound here is satisfied by a factor of a thousand.
- `a_two_handed_grip_bills_one_arm_of_fatigue_and_not_two` -- compare the summed
  fatigue across both arms against the one-handed bill for the same work.
- `a_one_handed_grip_is_unchanged_by_the_two_handed_term` -- the control. The flag must
  be inert on every single-handed path, and this is what proves the change is scoped.
- The existing `a_two_handed_trajectory_uses_right_authority_effort_and_target_only`
  and `a_two_handed_target_mirrors_the_off_hand` must **stay green**: ownership and
  mirroring are unchanged, only the magnitude moves.

Break each on purpose before believing it.

## Measurement, predeclared

`cargo run --release -p lab -- articulated --seeds 100 --mirrored`, with the Brute
carrying a two-handed club, reported against the current baseline
(Fighter `0.9901`, Brute `0.4928`, 150 severances, 14.0% decided at `attack-moves`).

Report Brute end health, Fighter end health, severances and decided rate. **Do not
select the divisor by win rate** -- the standing rule in `AGENTS.md` is not to choose
mechanics by wound outcome. The divisor is chosen by the inertia argument above; the
corpus measures what that choice did.

## Verification

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

**Predicted pin movement: `ARTICULATED_STREAM_DIGEST`, values only.** No stride, word
offset, section, count grammar, fixture command or ABI version changes; this is
`crates/sim` arriving through the digest fixture's own chased targets. The precedent is
recorded in its registry row in `docs/reference/hashes.md` -- the arm bearing pair
doubling on 2026-08-15 moved it the same way. Re-record **both** owners, Rust and
`tools/wasm_check.js`, and carry the paired half in
`docs/reference/articulated-mechanical-gate.md`, since the articulated world still has
no fight golden.

Nothing else may move. In particular the combat spec-table digest and the
`articulated-duel-v1` fingerprint must not: this session edits an actuator, not a
fixture row.

## Completed, 2026-08-16

### The pin prediction above was wrong, and no pin moved

This plan predicted `ARTICULATED_STREAM_DIGEST` would move values-only. **It did
not, and nothing else did either.** The prediction assumed the coupling would reach
the shipped duel, and it cannot: `club()` in `crates/sim/src/combat/spec.rs` binds
`GripBinding::Right`, so the fixture that `ARTICULATED_STREAM_DIGEST`,
`ARTICULATED_COMMAND_HASH`, the spec-table digest and the `articulated-duel-v1`
fingerprint are all taken against has **no two-handed grip in it**. A change scoped
to `Grip::TwoHanded` is inert on all four by construction.

That was predicted in writing before the gate was run, from reading
`drive_stream_digest_script`'s fixture rather than inheriting this file's guess, and
the run confirmed it. Verified afterwards by comparing every hash literal against
`HEAD` rather than by trusting the suite: `docs/reference/hashes.md` 39 identical,
`crates/web/src/lib.rs` 14, `tools/wasm_check.js` 32,
`crates/sim/src/combat/arena.rs` 3, `crates/sim/src/combat/spec.rs` 0.

**The lesson for session 04 is that a pin prediction must be read off the fixture,
not off the subsystem being edited.**

### The shape

`Grip::{OneHanded, TwoHanded}` in `crates/sim/src/combat/actuator.rs` carries the two
levers and no others. `Grip::OneHanded` is the identity on both, so every existing
caller keeps its signature: `integrate_arm_with_rates`, `integrate_arm_with_recoil`
and `bill_fatigue` are now thin one-handed wrappers over
`integrate_arm_for_grip`, `integrate_arm_with_recoil_for_grip` and
`bill_fatigue_for_grip`. That is what makes "no one-handed path can move" a property
of the code rather than a claim about it, and it kept the diff to the two-handed
branch of `drive_articulated_arms`.

`arm_available` divides by `driven_inertia` and still **returns the undivided
inertia**, so the divisor buys acceleration without also discounting the work. The
`1/4` bare-arm floor is reapplied after the division and is unreachable for the
shipped items.

`TWO_HANDED_INERTIA_DIVISOR = 2` from the inertia argument: Club `1.918` halves to
`0.959` against the Sword's `0.992`. `TWO_HANDED_FATIGUE_SHARES = 2` splits one
item's work across the two accounts, which also keeps them equal and so keeps
`a_two_handed_target_mirrors_the_off_hand`'s `left.fatigue == right.fatigue` true.

### Red first

Both constants were temporarily set to `1` -- exactly the pre-session behaviour --
and all three new tests failed with the arithmetic this plan predicted: club
two-handed `135` against sword `262`, a ratio of `51%`; and summed fatigue `386`
against a one-handed bill of `193`, exactly double. Restored, all three pass, and
`a_two_handed_trajectory_uses_right_authority_effort_and_target_only` and
`a_two_handed_target_mirrors_the_off_hand` stayed green throughout.

Each positive test also carries its own teeth as an assertion: the Sword band must
*reject* the one-handed Club, and the fatigue bound must *reject* the old
whole-bill-to-each behaviour.

### One thing this plan asked for that could not be run as written

The predeclared measurement was `lab articulated --seeds 100 --mirrored` "with the
Brute carrying a two-handed club", and `articulated` had no way to describe one --
`duel_config_from` was wired into `trace` alone. The picker is now wired into
`articulated` on exactly `trace`'s terms and through exactly its refusals. An
unflagged run is unchanged, which `--b-two-handed off` proves byte for byte.

### Measured

Recorded in full in
[the mechanical gate](../reference/articulated-mechanical-gate.md#two-handed-club-corpus-2026-08-16).
`--b-two-handed off` reproduces the fixture corpus *identically*, so the whole delta
is the grip:

| | one-handed Brute | two-handed Brute |
|---|---:|---:|
| Fighter end health | 0.9906 | 0.9885 |
| Brute end health | 0.4989 | **0.5271** |
| Severances | 144 | 110 |
| Decided by a body | 14.5% | 8.5% |
| Fighter wins | 200/200 | 200/200 |

**A real benefit, and not enough** -- and both halves are the result. The Brute keeps
about 5.6% more health and costs the Fighter slightly more, but the Fighter still
takes every trial, and fights became *less* decisive rather than more. The divisor
was not tuned against any of this. Session 03 should be written against these numbers
and against the reading that the remaining deficit is the shield and the cadence, not
arm authority.

### Gate results

| gate | result |
|---|---|
| `cargo test --workspace --no-fail-fast` | exit 0 |
| `cargo test --workspace --features cartesian-recoil --no-fail-fast` | exit 0 |
| `cargo build --release --target wasm32-unknown-unknown -p web` | exit 0 |
| `node --test tools/wasm_check.js` | 30/30, native == wasm |
| `node --test client/test/wasm-memory.test.mjs` | 5 pass, 1 skipped, exit 0 |
| `node tools/check_docs.js` | passed |
| `git diff --check` | clean |
