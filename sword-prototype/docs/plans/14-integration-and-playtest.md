# Session 14 -- the complete fight earns its defaults

## Outcome

Play, measure and calibrate the integrated body, art and learned behaviour; close every plan
item with durable evidence, then delete this plan set in the finishing commit as the root
repository's plan rule requires.

## Implement

1. Re-run the full headless corpus at the pinned seed and at two new seeds chosen before
   inspection. Report outcomes, bout length, vitality finish type, hit regions, severing,
   blocks, fist strikes, arrows, posture occupancy and option transitions by loadout.
2. Run visible playtests from Fixed and Overhead cameras:

   - human vs `swinger`, scripted meta and learned meta;
   - sword + empty hand, sword + shield, axe + shield, two swords and bow;
   - both fighter sides, both hand choices and both zoom clamps;
   - victory by torso/head injury, mixed wounds and severing.

3. Answer the remaining judgements in `docs/measurements.md`: Fixed-camera body-relative aim,
   costume/side readability, corpse strength, blood scale, bow draw under pressure, axe's
   missing thrust, arrow trace and frame cost. Mark each done with what was actually seen or
   leave it open by name; do not turn “not checked” into “fine.”
4. Tune only from paired evidence. Wrist/body motor ceilings need before/after solver tables;
   vitality weights need the same-seed corpus and human explanation; texture/prop cost needs
   control -> subject -> control brackets; learned fitness is never tuned on test seeds.
5. Audit lifecycle across 25 rebuilds, 100 arrows, every rig toggle and learned-policy
   selection: meshes, materials, textures, bodies, constraints, observers, particle systems
   and trails return to baseline. Verify port 5180 has no listener afterward.
6. Update `README.md`, `docs/design.md`, `docs/measurements.md` and `AGENTS.md` with only durable
   contracts, measured defaults and genuinely reusable traps. Remove superseded statements
   such as “nobody has played it.”
7. In the final commit, delete `docs/plans/00-overview.md` through this file. Closed work lives
   in design/measurements/code comments; a completed temporary plan does not become a second
   authority.

## Tests that must exist first

Add or extend integration cases:

- `every_setup_loadout_and_policy_builds_steps_finishes_and_disposes`
- `every_finish_path_stops_combat_on_the_exact_verdict_step`
- `a_hundred_arrows_and_twenty_five_rebuilds_return_all_resource_counts_to_baseline`
- `all_shipped_intents_stay_finite_and_anatomically_bounded_for_a_full_bout`
- `cosmetics_disabled_and_enabled_produce_identical_fight_records`

Run the resource test once with one disposal removed and the cosmetic parity test once with a
texture accidentally added to a pick/collision list; both must fail before restoration.

## Final gate

From `sword-prototype/`:

```powershell
npm ci
npm run texture:verify
npm run asset:verify
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
npm run measure -- --seed 777001
npm run measure -- --seed 991337
npm run ai:evaluate -- --seed 20260823
```

Then run the visible-browser matrix, stop the attached dev server and confirm port 5180 is
free. The topic is complete only when the learned policy either meets its predeclared
promotion criteria or is explicitly recorded as an unpromoted experiment; “training ran” is
not the outcome this plan asks for.
