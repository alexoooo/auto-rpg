# Arena response handoff

**Status:** implementation stopped at a safe boundary on 2026-08-21.
**Start here:** Session 02 is not complete. Do not begin actuator tuning in session 03
and do not accept or re-record another golden until the exact-law failures below are
understood and the full native gates are green.

## What is complete

Session 01's browser work is implemented and focused-green:

- the Arena HUD separates display callbacks, Babylon renders, worst interval, budget
  and wait state;
- one active Arena rAF owns at most one dirty Babylon draw, and an unchanged callback
  draws zero times;
- the lower fight-layout gap is repaired with a single `minmax(0, 1fr)` fight track;
- latency evidence records sample, submission, publication, acknowledgement and display
  as distinct clocks, snapshots the submitted target, and refuses incomplete joins by
  name; and
- closed drawers do no hidden canvas or formatting work.

The last focused client results were `studio-shell` 114/114, `render-contract` 159/159,
and `npm run check` green. Session 03's client-only freshness seam is also present: the
latest eligible mouse target reaches the next request/receipt and half/full-effort
receipts remain distinct. No foreground browser bracket or owner feel verdict was run.

Session 01's native diagnostic is also implemented. It shares the registered command,
stream, golden and exact drivers rather than imitating them, and its release-aware
preconstraint table is copied into sessions 02 and 03. The final observed first forbidden
crossings are:

| pin fixture | first forbidden proposal |
|---|---|
| `EMBODIED_CORPUS_DIGEST` | tick 14, entity 1, pair `2/4` |
| `EMBODIED_GOLDEN_DIGEST` | tick 5, entity 0, pair `8/4` |
| `ARTICULATED_COMMAND_HASH` | unreached |
| `ARTICULATED_STREAM_DIGEST` | tick 5, entity 1, pair `5/6` |
| `EXACT_TRAJECTORY_STATE_DIGEST` | tick 7, entity 0, pair `8/4` |
| `LIFTED_COULOMB_SOLVER_DIGEST` | tick 7, entity 0, pair `8/4` |

The five rate columns remain as recorded in session 03: corpus `3/1/3/1/1`, golden
`3/1/3/1/--`, command all unreached, stream `3/1/3/1/--`, and exact/lifted
`--/--/--/1/--`.

## Session 02 implementation present in the worktree

The worktree contains a substantial, unfinished authoritative self-collision change:

- a release-aware conservative sweep bracket, with entry-overlapping structural pairs
  allowed to leave but any later clear-to-hit re-entry constrained;
- fixed per-owner scanning of arms, forearms, held segments and shields, canonical pair
  order, shared moving/moving fractions, sixteen bracket refinements and eight passes;
- unbilled arm proposals followed by constrained achieved-work billing, including the
  rule that a fraction-zero rejected proposal bills no powered work;
- joint-annulus enforcement on motor and contact-achieved hands;
- exact-law post-contact anatomical projection recorded as external reason bit 64,
  `ANATOMICAL_CONSTRAINT`, with no self damage, event or contact credit;
- pure initial-pose validation that grandfathers shipped structural arm/body entry
  overlap but refuses nonstructural held/shield/opposite-item overlap; and
- dedicated self-collision tests for opposite arms/items/shields, adjacency, `Both`,
  canonical order, eight-pass limits, no damage/events, reflection, shared fractions and
  circular-command replay.

Focused self-collision tests were green in both laws (13/13 plus circular replay). Full
default `sim` reached 561 pass, 1 ignored, 0 fail before later exact residue work; the
latest confirmed full default after the contact-allocation repair was still green at that
boundary. The sub-raw allocation repair attributes a real raw-unit dissipation through
pre-rounding normal-impulse numerators when every published impulse rounds to zero;
genuinely zero contributors still refuse.

Do not assume the worktree is land-ready. The exact-law suite and pins are not green.

## Exact-law blocker at the stop boundary

The frozen exact and lifted diagnostics now correctly self-constrain before their former
opponent contacts. Their input commands were not reauthored. Both receipt grammars were
therefore intentionally revised to V2 so a self-constrained/no-contact terminal outcome
is load-bearing instead of requiring a contact that the new mechanic forbids.

`EXACT_TRAJECTORY_STATE_DIGEST` currently returns zero because one V2 release witness is
stale, not because the run errors. The measured release row remains at tick 54, but its
signed numerator changed from `-62666977392` to `-61960224384`. The hard-coded equality
leaves `release = false`, so the V2 diagnostic returns `None`.

Before changing that literal, mechanically prove the row is still the same release lane,
reason and denominator, make both adjacent/wrong-value mutations fail, and rerun:

