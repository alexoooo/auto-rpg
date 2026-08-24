# Session 06 -- the room has an outer boundary

## Outcome

Four static WORLD walls align with the visible north, south, east and west room edges.
Fighters, projectiles and debris cannot leave through a cardinal edge or corner; wall
contacts never score. The visual/collider pairing remains explicit and auditable.

## Implement

1. At `src/arena-room.ts:96-140`, extend `ROOM` with one measured `wallThickness` and derive
   each visual plane and collider centre from the same half-extent. Do not keep four copied
   coordinate literals.
2. At `src/arena-room.ts:329-380`, build four thin static boxes with membership `LAYER.WORLD`
   and `COLLIDES.WORLD`. Name them `room.wall.north.collider` etc. Register each visible wall
   placement against its collider so `validateRoomPlacements()` remains the authority gate.
3. Update the arena audit/lifecycle baseline and `tests/arena.test.mjs`'s old fifteen-body
   expectation to nineteen. Counts must return to baseline on disposal.
4. Keep the 60 m ground slab. The walls bound play, not the camera or the existence of floor
   beyond the room.

```ts
wallThickness: 0.24, // initial; retain only after the four-edge/corner sweep
```

## Tests first

In `tests/arena.test.mjs` and `tests/integration.test.mjs` add:

- `the_four_room_walls_are_world_colliders_aligned_with_their_visuals`
- `fighters_cannot_leave_through_any_cardinal_edge_or_corner`
- `flying_and_spent_arrows_cannot_leave_through_a_wall`
- `wall_contacts_do_not_score_as_combat`
- `four_wall_bodies_are_created_and_disposed_exactly_once`

Delete each cardinal wall in turn, offset one collider from its visual, and remove projectile
reciprocity. The edge, alignment and arrow tests must fail for the corresponding mutation.

## Acceptance

Drive both fighter sides continuously into every wall and two corners; run the same sweep with
AI and arrows. No pelvis may cross the inner face by more than its collision radius, no camera
view may imply a pass-through wall, and no combat report may name a wall strike.

```powershell
npm test
npm run check
npm run build
```
