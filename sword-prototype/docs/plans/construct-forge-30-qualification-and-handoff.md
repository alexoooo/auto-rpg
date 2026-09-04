# Session 30 — low-number combined-arms qualification and visual handoff

**Status (2026-09-01): in progress and competitively red.** Infrastructure, raw-event
reconstruction, non-monotonic lowest-rung selection, source/run identity, mutation fixtures and the
source-frozen 560-bout matrix are complete. The matrix at source `f82bc3d3`, run `d1e1d8e7`
rejected every rung, so all production durability multipliers remain null. The fresh authored entry
at schedule `8253502c`, source `f82bc3d3`, run `97a634ab` is also rejected: 1/8 bilateral
physical-damage rows, seven rows missing brace and fire, and 8/8 time caps. The earlier accepted
identity `e74cb441` / `e5d255e7` / `7a626bcd` remains historical evidence superseded by the
fire-lifecycle source change. `mapped-pbr` remains the default because no genuinely visible
hardware browser was available for the required performance bracket. The 2026-09-02 focused
Swordbearer repair closes the former one-completed-sweep left mirror: the bilateral sustained-action
reference now proves repeated sweeps, off-hand guard, dodge, recovery and upright sword damage.
The broader supported-locomotion suite is now green on scaled recovery and held-weapon wall pressure,
but the competitive repair remains owed. The later sibling-foot correction moved source to `420906e8`, and
the sustained-action work plus its locomotion-fallback correction moved it to `aa47975e`. The later
v5 named-gauntlet, contact-plane, Warden plate and Arbalest finisher corrections move current source to
`44cde241`, making both rejected `f82bc3d3` receipts historical; rerun the matrix against this
corrected source before any learning or durability promotion. Session 30 is not complete.

The first full-matrix attempt exhausted a 4 GiB V8 heap after roughly 260 cells because the parent,
resume reader, finalizer and CLI still retained corpus-sized objects despite atomic checkpoint files.
The corrected runner now requires `--out`, acknowledges each worker only after its cell is on disk,
retains no raw result array, independently replays one indexed cache row at a time, reconstructs one
16-cell rung at a time, folds the exact run digest in a bounded second pass and streams canonical
`report.json` in a third. Its terminal output is a compact receipt and path. The source change
invalidated the interrupted checkpoint by design; the final matrix restarted from an empty output
under source `f82bc3d3` and completed all 560 cells. That corpus remains an exact historical
rejection, but it is not current-source evidence after the `420906e8` foot correction, the later
sustained-action/locomotion-fallback repair at `aa47975e`, and the current v5 corrections at
`44cde241`.

## Outcome

Qualify the integrated combat-value-v2 game rather than six isolated mechanisms. Select durable
per-morphology balance rungs, prove that active Minds earn their results through physical Actions,
activate the procedural surface by default only if its visible performance gate passes, and write
the durable record. This session owns the
technical handoff; Session 16 still owns the player's final product-feel verdict.

## Frozen qualification matrix

Run four frozen seeds with the Construct on both left and right for each morphology:

- Swordbearer versus Warrior Duelist
- Twinblade versus Warrior Duelist
- Arbalest versus Warrior Duelist
- crossbow Warden versus Warrior Duelist
- sword Warden versus Warrior Duelist

For each morphology, measure active and `construct-hold` on identical bodies at every durability
rung `[1.0, 0.75, 0.50, 0.25, 0.10, 0.05, 0.02]`. Results are not assumed monotonic. Retain every
row and commit the numerically lowest passing rung. Session 25's values remain the base anchors;
the selected production multiplier scales part/module/joint health only, exactly as
`withDurabilityMultiplier` at `scripts/construct-warrior-curriculum.mjs#L50` does, and never scales
armour. Install the selected multiplier in each built-in Setup blueprint path, not merely in a
curriculum clone, and record both base health and production multiplier.

A passing rung requires:

- idle wins exactly 0/8;
- active wins at least 6/8, with at least 3/4 in each side mirror;
- all eight active cells show correct-sign turn, closure, retreat or earned ranged spacing;
- all eight active cells complete at least two physical attack admissions and deal positive damage;
- no active cell reaches the time cap through a passive-only visible/in-range interval;
- every winning body satisfies morphology-specific support, assembly and recovery evidence;
- no self-intersection, owner-collision bypass, carrier heap or post-verdict damage manufactures a
  result.

The passive-interval ceiling is computed from the active controller's declared chamber + commit +
recover limit plus its program dwell, not selected after observing the corpus.

## Morphology-specific evidence

- Swordbearer: close/turn/retreat requests, two completed sweeps, sword contact and reacquisition.
- Twinblade: shielded and unshielded admissions both appear in the corpus; both effectors traverse
  distinct paths and at least one accepted cell completes the two-cut sequence.
- Arbalest: at least one point-first axial-energy bolt wound and one left-sword contact in each
  mirror's accepted cells; sword activity begins whenever melee range is available, not only after
  ammunition loss.
- Crossbow Warden: correct turn, earned firing spacing, bolt wound and shield-bash contact/stability
  shove in each mirror's accepted cells.
- Sword Warden: correct turn, closure, physical dorsal sword sweep and retreat/recovery behavior.

Use qualifier IDs `swordbearer-combined-arms-v1`, `twinblade-open-lane-v2`,
`arbalest-combined-arms-v3`, `warden-crossbow-combined-arms-v1` and
`warden-sword-combat-v1`. Historical fatal-arrow, raw-gait and assisted-support evidence remains
available under its old ID and is explicitly superseded rather than rewritten.

