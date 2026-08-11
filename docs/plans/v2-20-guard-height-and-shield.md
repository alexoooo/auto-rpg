# v2-20 — a guard that can be raised, and a shield small enough to be beaten

**Goal:** give the off arm exactly one degree of freedom — height — and shrink the
plate until choosing that height is a real decision rather than a formality.

**Depends on:** `v2-17` checkpoint B (the static off arm this edits) and the
`/fight.html` viewer that made the problem visible.

**Blocks:** `v2-19`. The learned policy's most interesting action channel is the
guard height introduced here, and training against a plate that blocks everything
would be training against a fight with no gradient in it.

## Why, and why only one axis

`v2-17` closed with the off arm frozen — `articulated_script::off_hand` holds one
pose in body frame for the whole fight — because the game is aimed at first-person
control of a single hero and a human cannot drive two independently articulated
hands. That argument is unchanged and this session does not reopen it. What it
does is notice that the argument bounds the *number* of free columns, not which
ones, and that the one worth spending is height.

The reference is Die By The Sword, where the player could jump, duck and pitch the
body, so a fixed shield still covered a varying part of a varying silhouette. This
model has none of those: feet are planar, there is no crouch, and the torso does
not pitch. A shield at a fixed `CombatHeight::MID` is therefore fixed against the
body's own regions too, which is strictly less control than the reference had. One
scalar — shield up, shield down — restores it and costs the player one axis.

`bearing` stays welded to the commanded yaw, and that is not a simplification but
the same defect fix `off_hand` already carries: `World::derive_shield_pose` takes
the plate's centre from the hand and its normal from body yaw, so a hand free to
swing left and right presents the plate edge-on to the attack its position implies
it covers. Freeing height cannot reintroduce that, because height does not enter
the normal at all. Freeing bearing would. That asymmetry is the whole reason this
session moves one column and not two.

## The plate is a door

Measured against `fighter_anatomy` (`standing_height` 1.8), the shield's centre is
its holding hand, so `CombatHeight` places it at 0.45 / 0.90 / 1.35, and today's
`half_height` of 1/2 gives:

| guard | plate covers | regions left open |
|---|---|---|
| LOW | -0.05 .. 0.95 | head, torso above 0.95 |
| MID | 0.40 .. 1.40 | head, torso above 1.40 |
| HIGH | 0.85 .. 1.85 | legs below 0.85 only |

against regions at head 1.60..1.80, torso 0.70..1.50, legs 0.00..0.80. Two of the
three settings cover the whole torso; HIGH covers the torso *and* the head. There
is no height an attacker can pick that a MID guard does not already answer, which
is what "too easy to block" is, written out.

**New geometry: `half_width: r(1,4)`, `half_height: r(1,4)`, thickness unchanged.**
A 0.5 × 0.5 round shield in place of a 0.7 × 1.0 pavise — 36% of the face area.
That gives:

| guard | plate covers | regions left open |
|---|---|---|
| LOW | 0.20 .. 0.70 | head, torso above 0.70 — i.e. all of it |
| MID | 0.65 .. 1.15 | head, torso above 1.15, legs below 0.65 |
| HIGH | 1.10 .. 1.60 | legs entirely, torso below 1.10 |

Three settings, three different holes, no setting that answers everything. The
implementing session re-derives this table from the specs rather than trusting it,
and prints the derivation in its evidence.

**Mass, balance and surface do not move.** A plate at 36% of the area still
weighing 9/10 is heavy, and that is deliberate: `equipment_inertia` feeds arm
acceleration, so changing mass in the same commit would confound every attrition
number with a change in how fast the guard arm can travel. One variable. Record
the inconsistency rather than quietly fixing it.

**The old numbers are the deferred tall shield.** `half_width: r(7,20),
half_height: r(1,2)` is a second equipment row, not an edit to this one, and it
waits for a session that wants a second defensive archetype. Do not add it here —
a fourth equipment id moves the spec-table digest for no measurement.

## The scripted guard is a clock, and the learned guard is the point

`ScriptedArticulatedPolicy` already computes a selected height from
`(tick / HEIGHT_TICKS) % 3`. The guard reuses that and nothing else. The script's
contract — "nothing in here decides anything" — is why: a guard that read the
opponent's hand height would be a reaction, and this file measures the physics, not
the tuning.

