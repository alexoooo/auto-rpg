# Session 20 -- integrate one promoted adaptive policy

## Outcome

Only a session-19 candidate that passed every frozen gate becomes `adaptive-v1` in the arena.
Its algorithm is provenance, not UI branding: the picker promises competent adaptive combat,
and the artifact/report explain whether NEAT-QD, DAgger, PPO or look-ahead earned it.

This session is blocked, not skipped, when session 19 has no passing candidate.

## Implement

1. Copy exactly the selected artifact to `public/assets/ai/adaptive-v1.bin`; add its SHA-256,
   source tournament/report digest, algorithm and license/provenance to
   `public/assets/manifest.json`. No training state or unused model is bundled.
2. Add `adaptive-v1` to `POLICIES` at `src/mind.ts:755-779` through a loader that validates
   envelope, feature/action contract and payload before a bout starts. Missing, corrupt or
   incompatible bytes refuse `adaptive-v1` by name; they never fall back to Duelist.
3. Load once at boot and construct independent recurrent/planner state per fighter and per
   restart. Disposal releases observers/buffers and cannot retain opponent or bout history.
4. Extend `metaDiagnostic()` and the rig/HUD readout with current movement, hand action,
   persistence, confidence/value or planner score, artifact digest and algorithm. Reading the
   diagnostic never advances the controller.
5. Give `adaptive-v1` exactly the ordinary `FighterView` and `Intent` seam. It cannot read
   render meshes, private physics, the opponent mind, future events or the tournament result.
6. Add setup compatibility/refusal for every unit/loadout. A non-humanoid capability absent
   from the promoted matrix refuses rather than being treated as a Warrior with fists.
7. Record fixed visible bouts for approach, first exchange, attack, defense, recovery and
   verdict stop on both sides. Visual review may find a new defect; it may not waive a gate.

## Tests first

In `tests/learning.test.mjs`, `tests/minds.test.mjs`, `tests/arena.test.mjs` and
`tests/integration.test.mjs` add:

- `only_the_exact_promoted_artifact_registers_adaptive_v1`
- `adaptive_v1_refuses_missing_corrupt_and_incompatible_bytes_by_name`
- `two_adaptive_fighters_and_a_restart_have_independent_controller_state`
- `reading_the_adaptive_diagnostic_does_not_advance_policy_or_planner_state`
- `adaptive_v1_uses_only_fighter_view_and_returns_a_complete_bounded_intent`
- `every_promoted_unit_loadout_cell_is_supported_or_refused_explicitly`
- `adaptive_v1_stops_every_action_at_the_verdict`
- `twenty_five_build_dispose_cycles_return_ai_and_scene_resources_to_baseline`

Mutation-check fallback to Duelist, shared state, a diagnostic forward pass, one private-world
reader, a missing compatibility branch and continued post-verdict decisions.

## Acceptance

The fixed browser matrix visibly contains purposeful approach and repeated exchanges, not
only headless wins. The bundled digest exactly matches session 19 and a production build has
no other research artifact. Record any performance cost with bracketed visible-browser
measurements; hidden/software tabs are not evidence.

```powershell
npm run asset:verify
npm test
npm run check
npm run build
npm run ai:evaluate -- --policy adaptive-v1 --verify-promoted
```

