# Session 03 -- a wrist, not a propeller

## Outcome

Restrict anatomical roll, add a 0..90 degree wrist bend, mirror the secondary arm's aiming
envelope, and make wrist orientation policy-owned during human play. Hand position remains
under the player's pointer; the policy places the weapon around and across that line.

## Implement

1. In `src/mind.ts:46-94`, extend `HandIntent` and `ArmPose` with `wristBend: number` in the
   normalized range 0..1. Update `blankIntent()` at `src/policies.ts:97`, both fixtures named
   in `AGENTS.md`, takeover seeding at `src/main.ts:270-292` and hand-swap seeding together.
2. Rename the meaning, not necessarily the public spelling, of `roll`: it is bounded forearm
   pronation/supination. Start at `rollMin = -1.40`, `rollMax = +1.40` radians in
   `src/config.ts:222-278`. Add `wristBendMin = 0`, `wristBendMax = Math.PI / 2`, response and
   motor-ceiling values beside it. The rig overlay must show both commanded values.
3. Remove Z/X as normal player roll controls from `src/input.ts:190-205`, `index.html` and
   `README.md`. In `splitMind` at `src/mind.ts:409-450`, copy pointer/buttons from the person
   but `roll` and `wristBend` from the selected policy even for the driven hand. Put that
   ownership in one total helper so a later posture field cannot default to the wrong owner.
4. In `src/arm.ts:901-1042`, separate the hand-target direction from weapon orientation.
   Apply roll about the arm/aim axis, then apply `wristBend` about the mirrored local lateral
   axis. The bend sign comes from `HandView.outboard`, so the same positive intent mirrors
   anatomically between hands. Clamp before constructing the quaternion.
5. Mirror `azMin`/`azMax`, shoulder swing and cursor inverses for the secondary arm. Replace
   the one global `spread`/inverse with a per-hand mapping used by `Arm.aim`,
   `cursorForPose`, takeover and policies. This discharges owed items 11 and 12; capture the
   shield-hand anchor error before and after.
6. Update `rollForStroke` call sites in `src/policies.ts:630-930` and `:1254-1490` so every
   striking option deliberately chooses both roll and bend. Bow and shield holds must state
   their neutral bend rather than inheriting zero accidentally.

## Tests that must exist first

Add to `tests/handover.test.mjs`:

- `both_hands_round_trip_their_mirrored_envelopes`
- `a_handover_preserves_roll_and_wrist_bend_without_a_jump`

Add to `tests/minds.test.mjs`:

- `human_play_gives_wrist_orientation_to_the_policy_and_position_to_the_pointer`
- `every_shipped_policy_keeps_roll_and_bend_inside_anatomical_limits`
- `the_same_bend_intent_mirrors_between_left_and_right_hands`

Add to `tests/view.test.mjs`:

- `wrist_bend_changes_weapon_orientation_without_moving_the_commanded_hand`

Mutate the secondary inverse to use the primary range and raise roll max to 2.6; the paired
negative-side and limit tests must fail.

## Measurement and acceptance

Run the existing cursor sweep for both hands and record peak/steady anchor error, wrist-stop
occupancy, tip speed and shield-hand error. The known 167 mm live shield error should fall;
an unpredicted primary-hand regression is not a new baseline. In the page, watch sword,
axe, shield and bow through full policy cycles with `G` enabled; no wrist may spin through a
full turn or pay orientation error out as a large position jump.

```powershell
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
npm run asset:verify
```
