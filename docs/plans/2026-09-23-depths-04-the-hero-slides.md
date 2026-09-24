# Session 04: the hero slides along walls and replans when stuck

## Goal

The dungeon's automatic exploration fails today, on the layouts it already ships. The test
`mouse-facing-only exploration reaches the exit using revealed frontiers` in
`tests/dungeon-physical.test.mjs` runs one seed, 42, and 42 happens to work. The same body on
`generateDungeon(0)` to `(20)` wins on **2 of 21 seeds** (18 and 42): the hero stops against a
corridor wall with its edge 0.341 m from rock and stays there until the cap. This was found while
reviewing this plan, because session 05's acceptance test is the same test on new levels, and it
cannot pass until this is fixed. It is a fix to the run, independent of the level generator, and
lands before the run moves onto new levels so that a change in the run never reads as a change in
the map.

All figures in this session are the Node headless harness (`createHeadlessArena`, the test's own
body: facing mode, cursor fixed at (9, 60), no spawns), measured by an agent that served the
patched text through a Node loader hook and edited nothing under `src/`.

## Why the hero sticks

On seed 1, at the stall:

- `heroMovement` asks for (0.062, 0.998), a direction 3.5 degrees *away* from the wall, and one
  `clearSegment` has cleared.
- The facing is held on the cursor at -18.8 degrees, so `composeIntent` splits that into forward
  0.925 and strafe 0.38.
- `VirtualLocomotionCarrier.propose` scales each local axis by its own ceiling -- 3.2 m/s ahead,
  1.9 back, 2.4 to the side, an envelope added on 2026-09-18 -- so the move it proposes is
  (-0.029, 1.000): **into** the wall. `composeIntent` assumes a round gait, and the carrier's is not.
- `resolveGroupMoves` in `src/dungeon/locomotion.ts` scales the whole displacement by one swept
  fraction, which is 0. `VirtualLocomotionCarrier.commit` then zeroes the velocity, because the
  allowed move over the proposed one is 0, and on the next step the carrier proposes again from
  rest, 0.16 mm into the wall, and gets 0 again. Forever.

Replanning alone cannot help: from the stuck point the straight leg is still clear, so a replan
produces the same route. It won 1 of 11 seeds.

A second, rarer stall appears once the hero can slide (seed 2): it is pinned on the convex corner
of a rock cell at a point contact, with `route[0]` no longer clear from where it now stands,
because the leg was planned from elsewhere. `DungeonRun.follow` never replans a non-empty route, so
it sat there for 93 s.

Two fixes, both needed. Measured on seeds 0-9 and 42, with the cursor fixed, orbiting the hero at
1.5 rad/s and at 4 rad/s:

| fix | fixed cursor | orbit 1.5 | orbit 4 |
|---|---|---|---|
| none | 1 of 11 | 0 of 4 tried | 0 of 4 tried |
| replan when stuck, alone | 1 | 0 | 4 |
| correct the move for the carrier's ellipse | 11 | 0 | 4 |
| slide, alone | 5 of 6 tried (seed 2 fails, the corner) | 6 of 6 | 6 of 6 |
| **slide and replan when stuck** | **11** | **11** | **11** |

Over seeds 0-20 and 42 under all three cursors, the chosen pair wins 66 of 66, and the longest the
hero stands still is 0.83 s. The ellipse correction fixes the fixed-cursor test and fails as soon
as the facing turns, because `view.self.facing` trails the carrier's yaw by about 10.7 degrees at
1.5 rad/s, so it corrects in the wrong frame; it would also need a new getter on
`PhysicalSupportedLocomotionPort`. It is not in this session. The lag is worth its own look (see
the end).

## Files

| File | Change |
|---|---|
| `src/dungeon/locomotion.ts` | `resolveGroupMoves` slides the refused part of an oblique move along the wall. |
| `src/dungeon/run.ts` | `DungeonActor.progress`, `STALL`, and a stall check at the head of `follow`. |
| `tests/dungeon.test.mjs` | One test: an oblique move into a wall slides. |
| `tests/dungeon-physical.test.mjs` | The exploration test runs seeds 42, 1 and 2. |
| `AGENTS.md` | One trap. |

## `src/dungeon/locomotion.ts`

In `resolveGroupMoves`, the first map becomes:

