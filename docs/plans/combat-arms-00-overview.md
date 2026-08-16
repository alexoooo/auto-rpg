# Combat arms -- overview

**Status:** **complete, 2026-08-16. All five sessions landed and every gate is green.**
Five sessions in `crates/sim`, `crates/policy`, `crates/web`, `crates/lab` and
`client/` -- the fifth was not planned and exists because sessions 02 and 03 both
failed; see the corrected ranking below.

**The topic's result in one line:** the Fighter's end health left the `0.9885-0.9985`
band it had never left in any measured configuration, falling to `0.8575`, and the Brute
took its first kills and its first nine wins in 200 trials.

Three asks that turn out to be one topic: a two-handed club that genuinely uses both
hands, a Brute that can fight the `attack-moves` Fighter, and a shield arm that moves
freely instead of only up and down.

## Why the club and the Brute are one track

**This ranking was wrong at its head, and sessions 02 and 03 are what proved it.** It
is kept rather than rewritten because the two sessions were spent against it and the
correction is the topic's main result.

The original ranking said the Brute lost on, in order of size:

1. **Arm authority.** `arm_available` in `crates/sim/src/combat/actuator.rs` scales
   acceleration by `stat_factor(power) / equipment_inertia`, and top speed by
   `stat_factor(agility)`. Fighter agility 6 gives `0.500`; Brute agility 2 gives
   `0.357`. The club's inertia is `1.918` against the sword's `0.992`. Compounded, the
   Brute swings with roughly **half** the Fighter's effective arm authority.
2. **The shield**, at 22.76% of all resolutions on the composed corpus
   (`docs/reference/articulated-mechanical-gate.md`), which **nothing currently tries
   to beat**.
3. **Decision cadence** -- `decision_period = 20 - intellect` (`crates/sim/src/rules.rs`)
   gives the Fighter 12 and the Brute 18, so it re-plans half as often.
4. The policy, which is **last**.

It is otherwise the stronger body: 2.30 total reach against 1.70, integrity 3 against
2, blood 18 against 12.

**Session 02 fixed cause 1 and session 03 attacked cause 2, and each moved its own
mechanism while leaving the outcome exactly where it was.** The two-handed coupling
took Brute health from `0.4989` to `0.5271`; the `openings` policy took the shield's
share of resolutions from `9.68%` to `8.70%`. Across all six measured configurations
the Brute recorded **zero kills** and the Fighter's end health never left
`0.9885-0.9985`.

**The actual cause was not on the list.** `club().surface.edge_factor` is zero and
`channels` reads the factors off the weapon, so a swing -- which is transverse motion
-- routed its entire allocated share into `pressure`, the one column no anatomy has
ever read. A swung club could not injure anybody at any speed, by construction, and
both preceding sessions were delivering more club energy into a channel multiplied by
zero. [Session 05](combat-arms-05-blunt-damage.md) gives blunt force a representation
and the Brute-kills column stops being zero.

So the corrected ranking is: **the damage law first**, then arm authority, then the
shield, then cadence, then the policy. Sessions 01 and 02 land the coupling and session
03 writes the policy against a Brute that can already swing; neither was wasted, but
neither was ever going to be sufficient on its own.

## The state of the grip today

`GripBinding::Both` is **not** a stub. It is a complete, tested, hashed subsystem:
`canonical_grip_pair` gives the right limb ownership, a `Both` spec row makes a fighter
**spawn** two-handed with no command at all, the left arm is skipped for collider and
geometry purposes, mirroring is re-applied after every severance and contact clamp, the
replay codec round-trips it, and the client already parses `"Both"` out of a trace.
`both_scenario()` in `crates/sim/src/world.rs` is a ready fixture that clones the club
with `binding = Both`, which `docs/reference/combat-specs.md` explicitly sanctions.

**What is missing is the benefit.** The two-handed branch integrates only the right
arm, then bills fatigue on the **left** arm with the same inertia and step, then
mirrors. Two-handing therefore buys zero extra acceleration, bills fatigue twice, and
adds a mirrored left-arm capsule to be hit -- a defensive cost with no offensive
return. The contract anticipated this and left the hook in writing:
`docs/reference/articulated-actuators.md` says *"A later impairment rule that couples
two-handed torque must amend this contract before changing that behavior."*

## Session order