**Reading the threat is exactly what `v2-19` gives the learned policy.** The
scripted baseline guards on a clock; a learned one can guard on what is coming.
That is a real edge available to learning and it is the reason this session blocks
that one.

**Check for lockstep before believing any attrition number.** Both bodies read the
same tick, so both guards step at the same moment and a HIGH guard may face a HIGH
swing on every trial by construction. Measure the joint distribution of (attacker
weapon height, defender guard height) over the corpus. If it is diagonal, phase the
two sides apart by `HEIGHT_TICKS` on a stable, non-random key — faction, not seed —
and say so at the offset. If it is already mixed, say that instead and add nothing.

## Files

```text
crates/sim/src/combat/spec.rs          shield() geometry; the two pinned fixture tests
crates/policy/src/articulated_script.rs  off_hand() gains a guard height; three call sites
docs/reference/anatomy-health.md       the coverage table, if it writes the dimensions down
docs/reference/articulated-mechanical-gate.md  the phase table's guard column
docs/plans/v2-17-scripted-mechanical-gate.md   close the deferred shield high/low item
```

## Hash prediction

State these before editing, and treat any other movement as a bug.

- **Must not move:** `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`,
  `SWAP_HASH`, `BOW_HASH`. Legacy scenarios carry no combat spec table at all, so
  a shield dimension is unreachable from every one of them.
- **Expected to move:** the combat-spec table digest pinned in
  `spec.rs::fixed_spec_records_have_the_documented_byte_widths`
  (`0xf518_cd24_4980_f2d4`), because the shield's dimensions are three of its
  bytes. `SHIELD_EQUIPMENT_SPEC_V1_BYTES` stays 44 — the values change, the widths
  do not.
- **Decide by measurement:** `ARTICULATED_STREAM_DIGEST` (`0x6f87_9c13_430a_dfc1`,
  pinned in `crates/web/src/lib.rs` **and** `tools/wasm_check.js`) moves if and only
  if its fixture publishes a shield pose whose extents come from `shield()`. Check
  the fixture, predict, then run. A one-sided move is a native/wasm disagreement and
  not a re-record.
- **`ARTICULATED_COMMAND_HASH`** and **`CONTACT_BEHAVIOR_DIGEST`**: predict from
  their fixtures before running, not after.
- The policy change moves nothing. Policies are outside the portability promise and
  no golden runs an articulated policy.

## Verification

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- duel --seeds 400
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo run --release -p lab -- articulated --seeds 400 --mirrored --policy windmill
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

## Evidence this session owes

1. The two coverage tables above, re-derived from the specs by a test rather than
   by hand, with that test named in this file.
2. Blocked-contact rate and mean end health per body, before and after, on the same
   400 mirrored seeds — the number that says whether the plate got beatable.
3. The (attacker height, defender guard) joint distribution, and the lockstep
   verdict.
4. Every hash that moved, against the prediction above.

`v2-17`'s gate is not expected to pass here and this session does not claim it. A
smaller shield lets more contacts through; it does not touch the energy budget that
`v2-17` measured at roughly 35x short, and saying otherwise would be the fourth
confident wrong explanation in that file's history.

## What landed (2026-08-10)

Both changes landed as written. Three things above turned out to be wrong and are
corrected here rather than edited out, because the corrections are the useful part.

### 1. The coverage tables, derived

`sim::combat::spec::the_plate_leaves_a_different_hole_at_every_guard_height` computes
both, on the Fighter's own regions, through `actuator::hand_position` — the same
function the world places a hand with — and prints them under
`cargo test -p sim -- --nocapture the_plate_leaves`. Vertical overlap as a fraction of
each region's own extent:

| half_height | guard | Head | Torso | LeftArm | RightArm | Legs |
|---|---|---:|---:|---:|---:|---:|
| `1/2` superseded | LOW | 0% | 31.25% | 8.33% | 8.33% | **100%** |
| | MID | 0% | 87.50% | 83.33% | 83.33% | 50.00% |
| | HIGH | **100%** | 81.25% | **100%** | **100%** | 0% |
| `1/4` shipped | LOW | 0% | 0% | 0% | 0% | 62.50% |
| | MID | 0% | 56.25% | 41.67% | 41.67% | 18.75% |
| | HIGH | 0% | 50.00% | 66.67% | 66.67% | 0% |

**The prose above is wrong in three places and the tables above are right.**