```ts
  const moves = proposals.map(p => {
    const f = registry.allowedFraction(p.prior, p.next, p.footprint, p.ownerPartIds);
    let x = p.displacement.x * f, z = p.displacement.z * f;
    // Rock is axis-aligned cells, so the stopped remainder of an oblique move is offered back one
    // axis at a time: the component along a wall slides, the component into it stays refused.
    // Without this a move a few degrees into a wall is refused whole, the carrier's velocity is
    // zeroed, and it asks again from rest forever. A single-axis move has nothing to slide along.
    if (f < 1 && p.displacement.x !== 0 && p.displacement.z !== 0) for (const axis of ["x", "z"] as const) {
      const rest = p.displacement[axis] * (1 - f);
      const from = { x: p.prior.x + x, y: p.prior.y, z: p.prior.z + z };
      const to = axis === "x" ? { ...from, x: from.x + rest } : { ...from, z: from.z + rest };
      const g = registry.allowedFraction(from, to, p.footprint, p.ownerPartIds);
      if (axis === "x") x += rest * g; else z += rest * g;
    }
    return { x, z, yaw: p.displacement.yaw };
  });
```

- The single-axis exclusion is required, not tidiness. Without it `group locomotion constrains
  swept encounters and queued actors without pair commits` reads 0.4375 where it asserts 0.25:
  its stub registry answers 0.25 to every sweep, so a single-axis move would be offered its own
  remainder again. In a real world, re-offering the same axis from the contact point is the sweep
  that just stopped, so the exclusion loses nothing.
- The pairwise pass below it is unchanged. It only ever shortens a move, and it runs on the slid
  moves, so two bodies still cannot cross.
- This applies to every actor, keyboard included. **Name it in the commit as a feel change:** a
  player pushing diagonally into a wall now slides along it instead of stopping dead.

## `src/dungeon/run.ts`

```ts
export interface DungeonActor {
  id: string; name: string; body: Golem; combat: Combat; policy: Mind; intent: Intent;
  target: DungeonActor | null; home: Point; lastSeen: Point | null; alertedUntil: number;
  route: Point[]; goal: Point | null; nextPlan: number; radius: number;
  /** Where the body last made progress along its route, and when. */
  progress: { at: Point; since: number };
  meshes: { mesh: AbstractMesh; visible: boolean }[]; stopped: boolean;
}
/**
 * A route leg the body has not moved 50 mm along in half a second is replanned from where the body
 * actually is. The slowest carrier in `src/golem/config.ts` (the multileg: 0.8 m/s backing,
 * 6.5 m/s2) covers 50 mm from rest in about 0.1 s, and in about 0.15 s at the lowest movement stat
 * (x0.75, which scales both), so a body that has not is stuck -- typically on a corner its leg
 * cleared from where it was planned. Node headless harness: seed 2's explorer sat on a room corner
 * for 93 s without this, and needed exactly one replan with it.
 */
const STALL = { seconds: 0.5, metres: 0.05 } as const;
```

- In the actor literal in the constructor, beside `nextPlan: 0`, add
  `progress: { at: { ...at }, since: 0 }`.
- `follow` gains two statements after `const at = actor.body.feetPosition();`:

```ts
    if (!actor.route.length || distance(at, actor.progress.at) > STALL.metres) actor.progress = { at: { x: at.x, z: at.z }, since: this.clock };
    else if (this.clock - actor.progress.since > STALL.seconds) {
      actor.route = []; actor.nextPlan = 0; actor.progress = { at: { x: at.x, z: at.z }, since: this.clock };
    }
```

`nextPlan = 0` with an empty route is `follow`'s own replan condition, so nothing new plans a
route: the existing `findPath` call, three lines down, does it in the same call.

