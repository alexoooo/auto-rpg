# Session 16 -- freeze a projectile-aware policy perception v4

## Outcome

Give policies factual motion and projectile observations sufficient to distinguish an
incoming strike from a receding one, time an arrow interception, reason across different body
shapes and use natural attacks. Freeze these as feature v4 before changing the learned output.

The view remains perfect world state. This session does not invent visibility, noise or
reaction lag, and it never exposes another mind's intent, reward, future collision, solver
handle or train/validation/test identity.

## Corrections to this plan, verified against the code

Every line citation below was checked. Four of the plan's assumptions were wrong, and two of
them would have shipped a per-frame allocation into the physics loop.

- **The citations are off by roughly fifty lines.** `HandView` is `src/mind.ts#L205-L256`;
  `describeFighter` is `src/fighter.ts#L1522-L1614` with its hands loop at `#L1577-L1596`;
  `Combatant` is `src/units.ts#L37-L64`. Only `Fighter.observe` at `src/fighter.ts#L1363` was
  right.
- **`Weapon.velocityAt` allocates three vectors per call** -- `getLinearVelocity`,
  `getAngularVelocity` and `getObjectCenterWorld` each return a fresh `Vector3`
  (`src/weapon.ts#L1163-L1170`). That is exactly why `speedAt` exists beside it
  (`#L1244-L1252`), reusing the `free*` scratch. Publishing `tipVelocity` therefore requires a
  new `velocityAtToRef` written the way `speedAt` is written. `FistStrike.velocityAt`
  (`src/arm.ts#L85-L91`) has the same fault and needs the same treatment.
- **There is no "hand body" with a `velocityAt`.** The empty-fist striker is
  `Arm.fist: FistStrike | null` (`src/arm.ts#L247`, class at `#L56-L116`). `Arm.hand`
  (`#L233`) is the `Part` bone, a different object.
- **`Arrow` has no `ToRef` readers, and its two existing readers alias one scratch vector.**
  `tipPosition()` calls `bladeDirection()` and mutates the result in place
  (`src/arrow.ts#L425-L458`), so calling either invalidates the other. Write the readers.
- **The warning about `arrival` is aimed at the wrong risk.** For precisely the set this
  session publishes -- `live && !spent` -- `arrival` *is* the linear velocity, refreshed from
  `getLinearVelocityToRef` every control step (`src/arrow.ts#L374`); it only answers a
  different question once `struck` is true, which the filter already excludes. The two real
  hazards are that it is **one substep stale**, because `stepPair` observes before it updates
  (`src/fighter.ts#L1817-L1821`), and that `velocityAt(world)` **ignores its argument**
  entirely (`#L488-L491`), which reads as a bug to anyone who does not open the file. Publish
  through a new reader that takes a ref and says what it returns.
- **There is no "clear the logical length, overwrite, trim" idiom in this repository to
  match.** Every `.length = 0` in `src/` is teardown. The nearest relative is the
  anti-pattern: `Fighter.strikers` (`src/fighter.ts#L1210-L1224`) allocates a fresh array and
  a spread on every access, and is safe only because `Combat` reads it once from its
  constructor. This session introduces the idiom; write it down where it lands.

## Two stale version literals that will break the bump

`FEATURE_VERSION` is not compared generically everywhere. Bumping it to 4 without these two
edits produces a failure whose message reads backwards:

- `src/learning/meta.ts#L154` hardcodes
  `if (checkpoint.featureVersion !== 3) throw ... "cannot run as feature v3"`. Every freshly
  written v4 checkpoint is refused, by a message claiming v4 is the stale one.
- `src/learning/promotion.ts#L97` hardcodes `row.featureVersion !== 2` -- already stale by one
  version before this session starts.

The codecs themselves (`artifact.ts#L87-L89`, `checkpoint.ts#L191-L192`) do compare against the
runtime contract generically and need no edit.

## Publish facts, allocation-free

