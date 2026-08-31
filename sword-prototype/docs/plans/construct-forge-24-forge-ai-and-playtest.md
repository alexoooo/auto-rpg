# Session 24 -- expose damaged-limb locomotion and retune the machines

## Status -- technical implementation and recovery-aware evidence complete; human verdict remains (2026-08-31)

Humanoid full/left-limp/right-limp Actions, assisted Warden selection, descriptor-driven Forge
choices, immutable Arena/Probe diagnostics, assisted Arbalest qualifier v2 and Swordbearer recovery
are implemented. The recovery correction now lets the Warrior complete a physical rise after the
first full-health Arbalest knockdown. At committed x0.10 durability the identical idle body dies 7/8, while
the recovery-aware active Mind wins and exactly qualifies 8/8 across both mirrors (left 4, right 4)
with unchanged projectile hardware; its rise-timed fragile-pressure mode, blocker-relative aim and
1.90 m retreat boundary keep damaging shots on live assisted support. The assisted Twinblade rerun remains 0/8 active and
its best idle rung is 7/8. Exact-fresh Warden crawl authority, the Forge-authored save/reload
Probe/Fight path and frozen raw/assisted recovery A/B are physical and mutation-proven. The
physical fallback/obstacle corpus is complete; a fresh
assisted-Warden qualification at source `bd7b37f8` was run with eight workers and rejected rather
than laundered: all eight rows time-capped, one lacked bilateral damage and all eight missed the
required move/brace Actions. That negative satisfies this session's fail-closed handoff. This plan
remains only because the topic is not deleted until Session 16's human verdict and Session 18's
separate Twinblade balance decision close.

## Outcome

Make supported locomotion a construct-building and AI-programming mechanic rather than a fixed-body
patch. Players can author full and degraded locomotion Actions from real limb groups, see why an
Action is available/refused, and watch AI exploit the machine it was given. Re-run every invalidated
balance/qualification corpus and hand one technically green build to Session 16's human verdict.

## Implement

1. Keep existing all-members-required capability semantics. Add explicit lower-authority
   controller descriptors for one-support limp and selected three-support/crawl gaits. A humanoid
   may author `full-move`, `limp-left` and `limp-right`; a quadruped may author chosen 3-of-4 or crawl
   groups. Do not create a hidden optional-member rule or enumerate 2^N subsets. All alternative
   groups for one body must derive the same carrier or save/probe refuses by action/group ID.
   Every alternative claims `resource:balance`. The availability predicate is exact: while full
   move is live, both limp rules are inadmissible; when full is unavailable, only a named fallback
   whose complete chain is live and freshly standable is admissible. Utility never decides this
   exclusion, both limp requests together are refused, and reversing array order changes nothing.

2. Expose the registered controllers through compatibility data in
   `src/construct/controllers.ts`, the existing Forge control editor/catalog and physical Probe.
   There is no controller-name switch in UI. Probe, save, reload and visible Fight use the same
   scoped writer and pair resolver.

3. Add authored full/left-limp/right-limp rules to Swordbearer, Twinblade and Arbalest. Full move
   has higher utility; a fallback becomes admissible only when its exact smaller group remains
   intact. Bound limp speed/turn/strafe from a physical sweep; one-support does not inherit full
   biped authority. Add an assisted Warden controller as a separately selectable Action option;
   retain the old raw four-beat gait for A/B evidence until it is deliberately retired.

   The Warden A/B includes its durable lateral-fall limitation: identical forward and lateral
   falls must compare raw recovery with assisted recovery, and the result is recorded even if the
   raw controller still fails. The assisted controller cannot be accepted only on longitudinal
   falls. The retained result is deliberately asymmetric: both raw rows stay fallen/legacy while
   both assisted rows recover supported. A validator and negative mutations prevent either side
   from being rewritten into a generic all-green summary.

4. Put support state, stability, live support groups, requested/allowed speed, blocked reason,
   release reason and recovery progress into the existing in-arena Construct diagnostics and
   Forge Probe. The navigation proxy remains invisible even in the combat rig overlay; a dedicated
   debug outline may show it only when explicitly enabled and must own no body/shape.