- "Two of the three settings cover the whole torso" — none of them did. MID covered
  87.5% of it and HIGH 81.25%. What the old plate covered outright was the legs at LOW
  and the head and both arms at HIGH: four cells, and now zero.
- "There is no height an attacker can pick that a MID guard does not already answer" —
  the head, 1.60..1.80 against a MID plate topping out at 1.40, was never answered by
  MID under either geometry. The true statement is narrower: every setting answered at
  least one region *completely*, and no setting does now.
- The new-geometry HIGH row omits the head. At `1/4` the plate's top is 104,857 raw and
  the head begins at 104,858 — open by one part in 65,536, a real gap and not a shared
  plane. Under the shipped geometry the head is open at every height.

The tables also omit the arms, which on this roster carry the same `integrity_maxima` as
the torso and are the third and fourth things a plate stands in front of. The derivation
covers all five regions. And it is vertical only: a plate can be at the right height and
still be to one side of the blow, which `half_width` governs and this table is silent
about.

### 2. Before and after, 800 mirrored trials, the same 400 seeds

`lab articulated` grew two printed lines to make this measurable — a per-`ContactKind`
breakdown and the joint height table — because neither number existed. The "before"
column was recorded on the unmodified tree with the instrumentation already in.

| | composed before | composed after | windmill before | windmill after |
|---|---:|---:|---:|---:|
| weapon/shield resolutions | 860,246 | **494,787** | 201,358 | **104,429** |
| ... as a share of all | 34.38% | **22.76%** | 9.13% | **4.87%** |
| weapon/body resolutions | 1,570,668 | 1,611,493 | 1,871,525 | 1,904,658 |
| total resolutions | 2,502,035 | 2,174,331 | 2,204,699 | 2,143,135 |
| fighter mean end health | 0.9886 | 0.9800 | 0.9990 | 0.9994 |
| brute mean end health | 0.9424 | **0.9242** | 0.7325 | **0.7158** |
| decided by a body | 8 | 16 | 20 | 24 |
| severances | 54 | 69 | 163 | 145 |

The closing-attack control moves the same way: brute 0.8827 to 0.8637, fighter 0.9984 to
0.9969, weapon/shield 20.50% of resolutions after.

**The plate got beatable and the fight did not get decisive.** A third fewer blocks and
1.8 points of Brute health on the composed corpus; twice that proportionally on the
windmill, which is the corpus where the shield was doing the least work to begin with.
Fights decided by a body doubled, 8 to 16 — still 2.0% of 800.

One number is noise rather than signal: the composed corpus's side-difference went from
1 to 12 (3.00 percentage points). `v2-17`'s own gate-hygiene ledger records that this
statistic has a standard deviation near 13 under pure noise, so 12 is inside one sigma
and is not evidence of a mirror asymmetry.

### 3. The lockstep verdict: diagonal, and this plan's remedy does not fix it

Measured as ordered pairs of deciding bodies per tick, restricted to ticks whose
attacker asked to Attack:

```text
before  attack x guard  [[0, 18725, 0], [0, 21791, 0], [0, 21855, 0]]   34.94% "diagonal"
after   attack x guard  [[18802, 0, 0], [0, 21913, 0], [0, 0, 21953]]  100.00% diagonal
```

Before, every guard was MID and the table is one column; after, it is a perfect
permutation matrix over 62,668 pairs with **every off-diagonal cell exactly zero**. A
HIGH guard met a HIGH swing and nothing else, on every trial, by construction.

**The faction-keyed offset this plan asks for does not mix it, and cannot.** Both clocks
have period `HEIGHT_TICKS`, so offsetting one side's by a whole `HEIGHT_TICKS` leaves
them stepping at the same instants and only relabels which cells are occupied: the
distribution becomes 0.00% diagonal, every pair mismatched, which biases a
blocked-contact rate exactly as hard in the other direction. Any whole multiple does the
same. Only an offset that is *not* a multiple of the period can put mass in more than
one relation.

**And there is no faction to key on.** `ArticulatedObservation` has no faction column by
design — `ArticulatedPolicy`'s doc comment argues at length why, and `lab` routes on the
alive set precisely because the observation cannot. The only stable per-body key it
publishes is the subject's slot index, which is not a faction: on a roster where one
side owns two adjacent slots, parity splits that side instead of splitting the sides.

