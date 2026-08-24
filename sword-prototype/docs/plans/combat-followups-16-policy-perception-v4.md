# Session 16 -- freeze a projectile-aware policy perception v4

## Outcome

Give policies factual motion and projectile observations sufficient to distinguish an
incoming strike from a receding one, time an arrow interception, reason across different body
shapes and use natural attacks. Freeze these as feature v4 before changing the learned output.

The view remains perfect world state. This session does not invent visibility, noise or
reaction lag, and it never exposes another mind's intent, reward, future collision, solver
handle or train/validation/test identity.

## Publish facts, allocation-free

1. Extend `HandView` at `src/mind.ts#L154-L204` with `tipVelocity: Vector3`; retain
   `tipSpeed` as its magnitude for existing scripted readers. In
   `Fighter.describeFighter` at `src/fighter.ts#L1572-L1600`, read held-weapon velocity with
   `Weapon.velocityAt`, and empty-fist velocity with the hand body's `velocityAt`. Zero both
   only for a lost/absent hand. Do the equivalent factual publication for Centipede hands.
2. Add this factual view beside `HandView`:

   ~~~typescript
   export interface ProjectileView {
     kind: "arrow";
     owner: "self" | "opponent";
     position: Vector3;
     velocity: Vector3;
     age: number;
   }
   ~~~

   Add `projectiles: ProjectileView[]` to `FighterView`. It contains every `live && !spent`
   arrow and no parked or planted shaft.
3. Add an allocation-free projectile publication method to `Combatant` in
   `src/units.ts#L26-L58`. `Fighter.observe` at `src/fighter.ts#L1363` clears the logical
   length, asks self and opponent to overwrite reusable records, then trims the array.
   `Arrow` exposes current position and current pre-contact linear velocity through `ToRef`
   readers; do not use its cached scoring `arrival`, which answers a different question.
   Centipede publishes zero projectiles.
4. Keep vectors in world space in `FighterView`. Interpretation belongs in the feature
   writer. Add a steady-state allocation assertion after the maximum projectile count has
   been observed.

## Feature v4

In `src/learning/features.ts`, set `FEATURE_VERSION = 4` and replace the hand-speed-only
threat compression with a documented, exported `selectThreat(view)` used by both feature
writing and tests. Rank opponent arrows by positive time to closest approach to the observer's
vital centre, then melee/fist/natural threats by closing motion and reach margin. Tie-break by
kind, hand and publication index so order never depends on sort stability.

Append exact, normalized columns for:

- selected threat kind, one-hot over every `Striker` (`arrow` and `bite` included);
- selected threat position in the observer's local right/up/forward frame;
- selected threat velocity in that frame;
- time to closest approach and closest miss distance;
- opponent crouch, trunk lean and trunk twist;
- self/opponent collision radius, crown height and vital height;
- self/opponent bite reach, ready and active (zero when absent);
- separate `time_since_damage_dealt` and `time_since_damage_received` histories.

Keep the existing exact per-hand weapon one-hots, lost flags and reaches. Remove the
misnamed `time_since_damage`; derive the two replacements from vitality deltas without adding
combat-event privilege. State every scale and clamp next to `FEATURE_COLUMNS` and in
`docs/design.md`; do not normalize from mutable runtime balance constants unless the existing
contract already does so.

Update `FEATURE_MIRROR_INDEX` and `FEATURE_MIRROR_SIGN`: local-right position/velocity,
facing error, threat bearing and trunk twist change sign; left/right-labelled values swap.
Delete v3 constants, fixtures and special-case readers. The current artifact reader checks
the v4 contract and reports a generic stale-contract mismatch before running a network; it
does not contain a v3 parser, migration table or v3-specific execution branch.

## Make arrows actionable

In `src/action-primitives.ts#L99-L143` and `src/options.ts#L21-L42`, introduce a factual
threat target shared by cover skills. When the selected threat is an arrow, aim a shield,
buckler, weapon or empty forearm at the arrow's predicted crossing of the defender's shoulder
plane, clamped to the arm envelope. If no positive crossing exists, retain the melee/chest
cover target. This is fixed motor execution, not a hidden policy decision: learned selection
still decides whether to cover, disengage or attack.

## Tests and adversarial proof

- `tests/view.test.mjs`:
  `hand_tip_velocity_has_direction_and_an_empty_fist_is_not_always_stationary` and
  `projectile_view_contains_only_live_unspent_arrows_from_both_owners`.
- Add `tests/policy-perception.test.mjs`:
  `an_approaching_arrow_becomes_the_selected_threat`,
  `a_receding_or_planted_arrow_does_not_displace_a_nearer_melee_threat`,
  `projectile_publication_reuses_records_after_warmup`,
  `feature_v4_is_finite_for_every_research_cell`, and
  `feature_v4_mirror_matches_a_separately_constructed_asymmetric_world`.
- `tests/shield.test.mjs`:
  `cover_places_each_shield_kind_on_a_predicted_arrow_crossing`.
- Artifact/deployment tests:
  `a_synthetic_stale_feature_header_is_refused_before_network_execution`.

First set arrow velocity to zero and watch the approaching-arrow and cover tests fail. Then
negate only local-right velocity in the mirror table and watch the asymmetric mirror test
fail. Merely checking that mirroring twice returns the input is insufficient: two matching
wrong signs also form an involution.

## Accept

- Policies can distinguish incoming/receding melee tips, fists and arrows from published
  facts; the learned vector contains no camera or policy-intent column.
- Exact weapon identity remains present for both hands on both bodies.
- Superseded v3 constants, branches and fixtures are deleted. Session 17 deletes the separate
  old checkpoint/trainer path wholesale. A synthetic stale header fails with a contract error
  before any solver step.
- Update the perception and learning sections of `docs/design.md` and the artifact contract
  in `docs/measurements.md`.
- `npm test`, `npm run check` and `npm run build` pass.
