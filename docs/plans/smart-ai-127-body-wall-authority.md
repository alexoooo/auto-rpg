# Smart AI 127 -- close ordinary body-wall authority

**Status:** complete in the retained working patch. The response-aligned north-wall
fixture supplies Smart36 checkpoint E's missing ordinary boundary witness. Smart122
and Smart123 remain unmeasured and unregistered; this session does not claim their
digest or documentation closure.

Smart121's predeclared east-wall run stopped honestly. It proved the strike,
remainders, release and replay seam, but the defender moved away from the boundary it
was meant to cross. This successor had two reviewable stages: first classify the
missing body-lane lifecycle row at the real commit, then measure the stopped command
stream's signed response before choosing a boundary. It does not search spawn,
timing, reach, anatomy or loadout after an outcome.

## A -- one body row at the wall authority

[`World::commit_exact_contact`](../../crates/sim/src/world.rs) already reconciled a
clipped common response and separately recorded the absolute energy removed from
each held physical row. The exact ledger's documented lane 0 is the body, but the
only `WALL` append called the limb helper, whose fixed mapping is `limb + 1`.
Consequently a naked body's wall loss could change authoritative exact state without
a body lifecycle row, and Smart121's required lane was impossible to publish.

At the same successful clipped-axis commit, append one lane-0
`ExactExternalEnergyRow` using the immutable body mass and the solved versus settled
body velocities. Keep the held rows: they account distinct equipment masses, not the
body twice. The reason is `RecoilExternalEnergy::WALL`, the signed numerator is
`after - before`, and the denominator remains the existing exact Fx energy scale
`2 * 65_536 * 65_536`. This is feature-only and does not add a field, ABI word,
codec word or hash grammar.

Extend
`wall_reconciliation_normalizes_common_momentum_without_changing_its_rational_value`
to require both the body lane 0 and right-held lane 2. Suppressing only the new body
append made that test fail with
`wall settlement did not account for the body's physical row`; settlement and the
held witness remained intact. Restore the append and require the test green.

## B -- response-selected wall, unchanged ordinary stream

Restore Smart121's ordinary 56-command diagnostic only long enough to print the
defender's staged/settled endpoint and exact common position/momentum words. The
unchanged source-41 strike first produced this post-contact common momentum at tick
45:

```text
common scale       59_914_856_794
x quotient         -81
x remainder        -35_370_560_134
y quotient         1_092
y remainder        59_403_836_440
```

The east-wall premise was backwards: X is westward, while Y is strongly northward.
On the stopped east translation the defender moved inward immediately and reached
the north wall only at tick 77. Choose the north wall from that signed result, then
remove the diagnostic view. This is a mechanics classification, not a sweep: retain
seed 0, Brute Legs, offset raw `(-163_840,-65_536)`, Fighter shield plus two-unit
sword, 28 chamber ticks, commit through tick 52, release at tick 53, neutral Keep
through tick 55, reach 61,440, effort 65,536 and the 56-tick hard horizon.

The final fixture puts the Brute at `(12, 16 - Body::Brute.radius())`, whose Y raw
word is `1_002_701`, and translates the attacker by the frozen offset. Add:

```rust
#[test]
fn ordinary_exact_trajectory_crosses_a_wall_and_replays_every_authoritative_word() {}
```

At every tick compare two live runs and `Replay::play_until` across the state digest,
stored command, contact resolutions, cap, first exact rejection, exact external
ledger, anatomy, articulated pose and grips. The state digest owns every exact
trajectory word; explicit witnesses also require both remainder classes, the
accepted group, body wall row and later release.

## Receipt

The focused feature run records:

```text
accepted WeaponBody / Brute Legs ticks       45, 46
momentum-remainder witness ticks              45..56
position-remainder witness ticks              45..56
first defender body WALL tick                 45
body WALL signed numerator / denominator      -9_986_235_012 / 8_589_934_592
attacker right RELEASE tick                   54
RELEASE signed numerator / denominator        -1_073_625_268_272 / 8_589_934_592
exact refusals                                0
contact cap hits                              0
live/live/replay mismatch                     none through tick 56
```

Focused verification passed:

```powershell
cargo test -p sim --features cartesian-recoil wall_reconciliation_normalizes_common_momentum_without_changing_its_rational_value -- --nocapture
cargo test -p sim --features cartesian-recoil ordinary_exact_trajectory_crosses_a_wall_and_replays_every_authoritative_word -- --nocapture
cargo test -p sim contact_modified_pose_survives_replay_at_every_tick -- --nocapture
```

The consolidation handoff still owns the complete default/feature workspaces and
fresh wasm equality gates. Existing registered pin movement budget is zero: the code
is feature-gated. The unregistered feature stream receipt may move if its fixture
reaches this wall path, but it is evidence to remeasure, not a pin to re-record.
`EXACT_TRAJECTORY_STATE_DIGEST` and `LIFTED_COULOMB_SOLVER_DIGEST` remain absent until
Smart122 and Smart123 execute in order. `ARTICULATED_HASH` remains absent.