## Implement

1. Extend `scripts/construct-warrior-curriculum.mjs#L307` to generate the matrix, all-rungs
   durability ratchet and
   complete evidence rows. Do not accept caller-supplied qualification hooks. Every result records
   combat-unit version, blueprint/control/program digests, projectile-law version, seed, side,
   base durability, production multiplier, action/phase sequence, weapon attribution, projectile
   identity, usable joules, pre-/post-armour damage, support state, minimum self-clearance, refused
   owner-contact/module-attribution events and verdict tail.

   `--out` cells are untrusted restart caches. Source/manifest identity prevents accidental mixing,
   but an ordinary digest is not a signature: only complete terminal reconstruction/finalization is
   qualification evidence, and a hand-edited cache must be discarded or independently replayed.
   The full matrix refuses an in-memory invocation. Worker publication is acknowledgement-backed,
   terminal reconstruction holds at most one 16-cell rung, and canonical report generation reads
   those checkpoint rows again rather than assembling them in the CLI.

2. Extend `assertConstructWarriorCurriculum` and its canonical row reconstruction at
   `scripts/construct-warrior-curriculum.mjs#L241`, plus the mutation fixtures in
   `tests/construct-warrior-curriculum.test.mjs`. A summary cannot qualify without the raw ordered
   events from which it is reconstructed. Recycled projectile identity, forged damage, missing
   second attack, wrong turn sign, passive timeout, post-verdict contact, sub-limit self-clearance,
   owner-contact masquerading as an attack, wrong shield-module attribution and unsupported victory
   are independently rejected.

3. Run fresh eight-worker Construct qualification through
   `scripts/qualify-construct-learning-entry.mjs` because Sessions 25--29 move runtime source
   fingerprints. The command must require `qualified`; preserve a rejection honestly and return to
   Session 27 if a Mind/controller needs improvement. A new source digest is never qualification by
   itself.

4. Activate `procedural-pbr` as the default only after both the WebGL functional audit and step 5's
   visible performance gate are green. A named automatic `mapped-pbr` fallback remains available
   without changing the bout or requiring user action. If performance is blocked or exceeds the
   limit, production remains `mapped-pbr` and procedural mode is handed off as an explicit opt-in.

5. Take visible-browser performance evidence using control → procedural → control rounds on the
   identical seeded paused/unpaused scene. Require:

   - no added draw calls or per-part material instances;
   - median frame-time regression no greater than 10%;
   - range and raw rounds recorded beside the median;
   - no hidden-tab, software-rasterized or best-of-N claim.

   If a visible browser is unavailable, mark performance blocked, keep the mapped default and do
   not claim it passed.

6. Update `docs/design.md` with combat-value-v2 authority, migration, the axial-energy equation,
   combined-arms Action ownership and the fragment-effects/no-displacement surface boundary. Update
   `docs/measurements.md` with the complete corpus, rejected rows, projectile calibration and visual
   performance bracket. Update `README.md` with player-facing low-number combat, concurrent
   Construct weapons and automatic shader fallback.

7. Update `construct-forge-00-overview.md` and every live session status. Completed technical
   sessions remain in the topic until the final human/product verdict closes Sessions 16 and 18;
   then delete the whole closed plan set in the finishing commit and retain results only in durable
   documents.

## Tests watched failing

- `each_morphology_ratchet_requires_zero_idle_and_six_active_wins`
- `a_passing_matrix_contains_at_least_three_wins_in_each_mirror`
- `Arbalest_combined_arms_evidence_requires_bolt_and_concurrent_sword_activity`
- `Warden_combined_arms_evidence_requires_bolt_and_physical_shield_bash`
- `a_summary_without_raw_ordered_events_cannot_qualify`
- `post_verdict_or_recycled_projectile_damage_cannot_qualify_a_cell`
- `a_non_monotonic_ratchet_runs_every_rung_and_selects_the_lowest_passing_one`
- `clearance_or_owner_contact_evidence_cannot_be_omitted_or_forged`
- `a_new_source_digest_cannot_launder_a_rejected_morphology`
- `procedural_and_fallback_visual_modes_produce_identical_authoritative_reports`

Mutation proof each evidence clause before accepting the final corpus. Retain the mutations and
their expected refusal strings in the fixture tests.

## Digest and evidence prediction

- Session 25 moves every combat blueprint and persisted/report schema identity.
- Session 26 moves every blueprint digest for the v3 root grammar and changes projectile-bearing
  payloads/evidence in addition.
- Session 27 moves every blueprint for v4, Arbalest/Warden controls and all edited morphology programs.
- Sessions 28–29 must move no authoritative digest.
- Session 30 records the final exact digest set and source fingerprints. The selected health-only
  production multipliers intentionally move the affected built-in blueprint digests; no unmeasured
  combat constant changes merely to make the corpus pass.

## Verification

```powershell
node scripts/construct-warrior-locomotion.mjs
node scripts/construct-warrior-curriculum.mjs --durability-ladder
node scripts/construct-warrior-curriculum.mjs
node scripts/construct-warrior-curriculum.mjs --combined-arms --workers 8 --out docs/evidence/construct-combined-arms-v2
npm run construct:qualify -- --out docs/evidence/construct-learning-entry-v2 --workers 8 --expect qualified
npm run measure -- --only duelist-swinger --bouts 120 --seed 20260823
npm test
npm run check
npm run build
git diff --check -- .
```

Hand the exact build, qualification report, shader audit and performance bracket to Session 16.