```powershell
cargo test -p sim --features cartesian-recoil exact_trajectory_state_digest_is_stable_and_every_named_class_is_load_bearing -- --nocapture
```

Then rerun the focused reason-64 test. The latest code feeds a one-raw wide-quotient
publication residue back into the same exact owner so staged anatomical projection and
the committed reachable hand agree. That final fallback refinement was not rechecked by
a complete suite after the stop request.

The last complete exact `sim` run before the final refinements was 711 pass, 24 fail,
4 ignored. Many failures were retained contact/recoil assumptions from the former
opponent-contact trajectory. Classify each failure; do not bulk-update expected values.

## Measurements that are provisional, not accepted pins

No new golden is accepted or land-ready. The following values appeared in the worktree
or measurements during development and must be remeasured after the exact blocker and
all native suites are green:

- default corpus measured candidate: `0xe82e1318de16c056`;
- exact corpus stale provisional: `0xcea3940e15fb5d0d`;
- golden stale provisional default/exact:
  `0x309d04b4d617e202` / `0x7c5234359fa14cdf`;
- stream stale provisional default/exact:
  `0xaf4ff2866fa3ce2a` / `0x24af077a739e07dd`;
- exact trajectory stale provisional: `0x5ac6679a0565ca96`;
- lifted V2 stale provisional: `0x6c87b7b1ff935069`.

`ARTICULATED_COMMAND_HASH` is unreached and must stay exactly
`0xbe7dc38c780c4403` / `0x8ba5f039b1a76712`. No layout, scenario fingerprint,
`TRACE_SCHEMA`, command/frame/publication ABI, or learned inference digest is allowed to
move. The V1-to-V2 exact/lifted diagnostic receipt-domain changes are the only newly
authorized grammar moves and must be documented explicitly in the hash registry.

The latest exact replay-vector measurements, also awaiting a complete confirming test,
were:

- flat canonical: tick 300, Draw;
- flat mirrored: tick 300, Draw;
- slope canonical: tick 247, MonstersWin; and
- slope mirrored: tick 300, Decision(Heroes).

## Next safe sequence

1. Review the exact release-witness change and run the focused exact-trajectory test
   above.
2. Run the focused `exact_contact_anatomical_projection_owns_the_hand_momentum_and_external_energy_row`
   test and its projection-removal mutation.
3. Run full exact `sim`; classify and repair every red without reauthoring frozen inputs.
4. Confirm full default `sim`, then full default/exact `lab`. The default Lab expectation
   updates were not followed by a complete confirming rerun.
5. Rerun `embodied --self-clearance-audit` under the exact feature and confirm the six
   recorded rows still match the plan after the final shared-fraction and annulus laws.
6. Only then measure the six native pins, update reached native constants, prove rerun and
   replay, update the web/wasm mirrors, and update `docs/reference/hashes.md`.
7. Run zero-warning release, both wasm builds/checks, corpus, verify, all client suites,
   ABI, docs, dependency checks and `git diff --check`; rebuild default wasm last.
8. Implement Session 03's native response sweep and rate selection. No arm-rate constant
   has been tuned yet.
9. Run Session 04 in a visible foreground browser. The owner must supply the feel and
   self-intersection verdict; automation must not invent it.

## Files and worktree ownership

No agent process or development server was left running, and all files are released.
The working tree is intentionally dirty and includes the earlier plan consolidation plus
client changes. Preserve unrelated edits.

The unfinished Session 02 surface spans:

- `crates/fx/src/geom3.rs`, `crates/fx/src/lib.rs`;
- `crates/sim/src/codec.rs`, `diagnostics.rs`, `exact_diagnostics.rs`, `lib.rs`,
  `replay.rs`, `scenario.rs`;
- `crates/sim/src/combat/actuator.rs`, `limb.rs`, `resolution.rs`, `spec.rs`;
- `crates/sim/src/world/articulated.rs`, `contact_phase.rs`, `mod.rs`, `query.rs`,
  `self_collision.rs`;
- `crates/sim/tests/determinism.rs`;
- `crates/lab/src/main.rs`, `self_clearance.rs`;
- `crates/web/src/lib.rs`, `tools/wasm_check.js`; and
- the simulation/combat/contact/hash durable documents and Arena response plans.

The client Session 01/03 surface spans `client/src/render/frame-meter.ts`,
`client/src/arena/scene.ts`, `arena.ts`, `control-lab.ts`, `web/index.html`, and the
studio/render tests and browser/performance documents.

At the stop boundary `git diff --check` was green. `check_docs` had 28 stale source-line
anchors from the large shared source shift; repair them only after production line numbers
stabilize. The checker reported no handoff-link or handoff-structure error.