1. Extend `HandView` at `src/mind.ts#L205-L256` with `tipVelocity: Vector3`; retain
   `tipSpeed` as its magnitude for existing scripted readers. In `describeFighter`'s hands
   loop at `src/fighter.ts#L1577-L1596`, read held-weapon velocity through the new
   `Weapon.velocityAtToRef`, and empty-fist velocity through the equivalent added to
   `FistStrike`. Zero both only for a lost/absent hand. Do the equivalent factual publication
   for Centipede hands. While you are in `mind.ts`, fix `HandView`'s docstring: it claims
   "**Five fields**" (`#L194`) and there are seven before this session adds an eighth.
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
   been observed -- at most **12 live arrows per fighter**, because a quiver holds
   `CONFIG.arrow.count = 12` and `bow` is two-handed, so a fighter has at most one quiver.
   **That assertion will fail on a Centipede bout before a single projectile is published**:
   `Centipede.describe` already allocates two objects per observe at
   `src/bodies/centipede.ts#L192-L196`, and `Centipede.update` allocates a `Vector3` at
   `#L231`. Fix those first, or the new assertion lands red for a reason this session did not
   cause and will be dismissed as noise.

## Feature v4

In `src/learning/features.ts`, set `FEATURE_VERSION = 4` and replace the hand-speed-only
threat compression with a documented, exported `selectThreat(view)` used by both feature
writing and tests.

**There are three divergent copies of threat selection, not one**, and two of them drive motor
execution rather than perception: `features.ts#L47-L48` sorts all attached hands by `tipSpeed`
preferring striking ones; `options.ts#L22-L41` picks lead-versus-off by `isStriking` then
`tipSpeed`, synthesising a literal for a handless opponent; and `policies.ts#L205-L222` is a
byte-identical copy of the second. The first can disagree with the other two about which hand
is the threat. `selectThreat` reconciles all three, or this session records in writing that the
learned perception and the cover skill are deliberately looking at different hands -- which
would make the "Make arrows actionable" section below incoherent, so reconcile them. Rank opponent arrows by positive time to closest approach to the observer's
vital centre, then melee/fist/natural threats by closing motion and reach margin. Tie-break by
kind, hand and publication index so order never depends on sort stability.

Append exact, normalized columns for:

- selected threat kind, one-hot over every `Striker` (`arrow` and `bite` included). **No such
  list is exported today**: `GRIPS` is module-private (`src/hands.ts#L165`) and `WEAPON_KINDS`
  (`#L207`) is derived by *excluding* `arrow` and `bite`. Derive and export a nine-name
  `STRIKER_KINDS` from `GRIPS` the way `WEAPON_KINDS` already is; writing the nine names by
  hand in `features.ts` reintroduces exactly the drift `hands.ts#L196-L206` exists to prevent;
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
Note what "swap" means here today: the only swapping pair in the current table is
`current_movement_circle-left/right` (`features.ts#L19-L23`), because hands are labelled
primary/secondary and do not swap under mirroring.

**`mirrorBody` spreads the body object** (`features.ts#L93-L98`), so a newly added
`projectiles` array would be carried across **by reference and un-negated** -- `mirrorView`
would hand back an unmirrored projectile set, and
`feature_v4_mirror_matches_a_separately_constructed_asymmetric_world` would fail for a reason
that has nothing to do with the sign table. Mirror the array explicitly.
Delete v3 constants, fixtures and special-case readers. The current artifact reader checks
the v4 contract and reports a generic stale-contract mismatch before running a network; it
does not contain a v3 parser, migration table or v3-specific execution branch.

## Make arrows actionable

In `src/action-primitives.ts` and `src/options.ts`, introduce a factual threat target shared by
cover skills. The function that actually decides what cover aims at is **`actionCoverAt` at
`src/action-primitives.ts#L155-L165`, outside the range this plan originally cited**: it aims
at the threat hand's `tip` when that tip is nearer than the opponent's shoulder, and at the
opponent's chest otherwise. The call sites are `options.ts#L163, L169, L217, L223, L243` and
`policies.ts#L386`. The only existing predictive-aim arithmetic to model the crossing solve on
is `actionArrowLift`/`actionArcherAim` (`action-primitives.ts#L73-L85`).

**"Shoulder plane" does not exist anywhere in the tree** -- zero hits across `src/`, `docs/`
and `tests/`. Build it from `BodyView.facing` for the normal and `HandView.shoulder` for the
point, and note the crossing is only defined once section 2 above has put arrow position and
velocity in the view. **Do not put this in `src/aim.ts`**: that file is a render-only
`AimIndicator` overlay importing `MeshBuilder` and `StandardMaterial`, and pulling it into the
policy graph would undo what `mind.ts` and `hands.ts` are structured to prevent. When the selected threat is an arrow, aim a shield,
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
- Update the perception and learning sections of `docs/design.md` -- `#L84` documents the
  "66-column v3 `FighterView` feature table" by name and count, and both change here -- and the
  artifact contract in `docs/measurements.md`.
- `npm test`, `npm run check` and `npm run build` pass.
