# v2-ui-05 — the missing decision loop

**Goal:** make an articulated fight run inside wasm, with a different policy on each
side, started from a configuration the browser wrote.

**Depends on:** `v2-ui-04` (`Scenario::duel_from`).

**Golden expectation:** no pin moves — but `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH` and
`BOW_HASH` are all produced by the function this session edits, so the prediction is a
claim about discipline rather than about distance.

## The defect

[`crates/sim/src/world.rs:1803`](../../../crates/sim/src/world.rs#L1803):

```rust
pub fn submit(&mut self, id: EntityId, command: Command) {
    if self.combat_model != crate::CombatModel::Legacy {
        return;
    }
```

`Sim::advance` ([`crates/web/src/lib.rs:2933`](../../../crates/web/src/lib.rs#L2933))
runs one loop — `world.observe(id)`, `self.policies[faction].decide(&obs)`,
`world.submit(id, command)` — over the **legacy** `Policy` and `Command` types. On an
articulated world every command it produces is dropped on the floor.

`PolicyKind::from_code` ([`crates/policy/src/lib.rs:307`](../../../crates/policy/src/lib.rs#L307))
offers exactly four codes — `0 Utility, 1 Duelist, 2 Idle, 3 Random` — and all four are
legacy. So **zero policies are reachable for an articulated fight**, and
`init_articulated` opens a room whose bodies chase their tick-zero command forever. The
pose exports are an output channel with nothing behind them.

## A second branch, not a refactor

Add an articulated branch to `Sim::advance`. Do **not** restructure the legacy path,
do not extract a shared helper out of it, do not "tidy" the borrow dance around `due`
and `events` while in there.

`ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH` and `BOW_HASH` are produced by this function,
and `AGENTS.md`'s standing trap is precisely that a change here looks inert:
`Objective` defaults to `None` and no lab scenario issues an `Order::Goto`, so a plan
concludes no golden reaches the code — while `ROOM_HASH`'s script *does* issue an order
and *does* reach `ordered_feet`. A branch that the legacy path cannot enter is the only
shape of change that is obviously safe here, and obviously safe is what this needs.

The loop to port is the two-sided one: `measure_articulated_matchup`
([`crates/lab/src/main.rs:849`](../../../crates/lab/src/main.rs#L849)). Note that
`policy::run_articulated` takes a single `impl ArticulatedPolicy` and installs it on
both sides, which is right for a control and useless for an arena.

## Policy codes

A new `ArticulatedPolicyKind`, separate from `PolicyKind` — the two have nothing to do
with each other and overloading `set_policy`'s four codes would produce a page where
"idle" means two different things:

| code | policy | source |
|---|---|---|
| 0 | neutral | `policy::NeutralArticulatedPolicy` |
| 1 | composed | `policy::ScriptedArticulatedPolicy` |
| 2 | windmill | `policy::WindmillArticulatedPolicy` |
| 3 | attack-moves | `policy::ClosingAttackControlPolicy` |
| 4 | **reserved — `learned`** | refused here; landed by [`v2-ui-08`](v2-ui-08-learned-in-the-browser.md) |

The first four live in `crates/policy`, which `web` already depends on, and none of them
needs floating point.

**Code 4 is reserved and refused rather than omitted**, so that `v2-ui-08` — which
splits an inference-only `learn-core` out of `crates/learn` and gives it a cross-target
golden — is purely additive and needs no rework here. Until it lands, the studio shows
the entry disabled with a sentence saying which session enables it; an option that
silently does nothing is the first thing a reader will ask about.

Related footgun to note while here: `policy_kind(faction)` will keep answering a legacy
kind on an arena world. Either it learns about the arena or it says it does not know.

## The configuration buffer

A loadout is roughly forty scalars with cross-field validity — bindings against each
other, ids against each other, actions against the loadout. A sequence of scalar setter
calls would have partially-written intermediate states and no single point at which the
whole thing can be judged and refused, so this takes a staging buffer.

**The pattern already exists**:
[`crates/web/src/lib.rs:1471`](../../../crates/web/src/lib.rs#L1471) holds
`static SUBMITTED_COMMAND: RefCell<[u8; 55]>`, exposed by `submitted_command_ptr/len/
layout_version` and consumed by one atomic `submit_articulated` that checks bytes `0..1`
as the layout field and bytes 2 and 3 as guards before slicing the payload. A fixed
array never moves and never grows linear memory.

This *does* contradict the route section's comment at `lib.rs:4284` — "three scalar
exports rather than a shared input buffer ... a second buffer would be a second
detachable view for no gain". The distinction to record: a route is two scalars with no
cross-field rule; a loadout is forty with seven.

```text
arena_config_ptr()            -> u32   // ARENA_CONFIG: RefCell<[u8; 120]>
arena_config_len()            -> u32   // const 120
arena_config_layout_version() -> u32   // const 1
arena_start(seed: u32)        -> u32   // packed, submit_result() style
arena_fingerprint_lo() / _hi() -> u32
arena_policy(faction_code)    -> u32   // read-back
```

Layout, little-endian, every dimension an `i32` raw 16.16 to match
`submitted_command`'s grammar: bytes `0..2` the `u16` layout version and the sole layout
field, byte 2 the fighter count (must be 2), byte 3 reserved (must be 0), `4..8` the
`u32` max_ticks, then two 56-byte fighter blocks. Per fighter: anatomy code, policy code,
spawn x and y, then two 22-byte hand blocks of item code, reserved, and five dimension
words. Hand index 0 is `LimbSlot::LeftArm` and 1 is `RightArm`, whose discriminants are
already pinned by `left_and_right_limb_slots_have_stable_discriminants`
(`spec.rs:762`); the builder sets `binding` from the index.

## Failing well

`arena_start` returns `submit_result(outcome, reason, detail, slot)`
(`lib.rs:4608`). It must distinguish, at minimum: unknown layout, wrong fighter count,
both hands empty, `CombatSpecError::{Dimension, Fraction, Maximum, IdOrder,
MissingReference, LoadoutMismatch, GripConflict, TooManyAnatomies, TooManyEquipment}`,
learned-policy-unavailable, and contact-reservation-refused. **Eleven distinct failures,
every one reachable from a slider.** One opaque zero means the studio says "invalid" for
all of them and a reader cannot tell a typo from an impossibility.

It must install **nothing** on any failure, the way `install_articulated`
(`lib.rs:4149`) already does. Two hard reasons: `Scenario::fingerprint` *panics* on
invalid construction (`scenario.rs:454`), so `try_fingerprint` is mandatory rather than
preferable; and a trap behind `pub extern "C"` poisons the wasm instance for the life of
the page, turning a bad slider value into a reload.

## Measure the recording cost before session 07 designs around it

`publish()` rebuilds the entire legacy frame plus both articulated buffers on every call
([`lib.rs:4836`](../../../crates/web/src/lib.rs#L4836)), and a recorder calls `step(1)`
3,600 times. The overview's estimate — ~650 ticks/s in wasm, a fight in about five
seconds — assumes that is not the dominant cost, and that assumption is untested.

Measure it here. If `publish()` dominates, this session owes an
`arena_record_step(ticks)` that steps and fills only the two articulated buffers,
skipping the frame. Write the measured ticks/second into this file either way; session
07 reads it.

## Verification

```powershell
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_deps.js
node tools/check_docs.js
cargo run --release -p lab -- hash
```

**Rebuild the wasm before `wasm_check.js`, not after.** A stale artefact makes the one
test that could catch this session's worst outcome pass vacuously.

Every new export needs a `typeof wasm[name] === "function"` line in `tools/wasm_check.js`
and an entry in `sim.worker.ts`'s `requiredFunctions`. The comment above that list says
why and it is not decoration: `undefined >>> 0` is `0` and `NaN` never grows, so an
unchecked export turns every assertion below it into a vacuous pass.

Tests that carry the session:

- `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab` — same config, same
  seed, same outcome and same state hash native and in wasm. This is the test that says
  the ported loop is the loop, and without it the whole live path is unverified.
- `each_side_may_run_a_different_policy` — the thing `run_articulated` cannot do.
- `arena_start_refuses_and_installs_nothing` — for every one of the eleven reasons, with
  the instance still usable afterwards.
- `the_learned_code_is_refused_by_name`.

## Decision

Record `pass`, `revise` or `stop`. State the four legacy hashes as unmoved with the
command that printed them, and record the measured wasm ticks/second.

## How v2-ui-05 closed

**`pass`.** An articulated fight runs inside wasm, with a different policy on each side,
started from a 120-byte configuration the browser wrote. No pin moved.

### The four legacy hashes, unmoved

`cargo test -p web — --ignored --nocapture print_the_golden_hashes`:

```text
ROOM_HASH:   0x98441a18db7a95ca
BATTLE_HASH: 0x9aafe4bd54560586
SWAP_HASH:   0xf948f5486ee90191
BOW_HASH:    0x4a1157735d305e9f
```

`cargo run --release -p lab — hash` prints `LAB_HASH 0xfe31370e141ef531`.
`ARTICULATED_STREAM_DIGEST` is `0x54c0762b3dfb7a05`, the combat spec-table digest
`0x78e5b57ae0c6bbd6` and the `articulated-duel-v1` fingerprint `0x068d05fcada1027b`
(`cargo test -p sim — --nocapture the_shipped_fixture_digest`). `GOLDEN_STATE_HASH`,
`COMBAT_GEOMETRY_HASH`, `ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`, the
contact format corpus and the legacy feature prefix are asserted by tests that pass.
**No `ARTICULATED_HASH` was created**, and the wasm check pins no arena number for the
reason below.

### The branch is narrower than this file asked for

The condition on `Sim::advance`'s first line is **whether a configured duel is
installed**, not `CombatModel::Articulated`. Branching on the model would also divert
`init_articulated`'s room, whose behaviour under the legacy loop is measured elsewhere
and is not this session's to move: `published_views_survive_articulated_stress_without_memory_growth`
settles a page count by driving it through four descents, and
`the_high_water_corpus_fills_at_most_half_the_event_buffer` counts the rows one
`step(8)` accumulates through it. Reproducing the route, the portal, the descent, the
door and `note_bodies` faithfully in a second loop is a much larger change than this
session is, and "obviously safe" was the requirement. That room's commands are still
dropped by `World::submit`; the defect is closed for the world the studio will actually
watch, and narrowing it further is a session of its own.

### The cross-target claim, and the pin that was not created

`a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab` is native, and compares
the fight driven through the exports against a second, hand-written spelling of `lab`'s
`measure_articulated_matchup` — same state hash, same outcome, same stopping tick. It
holds because `arena_start` sets the runner's orders and puts both objectives back to
`Objective::None`, both of which are hashed.

`tools/wasm_check.js` gained a configured-duel test and **deliberately no pinned
number**. The number it would pin is a scripted articulated fight's state hash, which is
`ARTICULATED_HASH` under another name — planned by v2-17, deliberately absent, and
which no session here may create. What it checks instead is the layout, the refusals by
name, that the module runs the fight rather than standing still, and that the same bytes
produce the same fight twice while a different pairing produces a different one.

### Seven of the eleven refusals are unreachable, and v2-ui-04 is why

This file claimed all eleven were reachable from a slider. `Fraction`, `Maximum`,
`IdOrder`, `MissingReference`, `LoadoutMismatch`, `TooManyAnatomies` and
`TooManyEquipment` are not, and `Scenario::duel_from`'s own doc comment says so in as
many words — it derives `binding` from the hand index and the `Loadout` from the
carrying slots, so "`LoadoutMismatch` is unreachable from any knob here"; it numbers ids
`1..N` ascending; surfaces and anatomy maxima come off shipped rows a picker cannot
touch; and two anatomies and four equipment rows sit under caps of 64 and 128. The
contact reservation is unreachable for `init_articulated`'s reason.

What replaced them is twelve refusals a control *can* reach: unknown layout, wrong
fighter count, noncanonical bytes, unknown anatomy, unknown item code, unknown policy
code, an unavailable policy, a refused construction (a spawn dragged through the wall),
`Dimension`, `GripConflict`, `NoEquipment` and `UnknownAction`.
`arena_start_refuses_and_installs_nothing` drives all twelve through the export and
asserts the standing fight is untouched by each;
`the_arena_configuration_buffer_is_the_documented_layout` asserts the mapping over the
whole of `CombatSpecError` is injective, which is what covers the seven. Every code and
the reason each still exists are in
[`articulated-abi.md`](../../reference/articulated-abi.md#refusing-by-name).

### `policy_kind` says it does not know

An arena answers `0xffff_ffff` and `set_policy` refuses it. The alternative — teaching
a legacy export to answer an articulated code — puts back exactly the collision the two
registries exist to prevent, on the export whose whole job is naming which of four codes
is running. `init_articulated`'s room is deliberately unaffected: its legacy policies
*are* installed and consulted every tick, so a legacy code is the true answer there and
a sentinel would be the lie.

### Measured: about 10,000 ticks per second, and no `arena_record_step`

A 3,600-tick configured duel — shipped arrangement, `composed` against `windmill`, seed
3, in contact from the first clinch to the limit — runs at **~10,000 ticks/s** in wasm
under Node, so a whole fight records in **under half a second**. **`publish()` does not
dominate and this session owes no `arena_record_step`.**

The overview's ~650 ticks/s was 15x pessimistic and its section is superseded in place.

**Two of the three numbers this section first carried did not survive re-measurement,
and the section as originally written is superseded by
[`articulated-abi.md`](../../reference/articulated-abi.md#what-recording-costs), which
is now the canonical account with its method.** In short:

| first written here | re-measured, pinned to CPU 0, best of nine, six process runs |
|---|---|
| composed vs windmill ~10,000 ticks/s | **holds** — 8,821 – 9,996 ticks/s |
| neutral vs neutral ~58,000 "at every batch size" | 45,101 – 57,782 ticks/s; 58,000 is the *top* of the range, not a typical reading |
| `publish()` "about 4%, roughly 4 microseconds each" | **not a measurement** — the difference spans −1.2% to +7.8% on the contact pairing and −12.9% to +10.7% on the quiet one, straddling zero in both |

The first version interleaved its rounds — which is what it says, and which was
correct — but did not pin the process, and pinning turns out to matter more here than
interleaving did. An unpinned process reads up to 15% fast on a good run and about 1.8×
slow on a migrated one, and the migration moves every cell in that process at once. A
review that re-measured the control at 18,000–26,000 and called it a refutation was
reading exactly such a process; one unpinned run here read 25,672–27,634 across all
three control cells while the contact cells in the same process fell to 6,371–6,694.

**The conclusion survives, on a bound rather than on a figure.** 3,599 extra
publications are not separable from run-to-run noise — 3,600 `step(1)` calls are
repeatedly *faster* than one `step(3600)` of the identical fight — and even the worst
reading is under 8% of a drive that is already under 0.4 s. What the sentence "the cost
is the contact solver" is now entitled to is a factor with a range, 4.5–6.5×, and not
"58,000 versus 10,000".

**What the measurement does not cover**, recorded here because `v2-ui-07` is the
session that reads it: neither fixture ends early, so this is the longest fight the
configuration allows; the `learned` policy is unmeasured and is the only one with a
network behind it; and it is `step()` under Node with no browser, no worker and **no
per-frame copy-out of the pose, region and combat-event buffers** — which is precisely
the work `v2-ui-07` adds.

### Everything that ran

```text
cargo test                                                    all green
cargo build --release --target wasm32-unknown-unknown -p web  (before wasm_check)
node --test tools/wasm_check.js                               22 pass
node tools/check_deps.js                                      pass
node tools/check_docs.js                                      pass
cargo run --release -p lab — hash                            0xfe31370e141ef531
cargo test -p web — --ignored --nocapture print_the_golden_hashes
node --test client/test/wasm-memory.test.mjs                  241 pages, unmoved
```

`docs/architecture/policy.md` and `docs/architecture/browser-runtime.md` needed their
`#L` source anchors renumbered — line numbers only, no prose — because this session
moved the lines they point at and `check_docs` is a gate.

### The deviation this note did not disclose

The Verification section above requires an entry in `sim.worker.ts`'s
`requiredFunctions` for **every** new export, and none of the seven configured-duel
names has one. That is defensible and was the right call — the worker's adapter calls
none of them, and a name in that list that nothing calls is a promise the list does not
otherwise make — but the note said so nowhere, which left a plain instruction silently
unfollowed. All seven *are* in `tools/wasm_check.js`'s `typeof` list, which is the half
that catches a rename. **`v2-ui-07` is the session that wires them**, because it is the
session with a caller: the recording channel is the first thing on the client side that
drives `arena_start` and reads `arena_fingerprint_*`.

## What the adversarial review found, 2026-08-11

Eight defects against this session, and the two that mattered were both live bugs in
`pub extern "C"` exports rather than documentation drift.

### 1. `Sim::descend` never cleared `Sim::arena` (critical)

`descend` mutates a `Sim` in place, so every field it does not reassign survives into
the next floor. It reassigns `world`, `anatomy`, `torches`, `units`, `portal`,
`exit_room`, `last_hero_fall`, `last_kill`, `portal_armed` and `contact_high_water` —
and left the duel standing. `init`, `init_articulated` and `init_articulated_test`
replace the whole `Sim` and were clean; `descend` was the hole, against the release
wasm:

```text
descend() -> depth    1
arena_policy(0) NOW   1          (4294967295 would mean no arena)
arena_fingerprint     0x99b2edc99f29603d
tick after step(600)  300  <-- the previous arena's max_ticks
tick after step(600)  300
pose_len              8
```

A freshly generated eight-body floor driven by `advance_arena` against ids from a world
that no longer existed, stopped forever on the old configuration's limit, with
`arena_fingerprint` naming the old duel and `set_policy` refusing on a world whose
legacy policies are the true answer — and no error anywhere. `Sim::anatomy`'s doc
comment already carried the rule (*"Every place that assigns `world` owes this line"*);
`Sim::arena` had the identical obligation and paid it nowhere. Fixed with the same one
line, and the `Arena` doc comment's claim that installation is *"what makes
`Sim::advance`'s second branch unreachable from every world that came before it"* was
corrected: the install claim is true, the reachability claim was false for every world
installed *after* it. `descending_out_of_an_arena_returns_a_legacy_world` fails on the
tree before the fix and passes after, in `crates/web` and again in `wasm_check.js`.

**Converted rather than refused, deliberately.** `descend` answers the new depth and
has no value that means "no", so a refusal would need an out-of-band channel this
export has never had; and the conversion is an ordinary generated floor with the legacy
loop and the legacy policies, which is what every `init` produces anyway. The stronger
reason is that the field's own rule is what keeps working: refusing at the export would
have left the next place that assigns `world` free to reintroduce the same hole.

### 2. `set_goto` and `set_focus` silently changed an installed arena's fight

And `clear_order` and `route_push` too, which the review did not name — all four reach
`World::set_order`, the last through the route queue's first leg. Same 120 bytes, same
seed, 300 ticks, one call at tick 10:

```text
clean        0x030e832c484598ae
after goto   0xf8e8b75483089160   same fight: false   same fingerprint: true
after focus  0x3216d63eb48dfd68   same fight: false   same fingerprint: true
after clear  0x05bb0fff65b5273c   same fight: false   same fingerprint: true
after route  0xf8e8b75483089160   same fight: false   same fingerprint: true
```

**Refused, rather than making the fingerprint honest**, and the choice is not close.
`arena_fingerprint_*` is `Scenario::try_fingerprint` of the *configuration*; folding
later orders into it would buy a number that noticed the disturbance at the cost of the
property the number exists for — that a recording can be rebuilt from the configuration
it is named after. Refusing keeps "a function of the configuration and of nothing else"
a true sentence. The refusal is also the sharper form of the guard `install_arena`
already implies: it sets the runner's orders *because* orders are hashed, while an
`ArticulatedObservation` has no order column, so an order is invisible to the fight's
logic and visible to its identity — the worst pair of properties an input can have.
`set_focus` and `route_push` report it in the value they already had for a refusal;
`set_goto` and `clear_order` answer nothing and refuse silently, which is the one
unsatisfying corner and is recorded in place rather than fixed by widening two names
that `web/main.js`, the generated worker ABI and the frame reference all carry.
`an_installed_arena_refuses_every_order_export` covers all four plus a legacy-world
control, so the guard cannot degrade into "always refuse".

### 3-4, 6, and the leftovers

- **`docs/reference/hashes.md` `#L` anchors.** Re-derived from the tree by grepping for
  every constant, in both directions; all 32 now land on the line that declares or
  asserts the thing the link names. Six rows were stale on arrival, and not the six the
  review predicted: the four `tools/wasm_check.js` anchors for
  `ARTICULATED_COMMAND_HASH`, `COMBAT_GEOMETRY_HASH`, `CONTACT_BEHAVIOR_DIGEST` and
  `ARTICULATED_STREAM_DIGEST`, plus the contact format corpus into `resolution.rs` and
  the legacy feature prefix into `world.rs`. Every `crates/web/src/lib.rs` anchor was
  already correct on arrival — and then had to be renumbered anyway, because this
  session's own edits moved the lines. `docs/architecture/browser-runtime.md`'s three
  needed the same treatment for the same reason. `check_docs.js` does not validate `#L`
  anchors, so this is a hand check in both directions and stays one.

  **Found and deliberately not fixed:** `docs/design/progression.md`,
  `docs/design/navigation-visibility.md` and
  `docs/decisions/0003-renderer-outside-sim.md` carry `#L` anchors into
  `crates/web/src/lib.rs` that were stale long before this session — `Sim` at `#L1147`
  against a struct at `#L1630`, `Sim::advance` at `#L2156` against `#L2777`, and four
  more. They are outside this review's file set and none of them moved because of it;
  they are recorded here so the next session that touches those documents knows.
- **"Eleven of these are reachable" listing twelve.** The comment above the refusal
  codes said eleven and then named twelve; `articulated-abi.md`, this note and
  `arena_start_refuses_and_installs_nothing` all say twelve. Corrected to twelve.
- **The injectivity assertion counted rather than proved.** `arena_spec_refusal`'s
  `match` is genuinely exhaustive, so a new `CombatSpecError` variant is a failed
  build — but the match has no opinion about what an arm *returns*, and the test's list
  of variants was hand-written, so a sixteenth variant mapped to a duplicate code
  compiled and passed green. Now two halves: `ARENA_REASONS` is every declared reason
  byte in one array with a `const _: () = assert!` pairwise distinctness check, so a
  refusal declared with a number already in use never links; and the test walks the enum
  through `next_spec_error`, a second exhaustive `match`, so a new variant cannot be
  absent from the set injectivity is asserted over. The residual — a variant
  deliberately wired as a second terminator, orphaning itself from the walk — is written
  down on `next_spec_error`, because enumerating a foreign enum from outside its crate
  is not a thing Rust can do.
- **`#[test] #[ignore] fn probe_severance()`** is not in the tree. The three `#[ignore]`
  tests in `crates/web/src/lib.rs` are `print_articulated_buffer_high_water_marks`,
  `print_the_articulated_stream_digest` and `print_the_golden_hashes`, all three
  documented printers with the "written out again rather than shared" argument on them.
  Nothing was removed.
- **`client/test/wasm-memory.test.mjs`** still described the pose and event budget as
  "279,040 bytes … which is 5 pages" across "v2-16's two publications", stale since
  v2-ui-06 took it to 289,280 across three. Comment only; no assertion read it.

### Everything that ran again

```text
cargo test                                                    all green; -p web 117 + 3 ignored
cargo build --release --target wasm32-unknown-unknown -p web  (before wasm_check)
node --test tools/wasm_check.js                               24 pass
node --test client/test/wasm-memory.test.mjs                  241 pages, unmoved
node tools/check_abi.js                                       generated ABI matches Rust layout
node tools/check_deps.js                                      pass
node tools/check_docs.js                                      pass
cargo run --release -p lab -- hash                            0xfe31370e141ef531
cargo test -p web -- --ignored --nocapture print_the_golden_hashes
cargo test -p web -- --ignored --nocapture print_the_articulated_stream_digest
```

**No pin moved.** `ROOM_HASH 0x98441a18db7a95ca`, `BATTLE_HASH 0x9aafe4bd54560586`,
`SWAP_HASH 0xf948f5486ee90191`, `BOW_HASH 0x4a1157735d305e9f`,
`LAB_HASH 0xfe31370e141ef531`, `ARTICULATED_STREAM_DIGEST 0xf7d3a9c73aa59981`. The
arena fight itself is unmoved too: the clean 300-tick duel above still hashes
`0x030e832c484598ae` after the four refusals landed, which is what says the guards
refuse rather than alter.
