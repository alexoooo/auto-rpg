# Old path removal: the Arena, the Crypt and the skeleton on the core

2026-09-30. Part of [the core foundation](2026-09-28-core-foundation.md): it replaces stage 6's
arena work and stage 7's port with a shorter road. The old path goes, and what the owner wants
kept is carried onto the core first.

**The owner's ask (2026-09-30):** "i want to get rid of the old code. to do that, i want to port
the Arena and Random Crypt. but we just have humans, which is fine, and I want to add the skeleton
-- but this stuff doesn't need to work properly, it just needs to fit the new core. we don't need
the Golem or other stuff, i just want the Random Crypt and Skeleton because i don't want to lose
the art for those. after we beeline for old logic removal, then we can do the Step 5 of doing the
skills more dynamically."

**The owner's decisions (2026-09-30):**
- **Kept:** the Arena screen, the Random Crypt (`?play=dungeon`) and the skeleton's art. The stone
  golem, its art (`golem.glb` and its forge look), the module bench, the art proof and the legacy
  humans go; git keeps them.
- **Engines:** Havok goes entirely, its bake-off adapter too (the bake-off's report keeps its
  numbers). MuJoCo stays in the bake-off bench, unexplored parts and all. Other engines (Box3D,
  Jolt, ...) are tried as a bench adapter first (`src/physics-bench/engines/`), and the core reaches
  its engine through interfaces with no engine's types in them, so a candidate that passes the
  bench can be run under the core's tests by writing one module.
- **Working properly is not the bar.** The Crypt and the Arena need to run on the core: bodies
  built by `buildBody`, driven by minds through the skills, stepped by `World.step`. How well a
  skeleton fights is later work.
- After this plan, [minds and skills](2026-09-30-minds-and-skills.md) step 5.

## The steps