| session | file | pins expected to move |
|---|---|---|
| 01 | [`combat-arms-01-two-handed-grip.md`](combat-arms-01-two-handed-grip.md) | **landed:** none registered, as predicted; `ARENA_CONFIG_LAYOUT_VERSION` bump |
| 02 | [`combat-arms-02-two-handed-coupling.md`](combat-arms-02-two-handed-coupling.md) | **landed: none.** This table predicted `ARTICULATED_STREAM_DIGEST` values-only and that was wrong -- `club()` binds `Right`, so the shipped duel has no two-handed grip and a correctly scoped coupling is inert on every fixture. Read a pin prediction off the fixture, not off the subsystem |
| 03 | [`combat-arms-03-brute-policy.md`](combat-arms-03-brute-policy.md) | **landed: none, as predicted.** The asymmetric matchup and the `openings` policy (code 6) shipped; its **predeclared target was missed** and the miss is the finding -- beating the plate moved the shield's share of resolutions from 9.68% to 8.70% and the Fighter's end health not at all |
| 04 | [`combat-arms-04-free-guard-arm.md`](combat-arms-04-free-guard-arm.md) | **landed: none.** This table predicted both and both were wrong, for session 02's reason a second time: the command digest is taken against an **unstepped** world whose only shielded body spawns at yaw zero with a tucked arm, and the stream fixture holds every bearing at zero by design. The shield normal now follows the arm that carries it, and the guard tracks the threat inside `GUARD_ARC` |

| 05 | [`combat-arms-05-blunt-damage.md`](combat-arms-05-blunt-damage.md) | **landed: none.** Unplanned, and the session that actually moved the outcome. Predicted the four spec-table pins; **none moved**, because the implementation put `crush_factor` behind `Material` as a `const fn` rather than adding a fifth `SurfaceSpec` field, which keeps the hashed surface leaf and the spec rows exactly as they were |

01 before 02 because expressing the grip and changing what it does are two different
claims and must be separable in the history. 02 before 03 for the reason above. 04 is
independent of all three and is sequenced last only because it is the one that reopens
a decision the project already measured and settled. 05 was written after 03's result
and could have come first, had anyone known.

**Five sessions, five pin predictions, four of them wrong** -- and all four wrong in the
same direction and for the same reason: they were read off the subsystem being edited
instead of off what the fixture actually exercises. Every one of them predicted a move
that could not happen. The bow's step 1 is the first correct prediction in the effort,
and it was correct because it traced each digest to the line that writes the changed
value. Treat that as the method, not as a flourish.

## Constants introduced

- a two-handed inertia divisor in `arm_available` (session 02);
- `SHIELD_COVER_MARGIN`, the shield-coverage margin used when choosing a target
  region (session 03);
- a bounded arc for the freed guard bearing (session 04);
- `Material::crush_factor` -- `Flesh` 0, `Steel` 7/8, `Wood` 3/4 (session 05). It hangs
  off the material rather than the surface because blunt conversion is stiffness, which
  is what `Material` names and which had no mechanical meaning at all until then despite
  being written into every digest.

Each gets its provenance and a test bounding it from **both** sides.

## What must not move, in any of the four

`LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH` and
`BOW_HASH` are legacy fixtures, unreachable from an articulated actuator.
`COMBAT_GEOMETRY_HASH` needs a new geometry row to move; `CONTACT_BEHAVIOR_DIGEST` is
a hand-authored corpus; `LEARNED_INFERENCE_DIGEST` moves only on a model shape,
feature layout, action layout or forward-pass change.

**Do not edit the shipped fixture rows.** Changing `club()`'s binding, mass or length
in `crates/sim/src/combat/spec.rs` moves four pins at once -- the combat spec-table
digest, the `articulated-duel-v1` fingerprint, `ARTICULATED_COMMAND_HASH` and
`ARTICULATED_STREAM_DIGEST` -- which is the hazard `docs/reference/hashes.md` warns
about directly. Every session here works through runtime tables instead, which
`the_shipped_fixture_digest_is_unmoved_by_a_runtime_table` in
`crates/sim/src/combat/arena.rs` is the standing proof of.

## Verification

Each session, before calling it done:

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
npx tsc --noEmit
node tools/check_docs.js
git diff --check
```

Run cargo from PowerShell. In a Git Bash shell, coreutils `link` shadows MSVC's
`link.exe` and fails as `link: extra operand`, which reads as a toolchain bug and is
not one.

Behaviour is measured with `cargo run --release -p lab -- articulated --seeds 100
--mirrored`, and the paired half of any `ARTICULATED_STREAM_DIGEST` move is recorded in
`docs/reference/articulated-mechanical-gate.md`, because the articulated world still
has no fight golden.