What shipped instead is `GUARD_LEAD_TICKS = HEIGHT_TICKS / 2`, applied uniformly: the
*guard* clock leads the *weapon* clock by half a step, on every body. No key, the script
stays a pure function of `tick`, and the mixture is even.

```text
after + lead  attack x guard  [[9382, 9375, 0], [0, 10934, 10913], [10930, 0, 10939]]
                              50.03% diagonal of 62,473 pairs
```

The windmill control reads 59.39% and the closing control 50.00%; the windmill differs
because it attacks on every tick rather than in four phases of twelve, so its pairs
sample the clock differently. The cost is that the guard clock no longer lines up with
the thirty-tick phase grid — it steps mid-phase in phases 1, 4, 7 and 10 — which
`the_twelve_phases_are_the_reference_table_written_out_by_hand` now transcribes tick by
tick for that one column.

The corpus numbers in section 2 are the final ones, with the lead in. For the record,
the intermediate configuration — small plate, guard height, no lead — measured
composed weapon/shield at 504,280 of 2,262,791 (22.29%) with the Brute on 0.9308, and
windmill at 152,428 of 2,259,925 (6.74%) with the Brute on 0.7284. The lead costs the
shield a little more on both, which is the expected sign: half the swings now arrive at
a height the plate is not at.

### 4. Hashes, against the prediction

Predicted from the fixtures before running, in every case.

| pin | predicted | result |
|---|---|---|
| combat spec-table digest | moves | **moved**, `0xf518cd244980f2d4` → `0x78e5b57ae0c6bbd6`. `SHIELD_EQUIPMENT_SPEC_V1_BYTES` still 44. |
| `ARTICULATED_COMMAND_HASH` | moves — the probe is unstepped, but the shield pose is derived at *spawn* and its three extents are hashed per slot | **moved**, `0x6e61a92ec96ac3a6` → `0xd1da6a40df0480b2`, native and wasm agreeing |
| `ARTICULATED_STREAM_DIGEST` | moves — the plate's extents are published words in the pose row, *and* a smaller plate changes what the clinch resolves | **moved**, `0x6f879c13430adfc1` → `0x54c0762b3dfb7a05`, native and wasm agreeing, row shape unchanged |
| `CONTACT_BEHAVIOR_DIGEST` | must not move — `behavior_case` builds every collider by hand and constructs no `ContactShape::Shield` at all | **unmoved** |
| `COMBAT_GEOMETRY_HASH`, contact format corpus, legacy feature prefix | must not move | **unmoved** |
| `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH` | must not move | **unmoved** |

**Two pins moved that this plan did not name, and neither was in the golden registry.**
Both are now listed there.

- `Scenario::articulated_duel().fingerprint()`, `0x2a6cc9678c08730d` →
  `0x068d05fcada1027b`, pinned in `scenario.rs`. The fingerprint covers the immutable
  spec table, so an equipment dimension is part of the fixture's identity; the mirrored
  variant moved with it, to `0x6dbf62f0b336050b`. This matters beyond the test — every
  corpus and evidence artifact naming `articulated-duel-v1` is a claim about the
  fingerprint it was recorded against.
- `HIGH_WATER_EVENT_ROWS`, 354 → 346, in `crates/web`. Not a hash but a recorded
  measurement with the same discipline attached: 64 bodies in a clinch publish eight
  fewer event rows, because a smaller plate catches fewer swings and does not hand all
  of them back as body contact. The 2,048 capacity is unchanged and still sized on the
  historical maximum of 556.

The policy change moved nothing pinned, as predicted: no golden runs an articulated
policy, and `ARTICULATED_STREAM_DIGEST`'s fixture drives `stream_digest_command` rather
than this script.

### What landed that this plan did not ask for

- **`lab articulated` prints two new lines**, `blocked` and `guard`. Evidence items 2
  and 3 are not derivable from anything that existed, and the lab is where this
  repository measures; a throwaway script would have made the numbers unreproducible.
- **`policy::ArmRoles` is public.** The lab cannot attribute a height to "the weapon
  arm" without the script's own role rule, and that rule moves when an arm is severed,
  so re-deriving it in the lab would have been a second copy free to drift from the
  first exactly when a fight got interesting.
- **`docs/reference/hashes.md` gained two registry rows**, for pins that existed and
  were unlisted.
- **`docs/reference/combat-specs.md` is not in this plan's file list** and writes the
  shield's dimensions down verbatim. It is updated.
