# Combat arms 01 -- make a two-handed grip expressible

**Status:** **completed 2026-08-16.** See the closing note at the foot of this file.
Depends on nothing. See [the overview](combat-arms-00-overview.md).

**This session changes no mechanics.** It makes a grip that already works reachable
from the two places that configure a duel. Whether two hands *do* anything is
session 02's question, and keeping the two apart is the point: if they land together,
nothing distinguishes "the grip is now expressible" from "the grip now helps".

## What already works

Everything except the configuration path. `resolved_equipment` puts one id on both
arms, `grip_valid_for_arm` demands both grips name the same slot, `validate_equipment`
refuses a `Both` shield, `validate_bindings` refuses `Both` beside a second carried
item, and `canonical_grip_pair` in `crates/sim/src/world.rs` is the live transaction
rule that gives the **right** limb ownership. A `Both` spec row makes a fighter spawn
two-handed with no command; the left arm carries no collider and no segment geometry;
`mirror_two_handed` re-applies after severance and after a contact clamp; the codec
round-trips the binding; and `client/src/arena/picker.ts` already parses `"Both"` out
of a trace header.

`both_scenario()` in `crates/sim/src/world.rs` clones the club as a fourth row with
`binding = Both` and is exercised by several existing tests. Read it first -- it is the
shape this session makes reachable.

## The blocker

`DuelFighterV1::hands` is `[Option<HandItemV1>; 2]` (`crates/sim/src/combat/arena.rs`),
and its own doc comment explains why that cannot express this: *"a two-handed grip is
not a third value of a hand index -- it is one item occupying two hands, which would
need a different shape here and a rule for what the second arm is doing."*

Give it that shape. A `two_handed: bool` beside a single item is enough; a small `Hands`
enum reads better and makes the illegal states unrepresentable. Either way `duel_from`
then writes `binding: GripBinding::Both`, `carrying_order` gives the item one carrying
slot, and `Loadout::single` is already correct. **Every mechanism listed above runs
unchanged** -- that is the whole argument for this being a cheap session.

Answer the doc comment's open question in the same edit: **the second arm is the
mirror**, and it is not independently commandable. That is already what the actuator
does; the comment simply predates anyone writing it down as a rule.

## The arena buffer

The 120-byte config has no room and no binding byte. A hand block is
`[item code][reserved][mass][balance][dim0][dim1][dim2]` in `crates/web/src/lib.rs`,
and `ARENA_HAND_RESERVED` is the obvious carrier -- but it must currently be **zero**
or the buffer is refused as non-canonical, and that refusal is argued in place. So
using it is an `ARENA_CONFIG_LAYOUT_VERSION` bump, not a free byte.

Five mirrors move together, and a partial update is not green even if one side still
draws:

- `crates/web/src/lib.rs` -- the offsets, the const assertions, and the layout test;
- `client/src/runtime/arena-config.ts` -- `ARENA_CONFIG_BYTES`, the block sizes,
  `writeHand`, `readHand`, `decode` and `carriedOrder` (which **already models a
  per-slot `binding` string**, so the display side is half-built);
- the refusal table in the same file, so a rejected two-handed config is named rather
  than numbered;
- `tools/wasm_check.js`;
- `docs/reference/articulated-abi.md`.

The articulated command contract and the replay codec need **no change at all**:
`docs/reference/articulated-command-v1.md` already specifies the `Both` transaction --
both arms request the same slot, the right target is authoritative, the left remains
encoded and hashed but is not actuated.

## `lab trace`

`duel_config_from` in `crates/lab/src/main.rs` owns the fourteen duel keys. A
`--a-two-handed` / `--b-two-handed` pair follows the same discipline the others do,
including the two failure modes already written down there: a valueless `--key` is
demoted to a bare flag by `Args::parse` and must be refused rather than silently
running the pinned fixture, and a key aimed at an item the fighter is not holding is
refused by name. **Return the refusal rather than printing and exiting**, so a test can
assert the sentence.

## Tests

- `a_two_handed_club_is_expressible_from_a_duel_config` -- build one through
  `DuelConfigV1`, assert the spawned world has `Both` on the right limb, one collider,
  one segment, and `World::two_handed` true.
- `a_two_handed_config_round_trips_through_the_arena_buffer` -- write, read back, and
  compare the typed value, not the bytes.
