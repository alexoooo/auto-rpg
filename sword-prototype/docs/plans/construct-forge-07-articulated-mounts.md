# Session 07 -- prove a mount is not a turret or an arm

## Outcome

The Warden's same yaw/pitch mechanism can carry either an auto-crossbow or a sword. Installed module
plus configured controller determines the action vocabulary: `track`/`fire` for the crossbow,
`aim`/`cut`/`guard` for the sword. No mount class switches on either role.

## Implement

Create `src/construct/mounts.ts` with generic socket-frame aiming helpers and two-axis limit solves.
It knows joint IDs, axes and transforms but no weapon names. Add controller factories to
`src/construct/controllers.ts`:

- `aim-direction` drives any declared yaw/pitch pair toward a world vector within limits.
- `sweep-arc` winds, accelerates through a target plane and recovers using current joint state.
- `track-target` continually leads a selected factual target.
- `fire-projectile` requests a launcher module only while line, reload and ammunition permit.

Refactor `Weapon` at `src/weapon.ts#L438` so its physical root may be mounted by a construct socket
without inventing a `HandName`. Preserve all legacy constructors through an adapter. Generalize
`Striking` and `CombatReportEvent` at `src/combat.ts#L39` and `src/combat.ts#L120` to carry stable
`effectorId: string` plus `hand: HandName | null`. Existing weapons report their exact old hand;
construct modules report null and their group/module ID. Humanoid engagement recording ignores no
existing event and its version does not move.

Create `src/construct/launcher.ts` by extracting the body-neutral pool/launch behavior from `Quiver`
at `src/arrow.ts#L591`. The auto-crossbow owns a finite bolt pool, reload clock and firing socket.
It uses the current projectile collision/scoring path, with a distinct `bolt` presentation only if
the pure scoring contract deliberately treats it as `arrow` and says so.

Add two committed Warden variants in `src/construct/warden.ts`: `warden-crossbow` and
`warden-sword`. They differ only in dorsal module and control/action graph.

## Tests watched failing

Create `tests/construct-mounts.test.mjs`:

- `one_two_axis_body_mount_accepts_crossbow_and_sword_without_role_specific_physics`
- `crossbow_and_sword_modules_publish_different_actions_from_the_same_joint_pair`
- `aim_converges_inside_limits_and_refuses_an_unreachable_direction`
- `a_cut_moves_the_visible_sword_collider_and_scored_tip_through_one_arc`
- `the_auto_crossbow_never_fires_through_its_own_body_or_outside_alignment_tolerance`
- `reload_ammunition_and_projectile_pool_bound_every_firing_sequence`
- `legacy_hand_attribution_and_humanoid_engagement_rows_are_unchanged`

Mutation proof: replace the sword's mounted collider with a visual-only child and require the
contact/bounds test to fail. Force `hand: null` on a Warrior sword and require the legacy event
parity test to fail.

## Regression and accept

Run the 120-bout duelist/swinger null control before and after the striker/projectile refactor. The
fixed Warden mount must visibly track and fire, then visibly sweep the sword after a module swap.
No AI Mind is added yet; debug action requests drive both demonstrations.

~~~powershell
npm run measure -- --only duelist-swinger --bouts 120
npm test
npm run check
npm run build
~~~