5. Retune authored Minds only after the physical locomotion corpus is green. Rerun the exact
   Arbalest idle/active durability ladder and Twinblade corpus. Bump the Arbalest qualifier ID for
   assisted-support semantics to `arbalest-assisted-support-v2` in
   `src/construct/arbalest.ts` and its validator/tests; keep `arbalest-fatal-arrow-v1` as historical evidence. A new
   qualifier retains per-step support state, physical feet, arrow lifecycle, fatal transition and
   verdict tail; no caller-supplied assertion hook.

   Restore the Swordbearer debt transferred from removed Session 17. In both mirrors against an
   idle Warrior it must recover after the old 19.54 s toppling fixture and deliver more than the
   historical 0.074789 total damage; against the Duelist it must complete a real close/attack/
   retreat exchange without carrier heap, unsupported air-walk or a permanently refused sword
   action. These are minimum competence checks, not a final balance claim.

6. Re-run fresh eight-worker Construct qualification because every runtime source fingerprint is
   invalidated. Preserve a rejected Warden result if it is still physically red; a new source digest
   is not qualification. Re-run the full research preflight/null-control bracket before any compute
   roadmap resumes.

7. Update `docs/design.md`, `docs/measurements.md`, `README.md` and `AGENTS.md`. Supersede, do not
   erase, the raw-gait fall and planted Arbalest records. Explain to players that limbs authorize and
   limit locomotion while the game carrier prevents solver heaps.

## Tests watched failing

- `one_severed_leg_cancels_full_move_and_admits_only_the_intact_named_limp_group`
- `a_limp_uses_only_its_surviving_chain_at_its_measured_lower_authority`
- `two_lost_humanoid_supports_release_the_carrier_and_fall`
- `a_detached_waist_or_grounded_foot_cannot_drive_the_carrier`
- `an_action_conflict_cannot_double_spend_a_limb_for_attack_and_locomotion`
- `Forge_can_author_probe_save_reload_and_fight_supported_and_fallback_actions`
- `missing_support_is_named_and_never_replaced_by_array_order_or_an_unbound_limb`
- `full_move_excludes_both_limps_and_two_limp_requests_cannot_share_one_balance_resource`
- `diagnostics_report_requested_and_allowed_motion_without_exposing_a_body_handle`
- `the_assisted_Arbalest_qualifier_cannot_accept_v1_or_launder_support_evidence`
- `Swordbearer_recovers_from_the_historical_topple_and_exceeds_its_historical_damage_floor`
- `assisted_Warden_lateral_recovery_is_measured_beside_the_retained_raw_gait`
- `a_physically_severed_Warden_limb_executes_only_its_exact_three_support_crawl`
- `Forge_can_author_probe_save_reload_and_physically_fight_with_an_exact_Warden_crawl`

Mutations: stale detached sensor, skipped missing joint, fallback chosen by array order, zero-group
carrier retention, hidden UI dispatch, full-speed limp, double-spent attack limb, reused v1
qualifier and forged summary. Each goes red before restoration.

## Technical acceptance and handoff

The automated render/corpus must expose no foot skate, hovering carrier gap, treadmill gait, living-
body heap, invulnerable carrier, invisible weapon block or implausible limp. This is technical
evidence only. Session 16 owns the person-run close-range, Arbalest and product-feel verdict; Session
24 remains independently landable without claiming that verdict happened.

```powershell
node scripts/construct-warrior-locomotion.mjs
node scripts/construct-warrior-curriculum.mjs --arbalest --durability-ladder
node scripts/construct-warrior-curriculum.mjs --arbalest
node scripts/construct-warrior-curriculum.mjs --durability-ladder
node scripts/construct-warrior-curriculum.mjs
npm run construct:qualify -- --out <fresh-directory> --workers 8 --expect recorded
npm run measure -- --only duelist-swinger --bouts 120 --seed 20260823
npm test
npm run check
npm run build
```

From the repository root run `git diff --check -- sword-prototype`. Hand the exact build/report to
Session 16 for the player's product verdict. Resume Session 18 only against the assisted body; if its tactic remains
0/8, keep the measured negative rather than tuning against screenshots. Delete the finished plan
files once their durable results have landed.