1. **The skeleton on the core.** The skeleton is built by the human body-plan code (it is a human
   skeleton: Blender Studio's "Skeleton - Realistic"), from its own figure: families share code,
   not values.
   - **The human code takes a figure, not a workshop model name.** A figure is what the body-plan
     code reads: the sex whose tables it takes, de Leva's landmarks, the trunk's hulls and the
     feet's extents, the hand's points and right, the body's mass and stature, and its hit points.
     The two workshop figures are made from their rigs and envelopes as today. Acceptance: both
     workshop specs read equal, whole, before and after.
   - **The skeleton's figure is read from its art's bind** (`assets/skeleton/bind.json`, the old
     skeleton's parts as the art was fitted to them). The joint centres are the parts' ends; the
     trunk is the old trunk boxes sliced at de Leva's trunk landmarks; the feet are the foot boxes.
     Its mass, strength and hit points are placeholders the owner's ask allows, each stated as one
     (`skeleton-placeholders`), and so is the fists' thumb-up turn.
     *As built (2026-09-30):* the reference pose is the bind itself, elbows at a right angle with the
     forearms forward, not arms turned to hang. The body-plan code reads the elbow's axis from the
     bend between upper arm and forearm, which a straight arm does not have, and the art then rides
     its segments with no turn. The cost: a posture in joint angles is measured from each body's own
     reference, so `GUARD`'s elbow flexion of 1.3 presses the skeleton's elbows into their stop.
     Its envelope (`assets/core/stance-envelope.json`, Node core stand, Rapier, 120 Hz): it walks
     0.2 m/s every way, and at 0.3 to 0.7 m/s holds 2 of the 5 ways; it turns 2 rad/s both ways
     at 0.2 m/s. Standing in the guard 3 cm low its feet slide 5.7 cm (the Warrior's 0.5 mm).
   - **The art rides the core segments.** Each rigid piece of `skeleton.glb` is parented to the
     segment that carries its part, at its bind transform in that segment's bind frame; the neck
     rides the head, the ribcage and collars the upper trunk, the lumbar spine the middle trunk,
     the pelvis the lower trunk, and the palm and fingers the hand. `bind.json` and the GLB become
     fixed assets: their generator builds an old golem and goes with the old path.
   - **In the lab** as a third body, with the stance's envelope measured on it.
   - Acceptance: the skeleton's spec passes the provenance check, builds, and stands on the core
     stand; every piece sits on its segment. How it looks is the owner's eye gate.
   - **Landed (2026-09-30).** `src/core/human/skeleton.ts`, `modelSpec` and `CORE_MODELS`
     (`src/core/human/spec.ts`), `src/core-lab/skeleton-skin.ts`; tests `core-skeleton` and
     `core-skeleton-skin`. The fist is a cube in the bind, so the little finger's knuckle, where the
     club's grip ends, is its half-width below the middle one, and the skeleton holds the club.
     In the lab (Node stand, Rapier, 120 Hz) every scenario runs on it: it stands and walks in
     the Stance and goes round the Run's circle at 0.2 m/s; in the Routine it falls after its first
     two strikes, which borrow the Warrior's recipes. Its hand's capsule runs to the fist box's far
     side, about 7 cm past the art's knuckles. On the page (a built preview, drawn by hand in a
     hidden tab) the pieces meet at the joints, the fists raised in the overbent guard.
2. **The engine seam.** `src/core/engine/engine.ts` holds the interfaces (`PhysicsWorld`,
   `SegmentBody`, `CoreJoint`, shapes, mass properties) with no Rapier type; `engine/rapier.ts`
   implements them; `createWorld` takes an engine; the tests read masses through the interface.
   Acceptance: every core test passes unchanged in its numbers.
   - **Landed (2026-09-30).** `engine.ts` is the contract, written out in its doc comment: a fixed
     step that writes the nodes, bodies that never sleep, the spec's mass, the centre of mass's
     velocities, `CONTACT_FRICTION` (0.5) on every contact and no bounce, a joint's freedom k as
     axis k of its frame, and a motor as a torque-bounded velocity constraint. `engines.ts` lists
     the engines (Rapier alone, the default) and is the only importer of an engine's module;
     `PHYSICS_HZ` moved to `src/core/world.ts`, and the stance's ground friction is the contract's.
     `tests/core-boundary.test.mjs` holds the seam: an engine package (`@dimforge/`) is imported
     only by its engine's module, and that module only by `engines.ts`, with a control that finds
     both crossings. `tests/core-engine.test.mjs` holds an engine to the clauses the other tests
     lean on without naming: a slid box slows at 0.5 g within 2 %, a dropped one rises under 2 mm,
     a box drifting at 1 mm/s in free space still drifts after 5 s (Rapier wakes a body when a
     motor is set, so a drift is where sleep shows), the engine holds the mass the core set, a
     removed ground lets a box fall, and a body from another world is refused a joint. Each of
     those clauses turned the tests red when it was broken in `rapier.ts`, one at a time
     (friction 0.3 or combined by product, restitution 0.5, sleep allowed, mass not given, the
     ground not removed, a foreign body joined, every collider read as a hull). All 1157 tests
     pass as before (3 todo), and no number in a core test changed.
     **Trying another engine** (Box3D, Jolt, ...): once it has passed the physics bench
     (`src/physics-bench/`), write `src/core/engine/<name>.ts` implementing `PhysicsEngine`, add it
     to `ENGINES`, and run `CORE_ENGINE=<name> npm test`; the lab still loads the default.
3. **The Crypt on the core.** The level's layout, look, light and fog stay as they are. Its
   colliders (the floor, walls, obstacles and doors, Havok boxes in `src/dungeon/world.ts`) become
   fixed boxes in the core's world. The party and the enemies are core humans and skeletons,
   placed as today; the party takes the player's orders through a mind, and an enemy's mind walks
   to its target and attacks it. Acceptance: a seeded crypt loads, the bodies stand in it, and a
   fight starts and ends in the Node harness.
   - **Landed (2026-09-30).** `DungeonRun` (`src/dungeon/run.ts`) is a core world: the party and
     the enemies are `createBody` bodies driven by a mind each (`driveBy`), every one carrying a
     club (recorded, not asked), wounded by `watchBlows` (`src/core/rules/blows.ts`, blows read
     from the engine's contacts) under the dungeon's rulebook. The orders, sight, routes and
     doors are the old run's, read from the body's centre of mass over the floor. The strike
     skill's aim is held while the target's head stays within the approach's reach: re-aimed at
     the swaying head every step, two bodies stood placing their feet for 25 s. A fallen body is
     out of the fight, since the core cannot rise yet (recorded, not asked), and an enemy is
     built only once a standing party member is within `WAKE_METRES`, each body costing about
     0.55 ms a step. `buildDungeonWorld` puts its boxes in the core's world and lists them
     (`solids`): the same 832 boxes, name, centre and size, as the Havok bodies they replaced,
     on seeds 1, 2 and 4, crypt room 12 and the reference chamber. `createBody` now reads its view
     at creation, so a body's feet are where it was built before its first step. Tests:
     `crypt-core` (generated seed 1 loads, the enemies within the wake line are built and the
     rest are not, and every body stands; with the start moved 4 m from the first spawn, blows
     land both ways and wound, and the fight ends at 11.2 s with the skeleton knocked down, its
     bar at 0.95; a ball rests on a closed door and falls once it opens), and `dungeon-party`
     ported (Node, core world, Rapier, 120 Hz). The golem-only dungeon tests, the enemy roster
     and `scripts/dungeon/sweep.mjs` are deleted. The page (`src/dungeon/main.ts`) offers the
     Warrior, the Rogue and the skeleton, dresses each body in the lab's skins with its club, and
     steps the world from its render loop; a built preview, stepped by hand in a hidden tab,
     built, skinned and stood them. 1144 tests, 1141 pass, 3 todo.
4. **The Arena on the core.** The room's colliders (`buildArenaColliders`) become fixed shapes in
   the core's world, and its visible room stays. The setup offers core bodies; the bout is two
   minds, the core's rules (`src/core/rules/`) and a verdict. Acceptance: a bout runs to its end
   in the Node harness and on the page.
   - **Landed (2026-09-30).** `arenaSolids` (`src/arena-room.ts`) lists what a body meets: the
     ground's slab, the four walls and the fourteen posts, each post the eight-sided prism its
     mesh draws, corner for corner; `addArenaSolids` puts them in a core world through the
     engine's new `addFixedShape` (a fixed collider of any body shape). `buildArenaColliders`
     and `buildArena` take the core's physics, and without it keep Havok for the module bench
     until step 5; a collider mesh a core collider stands behind says so (`isCollider`), so the
     room's visual-collider pairs are checked as before. The crypt's mind is now the core's
     (`fighterMind`, `src/core/mind/fighter.ts`), with `ATTACK_METRES`. A bout (`Duel`,
     `src/arena/duel.ts`) is two clubbed core bodies 4 m apart across the centre, both built
     facing +z and each turning a quarter to the other (recorded, not asked), the arena's
     rulebook, and a verdict: a side is out once its pool has ended or its body has fallen, both
     out on one step draw, and at 120 s the fuller bar wins (recorded, not asked). The page
     (`src/arena/main.ts`, the arena template rewritten) offers the Warrior, the Rogue and the
     skeleton each side, skins them with their clubs, and has pause, replay, random replay (the
     right side redrawn), setup and `?matchup=left,right` links; a person watches, since the core
     has no orders for a side yet (recorded, not asked). The old arena (`src/main.ts` and what it
     reaches) is no longer routed, and goes in step 5. Tests: `arena-core` (the posts are their
     meshes' prisms; a ball rests on a post; Warrior against Rogue ends with the Warrior's fall
     at 18.9 s, its bar the fuller at 0.99 to 0.70, after 31 blows, and a replay in the same
     world stands where it was built), and the room on a core world in `arena` (Node, core world, Rapier,
     120 Hz). A built preview, stepped by hand in a hidden tab, ran Warrior against Rogue to its
     verdict (the Warrior by the Rogue's fall at 16.6 s, bars 0.99 and 0.86, 10 blows) and drew
     the verdict bar; a `?matchup=` link opened a skeleton against the Warrior directly. 1150
     tests, 1147 pass, 3 todo.
5. **Delete the old path.** `src/golem/`, the old fight, minds, walking and scoring, `bench.html`,
   `art-proof.html` and their sources, the tests, harnesses, research and scripts that reach them,
   Havok (package, adapter, the `?url` import), and the page inputs and warmup entries they leave.
   AGENTS.md is rewritten for one engine; `docs/history.md` stays, since its lessons stand.
   Acceptance: the gates, and nothing under `src/` imports what was deleted.
   - **Landed (2026-09-30).** 378 files went, commit 77a0cd77 holding them: 140 under `src/` (the
     golem, the bench, the art proof, the old fight, its minds, orders, policies, walking, scoring,
     config and physics glue, and Havok's bake-off adapter), 101 tests and harnesses, 108 under
     `research/` (the old league with its rating, runner and workers, the laboratory's notes and
     published results), the golem's GLB and manifest, the art proof's review captures, the old
     humanoid's grip fits, their exporters, and the two pages. `@babylonjs/havok` is uninstalled.
     What stayed was fitted to the core: the room's colliders are the core world's only
     (`buildArena` takes a function that makes the core's physics for the scene), the forge keeps
     only its kit and materials (`src/forge-assets.ts`), a blow's sound is `blowCue` alone, the
     crypt's order labels switch on its own orders, the arena's orbit camera is shared with its
     test (`src/arena/orbit.ts`), and the bake-off runs MuJoCo and Rapier, Havok's results kept
     beside `REPORT.md`. Tests that reached the old path were rewritten where their subject stays
     (the arena room on a core world, the crypt's scenes on a bare `NullEngine`, sound on core
     blows, the boundary check's control on the arena page) and deleted where it went. Two owner
     decisions whose records were deleted now name the commit that has them (`path@commit`, which
     the provenance check accepts), and the world-matrix guard the golem bench's test held moved
     to `tests/core-boundary.test.mjs`. AGENTS.md is rewritten for the core and Rapier, the
     README for the game as it stands, and `docs/history.md` notes the removal. The skeleton's
     and the forge kit's Blender scripts stay; their exporters from the old bodies
     (`scripts/skeleton/export-bind.mjs`, `scripts/art-proof/export-source.mjs`) went, and the
     committed `bind.json` and `source.json` are their inputs now. 329 tests, 326 pass, 3 todo.
6. **Then** minds and skills step 5.