**Orders.** Force moves, attack moves and destinations all go through `follow`. Because the replan
happens in the same call, the checks that read an empty route afterwards ("That path is blocked.
Draw a new route on the floor.", "Destination unreachable. Choose another floor point.") fire only
when the goal is unreachable from where the body now is. The agent traced force-to-room,
force-into-rock, destination and destination-into-rock on seed 42: notices, timings and final
positions are identical with and without the fix (force-to-room goes idle at 5.13 s at
(24.64, 8.99) in both).

## `tests/dungeon.test.mjs`

Beside `group locomotion constrains swept encounters...`, which reuses the `proposal` helper above
it:

```js
test("a_move_obliquely_into_a_wall_slides_along_it", () => {
  // A wall across +x: any sweep that gains x is refused whole, any other is allowed.
  const wall = { allowedFraction: (from, to) => to.x > from.x + 1e-9 ? 0 : 1 };
  const [slid] = resolveGroupMoves([proposal(0, 0, 0.1, 1)], [true], wall);
  assert.equal(slid.x, 0, "into the wall: refused");
  assert.equal(slid.z, 1, "along the wall: kept");
  const [straight] = resolveGroupMoves([proposal(0, 0, 0.1, 0)], [true], wall);
  assert.deepEqual([straight.x, straight.z], [0, 0], "straight into the wall: nothing to slide along");
});
```

## `tests/dungeon-physical.test.mjs`

`mouse-facing-only exploration reaches the exit using revealed frontiers` loops over seeds
`[42, 1, 2]`, building a fresh arena and run for each, with the seed in the failure message. Seed
1 is the one a missing slide fails; seed 2 is the one a missing replan fails; 42 is the seed the
test has always run. The cursor stays at (9, 60), which is where it was chosen for 42; say in a
comment that seeds 1 and 2 were measured with that same cursor.

Figures with the fix, Node headless harness, simulated seconds to the exit and uncontended wall
time: 42 wins at 24.16 s (0.78 s wall, unchanged from today), 1 at 31.29 s (0.97 s), 2 at 45.20 s
(1.26 s). The 120 s cap stays. A failing seed costs 6-7.5 s of wall time to reach it.

## `AGENTS.md`

One trap, after "Recovery cannot require the support state it exists to restore" or wherever the
dungeon's own traps sit when this lands:

- **The carrier's gait is an ellipse, and a planner that checks a direction is checking one the
  body will not take.** `VirtualLocomotionCarrier.propose` scales each local axis by its own
  ceiling (ahead, back and to the side differ), so with the facing held away from the direction
  of travel, `composeIntent`'s forward/strafe split comes out a few degrees off the planned
  direction. On a corridor wall that is a move into the wall, and when a sweep refused the whole
  move, the hero stood there for the rest of the run: 19 of 21 classic seeds, while the one seed
  the test ran passed. `resolveGroupMoves` in `src/dungeon/locomotion.ts` slides the refused part
  along the wall, and `STALL` in `src/dungeon/run.ts` replans a leg the body has stopped on. Test
  navigation on more than one seed.

## Verification

- `npm test`, `npm run check`, `npm run build`. The agent ran the full suite with the patched text
  served to every test process: 845 of 845 passed.
- Mutations, each must go red:
  - Delete the slide loop in `resolveGroupMoves`: `a_move_obliquely_into_a_wall...` goes red, and
    the exploration test on seed 1.
  - Delete the single-axis condition: `group locomotion constrains swept encounters...` goes red
    (0.4375).
  - Delete the stall statements in `follow`: the exploration test on seed 2 goes red.
- The browser: after the mutations, re-touch both files and grep the served text for `STALL` and
  `rest * g` on the owner's server (AGENTS.md). The owner then plays `/dungeon.html` (or
  `?play=dungeon` once session 01 has landed) with seeds 1, 2 and 3 and a hero of each family, in
  facing mode, and says whether the hero ever stands against a wall; and with keyboard movement,
  whether sliding along a wall feels right. My tab gets no frames (see memory).

## What the review changed

The adversarial review of the implementation found one defect and two gaps, all repaired in the
same commit:

- **A stall replan could strand a 0.5 m body.** `findPath` searched from the middle of the cell the
  body stood in, and at the multileg's 0.5 m radius the middle of a cell beside rock is not
  walkable, so from about one standable point in eight (seeds 1, 2, 42) there was no route unless
  the goal was in a straight line. Before this session a planned route was never thrown away there;
  the stall replan threw it away. Two repairs: the replan keeps the old route when the new one is
  empty, and `findPath` also steps out of its first cell from the body's own point. *Also*, not
  *instead*: from the body's point alone the default biped lost classic seeds 0, 8 and 9, so seed 0
  joined the exploration test. `a_body_beside_a_wall_plans_from_where_it_stands` pins the new start.
  Nothing pins the kept-route guard.
- **The slide test could not see a slide swept from the wrong point.** A corner stub (rock only
  where both axes are gained) now fails a second axis swept from `prior` rather than from where the
  first axis ended, and a slide offering only one axis.
- **`STALL`'s comment claimed it detects stuck bodies.** It detects still ones, whatever holds them;
  the comment says so now.

Measured after the repairs (Node headless harness, facing mode, cursor (9, 60)): the default biped
wins all twelve classic seeds 42, 1, 2 and 0-10 in 23.6 to 49.1 simulated seconds, the times it
had before the repairs; the multileg wins the same twelve in 46.2 to 106.5 s, unchanged.

## Not in this session

`view.self.facing` trails the carrier's yaw by about 10 degrees while turning at 1.5 rad/s
(Node headless harness). That also skews `composeIntent`'s forward/strafe split for keyboard
movement with the facing held on the cursor. It did not stop exploration once the hero slides, and
fixing it means a new reading on `PhysicalSupportedLocomotionPort`. Whether it matters is judged
in play: session 05's checklist asks the owner to steer with the keyboard while the hero faces the
cursor and say whether it goes where they push. Only a "no" there earns it a session.
