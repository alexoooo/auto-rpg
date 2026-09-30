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
2. **The engine seam.** `src/core/engine/engine.ts` holds the interfaces (`PhysicsWorld`,
   `SegmentBody`, `CoreJoint`, shapes, mass properties) with no Rapier type; `engine/rapier.ts`
   implements them; `createWorld` takes an engine; the tests read masses through the interface.
   Acceptance: every core test passes unchanged in its numbers.
3. **The Crypt on the core.** The level's layout, look, light and fog stay as they are. Its
   colliders (the floor, walls, obstacles and doors, Havok boxes in `src/dungeon/world.ts`) become
   fixed boxes in the core's world. The party and the enemies are core humans and skeletons,
   placed as today; the party takes the player's orders through a mind, and an enemy's mind walks
   to its target and attacks it. Acceptance: a seeded crypt loads, the bodies stand in it, and a
   fight starts and ends in the Node harness.
4. **The Arena on the core.** The room's colliders (`buildArenaColliders`) become fixed shapes in
   the core's world, and its visible room stays. The setup offers core bodies; the bout is two
   minds, the core's rules (`src/core/rules/`) and a verdict. Acceptance: a bout runs to its end
   in the Node harness and on the page.
5. **Delete the old path.** `src/golem/`, the old fight, minds, walking and scoring, `bench.html`,
   `art-proof.html` and their sources, the tests, harnesses, research and scripts that reach them,
   Havok (package, adapter, the `?url` import), and the page inputs and warmup entries they leave.
   AGENTS.md is rewritten for one engine; `docs/history.md` stays, since its lessons stand.
   Acceptance: the gates, and nothing under `src/` imports what was deleted.
6. **Then** minds and skills step 5.
