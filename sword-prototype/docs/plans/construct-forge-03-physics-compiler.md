# Session 03 -- compile one blueprint into physics and procedural art

## Outcome

Any valid v1 body blueprint builds transactionally into Havok bodies, constraints and a coherent
hard-surface presentation. Physics and visible geometry come from the same `PartSpec`; there is no
costume fitted over a second body.

## Implement

Extract the body-neutral fields of `Limb` from `src/fighter.ts#L66` into `src/anatomy.ts`, then
update Fighter, Centipede, `Combatant` and `Combat` without changing behaviour.

Create:

- `src/construct/runtime.ts` -- owns `ConstructPart`, `ConstructJoint`, socket transforms, body
  lookup, disposal and the transaction.
- `src/construct/compile.ts` -- topological build order and exact attachment-frame arithmetic.
- `src/construct/render.ts` -- procedural plates, collars, bearings, pistons, rivets and emissive
  cores derived from the authoritative shape dimensions.
- `src/construct/materials.ts` -- one scene-owned palette per faction; parts never dispose it.

The runtime transaction owns every mesh, transform node, physics body, leaf shape, constraint and
observer it creates, and disposes them once in reverse dependency order. A palette is owned by a
scene registry and borrowed by runtimes; rollback releases the borrow but never disposes another
runtime's material. The Scene, Havok plugin and caller-supplied blueprint bytes remain caller-owned.
No controller or scheduler exists in this session, so the compiler census must not invent one.

The compiler first resolves every world bind transform without creating a body. In Babylon's
row-vector convention each edge solves
`childWorld = inverse(childFrame) * parentFrame * parentWorld`; it validates coincident origins and
matching complete orientation bases, not only one point. It applies the overview's feasible
collision rule--all intact shapes owned by one construct are mutually exempt, with filter masks set
on every leaf shape--rather than accepting arbitrary pair exclusions. It then creates bodies
parent-before-child through the existing physics setup at `src/physics.ts#L173` and constraints
through the conventions in `src/rig.ts#L139`. A failure after the first body invokes one rollback
that disposes constraints, bodies, meshes and observers in reverse construction order.

Each primitive has one authoritative dimension record. The visible shell may add a bounded inset
or bevel outside the collision surface only up to `PartSpec.shell.visualClearanceM`; the compiler
compares the oriented shell against joint planes and neighbouring oriented bounds, rather than
using world AABBs as a collision proof. It refuses a crossing by both part IDs and plane. Provide a
debug overlay that draws attachment frames and collider bounds from runtime facts, not reconstructed
blueprint numbers.

## Tests watched failing

Create `tests/construct-runtime.test.mjs` with a NullEngine and real Havok bytes:

- `the_compiler_places_both_sides_of_every_joint_frame_at_the_same_world_point`
- `joint_orientation_bases_and_one_step_velocity_stay_neutral_at_three_world_bearings`
- `rendered_part_bounds_describe_the_same_authoritative_primitive_as_collision`
- `a_construct_build_and_dispose_returns_the_full_scene_and_constraint_census`
- `a_failure_after_the_third_body_rolls_back_the_first_two_and_every_visual`
- `part_build_order_is_topological_and_independent_of_blueprint_array_order`
- `every_intact_leaf_collides_with_world_and_enemy_but_not_its_owner`
- `a_visual_clearance_that_crosses_a_joint_or_neighbour_is_refused`

The frame tests construct real Havok bodies at 0, pi/2 and pi, force activation, compare origin and
axis/perpendicular bases, step once through `_advancePhysicsEngineStep`, and bound velocity against
an equivalent one-part control. They do not compare two values reconstructed from the same
blueprint arithmetic. The bounds test transforms actual rendered vertices and compares them with
the live body's collider bounds within exactly the declared clearance.

Mutation proof: add 1 mm or 0.1 degrees to one child frame after validation and require the live
world-frame/one-step test to fail. Inject a throwing part factory at the third body--do not monkey
patch an import the compiler never calls--and require meshes, transform nodes, bodies, leaf shapes,
constraints, active observers and material-registry leases to return exactly to baseline.
Track live constraints by wrapping Havok `initConstraint`/`disposeConstraint`; its private map is
history, not a census.

## Accept

- A synthetic six-part graph stands in the headless arena with no frame-one constraint launch.
- Procedural geometry is recognizably mechanical: tapered plates, explicit bearings and covered
  gaps, not unstyled boxes pretending to be a final character.
- No setup unit, weapon, action or AI is added yet.
- `npm test`, `npm run check` and `npm run build` pass.

Because anatomy, `Combatant` and `Combat` are shared execution seams, bracket this session with
`npm run measure -- --only duelist-swinger --bouts 120 --seed 20260823`. The canonical current
control is the full report row recorded in `docs/measurements.md` (duelist 66/120); compare all
reported columns exactly, not a hand-waved sampling range.