- `a_two_handed_shield_is_refused_by_name` -- the existing `validate_equipment` rule,
  reached from the new path.
- `a_second_carried_item_beside_a_two_handed_grip_is_refused_by_name` -- likewise
  `validate_bindings`.
- `a_valueless_two_handed_flag_is_refused_rather_than_running_the_fixture` -- the
  `Args::parse` trap, asserted by sentence.

Each must be shown failing before it is believed. The layout test in particular passes
trivially if the const assertions are edited to match a mistake.

## Verification

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
npx tsc --noEmit
node tools/check_docs.js
git diff --check
```

**Predicted pin movement: none registered.** `ARENA_CONFIG_LAYOUT_VERSION` is a layout
version, not a golden. The guard that this is true is
`the_shipped_fixture_digest_is_unmoved_by_a_runtime_table` in
`crates/sim/src/combat/arena.rs`, which asserts the spec-table digest and the
`articulated-duel-v1` fingerprint are unmoved *after* building runtime tables. If
either moves, a fixture row was edited by accident -- that is a bug, not a number to
re-record.

## Completed, 2026-08-16

**The shape chosen was `two_handed: bool` beside the array**, not a `Hands` enum. The
doc comment that used to explain why `Both` was inexpressible now states the rule it
was missing: the left arm is the mirror, driven by `mirror_two_handed` from the right
arm's committed state, and a submitted left-arm target on a two-handed fighter is
encoded and hashed but never actuated.

One refusal was added that this plan did not anticipate. `two_handed` with an empty
right hand is `CombatSpecError::GripConflict`, refused in `duel_from` rather than left
to `validate_rows`, because no `Both` row is ever written for that configuration -- the
flag would silently mean "one-handed", and a config that runs as something other than
what it says is the failure the noncanonical-buffer rule exists to prevent.

All five named tests exist and the prediction held: **no registered pin moved.**
Verified by comparing every hash literal against `HEAD` rather than by trusting the
suite -- `docs/reference/hashes.md` 39 literals identical, `crates/web/src/lib.rs` 12,
`tools/wasm_check.js` 22, `crates/sim/src/combat/arena.rs` 3. The `hashes.md` diff is
line-anchor drift alone.

Two repairs were folded in that belong to Smart134 rather than to this session, both
mirrors of committed Rust owners that were missed when that change landed:
`CLINCH_CAP_TICK` 89 -> 85 in `client/test/wasm-memory.test.mjs`, and in the same file
`the_index_survives_a_death`'s windmill seed-3 fixture, whose kill moved 1,260 -> 2,620
and whose survivor is no longer untouched. `lab trace --policy windmill --seed 3`
reports "2620 ticks, HeroesWin, hero 0.9980 monster 0.0000, 365 contacts, 4
severances"; 0.9980 is exactly 65_408/65_536, so the health row was re-recorded from
65_536 to 65_408 with native and wasm agreeing on both numbers.

**A pre-existing harness defect was also fixed, and it is worth knowing about.** The
`worker-protocol` suite ran all 64 subtests green and then never exited, which reads as
a hung suite. `server.close()` does not reap the config-file watcher on Vite 8.1.5:
measured with `process.getActiveResourcesInfo()`, two `FSEventWrap` handles survive it,
and only once a module has been transformed -- a plain HTML fetch does not show it. The
test now closes the watcher explicitly. The suite finishes in 1.7s.

### Gate results

| gate | result |
|---|---|
| `cargo test --workspace --no-fail-fast` | exit 0 |
| `cargo test --workspace --features cartesian-recoil --no-fail-fast` | exit 0 |
| `cargo build --release --target wasm32-unknown-unknown -p web` | exit 0 |
| `node --test tools/wasm_check.js` | 30/30, native == wasm |
| `node --test client/test/worker-protocol.test.mjs` | 64/64, exits cleanly |
| `node --test client/test/wasm-memory.test.mjs` | 5 pass, 1 skipped |
| `node --test client/test/render-contract.test.mjs` | 83/83 |
| `node --test client/test/studio-shell.test.mjs` | 23/23 |
| `npx tsc --noEmit` | exit 0 |
| `node tools/check_docs.js` | passed |
| `node tools/check_deps.js` + its test | passed, 16/16 |
| `git diff --check` | clean |
