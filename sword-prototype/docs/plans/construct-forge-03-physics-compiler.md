# Session 03 -- compile one blueprint into physics and procedural art

## Outcome

Any valid v1 body blueprint builds transactionally into Havok bodies, constraints and a coherent
hard-surface presentation. Physics and visible geometry come from the same `PartSpec`; there is no
costume fitted over a second body.

## Implement

Extract the body-neutral fields of `Limb` from `src/fighter.ts#L47` into `src/anatomy.ts`, then
update Fighter, Centipede, `Combatant` and `Combat` without changing behaviour.

Create:

- `src/construct/runtime.ts` -- owns `ConstructPart`, `ConstructJoint`, socket transforms, body
  lookup, disposal and the transaction.
- `src/construct/compile.ts` -- topological build order and exact attachment-frame arithmetic.
- `src/construct/render.ts` -- procedural plates, collars, bearings, pistons, rivets and emissive
  cores derived from the authoritative shape dimensions.
- `src/construct/materials.ts` -- one scene-owned palette per faction; parts never dispose it.

The compiler first resolves every world bind transform without creating a body, validates both
sides of every joint frame and checks declared self-collision exclusions. It then creates bodies
parent-before-child through the existing physics setup at `src/physics.ts#L173` and constraints
through the conventions in `src/rig.ts#L139`. A failure after the first body invokes one rollback
that disposes constraints, bodies, meshes and observers in reverse construction order.

Each primitive has one authoritative dimension record. The visible shell may add a bounded inset
or bevel outside the collision surface only when the record declares `visualClearanceM`; the
compiler refuses a shell that crosses the next joint plane or another part's bind AABB. Provide a
debug overlay that draws attachment frames and collider bounds from runtime facts, not reconstructed
blueprint numbers.

## Tests watched failing

Create `tests/construct-runtime.test.mjs` with a NullEngine and real Havok bytes:

- `the_compiler_places_both_sides_of_every_joint_frame_at_the_same_world_point`
- `rendered_part_bounds_describe_the_same_authoritative_primitive_as_collision`
- `a_construct_build_and_dispose_returns_the_full_scene_and_constraint_census`
- `a_failure_after_the_third_body_rolls_back_the_first_two_and_every_visual`
- `part_build_order_is_topological_and_independent_of_blueprint_array_order`
- `a_visual_clearance_that_crosses_a_joint_or_neighbour_is_refused`

Mutation proof: add 1 mm to one child frame after validation and require the world-frame test to
fail. Force the third body constructor to throw and require the lifecycle census to return exactly
to baseline; an assertion that only counts meshes is insufficient.

## Accept

- A synthetic six-part graph stands in the headless arena with no frame-one constraint launch.
- Procedural geometry is recognizably mechanical: tapered plates, explicit bearings and covered
  gaps, not unstyled boxes pretending to be a final character.
- No setup unit, weapon, action or AI is added yet.
- `npm test`, `npm run check` and `npm run build` pass.
